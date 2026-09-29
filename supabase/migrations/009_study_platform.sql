-- ============================================================
-- CHAPTER — Migration 009: study platform
-- ------------------------------------------------------------
-- Run AFTER 008. Adds the data model the product runs on:
--
--   catalog_subjects / catalog_topics   IGCSE + SAT syllabus map (seeded in 010)
--   profiles (new columns)              onboarding, timezone, preferences
--   student_subjects                    chosen subjects, exam dates, targets
--   practice_sessions                   one row per practice set
--   question_attempts                   every answered question (source of truth)
--   topic_stats / daily_activity        server-maintained aggregates
--   weekly_xp                           weekly league standings
--   goals, notes, flashcard_decks, flashcards
--   past_papers, paper_attempts
--
-- Integrity model: clients may INSERT an attempt, but XP, timestamps,
-- streaks, mastery aggregates and free-quota spending are computed here,
-- inside triggers the client cannot bypass. Column-level grants restrict
-- which fields a client can write at all.
-- ============================================================

-- ------------------------------------------------------------
-- Catalogue
-- ------------------------------------------------------------
create table if not exists public.catalog_subjects (
  key      text primary key check (key ~ '^[a-z0-9_.-]{2,40}$'),
  program  text not null check (program in ('igcse', 'sat')),
  name     text not null,
  code     text,
  sort     smallint not null default 0
);

create table if not exists public.catalog_topics (
  subject_key text not null references public.catalog_subjects(key) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9-]{1,48}$'),
  name        text not null,
  sort        smallint not null default 0,
  primary key (subject_key, key)
);

alter table public.catalog_subjects enable row level security;
alter table public.catalog_topics   enable row level security;

drop policy if exists catalog_subjects_read on public.catalog_subjects;
create policy catalog_subjects_read on public.catalog_subjects
  for select to authenticated using (true);
drop policy if exists catalog_topics_read on public.catalog_topics;
create policy catalog_topics_read on public.catalog_topics
  for select to authenticated using (true);

revoke all on public.catalog_subjects, public.catalog_topics from anon;
revoke insert, update, delete on public.catalog_subjects, public.catalog_topics from authenticated;

-- ------------------------------------------------------------
-- Profiles: onboarding + preferences
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists display_name       text,
  add column if not exists role               text not null default 'student',
  add column if not exists program            text,
  add column if not exists igcse_tier         text,
  add column if not exists timezone           text not null default 'UTC',
  add column if not exists onboarded_at       timestamptz,
  add column if not exists leaderboard_opt_in boolean not null default true,
  add column if not exists tutor_style        text not null default 'balanced';

do $$ begin
  alter table public.profiles add constraint profiles_display_name_len
    check (display_name is null or char_length(display_name) between 1 and 40);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_role_valid
    check (role in ('student', 'parent'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_program_valid
    check (program is null or program in ('igcse', 'sat'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_tier_valid
    check (igcse_tier is null or igcse_tier in ('core', 'extended'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_tutor_style_valid
    check (tutor_style in ('balanced', 'concise', 'detailed', 'socratic'));
exception when duplicate_object then null; end $$;

-- Invalid time zones would break every "today" calculation. Fall back to UTC.
create or replace function public.validate_profile()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.timezone is distinct from old.timezone then
    if new.timezone is null
       or not exists (select 1 from pg_timezone_names where name = new.timezone) then
      new.timezone := 'UTC';
    end if;
  end if;
  if new.display_name is not null then
    new.display_name := nullif(btrim(new.display_name), '');
  end if;
  return new;
end $$;

drop trigger if exists trg_validate_profile on public.profiles;
create trigger trg_validate_profile
  before insert or update on public.profiles
  for each row execute function public.validate_profile();

-- New accounts: copy display name + role from signup metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r text := case when meta ->> 'role' = 'parent' then 'parent' else 'student' end;
  dn text := left(nullif(btrim(meta ->> 'display_name'), ''), 40);
begin
  insert into public.profiles (id, email, display_name, role)
  values (new.id, new.email, dn, r)
  on conflict (id) do nothing;
  return new;
end $$;

-- Keep the display copy of the email in step with auth.
create or replace function private.sync_profile_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.sync_profile_email();

-- Clients may edit only these profile columns.
revoke update on public.profiles from authenticated;
grant update (username, display_name, role, program, igcse_tier, timezone,
              onboarded_at, leaderboard_opt_in, tutor_style)
  on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated;
revoke all on public.profiles from anon;

-- ------------------------------------------------------------
-- Student subjects
-- ------------------------------------------------------------
create table if not exists public.student_subjects (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_key  text not null references public.catalog_subjects(key) on delete cascade,
  exam_date    date,
  target_grade text check (target_grade is null or char_length(target_grade) between 1 and 8),
  confidence   smallint check (confidence is null or confidence between 1 and 5),
  created_at   timestamptz not null default now(),
  primary key (user_id, subject_key)
);

alter table public.student_subjects enable row level security;
drop policy if exists student_subjects_own on public.student_subjects;
create policy student_subjects_own on public.student_subjects
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.student_subjects from anon;

-- ------------------------------------------------------------
-- Practice sessions
-- ------------------------------------------------------------
create table if not exists public.practice_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_key      text references public.catalog_subjects(key) on delete set null,
  topic_key        text,
  mode             text not null check (mode in ('practice', 'daily', 'exam', 'placement', 'review', 'reading', 'weakness')),
  question_count   integer not null default 0,
  correct_count    integer not null default 0,
  practice_seconds integer not null default 0,
  xp_earned        integer not null default 0,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz
);

create index if not exists practice_sessions_user_idx
  on public.practice_sessions (user_id, started_at desc);

alter table public.practice_sessions enable row level security;
drop policy if exists ps_select_own on public.practice_sessions;
create policy ps_select_own on public.practice_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists ps_insert_own on public.practice_sessions;
create policy ps_insert_own on public.practice_sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists ps_update_own on public.practice_sessions;
create policy ps_update_own on public.practice_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.practice_sessions from anon;
revoke insert, update, delete on public.practice_sessions from authenticated;
grant insert (id, subject_key, topic_key, mode) on public.practice_sessions to authenticated;
grant update (ended_at) on public.practice_sessions to authenticated;

-- ------------------------------------------------------------
-- Question attempts — the source of truth for progress
-- ------------------------------------------------------------
create table if not exists public.question_attempts (
  id            bigint generated always as identity primary key,
  client_id     uuid not null,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id    uuid references public.practice_sessions(id) on delete set null,
  subject_key   text not null,
  topic_key     text not null,
  question_ref  text not null check (char_length(question_ref) between 1 and 200),
  -- snapshot of the question text, kept only for wrong answers so the tutor
  -- can talk about recent mistakes; cleared for correct answers
  question_text text check (question_text is null or char_length(question_text) <= 1200),
  source        text not null default 'bank' check (source in ('bank', 'generated', 'ai')),
  difficulty    text not null check (difficulty in ('easy', 'medium', 'hard')),
  correct       boolean not null,
  time_ms       integer check (time_ms is null or time_ms between 0 and 3600000),
  mode          text not null check (mode in ('practice', 'daily', 'exam', 'placement', 'review', 'reading', 'weakness')),
  xp_awarded    integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (user_id, client_id),
  foreign key (subject_key, topic_key) references public.catalog_topics(subject_key, key)
);

create index if not exists qa_user_time_idx on public.question_attempts (user_id, created_at desc);
create index if not exists qa_user_wrong_idx on public.question_attempts (user_id, created_at desc) where correct = false;
create index if not exists qa_session_idx on public.question_attempts (session_id);

alter table public.question_attempts enable row level security;
drop policy if exists qa_select_own on public.question_attempts;
create policy qa_select_own on public.question_attempts
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists qa_insert_own on public.question_attempts;
create policy qa_insert_own on public.question_attempts
  for insert to authenticated with check ((select auth.uid()) = user_id);

revoke all on public.question_attempts from anon;
revoke insert, update, delete on public.question_attempts from authenticated;
grant insert (client_id, session_id, subject_key, topic_key, question_ref, question_text,
              source, difficulty, correct, time_ms, mode)
  on public.question_attempts to authenticated;

-- ------------------------------------------------------------
-- Aggregates (server-maintained, read-only to clients)
-- ------------------------------------------------------------
create table if not exists public.topic_stats (
  user_id         uuid not null references auth.users(id) on delete cascade,
  subject_key     text not null,
  topic_key       text not null,
  attempts        integer not null default 0,
  correct         integer not null default 0,
  -- exponentially weighted recent accuracy (0..1); recent answers count more
  recent_score    real not null default 0,
  last_attempt_at timestamptz,
  primary key (user_id, subject_key, topic_key)
);

create table if not exists public.daily_activity (
  user_id          uuid not null references auth.users(id) on delete cascade,
  day              date not null,
  questions        integer not null default 0,
  correct          integer not null default 0,
  xp               integer not null default 0,
  practice_seconds integer not null default 0,
  reviews          integer not null default 0,
  primary key (user_id, day)
);

create table if not exists public.weekly_xp (
  user_id    uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  xp         integer not null default 0,
  primary key (user_id, week_start)
);
create index if not exists weekly_xp_week_idx on public.weekly_xp (week_start, xp desc);

alter table public.topic_stats    enable row level security;
alter table public.daily_activity enable row level security;
alter table public.weekly_xp      enable row level security;

drop policy if exists ts_select_own on public.topic_stats;
create policy ts_select_own on public.topic_stats
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists da_select_own on public.daily_activity;
create policy da_select_own on public.daily_activity
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists wx_select_own on public.weekly_xp;
create policy wx_select_own on public.weekly_xp
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.topic_stats, public.daily_activity, public.weekly_xp from anon;
revoke insert, update, delete on public.topic_stats, public.daily_activity, public.weekly_xp from authenticated;

-- ------------------------------------------------------------
-- Rules (single place to change them)
-- ------------------------------------------------------------
create or replace function private.xp_for(p_difficulty text, p_correct boolean)
returns integer language sql immutable as $$
  select case when not p_correct then 0
              when p_difficulty = 'hard' then 35
              when p_difficulty = 'medium' then 20
              else 10 end;
$$;

-- A day counts toward the streak once the student has done real work:
-- 5 answered questions or 10 flashcard reviews.
create or replace function private.study_day_questions() returns integer
  language sql immutable as $$ select 5 $$;
create or replace function private.study_day_reviews() returns integer
  language sql immutable as $$ select 10 $$;

create or replace function private.user_today(p_user uuid)
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.profiles where id = p_user), 'UTC'))::date;
$$;

-- Marks `p_day` as a study day and advances the streak. Idempotent per day.
create or replace function private.mark_study_day(p_user uuid, p_day date)
returns void language plpgsql security definer set search_path = public as $$
declare p record; s int; bonus int := 0;
begin
  select last_study_date, streak_days, longest_streak into p
    from public.profiles where id = p_user for update;
  if not found or p.last_study_date is not distinct from p_day then
    return;
  end if;
  if p.last_study_date is not null and p_day < p.last_study_date then
    return; -- late-arriving data for an older day never rewinds the streak
  end if;
  s := case when p.last_study_date = p_day - 1 then p.streak_days + 1 else 1 end;
  -- consistency bonus every 7 days, capped
  if s % 7 = 0 then bonus := least(250, s * 5); end if;

  update public.profiles
     set streak_days = s,
         longest_streak = greatest(coalesce(p.longest_streak, 0), s),
         last_study_date = p_day,
         xp = xp + bonus
   where id = p_user;

  if bonus > 0 then
    insert into public.weekly_xp (user_id, week_start, xp)
    values (p_user, date_trunc('week', now() at time zone 'UTC')::date, bonus)
    on conflict (user_id, week_start) do update set xp = public.weekly_xp.xp + excluded.xp;
    update public.daily_activity set xp = xp + bonus where user_id = p_user and day = p_day;
  end if;
end $$;

-- ------------------------------------------------------------
-- Attempt triggers
-- ------------------------------------------------------------
create or replace function private.before_attempt_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  recent int;
  today_count int;
  q jsonb;
begin
  if caller is not null then
    new.user_id := caller;
  end if;
  if new.user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  new.created_at := now();
  new.xp_awarded := private.xp_for(new.difficulty, new.correct);
  if new.correct then
    new.question_text := null;
  end if;

  if new.session_id is not null and not exists (
    select 1 from public.practice_sessions s
     where s.id = new.session_id and s.user_id = new.user_id
  ) then
    raise exception 'invalid_session' using errcode = '42501';
  end if;

  -- Abuse limits. Far above genuine use (a fast student answers ~6/min).
  select count(*) into recent from public.question_attempts
   where user_id = new.user_id and created_at > now() - interval '1 minute';
  if recent >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001', hint = 'Too many answers in a short time.';
  end if;
  select count(*) into today_count from public.question_attempts
   where user_id = new.user_id and created_at > now() - interval '1 day';
  if today_count >= 1500 then
    raise exception 'rate_limited' using errcode = 'P0001', hint = 'Daily answer limit reached.';
  end if;

  -- Free tier: 100 questions a month, enforced here so progress cannot be
  -- recorded past the limit whatever the client does.
  q := private.consume_quota_for(new.user_id, 1);
  if not coalesce((q ->> 'ok')::boolean, false) then
    raise exception 'free_limit_reached' using errcode = 'P0001',
      hint = 'Free questions reset on ' || coalesce(q ->> 'resets_on', 'the 1st') || '.';
  end if;

  return new;
end $$;

create or replace function private.after_attempt_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d date;
  secs int := least(coalesce(new.time_ms, 0), 180000) / 1000;
  dq int;
begin
  d := (new.created_at at time zone coalesce(
         (select timezone from public.profiles where id = new.user_id), 'UTC'))::date;

  insert into public.topic_stats (user_id, subject_key, topic_key, attempts, correct, recent_score, last_attempt_at)
  values (new.user_id, new.subject_key, new.topic_key, 1, new.correct::int, new.correct::int, new.created_at)
  on conflict (user_id, subject_key, topic_key) do update
    set attempts = public.topic_stats.attempts + 1,
        correct = public.topic_stats.correct + new.correct::int,
        recent_score = public.topic_stats.recent_score * 0.7 + new.correct::int * 0.3,
        last_attempt_at = new.created_at;

  insert into public.daily_activity (user_id, day, questions, correct, xp, practice_seconds)
  values (new.user_id, d, 1, new.correct::int, new.xp_awarded, secs)
  on conflict (user_id, day) do update
    set questions = public.daily_activity.questions + 1,
        correct = public.daily_activity.correct + new.correct::int,
        xp = public.daily_activity.xp + new.xp_awarded,
        practice_seconds = public.daily_activity.practice_seconds + secs
  returning questions into dq;

  if new.xp_awarded > 0 then
    update public.profiles set xp = xp + new.xp_awarded where id = new.user_id;
    insert into public.weekly_xp (user_id, week_start, xp)
    values (new.user_id, date_trunc('week', new.created_at at time zone 'UTC')::date, new.xp_awarded)
    on conflict (user_id, week_start) do update set xp = public.weekly_xp.xp + excluded.xp;
  end if;

  if new.session_id is not null then
    update public.practice_sessions
       set question_count = question_count + 1,
           correct_count = correct_count + new.correct::int,
           practice_seconds = practice_seconds + secs,
           xp_earned = xp_earned + new.xp_awarded
     where id = new.session_id;
  end if;

  if dq = private.study_day_questions() then
    perform private.mark_study_day(new.user_id, d);
  end if;
  return null;
end $$;

drop trigger if exists trg_attempt_before on public.question_attempts;
create trigger trg_attempt_before
  before insert on public.question_attempts
  for each row execute function private.before_attempt_insert();

drop trigger if exists trg_attempt_after on public.question_attempts;
create trigger trg_attempt_after
  after insert on public.question_attempts
  for each row execute function private.after_attempt_insert();

-- Wrong answers only ever come from the owner; attempts are immutable.
-- (No update/delete policies or grants exist.)

-- ------------------------------------------------------------
-- Goals
-- ------------------------------------------------------------
create table if not exists public.goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('questions', 'practice_minutes', 'accuracy', 'flashcards', 'papers', 'paper_score', 'sat_score')),
  period       text not null default 'weekly' check (period in ('weekly', 'by_date')),
  subject_key  text references public.catalog_subjects(key) on delete cascade,
  target       numeric not null check (target > 0 and target <= 100000),
  target_label text check (target_label is null or char_length(target_label) <= 12),
  due_date     date,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz,
  check (period = 'weekly' or due_date is not null),
  check (kind not in ('accuracy', 'paper_score') or target <= 100),
  check (kind <> 'sat_score' or target between 400 and 1600),
  -- per-subject tracking exists for papers only; activity totals are overall
  check (subject_key is null or kind in ('papers', 'paper_score'))
);
create index if not exists goals_user_idx on public.goals (user_id, created_at desc);

-- ------------------------------------------------------------
-- Notes
-- ------------------------------------------------------------
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_key text references public.catalog_subjects(key) on delete set null,
  title       text not null default '' check (char_length(title) <= 120),
  body        text not null default '' check (char_length(body) <= 100000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists notes_user_idx on public.notes (user_id, updated_at desc);

drop trigger if exists trg_notes_touch on public.notes;
create trigger trg_notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- Flashcards (spaced repetition)
-- ------------------------------------------------------------
create table if not exists public.flashcard_decks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  subject_key text references public.catalog_subjects(key) on delete set null,
  source      text not null default 'manual' check (source in ('manual', 'ai', 'note')),
  created_at  timestamptz not null default now()
);
create index if not exists decks_user_idx on public.flashcard_decks (user_id, created_at desc);

create table if not exists public.flashcards (
  id               uuid primary key default gen_random_uuid(),
  deck_id          uuid not null references public.flashcard_decks(id) on delete cascade,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  front            text not null check (char_length(front) between 1 and 500),
  back             text not null check (char_length(back) between 1 and 2000),
  ease             real not null default 2.5,
  interval_days    integer not null default 0,
  repetitions      integer not null default 0,
  lapses           integer not null default 0,
  due_at           timestamptz not null default now(),
  last_reviewed_at timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists flashcards_due_idx on public.flashcards (user_id, due_at);
create index if not exists flashcards_deck_idx on public.flashcards (deck_id);

-- A card must live in a deck owned by the same user.
create or replace function private.check_card_deck()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.flashcard_decks d where d.id = new.deck_id and d.user_id = new.user_id) then
    raise exception 'deck_not_found' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_card_deck on public.flashcards;
create trigger trg_card_deck before insert or update of deck_id, user_id on public.flashcards
  for each row execute function private.check_card_deck();

-- ------------------------------------------------------------
-- Past papers (catalogue managed by admins) + student attempts
-- ------------------------------------------------------------
create table if not exists public.past_papers (
  id               uuid primary key default gen_random_uuid(),
  subject_key      text not null references public.catalog_subjects(key) on delete cascade,
  year             smallint not null check (year between 1990 and 2100),
  session          text not null check (session in ('feb_mar', 'may_jun', 'oct_nov', 'specimen', 'practice')),
  paper_number     smallint check (paper_number between 1 and 9),
  variant          smallint check (variant between 1 and 9),
  kind             text not null default 'question_paper'
                   check (kind in ('question_paper', 'mark_scheme', 'insert', 'practice_test', 'answer_key')),
  title            text not null check (char_length(title) between 1 and 160),
  tier             text check (tier in ('core', 'extended')),
  storage_path     text,
  external_url     text check (external_url is null or external_url ~ '^https://'),
  duration_minutes smallint,
  max_marks        smallint,
  created_at       timestamptz not null default now(),
  check (storage_path is not null or external_url is not null)
);
create index if not exists past_papers_subject_idx on public.past_papers (subject_key, year desc);

create table if not exists public.paper_attempts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  paper_id         uuid references public.past_papers(id) on delete set null,
  subject_key      text not null references public.catalog_subjects(key) on delete cascade,
  title            text not null check (char_length(title) between 1 and 160),
  score            numeric not null check (score >= 0),
  max_score        numeric not null check (max_score > 0 and max_score <= 2000),
  completed_on     date not null default current_date,
  duration_minutes smallint check (duration_minutes is null or duration_minutes between 1 and 600),
  reflection       text check (reflection is null or char_length(reflection) <= 2000),
  created_at       timestamptz not null default now(),
  check (score <= max_score)
);
create index if not exists paper_attempts_user_idx on public.paper_attempts (user_id, completed_on desc);

-- ------------------------------------------------------------
-- RLS for owned tables
-- ------------------------------------------------------------
alter table public.goals           enable row level security;
alter table public.notes           enable row level security;
alter table public.flashcard_decks enable row level security;
alter table public.flashcards      enable row level security;
alter table public.past_papers     enable row level security;
alter table public.paper_attempts  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['goals', 'notes', 'flashcard_decks', 'flashcards', 'paper_attempts'] loop
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t || '_own', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Scheduling fields change only through review_flashcard().
revoke update on public.flashcards from authenticated;
grant update (front, back, deck_id) on public.flashcards to authenticated;
revoke insert on public.flashcards from authenticated;
grant insert (id, deck_id, front, back) on public.flashcards to authenticated;

drop policy if exists past_papers_read on public.past_papers;
create policy past_papers_read on public.past_papers
  for select to authenticated using (true);
revoke all on public.past_papers from anon;
revoke insert, update, delete on public.past_papers from authenticated;

-- Storage bucket for paper PDFs. Signed-in users can read; only the service
-- role (the import script) can write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('past-papers', 'past-papers', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "past papers readable by students" on storage.objects;
create policy "past papers readable by students" on storage.objects
  for select to authenticated using (bucket_id = 'past-papers');

-- ------------------------------------------------------------
-- RPC: review a flashcard (SM-2 variant)
--   grade 0 = again, 1 = hard, 2 = good, 3 = easy
-- ------------------------------------------------------------
create or replace function public.review_flashcard(p_card uuid, p_grade smallint)
returns public.flashcards
language plpgsql security definer set search_path = public as $$
declare
  c public.flashcards;
  uid uuid := auth.uid();
  q int;
  new_ease real;
  new_interval int;
  d date;
  dr int;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_grade is null or p_grade not between 0 and 3 then
    raise exception 'invalid_grade' using errcode = '22023';
  end if;

  select * into c from public.flashcards where id = p_card and user_id = uid for update;
  if not found then
    raise exception 'card_not_found' using errcode = '42501';
  end if;

  if p_grade = 0 then
    c.repetitions := 0;
    c.lapses := c.lapses + 1;
    c.interval_days := 0;
    c.ease := greatest(1.3, c.ease - 0.2);
    c.due_at := now() + interval '10 minutes';
  else
    q := p_grade + 2; -- map to SM-2 quality 3..5
    new_ease := greatest(1.3, c.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    if c.repetitions = 0 then
      new_interval := case p_grade when 3 then 3 else 1 end;
    elsif c.repetitions = 1 then
      new_interval := case p_grade when 1 then 3 when 2 then 6 else 8 end;
    else
      new_interval := greatest(c.interval_days + 1, round(c.interval_days * new_ease *
        case p_grade when 1 then 0.8 when 3 then 1.3 else 1 end)::int);
    end if;
    c.ease := new_ease;
    c.interval_days := least(new_interval, 365);
    c.repetitions := c.repetitions + 1;
    c.due_at := now() + make_interval(days => c.interval_days);
  end if;
  c.last_reviewed_at := now();

  update public.flashcards
     set ease = c.ease, interval_days = c.interval_days, repetitions = c.repetitions,
         lapses = c.lapses, due_at = c.due_at, last_reviewed_at = c.last_reviewed_at
   where id = c.id;

  d := private.user_today(uid);
  insert into public.daily_activity (user_id, day, reviews)
  values (uid, d, 1)
  on conflict (user_id, day) do update set reviews = public.daily_activity.reviews + 1
  returning reviews into dr;
  if dr = private.study_day_reviews() then
    perform private.mark_study_day(uid, d);
  end if;

  return c;
end $$;

-- ------------------------------------------------------------
-- RPC: weekly leaderboard within the caller's program
-- Only opted-in students with a username appear. Returns usernames and
-- weekly XP — never ids, emails or tiers.
-- ------------------------------------------------------------
create or replace function public.get_leaderboard(p_limit integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prog text;
  wk date := date_trunc('week', now() at time zone 'UTC')::date;
  rows jsonb;
  me jsonb;
  total int;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select program into prog from public.profiles where id = uid;
  p_limit := least(greatest(coalesce(p_limit, 30), 5), 100);

  with cohort as (
    select p.id, p.username, coalesce(w.xp, 0) as xp
      from public.profiles p
      left join public.weekly_xp w on w.user_id = p.id and w.week_start = wk
     where p.role = 'student'
       and p.program is not distinct from prog
       and (p.id = uid or (p.leaderboard_opt_in and p.username is not null and coalesce(w.xp, 0) > 0))
  ), ranked as (
    select id, username, xp,
           rank() over (order by xp desc) as rnk
      from cohort
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'rank', rnk, 'username', coalesce(username, 'You'), 'xp', xp, 'is_me', id = uid)
      order by rnk, username) filter (where rnk <= p_limit), '[]'::jsonb),
    (select jsonb_build_object('rank', rnk, 'xp', xp) from ranked where id = uid),
    count(*)
  into rows, me, total
  from ranked;

  return jsonb_build_object(
    'week_start', wk,
    'week_end', wk + 6,
    'program', prog,
    'entries', rows,
    'me', me,
    'size', total);
end $$;

-- ------------------------------------------------------------
-- RPC: export everything we hold about the caller (privacy)
-- ------------------------------------------------------------
create or replace function public.export_my_data()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'subjects', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.student_subjects s where s.user_id = uid),
    'attempts', (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at), '[]') from public.question_attempts a where a.user_id = uid),
    'sessions', (select coalesce(jsonb_agg(to_jsonb(s) order by s.started_at), '[]') from public.practice_sessions s where s.user_id = uid),
    'goals', (select coalesce(jsonb_agg(to_jsonb(g)), '[]') from public.goals g where g.user_id = uid),
    'notes', (select coalesce(jsonb_agg(to_jsonb(n)), '[]') from public.notes n where n.user_id = uid),
    'flashcard_decks', (select coalesce(jsonb_agg(to_jsonb(d)), '[]') from public.flashcard_decks d where d.user_id = uid),
    'flashcards', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.flashcards c where c.user_id = uid),
    'paper_attempts', (select coalesce(jsonb_agg(to_jsonb(pa)), '[]') from public.paper_attempts pa where pa.user_id = uid)
  );
end $$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;

-- Explicit allow-list: nothing in public is callable unless granted here.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.my_tier() to authenticated;
grant execute on function public.quota_status() to authenticated;
grant execute on function public.my_ai_allowance(text) to authenticated;
grant execute on function public.review_flashcard(uuid, smallint) to authenticated;
grant execute on function public.get_leaderboard(integer) to authenticated;
grant execute on function public.export_my_data() to authenticated;
