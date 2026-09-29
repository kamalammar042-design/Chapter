-- ============================================================
-- CHAPTER — Migration 015: AI operations, observability, admin analytics
-- ------------------------------------------------------------
-- Run AFTER 014.
--
--   ai_usage (extended)        model, task, duration, tokens, estimated cost
--   content_generation_runs    one row per question-generation request
--   app_events                 privacy-safe error/event log (no content)
--   service_student_context()  focused tutor context (subject/topic aware)
--   admin_* functions          content health, AI cost, recent events
-- ============================================================

-- ------------------------------------------------------------
-- AI usage detail
-- ------------------------------------------------------------
alter table public.ai_usage
  add column if not exists model              text,
  add column if not exists task               text,
  add column if not exists duration_ms        integer,
  add column if not exists cache_read_tokens  integer default 0,
  add column if not exists estimated_cost_usd numeric(10, 5) default 0,
  add column if not exists error_code         text;

alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('pdf_scan', 'essay_mark', 'tutor_message', 'generate', 'internal'));
create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);

-- Internal calls (e.g. verifying generated questions) are Chapter's cost, not
-- the student's: they do not count towards the short-window limit.
create or replace function private.ai_recent_calls(p_user uuid, p_seconds integer)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.ai_usage
   where user_id = p_user and kind <> 'internal' and created_at > now() - make_interval(secs => p_seconds);
$$;

-- ------------------------------------------------------------
-- Question generation runs
-- ------------------------------------------------------------
create table if not exists public.content_generation_runs (
  id              uuid primary key default gen_random_uuid(),
  requested_by    uuid references auth.users(id) on delete set null,
  subject_key     text not null,
  topic_key       text not null,
  skill_id        text references public.skills(id) on delete set null,
  requested_count integer not null,
  published       integer not null default 0,
  pending_review  integer not null default 0,
  rejected        integer not null default 0,
  model           text,
  report          jsonb,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index if not exists generation_runs_started_idx on public.content_generation_runs (started_at desc);
alter table public.content_generation_runs enable row level security;
drop policy if exists generation_runs_admin on public.content_generation_runs;
create policy generation_runs_admin on public.content_generation_runs for select to authenticated using (public.is_admin());
revoke all on public.content_generation_runs from anon;
revoke insert, update, delete on public.content_generation_runs from authenticated;

-- ------------------------------------------------------------
-- Application events (observability)
-- Stores what went wrong and where, never passwords, tokens or student
-- content. The user is recorded as a one-way hash for de-duplication only.
-- ------------------------------------------------------------
create table if not exists public.app_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  level       text not null check (level in ('error', 'warn', 'info')),
  source      text not null check (source in ('client', 'edge', 'db')),
  event       text not null check (char_length(event) between 2 and 80),
  route       text check (route is null or char_length(route) <= 200),
  message     text check (message is null or char_length(message) <= 500),
  detail      jsonb check (detail is null or pg_column_size(detail) <= 4096),
  user_hash   text,
  app_version text
);
create index if not exists app_events_created_idx on public.app_events (created_at desc);
alter table public.app_events enable row level security;
drop policy if exists app_events_admin on public.app_events;
create policy app_events_admin on public.app_events for select to authenticated using (public.is_admin());
revoke all on public.app_events from anon;
revoke insert, update, delete on public.app_events from authenticated;

create or replace function public.log_client_event(
  p_level text, p_event text, p_route text default null, p_message text default null,
  p_detail jsonb default null, p_version text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  h text;
  recent int;
begin
  if uid is null or p_level not in ('error', 'warn', 'info') then
    return;
  end if;
  h := left(encode(sha256(convert_to(uid::text, 'UTF8')), 'hex'), 16);
  select count(*) into recent from public.app_events where user_hash = h and created_at > now() - interval '10 minutes';
  if recent >= 20 then
    return; -- quietly drop floods
  end if;
  insert into public.app_events (level, source, event, route, message, detail, user_hash, app_version)
  values (p_level, 'client', left(coalesce(p_event, 'unknown'), 80), left(p_route, 200), left(p_message, 500),
          case when p_detail is null or pg_column_size(p_detail) > 4096 then null else p_detail end,
          h, left(p_version, 40));
end $$;

-- ------------------------------------------------------------
-- Focused tutor context
-- Only what matters for this request: the relevant subject's weak skills,
-- unresolved misconceptions, recent mistakes and exam, plus preferences.
-- ------------------------------------------------------------
drop function if exists public.service_student_context(uuid);
create or replace function public.service_student_context(p_user uuid, p_subject text default null, p_topic text default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'name', p.display_name, 'program', p.program, 'igcse_tier', p.igcse_tier,
        'tutor_style', p.tutor_style, 'today', (now() at time zone p.timezone)::date)
      from public.profiles p where p.id = p_user),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
               'subject', cs.name, 'program', cs.program, 'exam_date', s.exam_date, 'target', s.target_grade)
             order by (s.subject_key = p_subject) desc, s.exam_date nulls last)
        from public.student_subjects s join public.catalog_subjects cs on cs.key = s.subject_key
       where s.user_id = p_user and (p_subject is null or s.subject_key = p_subject or s.exam_date is not null)), '[]'::jsonb),
    'skills', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('subject', cs.name, 'topic', ct.name, 'skill', sk.name, 'mastery', m.mastery,
                                  'attempts', m.attempts, 'streak_wrong', m.incorrect_streak) as x
          from public.skill_mastery m
          join public.skills sk on sk.id = m.skill_id
          join public.catalog_topics ct on ct.subject_key = sk.subject_key and ct.key = sk.topic_key
          join public.catalog_subjects cs on cs.key = sk.subject_key
         where m.user_id = p_user and m.attempts >= 2
           and (p_subject is null or sk.subject_key = p_subject)
           and (p_topic is null or sk.topic_key = p_topic or m.mastery < 50)
         order by (sk.topic_key = p_topic) desc nulls last, m.mastery asc
         limit 8) y), '[]'::jsonb),
    'misconceptions', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('skill', sk.name, 'misconception', mc.description, 'times', smc.evidence_count) as x
          from public.student_misconceptions smc
          join public.misconceptions mc on mc.id = smc.misconception_id
          join public.skills sk on sk.id = mc.skill_id
         where smc.user_id = p_user and smc.resolved_at is null
           and (p_subject is null or sk.subject_key = p_subject)
         order by smc.evidence_count desc, smc.last_seen_at desc
         limit 5) y), '[]'::jsonb),
    'recent_mistakes', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('topic', ct.name, 'question', left(a.question_text, 240)) as x
          from public.question_attempts a
          join public.catalog_topics ct on ct.subject_key = a.subject_key and ct.key = a.topic_key
         where a.user_id = p_user and not a.correct and a.question_text is not null
           and a.created_at > now() - interval '14 days'
           and (p_subject is null or a.subject_key = p_subject)
           and (p_topic is null or a.topic_key = p_topic)
         order by a.created_at desc
         limit 4) y), '[]'::jsonb),
    'memory', coalesce((
      select jsonb_agg(jsonb_build_object('kind', m.kind, 'content', m.content))
        from (select * from public.student_memory
               where user_id = p_user and (p_subject is null or subject_key is null or subject_key = p_subject)
               order by (kind = 'preference') desc, updated_at desc limit 12) m), '[]'::jsonb),
    'recent_papers', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('title', pa.title, 'score', pa.score, 'max', pa.max_score, 'on', pa.completed_on) as x
          from public.paper_attempts pa
         where pa.user_id = p_user and (p_subject is null or pa.subject_key = p_subject)
         order by pa.completed_on desc limit 2) y), '[]'::jsonb)
  );
$$;

-- ------------------------------------------------------------
-- Admin analytics
-- ------------------------------------------------------------
create or replace function private.expected_accuracy(d smallint)
returns real language sql immutable as $$
  select case d when 1 then 0.85 when 2 then 0.72 when 3 then 0.6 when 4 then 0.45 else 0.32 end::real;
$$;

create or replace function public.admin_question_health(
  p_min_attempts integer default 30, p_only_flagged boolean default true, p_limit integer default 200)
returns table (
  question_id uuid, stem text, subject_key text, topic_key text, skill_id text, difficulty smallint,
  status text, source_type text, attempts integer, accuracy real, expected_accuracy real,
  avg_time_s real, hint_rate real, skip_rate real, option_counts integer[], correct_index smallint,
  open_reports integer, flags text[]
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with base as (
    select q.id, q.stem, q.subject_key, q.topic_key, q.skill_id, q.difficulty, q.status, q.source_type, q.correct_index,
           coalesce(s.attempts, 0) as n, coalesce(s.correct, 0) as c, coalesce(s.total_time_ms, 0) as t,
           coalesce(s.hint_uses, 0) as h, coalesce(s.skips, 0) as sk, coalesce(s.option_counts, '{0,0,0,0,0,0}') as oc,
           (select count(*)::int from public.question_reports r where r.question_id = q.id and r.resolved_at is null) as rep
      from public.questions q left join public.question_stats s on s.question_id = q.id
     where q.status in ('published', 'pending_review') and q.owner_id is null
  ), scored as (
    select b.*,
           case when b.n > 0 then (b.c::real / b.n)::real end as acc,
           private.expected_accuracy(b.difficulty) as exp_acc,
           (select max(v) from unnest(b.oc) with ordinality u(v, i) where i - 1 <> coalesce(b.correct_index, -1)) as top_wrong,
           b.oc[coalesce(b.correct_index, 0) + 1] as right_count
      from base b
  )
  select s.id, left(s.stem, 240), s.subject_key, s.topic_key, s.skill_id, s.difficulty, s.status, s.source_type,
         s.n, s.acc, s.exp_acc,
         case when s.n > 0 then (s.t / s.n / 1000.0)::real end,
         case when s.n > 0 then (s.h::real / s.n)::real end,
         case when s.n + s.sk > 0 then (s.sk::real / (s.n + s.sk))::real end,
         s.oc, s.correct_index, s.rep,
         array_remove(array[
           case when s.n >= p_min_attempts and s.acc >= 0.95 and s.difficulty >= 3 then 'too_easy' end,
           case when s.n >= p_min_attempts and s.acc <= 0.2 then 'too_hard' end,
           case when s.n >= p_min_attempts and abs(s.acc - s.exp_acc) >= 0.25 then 'difficulty_mismatch' end,
           case when s.n >= greatest(10, p_min_attempts / 2) and s.top_wrong > s.right_count then 'suspicious_distractor' end,
           case when s.n >= greatest(10, p_min_attempts / 2) and s.t / s.n > 150000 then 'slow' end,
           case when s.n + s.sk >= greatest(10, p_min_attempts / 2) and s.sk::real / (s.n + s.sk) >= 0.25 then 'high_skip' end,
           case when s.rep > 0 then 'reported' end,
           case when s.status = 'pending_review' then 'needs_review' end
         ]::text[], null)
    from scored s
   where not p_only_flagged or s.rep > 0 or s.status = 'pending_review' or (s.n >= greatest(10, p_min_attempts / 2) and (
           (s.n >= p_min_attempts and (s.acc >= 0.95 and s.difficulty >= 3 or s.acc <= 0.2 or abs(s.acc - s.exp_acc) >= 0.25))
           or s.top_wrong > s.right_count or s.t / s.n > 150000))
   order by s.rep desc, s.n desc
   limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end $$;

create or replace function public.admin_ai_usage(p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'since', since,
    'totals', (select jsonb_build_object(
                 'requests', count(*), 'failures', count(*) filter (where not ok),
                 'input_tokens', coalesce(sum(input_tokens), 0), 'output_tokens', coalesce(sum(output_tokens), 0),
                 'estimated_cost_usd', coalesce(round(sum(estimated_cost_usd)::numeric, 4), 0),
                 'avg_duration_ms', coalesce(round(avg(duration_ms)), 0))
               from public.ai_usage where created_at >= since),
    'by_model', coalesce((select jsonb_agg(x order by x ->> 'model') from (
                 select jsonb_build_object('model', coalesce(model, 'unknown'), 'requests', count(*),
                   'failures', count(*) filter (where not ok),
                   'estimated_cost_usd', round(coalesce(sum(estimated_cost_usd), 0)::numeric, 4)) as x
                   from public.ai_usage where created_at >= since group by model) m), '[]'::jsonb),
    'by_task', coalesce((select jsonb_agg(x order by x ->> 'task') from (
                 select jsonb_build_object('task', coalesce(task, kind), 'requests', count(*),
                   'avg_duration_ms', round(avg(duration_ms)),
                   'estimated_cost_usd', round(coalesce(sum(estimated_cost_usd), 0)::numeric, 4)) as x
                   from public.ai_usage where created_at >= since group by coalesce(task, kind)) t), '[]'::jsonb),
    'by_day', coalesce((select jsonb_agg(x order by x ->> 'day') from (
                 select jsonb_build_object('day', created_at::date, 'requests', count(*),
                   'estimated_cost_usd', round(coalesce(sum(estimated_cost_usd), 0)::numeric, 4)) as x
                   from public.ai_usage where created_at >= since group by created_at::date) d), '[]'::jsonb));
end $$;

create or replace function public.admin_overview()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'questions_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.questions group by status) x),
    'questions_by_source', (select coalesce(jsonb_object_agg(source_type, n), '{}'::jsonb) from (select source_type, count(*) n from public.questions where status = 'published' group by source_type) x),
    'open_reports', (select count(*) from public.question_reports where resolved_at is null),
    'resources_unavailable', (select count(*) from public.resources where status = 'unavailable'),
    'errors_24h', (select count(*) from public.app_events where level = 'error' and created_at > now() - interval '1 day'),
    'skills_without_questions', (select count(*) from public.skills sk where not exists (
        select 1 from public.questions q where q.skill_id = sk.id and q.status = 'published')));
end $$;

-- ------------------------------------------------------------
-- Parent overview, now with skill-level progress. Still academic only:
-- no notes, tutor conversations, question text or account details.
-- ------------------------------------------------------------
create or replace function public.parent_student_overview(p_student uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p public.profiles;
  today date;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.parent_links where parent_id = uid and student_id = p_student) then
    raise exception 'not_linked' using errcode = '42501';
  end if;

  select * into p from public.profiles where id = p_student;
  today := (now() at time zone p.timezone)::date;

  return jsonb_build_object(
    'student', jsonb_build_object(
      'name', coalesce(p.display_name, p.username, 'Student'),
      'program', p.program, 'igcse_tier', p.igcse_tier, 'timezone', p.timezone,
      'xp', p.xp, 'streak_days', p.streak_days, 'longest_streak', p.longest_streak,
      'last_study_date', p.last_study_date, 'today', today),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object('subject_key', s.subject_key, 'exam_date', s.exam_date, 'target_grade', s.target_grade))
        from public.student_subjects s where s.user_id = p_student), '[]'::jsonb),
    'topic_stats', coalesce((
      select jsonb_agg(jsonb_build_object(
               'subject_key', t.subject_key, 'topic_key', t.topic_key, 'attempts', t.attempts,
               'correct', t.correct, 'recent_score', t.recent_score, 'last_attempt_at', t.last_attempt_at))
        from public.topic_stats t where t.user_id = p_student), '[]'::jsonb),
    'skills', jsonb_build_object(
      'weakest', coalesce((
        select jsonb_agg(x) from (
          select jsonb_build_object('skill_id', m.skill_id, 'name', sk.name, 'subject_key', sk.subject_key,
                                    'mastery', m.mastery, 'attempts', m.attempts) as x
            from public.skill_mastery m join public.skills sk on sk.id = m.skill_id
           where m.user_id = p_student and m.attempts >= 2 and m.mastery < 60
           order by m.mastery asc limit 6) y), '[]'::jsonb),
      'secure', (select count(*) from public.skill_mastery where user_id = p_student and mastery >= 60),
      'practised', (select count(*) from public.skill_mastery where user_id = p_student),
      'due_reviews', (select count(*) from public.skill_mastery where user_id = p_student and next_review_at <= now()),
      'recurring_mistakes', (select count(*) from public.student_misconceptions where user_id = p_student and resolved_at is null)),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day', a.day, 'questions', a.questions, 'correct', a.correct,
               'practice_seconds', a.practice_seconds, 'reviews', a.reviews, 'xp', a.xp) order by a.day)
        from public.daily_activity a where a.user_id = p_student and a.day > today - 56), '[]'::jsonb),
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'kind', g.kind, 'period', g.period, 'subject_key', g.subject_key,
               'target', g.target, 'target_label', g.target_label, 'due_date', g.due_date, 'created_at', g.created_at))
        from public.goals g where g.user_id = p_student and g.archived_at is null), '[]'::jsonb),
    'papers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'subject_key', pa.subject_key, 'title', pa.title, 'score', pa.score,
               'max_score', pa.max_score, 'completed_on', pa.completed_on) order by pa.completed_on desc)
        from (select * from public.paper_attempts where user_id = p_student order by completed_on desc limit 20) pa), '[]'::jsonb)
  );
end $$;

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
grant execute on function public.log_client_event(text, text, text, text, jsonb, text) to authenticated;
grant execute on function public.admin_question_health(integer, boolean, integer) to authenticated;
grant execute on function public.admin_ai_usage(integer) to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.service_can_use_ai(uuid, text) to service_role;
grant execute on function public.service_student_context(uuid, text, text) to service_role;
grant execute on function public.service_remember(uuid, text, text, text) to service_role;
