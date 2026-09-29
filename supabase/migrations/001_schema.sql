-- ============================================================
-- CHAPTER — Database Schema (Supabase / PostgreSQL)
-- Migration 001: tables
-- ------------------------------------------------------------
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- BEFORE the RLS migration (002). It creates every table and the
-- relationships between them. Auth is handled by Supabase's built-in
-- auth.users table — we never create our own passwords table.
-- ============================================================

-- ---- enums (constrain values so bad data can't get in) ----
do $$ begin
  create type curriculum_t as enum ('british','american');
exception when duplicate_object then null; end $$;

do $$ begin
  -- shared level tags spanning both systems (matches the app's levelTag())
  create type level_t as enum ('foundation','intermediate','advanced');
exception when duplicate_object then null; end $$;

do $$ begin
  create type difficulty_t as enum ('easy','medium','hard');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_t as enum ('free','pro','parent');
exception when duplicate_object then null; end $$;

-- ============================================================
-- profiles — one row per authenticated user
-- Linked 1:1 to auth.users (Supabase's managed auth table).
-- We DON'T store passwords or emails for auth here; Supabase owns that.
-- We keep a copy of email only for display/contact convenience.
-- ============================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique,
  email         text,
  country       text,
  school_name   text,
  curriculum    curriculum_t,
  -- the specific level id the student picked, e.g. 'gcse','as','alevel','g9_10','g11_12','ap'
  grade_level   text,
  -- shared tag derived from grade_level; stored so leaderboards can group fast
  level_tag     level_t,
  subscription  subscription_t not null default 'free',
  founding_member boolean not null default false,
  xp            integer not null default 0 check (xp >= 0),
  streak_days   integer not null default 0 check (streak_days >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_study_date date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'One row per user; extends auth.users with app-specific fields.';

-- ============================================================
-- subjects + topics — REFERENCE data (the fixed curriculum content)
-- These are small, read-only-to-users lookup tables. The app already
-- knows these by name; we store them so progress can reference real IDs
-- and so future admin tools can edit content without a code deploy.
-- ============================================================
create table if not exists public.subjects (
  id     smallint primary key,           -- stable small ids (1..5)
  name   text not null unique,           -- 'Physics','Chemistry',...
  emoji  text,
  color  text
);

create table if not exists public.topics (
  id          smallint primary key,
  subject_id  smallint not null references public.subjects(id) on delete cascade,
  name        text not null,
  unique (subject_id, name)
);

-- ============================================================
-- user_subjects — which subjects a student has selected
-- (default-all in the app, but they can deselect)
-- ============================================================
create table if not exists public.user_subjects (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  subject_id smallint not null references public.subjects(id) on delete cascade,
  exam_date  date,
  selected   boolean not null default true,
  primary key (user_id, subject_id)
);

-- ============================================================
-- progress — per-user, per-topic mastery
-- This is the hot table (read on every home/stats render). Designed so
-- the common query "all my progress" needs NO joins: filter by user_id.
-- subject_id is denormalised in so we can group by subject without joining topics.
-- ============================================================
create table if not exists public.progress (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  subject_id      smallint not null references public.subjects(id) on delete cascade,
  topic_id        smallint not null references public.topics(id) on delete cascade,
  mastery_percent numeric(5,2) not null default 0 check (mastery_percent between 0 and 100),
  questions_seen  integer not null default 0 check (questions_seen >= 0),
  correct_answers integer not null default 0 check (correct_answers >= 0),
  updated_at      timestamptz not null default now(),
  unique (user_id, topic_id)
);

create index if not exists progress_user_idx on public.progress (user_id);
create index if not exists progress_user_subject_idx on public.progress (user_id, subject_id);

-- ============================================================
-- study_sessions — append-only log of completed quiz sessions
-- Powers stats (accuracy trend, days studied) and is the audit trail
-- for XP changes. Never updated, only inserted — cheap and safe.
-- ============================================================
create table if not exists public.study_sessions (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  subject_id     smallint not null references public.subjects(id) on delete cascade,
  topic_id       smallint references public.topics(id) on delete set null,
  difficulty     difficulty_t not null,
  questions      integer not null check (questions > 0),
  correct        integer not null check (correct >= 0),
  xp_earned      integer not null default 0 check (xp_earned >= 0),
  duration_secs  integer not null default 0 check (duration_secs >= 0),
  created_at     timestamptz not null default now()
);

create index if not exists sessions_user_idx on public.study_sessions (user_id, created_at desc);

-- ============================================================
-- leaderboard_view — rankings per (curriculum, grade, subject)
-- NOT a table. A VIEW so it's always correct and can never drift from
-- the real XP. Per-cohort, exactly like the app's cohortKey().
-- Querying it returns rows already filtered to a cohort by the app.
-- ============================================================
create or replace view public.leaderboard as
  select
    p.id            as user_id,
    p.username,
    p.curriculum,
    p.grade_level,
    us.subject_id,
    -- subject-scoped xp = share of total xp by this subject's mastery
    coalesce(round(
      p.xp * (
        coalesce(sub_mastery.subj_avg, 0)
        / nullif(total_mastery.tot_avg, 0)
      )
    )::int, 0) as subject_xp,
    rank() over (
      partition by p.curriculum, p.grade_level, us.subject_id
      order by p.xp desc
    ) as cohort_rank
  from public.profiles p
  join public.user_subjects us on us.user_id = p.id and us.selected = true
  left join lateral (
    select avg(pr.mastery_percent) as subj_avg
    from public.progress pr
    where pr.user_id = p.id and pr.subject_id = us.subject_id
  ) sub_mastery on true
  left join lateral (
    select avg(pr.mastery_percent) as tot_avg
    from public.progress pr
    where pr.user_id = p.id
  ) total_mastery on true;

comment on view public.leaderboard is 'Per-cohort rankings (curriculum+grade+subject). Always live; never stored.';

-- ============================================================
-- updated_at auto-touch trigger
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_progress_touch on public.progress;
create trigger trg_progress_touch before update on public.progress
  for each row execute function public.touch_updated_at();

-- ============================================================
-- auto-create a profile row when a new auth user signs up
-- (so you never have a logged-in user without a profile)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
