-- ============================================================
-- CHAPTER — Migration 006: scale, entitlements, AI metering
-- ------------------------------------------------------------
-- Run AFTER 001–005. This migration is additive: it does not alter
-- or drop anything the Expo app already depends on, so both the
-- Expo client and the new web client run against one database.
--
-- What this adds:
--   1. answer_events    — append-only fact table (the traffic hot path)
--   2. leaderboard_mv   — materialized cohort rankings (fast reads)
--   3. entitlements     — server-owned subscription source of truth
--   4. admin_grants     — manual comps (your test account) without a client hole
--   5. ai_usage         — per-user AI metering so spend cannot run away
--   6. free_quota       — 100 questions/month, resets monthly, nothing else resets
-- ============================================================


-- ============================================================
-- 1. ANSWER EVENTS — the append-only hot path
-- ------------------------------------------------------------
-- Every answered question writes one row here. This is the table that
-- grows fastest (a single active student produces ~100 rows/week), so
-- it is designed for write throughput and range scans, not updates.
--
-- Partitioned BY MONTH: old months can be detached and archived to cold
-- storage without touching live data, and every analytical query is
-- constrained to a small number of partitions. This is the single most
-- important decision for handling traffic at scale.
-- ============================================================
create table if not exists public.answer_events (
  id            bigint generated always as identity,
  user_id       uuid not null references auth.users(id) on delete cascade,
  subject_id    smallint not null,
  topic_id      smallint,
  -- question signature: stable hash of the question text, so we can
  -- detect repeats without storing the whole question body per event
  q_sig         text not null,
  correct       boolean not null,
  difficulty    difficulty_t not null,
  -- milliseconds the student took; powers the "answered too fast to have
  -- read it" anti-cheat heuristic and the confidence model
  latency_ms    integer check (latency_ms >= 0),
  -- where the answer happened, so we can separate casual practice from
  -- exam conditions in analytics
  mode          text not null default 'quiz'
                check (mode in ('quiz','daily','exam','ranked','flashcard','written','comprehension','placement')),
  xp_awarded    integer not null default 0 check (xp_awarded >= 0),
  created_at    timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);

comment on table public.answer_events is
  'Append-only answer log, month-partitioned. Never UPDATE rows here.';

-- ---- partition management ----------------------------------
-- Creates the partition for a given month if it does not exist.
-- Called by ensure_partitions() below; safe to run repeatedly.
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
    -- Per-partition indexes. Defined here rather than on the parent so
    -- each partition stays independently maintainable.
    execute format(
      'create index if not exists %I on public.%I (user_id, created_at desc)',
      pname || '_user_idx', pname);
    execute format(
      'create index if not exists %I on public.%I (subject_id, correct)',
      pname || '_subject_idx', pname);
    -- Partial index: wrong answers only. The adaptive daily quiz reads
    -- exactly this slice, and it is a small fraction of total rows.
    execute format(
      'create index if not exists %I on public.%I (user_id, created_at desc) where correct = false',
      pname || '_wrong_idx', pname);
  end if;
end $$;

-- Keeps the current month plus the next three months provisioned, so a
-- month rollover at midnight never fails an insert. Schedule this via
-- pg_cron (see 008_cron.sql) or call it from a daily Edge Function.
create or replace function public.ensure_partitions()
returns void language plpgsql as $$
declare i int;
begin
  for i in 0..3 loop
    perform public.create_month_partition((current_date + (i || ' month')::interval)::date);
  end loop;
end $$;

-- Provision the first partitions immediately so inserts work today.
select public.ensure_partitions();


-- ============================================================
-- 2. LEADERBOARD — materialized, not computed per request
-- ------------------------------------------------------------
-- Ranking every user on every page load does not survive contact with
-- traffic. Instead we materialize cohort standings and refresh them on a
-- schedule. Reads become a single indexed lookup.
--
-- Cohort = curriculum + grade_level. British and American students never
-- mix, matching the Expo app's cohortKey() logic exactly.
-- ============================================================
create materialized view if not exists public.leaderboard_mv as
select
  p.id                as user_id,
  p.username,
  p.curriculum,
  p.grade_level,
  p.xp,
  p.streak_days,
  p.subscription,
  -- cohort-scoped rank
  rank() over (
    partition by p.curriculum, p.grade_level
    order by p.xp desc, p.longest_streak desc, p.id
  ) as cohort_rank,
  count(*) over (partition by p.curriculum, p.grade_level) as cohort_size,
  now() as refreshed_at
from public.profiles p
where p.username is not null
  and p.curriculum is not null;

-- UNIQUE index is required for REFRESH ... CONCURRENTLY, which is what
-- lets the leaderboard refresh without blocking readers.
create unique index if not exists leaderboard_mv_user_idx
  on public.leaderboard_mv (user_id);
create index if not exists leaderboard_mv_cohort_idx
  on public.leaderboard_mv (curriculum, grade_level, cohort_rank);

create or replace function public.refresh_leaderboard()
returns void language plpgsql security definer as $$
begin
  refresh materialized view concurrently public.leaderboard_mv;
end $$;


-- ============================================================
-- 3. ENTITLEMENTS — server-owned subscription truth
-- ------------------------------------------------------------
-- profiles.subscription stays as the fast-read cache the app already
-- uses. This table is the AUDITABLE source: every grant records where it
-- came from (play / stripe / admin) and when it expires. The trigger
-- below keeps profiles.subscription in sync automatically.
--
-- Supporting both play_billing and stripe means the Expo app (store
-- billing, mandatory on Android/iOS) and the web app (Stripe, allowed on
-- web) can both grant entitlement into one column.
-- ============================================================
create table if not exists public.entitlements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  tier         subscription_t not null,
  source       text not null check (source in ('play_billing','stripe','admin','promo')),
  -- external reference: Play purchaseToken or Stripe subscription id
  external_ref text,
  starts_at    timestamptz not null default now(),
  -- null = perpetual (used for admin grants)
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists entitlements_user_idx
  on public.entitlements (user_id, expires_at desc nulls first);
-- One active entitlement per external reference: blocks double-grant if
-- a webhook or verification call is delivered twice.
create unique index if not exists entitlements_ref_idx
  on public.entitlements (source, external_ref)
  where external_ref is not null;

-- Resolves the highest active tier for a user. 'parent' outranks 'pro'.
create or replace function public.effective_tier(p_user uuid)
returns subscription_t language sql stable as $$
  select coalesce(
    (select e.tier
       from public.entitlements e
      where e.user_id = p_user
        and e.revoked_at is null
        and e.starts_at <= now()
        and (e.expires_at is null or e.expires_at > now())
      order by case e.tier when 'parent' then 2 when 'pro' then 1 else 0 end desc
      limit 1),
    'free'::subscription_t);
$$;

-- Keep the profiles cache in step with the entitlement ledger.
create or replace function public.sync_subscription()
returns trigger language plpgsql security definer as $$
declare uid uuid := coalesce(new.user_id, old.user_id);
begin
  update public.profiles
     set subscription = public.effective_tier(uid),
         updated_at   = now()
   where id = uid;
  return null;
end $$;

drop trigger if exists entitlements_sync on public.entitlements;
create trigger entitlements_sync
  after insert or update or delete on public.entitlements
  for each row execute function public.sync_subscription();


-- ============================================================
-- 4. ADMIN GRANTS — comp accounts without a client-side backdoor
-- ------------------------------------------------------------
-- Hardcoding an email in the app would ship a string that anyone can
-- find in the bundle and edit. Instead the grant lives here, server-side,
-- readable only by service_role. On signup a trigger checks this list.
--
-- TO GRANT YOUR OWN TEST ACCOUNT, run 007_admin.sql after signing up.
-- ============================================================
create table if not exists public.admin_grants (
  email      text primary key,
  tier       subscription_t not null default 'parent',
  note       text,
  created_at timestamptz not null default now()
);

-- Applied automatically when a matching email registers.
create or replace function public.apply_admin_grant()
returns trigger language plpgsql security definer as $$
declare g record;
begin
  select * into g from public.admin_grants
   where lower(email) = lower(new.email) limit 1;
  if found then
    insert into public.entitlements (user_id, tier, source, external_ref, expires_at)
    values (new.id, g.tier, 'admin', 'admin:' || lower(new.email), null)
    on conflict (source, external_ref) where external_ref is not null do nothing;
  end if;
  return new;
end $$;

drop trigger if exists profiles_admin_grant on public.profiles;
create trigger profiles_admin_grant
  after insert on public.profiles
  for each row execute function public.apply_admin_grant();


-- ============================================================
-- 5. AI USAGE METERING — spend cannot run away
-- ------------------------------------------------------------
-- Every AI call (PDF scan, essay marking) records a row. The Edge
-- Function checks the monthly count BEFORE calling the model and refuses
-- past the cap. Two protections in one: an abusive account cannot run up
-- the bill, and free users cannot reach the endpoint at all.
-- ============================================================
create table if not exists public.ai_usage (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('pdf_scan','essay_mark')),
  -- billing observability: what the call actually consumed
  input_tokens  integer default 0,
  output_tokens integer default 0,
  pages       integer default 0,
  ok          boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists ai_usage_user_month_idx
  on public.ai_usage (user_id, created_at desc);

-- Monthly caps by tier. Free is ZERO — the feature is Pro/Parent only,
-- enforced in the database rather than only hidden in the UI.
create or replace function public.ai_monthly_cap(p_tier subscription_t, p_kind text)
returns integer language sql immutable as $$
  select case
    when p_tier = 'free' then 0
    when p_kind = 'pdf_scan'   then 60   -- generous; no real student hits this
    when p_kind = 'essay_mark' then 120
    else 0 end;
$$;

create or replace function public.ai_usage_this_month(p_user uuid, p_kind text)
returns integer language sql stable as $$
  select count(*)::int from public.ai_usage
   where user_id = p_user and kind = p_kind and ok = true
     and created_at >= date_trunc('month', now());
$$;

-- Single call the Edge Function makes before hitting the model.
create or replace function public.can_use_ai(p_user uuid, p_kind text)
returns jsonb language plpgsql stable security definer as $$
declare t subscription_t; cap int; used int;
begin
  t   := public.effective_tier(p_user);
  cap := public.ai_monthly_cap(t, p_kind);
  used := public.ai_usage_this_month(p_user, p_kind);
  return jsonb_build_object(
    'allowed', cap > 0 and used < cap,
    'tier', t, 'cap', cap, 'used', used,
    'reason', case
      when cap = 0 then 'upgrade_required'
      when used >= cap then 'monthly_cap_reached'
      else null end);
end $$;


-- ============================================================
-- 6. FREE QUOTA — 100 questions/month, and ONLY this resets
-- ------------------------------------------------------------
-- Deliberately its own table. Because the quota is derived from a
-- period_start column rather than being a counter someone has to
-- remember to clear, the "reset" is implicit: when the month changes,
-- the row is stale and treated as zero. Nothing else is touched — XP,
-- streaks, mastery, longest_streak and wrong-answer history all live in
-- other tables and are never reset by this mechanism.
-- ============================================================
create table if not exists public.free_quota (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  period_start date not null default date_trunc('month', now())::date,
  used         integer not null default 0 check (used >= 0),
  updated_at   timestamptz not null default now()
);

create or replace function public.free_quota_limit() returns integer
  language sql immutable as $$ select 100 $$;

-- Returns remaining questions. Premium always reports unlimited.
create or replace function public.quota_status(p_user uuid)
returns jsonb language plpgsql stable security definer as $$
declare t subscription_t; r record; cur date := date_trunc('month', now())::date; u int := 0;
begin
  t := public.effective_tier(p_user);
  if t <> 'free' then
    return jsonb_build_object('unlimited', true, 'tier', t);
  end if;
  select * into r from public.free_quota where user_id = p_user;
  -- Stale period == new month == quota is zero again.
  if found and r.period_start = cur then u := r.used; end if;
  return jsonb_build_object(
    'unlimited', false, 'tier', t,
    'used', u, 'limit', public.free_quota_limit(),
    'remaining', greatest(0, public.free_quota_limit() - u),
    'resets_on', (cur + interval '1 month')::date);
end $$;

-- Atomically consume quota. Returns false when the free wall is hit, so
-- the caller shows the paywall. Premium consumes nothing.
create or replace function public.consume_quota(p_user uuid, p_n integer default 1)
returns jsonb language plpgsql security definer as $$
declare t subscription_t; cur date := date_trunc('month', now())::date; newu int;
begin
  t := public.effective_tier(p_user);
  if t <> 'free' then
    return jsonb_build_object('ok', true, 'unlimited', true);
  end if;

  insert into public.free_quota (user_id, period_start, used)
       values (p_user, cur, 0)
  on conflict (user_id) do update
      -- rolling into a new month zeroes the counter in the same statement
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


-- ============================================================
-- 7. RLS — deny by default on every new table
-- ============================================================
alter table public.answer_events enable row level security;
alter table public.entitlements  enable row level security;
alter table public.admin_grants  enable row level security;
alter table public.ai_usage      enable row level security;
alter table public.free_quota    enable row level security;

-- answer_events: insert own, read own. No update/delete policy exists,
-- so the log is append-only for clients by construction.
drop policy if exists ae_insert_own on public.answer_events;
create policy ae_insert_own on public.answer_events
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists ae_select_own on public.answer_events;
create policy ae_select_own on public.answer_events
  for select to authenticated using (auth.uid() = user_id);

-- entitlements: readable by owner, writable ONLY by service_role.
-- This is what makes self-granting premium impossible from the client.
drop policy if exists ent_select_own on public.entitlements;
create policy ent_select_own on public.entitlements
  for select to authenticated using (auth.uid() = user_id);

-- admin_grants: no client policy at all => service_role only.

-- ai_usage / free_quota: read own, all writes go through the
-- security-definer functions above.
drop policy if exists aiu_select_own on public.ai_usage;
create policy aiu_select_own on public.ai_usage
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists fq_select_own on public.free_quota;
create policy fq_select_own on public.free_quota
  for select to authenticated using (auth.uid() = user_id);

grant select on public.leaderboard_mv to anon, authenticated;
grant execute on function public.quota_status(uuid)        to authenticated;
grant execute on function public.consume_quota(uuid,int)   to authenticated;
grant execute on function public.can_use_ai(uuid,text)     to authenticated;
grant execute on function public.effective_tier(uuid)      to authenticated;
