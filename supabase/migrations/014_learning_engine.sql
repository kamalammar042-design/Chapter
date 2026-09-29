-- ============================================================
-- CHAPTER — Migration 014: learning engine
-- ------------------------------------------------------------
-- Run AFTER 013.
--
--   submit_attempt()         the only way to record an answer: correctness
--                            is decided on the server from the stored key
--   skill_mastery            difficulty-adjusted mastery per skill + spaced
--                            review schedule
--   student_misconceptions   recurring misconceptions detected from the
--                            wrong options students choose
--   question_stats upkeep    per-question analytics for the quality loop
--
-- Mastery model (explainable on purpose):
--   Each student has a rating θ per skill (starts at 0). A question of
--   difficulty d (1–5) has b = (d − 3) × 0.8. The expected chance of success
--   is p = 1 / (1 + e^(b − θ)). After an answer, θ += k × (outcome − p),
--   where outcome is 1 for correct, 0.6 for correct with a hint and 0 for
--   wrong, and k shrinks from 0.6 towards 0.15 as evidence grows.
--   Mastery % = 100 × sigmoid(θ) × min(1, attempts / 8).
--
-- Spaced review: a correct unaided answer moves the skill one step along
-- 1, 3, 7, 14, 30, 60 days (at most one step per day); a wrong answer resets
-- it and brings the skill back the next day.
-- ============================================================

-- ------------------------------------------------------------
-- Attempts: link to the question and record what was chosen
-- ------------------------------------------------------------
alter table public.question_attempts
  add column if not exists question_id      uuid references public.questions(id) on delete set null,
  add column if not exists question_version integer,
  add column if not exists selected_index   smallint,
  add column if not exists hints_used       smallint not null default 0,
  add column if not exists skill_id         text references public.skills(id) on delete set null,
  add column if not exists misconception_id uuid references public.misconceptions(id) on delete set null;

do $$ begin
  alter table public.question_attempts add constraint question_attempts_hints_range check (hints_used between 0 and 5);
exception when duplicate_object then null; end $$;

create index if not exists qa_question_idx on public.question_attempts (question_id);
create index if not exists qa_user_skill_idx on public.question_attempts (user_id, skill_id, created_at desc);

alter table public.question_attempts drop constraint if exists question_attempts_mode_check;
alter table public.question_attempts add constraint question_attempts_mode_check
  check (mode in ('practice', 'daily', 'exam', 'placement', 'review', 'reading', 'weakness', 'guided', 'plan'));
alter table public.practice_sessions drop constraint if exists practice_sessions_mode_check;
alter table public.practice_sessions add constraint practice_sessions_mode_check
  check (mode in ('practice', 'daily', 'exam', 'placement', 'review', 'reading', 'weakness', 'guided', 'plan'));

-- Session extras the client reports (non-integrity counters).
alter table public.practice_sessions
  add column if not exists hints_used          integer not null default 0,
  add column if not exists explanations_viewed integer not null default 0,
  add column if not exists flashcards_reviewed integer not null default 0,
  add column if not exists tutor_messages      integer not null default 0;
grant update (ended_at, explanations_viewed, flashcards_reviewed, tutor_messages) on public.practice_sessions to authenticated;

-- Answers are recorded through submit_attempt() only, so the client can no
-- longer claim an answer was correct.
revoke insert on public.question_attempts from authenticated;

-- Hinted answers earn half XP.
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
  if coalesce(new.hints_used, 0) > 0 then
    new.xp_awarded := new.xp_awarded / 2;
  end if;
  if new.correct then
    new.question_text := null;
  end if;

  if new.session_id is not null and not exists (
    select 1 from public.practice_sessions s where s.id = new.session_id and s.user_id = new.user_id
  ) then
    raise exception 'invalid_session' using errcode = '42501';
  end if;

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

  q := private.consume_quota_for(new.user_id, 1);
  if not coalesce((q ->> 'ok')::boolean, false) then
    raise exception 'free_limit_reached' using errcode = 'P0001',
      hint = 'Free questions reset on ' || coalesce(q ->> 'resets_on', 'the 1st') || '.';
  end if;
  return new;
end $$;

-- ------------------------------------------------------------
-- Skill mastery + spaced review
-- ------------------------------------------------------------
create table if not exists public.skill_mastery (
  user_id          uuid not null references auth.users(id) on delete cascade,
  skill_id         text not null references public.skills(id) on delete cascade,
  attempts         integer not null default 0,
  correct          integer not null default 0,
  hints_used       integer not null default 0,
  rating           real not null default 0,
  mastery          smallint not null default 0,
  recent_score     real not null default 0,
  correct_streak   integer not null default 0,
  incorrect_streak integer not null default 0,
  review_level     smallint not null default 0,
  interval_days    smallint not null default 0,
  last_review_day  date,
  next_review_at   timestamptz,
  first_seen_at    timestamptz not null default now(),
  last_practiced_at timestamptz,
  primary key (user_id, skill_id)
);
create index if not exists skill_mastery_review_idx on public.skill_mastery (user_id, next_review_at);

create table if not exists public.student_misconceptions (
  user_id          uuid not null references auth.users(id) on delete cascade,
  misconception_id uuid not null references public.misconceptions(id) on delete cascade,
  evidence_count   integer not null default 0,
  avoided_count    integer not null default 0,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  resolved_at      timestamptz,
  primary key (user_id, misconception_id)
);

alter table public.skill_mastery enable row level security;
alter table public.student_misconceptions enable row level security;
drop policy if exists sm_select_own on public.skill_mastery;
create policy sm_select_own on public.skill_mastery for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists smc_select_own on public.student_misconceptions;
create policy smc_select_own on public.student_misconceptions for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.skill_mastery, public.student_misconceptions from anon;
revoke insert, update, delete on public.skill_mastery, public.student_misconceptions from authenticated;

create or replace function private.after_attempt_learning()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  q record;
  sm public.skill_mastery;
  b real;
  p real;
  k real;
  outcome real;
  rating_new real;
  attempts_new int;
  today date;
  steps int[] := array[1, 3, 7, 14, 30, 60];
  lvl int;
begin
  if new.question_id is null then
    return null;
  end if;
  select id, difficulty, options, question_type into q from public.questions where id = new.question_id;

  -- ---- per-question analytics ------------------------------------------
  insert into public.question_stats (question_id) values (new.question_id) on conflict do nothing;
  update public.question_stats
     set attempts = attempts + 1,
         correct = correct + new.correct::int,
         total_time_ms = total_time_ms + least(coalesce(new.time_ms, 0), 180000),
         hint_uses = hint_uses + (new.hints_used > 0)::int,
         last_attempt_at = new.created_at
   where question_id = new.question_id;
  if new.selected_index is not null and new.selected_index between 0 and 5 then
    update public.question_stats
       set option_counts[new.selected_index + 1] = option_counts[new.selected_index + 1] + 1
     where question_id = new.question_id;
  end if;

  -- ---- skill mastery + spaced review -------------------------------------
  if new.skill_id is not null then
    insert into public.skill_mastery (user_id, skill_id) values (new.user_id, new.skill_id) on conflict do nothing;
    select * into sm from public.skill_mastery where user_id = new.user_id and skill_id = new.skill_id for update;

    b := (q.difficulty - 3) * 0.8;
    p := 1 / (1 + exp(b - sm.rating));
    outcome := case when new.correct then case when new.hints_used > 0 then 0.6 else 1 end else 0 end;
    k := greatest(0.15, 0.6 / (1 + sm.attempts * 0.08));
    rating_new := greatest(-4, least(4, sm.rating + k * (outcome - p)));
    attempts_new := sm.attempts + 1;
    today := private.user_today(new.user_id);

    if new.correct and new.hints_used = 0 then
      if sm.last_review_day is distinct from today then
        lvl := least(sm.review_level + 1, 6);
        sm.interval_days := steps[lvl];
        sm.review_level := lvl;
        sm.last_review_day := today;
      end if;
      sm.correct_streak := sm.correct_streak + 1;
      sm.incorrect_streak := 0;
      sm.next_review_at := new.created_at + make_interval(days => sm.interval_days);
    elsif new.correct then
      -- helped to the answer: no promotion, see it again soon
      sm.correct_streak := 0;
      sm.next_review_at := new.created_at + interval '1 day';
    else
      sm.correct_streak := 0;
      sm.incorrect_streak := sm.incorrect_streak + 1;
      sm.review_level := 0;
      sm.interval_days := 0;
      sm.next_review_at := new.created_at + interval '20 hours';
    end if;

    update public.skill_mastery
       set attempts = attempts_new,
           correct = sm.correct + new.correct::int,
           hints_used = sm.hints_used + (new.hints_used > 0)::int,
           rating = rating_new,
           mastery = round(100 * (1 / (1 + exp(-rating_new))) * least(1, attempts_new / 8.0)),
           recent_score = case when sm.attempts = 0 then new.correct::int else sm.recent_score * 0.7 + new.correct::int * 0.3 end,
           correct_streak = sm.correct_streak,
           incorrect_streak = sm.incorrect_streak,
           review_level = sm.review_level,
           interval_days = sm.interval_days,
           last_review_day = sm.last_review_day,
           next_review_at = sm.next_review_at,
           last_practiced_at = new.created_at
     where user_id = new.user_id and skill_id = new.skill_id;
  end if;

  if new.session_id is not null and new.hints_used > 0 then
    update public.practice_sessions set hints_used = hints_used + new.hints_used where id = new.session_id;
  end if;

  -- ---- misconceptions ----------------------------------------------------
  if new.misconception_id is not null then
    insert into public.student_misconceptions (user_id, misconception_id, evidence_count, last_seen_at)
    values (new.user_id, new.misconception_id, 1, new.created_at)
    on conflict (user_id, misconception_id) do update
      set evidence_count = public.student_misconceptions.evidence_count + 1,
          avoided_count = 0, last_seen_at = new.created_at, resolved_at = null;
  elsif new.correct and q.question_type = 'mcq' then
    -- avoiding a known trap twice counts as having moved past it
    update public.student_misconceptions m
       set avoided_count = m.avoided_count + 1,
           resolved_at = case when m.avoided_count + 1 >= 2 then new.created_at end
     where m.user_id = new.user_id and m.resolved_at is null
       and m.misconception_id in (
         select (o ->> 'misconception_id')::uuid from jsonb_array_elements(q.options) o
          where coalesce(o ->> 'misconception_id', '') <> '');
  end if;
  return null;
end $$;

drop trigger if exists trg_attempt_learning on public.question_attempts;
create trigger trg_attempt_learning
  after insert on public.question_attempts
  for each row execute function private.after_attempt_learning();

-- ------------------------------------------------------------
-- RPC: submit an answer
-- ------------------------------------------------------------
create or replace function public.submit_attempt(
  p_client_id  uuid,
  p_question_id uuid,
  p_selected   smallint,
  p_time_ms    integer default null,
  p_hints      smallint default 0,
  p_mode       text default 'practice',
  p_session_id uuid default null,
  p_instance   jsonb default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  q public.questions;
  prev public.question_attempts;
  is_correct boolean;
  misc uuid;
  diff_label text;
  before_m smallint;
  after_m smallint;
  r public.question_attempts;
  hints smallint := greatest(0, least(5, coalesce(p_hints, 0)));
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_client_id is null then
    raise exception 'invalid_request' using errcode = '22023';
  end if;

  -- Idempotent: a retried submission returns the original result.
  select * into prev from public.question_attempts where user_id = uid and client_id = p_client_id;
  if found then
    select correct_index into q.correct_index from public.questions where id = prev.question_id;
    return jsonb_build_object('duplicate', true, 'correct', prev.correct, 'correct_index', q.correct_index,
                              'xp', prev.xp_awarded, 'skill_id', prev.skill_id);
  end if;

  select * into q from public.questions
   where id = p_question_id and status = 'published' and (owner_id is null or owner_id = uid);
  if not found then
    raise exception 'question_not_found' using errcode = 'P0002';
  end if;

  if q.question_type = 'mcq' then
    if p_selected is null or p_selected < 0 or p_selected >= jsonb_array_length(q.options) then
      raise exception 'invalid_answer' using errcode = '22023';
    end if;
    is_correct := p_selected = q.correct_index;
    if not is_correct then
      misc := nullif(q.options -> p_selected ->> 'misconception_id', '')::uuid;
    end if;
  else
    -- Procedural families are generated and checked deterministically on the
    -- device (see src/content/templates.ts); the instance reports the result.
    if p_instance is null or coalesce(jsonb_typeof(p_instance -> 'correct'), '') <> 'boolean' then
      raise exception 'invalid_answer' using errcode = '22023';
    end if;
    is_correct := (p_instance ->> 'correct')::boolean;
    if not is_correct and coalesce(p_instance ->> 'misconception', '') <> '' then
      select id into misc from public.misconceptions
       where skill_id = q.skill_id and key = p_instance ->> 'misconception';
    end if;
  end if;

  diff_label := case when q.difficulty <= 2 then 'easy' when q.difficulty = 3 then 'medium' else 'hard' end;
  if q.skill_id is not null then
    select mastery into before_m from public.skill_mastery where user_id = uid and skill_id = q.skill_id;
  end if;

  insert into public.question_attempts (
    client_id, user_id, session_id, subject_key, topic_key, question_ref, question_text, source, difficulty,
    correct, time_ms, mode, question_id, question_version, selected_index, hints_used, skill_id, misconception_id)
  values (
    p_client_id, uid, p_session_id, q.subject_key, q.topic_key,
    left(coalesce(p_instance ->> 'ref', q.id::text), 200),
    left(case when q.question_type = 'procedural' then coalesce(p_instance ->> 'text', q.stem) else q.stem end, 1200),
    case when q.question_type = 'procedural' then 'generated' when q.source_type = 'generated' then 'ai' else 'bank' end,
    diff_label, is_correct, greatest(0, least(3600000, p_time_ms)), p_mode, q.id, q.version, p_selected, hints,
    q.skill_id, misc)
  returning * into r;

  if q.skill_id is not null then
    select mastery into after_m from public.skill_mastery where user_id = uid and skill_id = q.skill_id;
  end if;

  return jsonb_build_object(
    'duplicate', false,
    'correct', is_correct,
    'correct_index', q.correct_index,
    'xp', r.xp_awarded,
    'skill_id', q.skill_id,
    'mastery_before', coalesce(before_m, 0),
    'mastery_after', coalesce(after_m, 0),
    'misconception', (select description from public.misconceptions where id = misc));
end $$;

-- ------------------------------------------------------------
-- RPC: questions for a practice set
-- ------------------------------------------------------------
-- Published questions for the requested scope, respecting the student's
-- IGCSE tier, preferring ones they have not answered recently. Returns
-- answers too: practice gives instant feedback and works offline, while
-- submit_attempt() decides correctness independently.
create or replace function public.get_practice_pool(
  p_subject  text,
  p_topic    text default null,
  p_skills   text[] default null,
  p_min_diff smallint default 1,
  p_max_diff smallint default 5,
  p_limit    integer default 60
)
returns table (
  id uuid, subject_key text, topic_key text, skill_id text, question_type text, template_key text,
  stem text, options jsonb, correct_index smallint, explanation text, hint text, difficulty smallint,
  cognitive_level text, source_type text, source_name text, recently_seen boolean
)
language sql stable security definer set search_path = public as $$
  with me as (
    select id, igcse_tier from public.profiles where id = auth.uid()
  ), recent as (
    select distinct question_id from public.question_attempts
     where user_id = auth.uid() and question_id is not null and created_at > now() - interval '3 days'
  )
  select q.id, q.subject_key, q.topic_key, q.skill_id, q.question_type, q.template_key,
         q.stem, q.options, q.correct_index, q.explanation, q.hint, q.difficulty,
         q.cognitive_level, q.source_type, q.source_name,
         (r.question_id is not null) as recently_seen
    from public.questions q
    cross join me
    left join recent r on r.question_id = q.id
   where auth.uid() is not null
     and q.status = 'published'
     and (q.owner_id is null or q.owner_id = auth.uid())
     and q.subject_key = p_subject
     and (p_topic is null or q.topic_key = p_topic)
     and (p_skills is null or q.skill_id = any (p_skills))
     and q.difficulty between p_min_diff and p_max_diff
     and not (me.igcse_tier = 'core' and q.tier = 'extended')
   order by (r.question_id is not null), random()
   limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

-- Records that a question was shown but skipped (for the quality loop).
create or replace function public.record_skip(p_question_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from public.questions where id = p_question_id and status = 'published' and owner_id is null) then
    insert into public.question_stats (question_id, skips) values (p_question_id, 1)
    on conflict (question_id) do update set skips = public.question_stats.skips + 1;
  end if;
end $$;

-- Skills due for spaced review, with names, for the caller.
create or replace function public.due_reviews(p_limit integer default 20)
returns table (skill_id text, subject_key text, topic_key text, name text, mastery smallint,
               next_review_at timestamptz, interval_days smallint, incorrect_streak integer)
language sql stable security definer set search_path = public as $$
  select m.skill_id, s.subject_key, s.topic_key, s.name, m.mastery, m.next_review_at, m.interval_days, m.incorrect_streak
    from public.skill_mastery m join public.skills s on s.id = m.skill_id
   where m.user_id = auth.uid() and m.next_review_at is not null and m.next_review_at <= now()
   order by m.mastery asc, m.next_review_at asc
   limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.my_tier() to authenticated;
grant execute on function public.quota_status() to authenticated;
grant execute on function public.my_ai_allowance(text) to authenticated;
grant execute on function public.review_flashcard(uuid, smallint) to authenticated;
grant execute on function public.get_leaderboard(integer) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.create_parent_invite() to authenticated;
grant execute on function public.accept_parent_invite(text) to authenticated;
grant execute on function public.remove_parent_link(uuid) to authenticated;
grant execute on function public.my_parent_links() to authenticated;
grant execute on function public.my_students() to authenticated;
grant execute on function public.parent_student_overview(uuid) to authenticated;
grant execute on function public.my_subscription() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.submit_attempt(uuid, uuid, smallint, integer, smallint, text, uuid, jsonb) to authenticated;
grant execute on function public.get_practice_pool(text, text, text[], smallint, smallint, integer) to authenticated;
grant execute on function public.record_skip(uuid) to authenticated;
grant execute on function public.due_reviews(integer) to authenticated;
grant execute on function public.service_can_use_ai(uuid, text) to service_role;
grant execute on function public.service_remember(uuid, text, text, text) to service_role;
