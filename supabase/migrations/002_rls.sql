-- ============================================================
-- CHAPTER — Row Level Security (Supabase / PostgreSQL)
-- Migration 002: RLS policies
-- ------------------------------------------------------------
-- Run AFTER 001_schema.sql.
--
-- WHY THIS MATTERS: without RLS, anyone with your public anon key
-- (which ships in the frontend and is MEANT to be public) could read
-- every user's data. RLS makes the DATABASE itself refuse to return
-- rows that don't belong to the requesting user. Security lives in the
-- database, not in your JavaScript — so even a malicious client can't
-- bypass it.
--
-- Key idea: auth.uid() returns the id of the currently authenticated
-- user (from their JWT). Every policy compares it to the row's user_id.
-- ============================================================

-- ---- turn RLS ON for every user-data table ----
-- (Once enabled, the DEFAULT is deny-all. Nothing is readable/writable
--  until a policy explicitly allows it. That's the safe default.)
alter table public.profiles       enable row level security;
alter table public.user_subjects  enable row level security;
alter table public.progress       enable row level security;
alter table public.study_sessions enable row level security;
alter table public.subjects       enable row level security;
alter table public.topics         enable row level security;

-- ============================================================
-- profiles
-- A user can read & update only their OWN profile row.
-- They can NOT insert (the signup trigger does that) and can NOT delete.
-- ============================================================
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using ( auth.uid() = id );

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using ( auth.uid() = id )
  with check ( auth.uid() = id );

-- NOTE: no insert/delete policy on profiles for normal users.
-- Inserts happen via the SECURITY DEFINER signup trigger only.

-- ============================================================
-- LEADERBOARD EXCEPTION (read this carefully)
-- Rankings need to show OTHER users' usernames + xp. That's public-ish
-- data by design. But we must NOT leak emails, school, or progress.
-- Solution: a separate, SELECT-only policy that exposes ONLY safe
-- columns via a dedicated view with security_invoker off.
-- We expose username + xp + cohort through the `public_leaderboard` view
-- below, and keep the base profiles table strictly own-row.
-- ============================================================
-- A minimal, privacy-safe public view: only what a leaderboard needs.
create or replace view public.public_leaderboard
with (security_invoker = off) as
  select
    p.username,
    p.curriculum,
    p.grade_level,
    us.subject_id,
    p.xp,
    rank() over (
      partition by p.curriculum, p.grade_level, us.subject_id
      order by p.xp desc
    ) as cohort_rank
  from public.profiles p
  join public.user_subjects us on us.user_id = p.id and us.selected = true;

comment on view public.public_leaderboard is
  'Privacy-safe leaderboard: exposes ONLY username, cohort, xp, rank. No email/school/progress.';

-- Lock the view down to authenticated users only.
revoke all on public.public_leaderboard from anon;
grant select on public.public_leaderboard to authenticated;

-- ============================================================
-- user_subjects — own rows only, full CRUD on own data
-- ============================================================
drop policy if exists "user_subjects_all_own" on public.user_subjects;
create policy "user_subjects_all_own"
  on public.user_subjects for all
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );

-- ============================================================
-- progress — own rows only, full CRUD on own data
-- THE most important policy: a student can never read another
-- student's mastery, scores, or weaknesses.
-- ============================================================
drop policy if exists "progress_all_own" on public.progress;
create policy "progress_all_own"
  on public.progress for all
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );

-- ============================================================
-- study_sessions — insert + read OWN; never update/delete
-- (append-only audit log: you can add your sessions and read them,
--  but nobody can rewrite history)
-- ============================================================
drop policy if exists "sessions_select_own" on public.study_sessions;
create policy "sessions_select_own"
  on public.study_sessions for select
  using ( auth.uid() = user_id );

drop policy if exists "sessions_insert_own" on public.study_sessions;
create policy "sessions_insert_own"
  on public.study_sessions for insert
  with check ( auth.uid() = user_id );

-- (intentionally NO update/delete policy → those are denied for everyone)

-- ============================================================
-- subjects + topics — reference data: readable by any logged-in user,
-- writable by NOBODY through the API (only you, via the dashboard/service role).
-- ============================================================
drop policy if exists "subjects_read_all" on public.subjects;
create policy "subjects_read_all"
  on public.subjects for select
  using ( auth.role() = 'authenticated' );

drop policy if exists "topics_read_all" on public.topics;
create policy "topics_read_all"
  on public.topics for select
  using ( auth.role() = 'authenticated' );

-- No insert/update/delete policies on subjects/topics → content is
-- read-only to clients. You seed/edit it with the service role key
-- (server-side only — NEVER put the service role key in the frontend).

-- ============================================================
-- SANITY CHECK (run these after applying; both should error/zero-rows
-- when logged in as a normal user trying to touch someone else's data)
-- ============================================================
-- select * from public.progress where user_id <> auth.uid();  -- expect 0 rows
-- update public.profiles set xp = 999999 where id <> auth.uid(); -- expect 0 rows affected
