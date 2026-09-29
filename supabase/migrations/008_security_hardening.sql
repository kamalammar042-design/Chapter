-- ============================================================
-- CHAPTER — Migration 008: security hardening
-- ------------------------------------------------------------
-- Run AFTER 001–007. Fixes authorization holes found in the audit:
--
--   1. SECURITY DEFINER functions that trusted a client-supplied user id
--      (quota_status, consume_quota, can_use_ai, recompute_streak,
--      effective_tier). Any signed-in user could spend or read another
--      user's quota, or rewrite their streak. They now derive the caller
--      from auth.uid(); service-only variants live in the `private`
--      schema, which PostgREST does not expose.
--   2. Leaderboard objects that bypassed RLS: `leaderboard` (view, owner
--      rights, readable by anon), `public_leaderboard` (security_invoker
--      off) and `leaderboard_mv` (materialized views ignore RLS; it was
--      granted to anon and exposed user ids + subscription tier). All are
--      removed. Rankings are served by get_leaderboard() in 009, which
--      returns only opted-in usernames and weekly XP.
--   3. Every function in `public` was executable by anon (Postgres grants
--      EXECUTE to PUBLIC by default). refresh_leaderboard() let anyone
--      trigger a full materialized-view refresh. Execute is now revoked
--      by default and granted explicitly.
--   4. Admin grants were applied by matching the profile email on insert.
--      With email confirmation off, anyone could register that address
--      and receive the comp tier. Grants now require a confirmed email.
--   5. Clients could raise their own XP by up to 5,000 per update with no
--      limit on the number of updates. XP, streaks and study dates are now
--      server-owned and derived from recorded attempts (009).
-- ============================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

-- ------------------------------------------------------------
-- 1. Remove RLS-bypassing leaderboard objects
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'chapter-refresh-leaderboard';
  end if;
exception when others then
  raise notice 'pg_cron unschedule skipped: %', sqlerrm;
end $$;

drop view if exists public.leaderboard;
drop view if exists public.public_leaderboard;
drop function if exists public.refresh_leaderboard();
drop materialized view if exists public.leaderboard_mv;

-- ------------------------------------------------------------
-- 2. Lock down function execution
-- ------------------------------------------------------------
-- New functions created by this role are no longer executable by PUBLIC.
-- The PUBLIC grant is a global default, so it must be revoked globally; the
-- anon/authenticated grants Supabase adds are per-schema.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from authenticated;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;
grant execute on all functions in schema public to service_role;

-- ------------------------------------------------------------
-- 3. Tier + quota + AI gate: caller-derived identity
-- ------------------------------------------------------------
-- effective_tier(uuid) stays (other definer functions depend on it) but is
-- no longer callable by clients. Clients use my_tier().
create or replace function public.my_tier()
returns subscription_t
language sql stable security definer set search_path = public as $$
  select public.effective_tier(auth.uid());
$$;

drop function if exists public.quota_status(uuid);
drop function if exists public.consume_quota(uuid, integer);
drop function if exists public.can_use_ai(uuid, text);
drop function if exists public.recompute_streak(uuid);

create or replace function private.quota_status_for(p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t subscription_t;
  r record;
  cur date := date_trunc('month', now())::date;
  u int := 0;
begin
  t := public.effective_tier(p_user);
  if t <> 'free' then
    return jsonb_build_object('unlimited', true, 'tier', t);
  end if;
  select * into r from public.free_quota where user_id = p_user;
  if found and r.period_start = cur then u := r.used; end if;
  return jsonb_build_object(
    'unlimited', false, 'tier', t,
    'used', u, 'limit', public.free_quota_limit(),
    'remaining', greatest(0, public.free_quota_limit() - u),
    'resets_on', (cur + interval '1 month')::date);
end $$;

create or replace function public.quota_status()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return private.quota_status_for(auth.uid());
end $$;

-- Spends free quota for a user. Only called from trusted server code (the
-- attempt trigger in 009), never directly by clients.
create or replace function private.consume_quota_for(p_user uuid, p_n integer default 1)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t subscription_t;
  cur date := date_trunc('month', now())::date;
  newu int;
begin
  t := public.effective_tier(p_user);
  if t <> 'free' then
    return jsonb_build_object('ok', true, 'unlimited', true);
  end if;

  insert into public.free_quota (user_id, period_start, used)
       values (p_user, cur, 0)
  on conflict (user_id) do update
      set used = case when public.free_quota.period_start <> cur then 0
                      else public.free_quota.used end,
          period_start = cur;

  update public.free_quota
     set used = used + p_n, updated_at = now()
   where user_id = p_user
     and used + p_n <= public.free_quota_limit()
  returning used into newu;

  if newu is null then
    return jsonb_build_object('ok', false, 'reason', 'free_limit_reached',
      'limit', public.free_quota_limit(),
      'resets_on', (cur + interval '1 month')::date);
  end if;
  return jsonb_build_object('ok', true, 'used', newu,
    'remaining', public.free_quota_limit() - newu);
end $$;

create or replace function private.can_use_ai(p_user uuid, p_kind text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t subscription_t; cap int; used int;
begin
  t    := public.effective_tier(p_user);
  cap  := public.ai_monthly_cap(t, p_kind);
  used := public.ai_usage_this_month(p_user, p_kind);
  return jsonb_build_object(
    'allowed', cap > 0 and used < cap,
    'tier', t, 'cap', cap, 'used', used,
    'remaining', greatest(0, cap - used),
    'reason', case
      when cap = 0 then 'upgrade_required'
      when used >= cap then 'monthly_cap_reached'
      else null end);
end $$;

-- Client-facing: how much AI allowance do I have left?
create or replace function public.my_ai_allowance(p_kind text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return private.can_use_ai(auth.uid(), p_kind);
end $$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;

-- ------------------------------------------------------------
-- 4. Admin grants require a confirmed email
-- ------------------------------------------------------------
create or replace function private.apply_admin_grant_for(p_user uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare u record; g record;
begin
  select id, email, email_confirmed_at into u from auth.users where id = p_user;
  if not found or u.email_confirmed_at is null or u.email is null then
    return;
  end if;
  select * into g from public.admin_grants where lower(email) = lower(u.email) limit 1;
  if found then
    insert into public.entitlements (user_id, tier, source, external_ref, expires_at)
    values (u.id, g.tier, 'admin', 'admin:' || lower(u.email), null)
    on conflict (source, external_ref) where external_ref is not null do nothing;
  end if;
end $$;

create or replace function public.apply_admin_grant()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform private.apply_admin_grant_for(new.id);
  return new;
end $$;

create or replace function private.on_auth_user_confirmed()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null
     and (old.email_confirmed_at is null or old.email is distinct from new.email) then
    perform private.apply_admin_grant_for(new.id);
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at, email on auth.users
  for each row execute function private.on_auth_user_confirmed();

-- Remove any admin entitlement that was granted to an unconfirmed account.
update public.entitlements e
   set revoked_at = now()
  from auth.users u
 where e.user_id = u.id
   and e.source = 'admin'
   and e.revoked_at is null
   and u.email_confirmed_at is null;

-- ------------------------------------------------------------
-- 5. Server-owned profile fields
-- ------------------------------------------------------------
-- Requests from PostgREST run as role `authenticated`. Server code (security
-- definer functions, triggers they fire, service_role) runs as a different
-- role, so current_user tells us whether a client is making the change.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'profile id cannot change';
  end if;
  if new.subscription is distinct from old.subscription then
    raise exception 'subscription can only be changed by the server (verified purchase)';
  end if;
  if new.founding_member is distinct from old.founding_member then
    raise exception 'founding_member can only be set by the server';
  end if;

  -- Progress fields are derived from recorded attempts. Older clients still
  -- send them; ignore their values instead of failing the whole update.
  new.xp              := old.xp;
  new.streak_days     := old.streak_days;
  new.longest_streak  := old.longest_streak;
  new.last_study_date := old.last_study_date;
  new.email           := old.email;
  return new;
end;
$$;

-- Usernames are public on the leaderboard: constrain them. NOT VALID so
-- existing rows are not rejected; every new write is checked.
do $$ begin
  alter table public.profiles
    add constraint profiles_username_format
    check (username ~ '^[A-Za-z0-9_.]{3,24}$') not valid;
exception when duplicate_object then null; end $$;

-- Case-insensitive uniqueness so "Sam" and "sam" cannot both exist.
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username)) where username is not null;

-- ------------------------------------------------------------
-- 6. Legacy tables: stop client writes that bypass server logic
-- ------------------------------------------------------------
-- answer_events is superseded by question_attempts (009). Keep the data,
-- remove client write access.
drop policy if exists ae_insert_own on public.answer_events;
revoke insert, update, delete on public.answer_events from anon, authenticated;

-- Partitions are tables in their own right: RLS on the parent does not apply
-- when a partition is queried directly, and Supabase's default grants made
-- every monthly partition readable through the REST API — by anon included.
-- Enable RLS and remove client access on existing partitions...
do $$
declare r record;
begin
  for r in
    select c.relname from pg_inherits i
      join pg_class c on c.oid = i.inhrelid
      join pg_class p on p.oid = i.inhparent
     where p.relname = 'answer_events'
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    execute format('revoke all on public.%I from anon, authenticated', r.relname);
  end loop;
end $$;

-- ...and on every partition created from now on.
create or replace function public.create_month_partition(p_month date)
returns void language plpgsql as $$
declare
  start_d date := date_trunc('month', p_month)::date;
  end_d   date := (date_trunc('month', p_month) + interval '1 month')::date;
  pname   text := 'answer_events_' || to_char(start_d, 'YYYY_MM');
begin
  if not exists (select 1 from pg_class where relname = pname) then
    execute format(
      'create table public.%I partition of public.answer_events
         for values from (%L) to (%L)', pname, start_d, end_d);
    execute format('alter table public.%I enable row level security', pname);
    execute format('revoke all on public.%I from anon, authenticated', pname);
    execute format(
      'create index if not exists %I on public.%I (user_id, created_at desc)',
      pname || '_user_idx', pname);
  end if;
end $$;

-- Reference data should not be readable anonymously either.
revoke all on public.subjects, public.topics from anon;

-- Grants that must exist for signed-in clients.
grant execute on function public.my_tier() to authenticated;
grant execute on function public.quota_status() to authenticated;
grant execute on function public.my_ai_allowance(text) to authenticated;

-- Tables from 005/006 kept Supabase's default grants to anon. RLS returned no
-- rows, but anonymous clients have no business touching them at all.
revoke all on public.free_quota, public.entitlements, public.ai_usage,
              public.admin_grants, public.purchase_receipts, public.answer_events
  from anon;
revoke insert, update, delete on public.free_quota, public.entitlements, public.ai_usage,
              public.admin_grants
  from authenticated;
revoke select on public.admin_grants from authenticated;
