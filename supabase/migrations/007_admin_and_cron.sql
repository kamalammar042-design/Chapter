-- ============================================================
-- CHAPTER — Migration 007: admin grant + scheduled maintenance
-- ------------------------------------------------------------
-- Run AFTER 006_scale.sql.
-- ============================================================


-- ============================================================
-- 1. YOUR TEST ACCOUNT — full Parent tier
-- ------------------------------------------------------------
-- This is the safe way to comp an account. The email lives in a table
-- that clients cannot read or write (no RLS policy => service_role only),
-- so nothing about this grant is discoverable or editable from the app
-- bundle. Compare with hardcoding the email in the client, where anyone
-- who unzips the APK finds it and swaps in their own address.
--
-- Order does not matter: if the account already exists the grant is
-- applied immediately by the block below; if it does not exist yet, the
-- profiles_admin_grant trigger applies it the moment you sign up.
-- ============================================================
insert into public.admin_grants (email, tier, note)
values ('kamalammar042@gmail.com', 'parent', 'Founder test account — full Parent tier')
on conflict (email) do update
  set tier = excluded.tier, note = excluded.note;

-- Apply retroactively if the account has already registered.
do $$
declare u record;
begin
  for u in
    select p.id, p.email from public.profiles p
    join public.admin_grants g on lower(g.email) = lower(p.email)
  loop
    insert into public.entitlements (user_id, tier, source, external_ref, expires_at)
    select u.id, g.tier, 'admin', 'admin:' || lower(u.email), null
      from public.admin_grants g where lower(g.email) = lower(u.email)
    on conflict (source, external_ref) where external_ref is not null do nothing;
  end loop;
end $$;


-- ============================================================
-- 2. SCHEDULED MAINTENANCE (pg_cron)
-- ------------------------------------------------------------
-- Enable pg_cron in the Supabase dashboard first:
--   Database > Extensions > search "pg_cron" > Enable
-- If you skip this, the app still works: the leaderboard just refreshes
-- on demand instead, and partitions can be created by calling
-- ensure_partitions() manually. Scheduling is a performance win, not a
-- correctness requirement.
-- ============================================================
-- Guarded so the migration also runs where pg_cron is unavailable (local
-- test databases). The leaderboard refresh job that used to live here was
-- removed in 008 along with the materialized view it refreshed.
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    -- Partitions: daily at 03:00 UTC, keeping 3 months provisioned ahead so
    -- a month boundary can never fail an insert.
    perform cron.schedule(
      'chapter-ensure-partitions', '0 3 * * *',
      $job$ select public.ensure_partitions(); $job$
    );
  else
    raise notice 'pg_cron not available; call public.ensure_partitions() on a schedule manually';
  end if;
end $cron$;


-- ============================================================
-- 3. STREAK INTEGRITY
-- ------------------------------------------------------------
-- Streaks are computed from answer_events rather than trusted from the
-- client, so a tampered local profile cannot inflate them. Called after
-- a study session; also safe to run in batch.
-- ============================================================
create or replace function public.recompute_streak(p_user uuid)
returns integer language plpgsql security definer as $$
declare d date; prev date; run int := 0; best int := 0; today date := current_date;
begin
  for d in
    select distinct created_at::date as day
      from public.answer_events
     where user_id = p_user
       and created_at > now() - interval '400 days'
     order by day desc
  loop
    if prev is null then
      -- a streak is live only if the most recent activity is today or yesterday
      if d = today or d = today - 1 then run := 1; else exit; end if;
    elsif d = prev - 1 then run := run + 1;
    else exit;
    end if;
    prev := d;
  end loop;

  select greatest(coalesce(longest_streak,0), run) into best
    from public.profiles where id = p_user;

  update public.profiles
     set streak_days = run, longest_streak = best,
         last_study_date = today, updated_at = now()
   where id = p_user;
  return run;
end $$;

grant execute on function public.recompute_streak(uuid) to authenticated;
