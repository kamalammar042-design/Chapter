-- ============================================================
-- CHAPTER — Migration 011: AI tutor, memory, metering
-- ------------------------------------------------------------
-- Run AFTER 010.
--
--   tutor_conversations / tutor_messages   persisted chats (written only by
--                                          the ai-tutor Edge Function)
--   student_memory                         durable academic facts the tutor
--                                          remembers; visible to and deletable
--                                          by the student
--   ai_usage kinds + caps                  tutor messages metered per tier
--   tutor-uploads bucket                   scanned question images
-- ============================================================

create table if not exists public.tutor_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default 'New conversation' check (char_length(title) <= 120),
  subject_key text references public.catalog_subjects(key) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists tutor_conv_user_idx on public.tutor_conversations (user_id, updated_at desc);

create table if not exists public.tutor_messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references public.tutor_conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null check (char_length(content) <= 40000),
  -- storage paths of uploaded images (tutor-uploads bucket)
  attachments     jsonb not null default '[]'::jsonb,
  mode            text check (mode in ('chat', 'explain', 'hint', 'check', 'simplify', 'mistake', 'plan', 'scan')),
  input_tokens    integer,
  output_tokens   integer,
  created_at      timestamptz not null default now()
);
create index if not exists tutor_msg_conv_idx on public.tutor_messages (conversation_id, id);

create table if not exists public.student_memory (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('struggle', 'misconception', 'strength', 'preference', 'goal', 'context')),
  subject_key    text references public.catalog_subjects(key) on delete set null,
  content        text not null check (char_length(content) between 3 and 300),
  source         text not null default 'tutor' check (source in ('tutor', 'user')),
  evidence_count integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists memory_user_idx on public.student_memory (user_id, updated_at desc);
create unique index if not exists memory_dedupe_idx
  on public.student_memory (user_id, kind, lower(content));

alter table public.tutor_conversations enable row level security;
alter table public.tutor_messages      enable row level security;
alter table public.student_memory      enable row level security;

-- Conversations: the student reads, renames and deletes their own. Rows are
-- created by the Edge Function (service role) so every message is genuine.
drop policy if exists tc_select_own on public.tutor_conversations;
create policy tc_select_own on public.tutor_conversations
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists tc_update_own on public.tutor_conversations;
create policy tc_update_own on public.tutor_conversations
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists tc_delete_own on public.tutor_conversations;
create policy tc_delete_own on public.tutor_conversations
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists tm_select_own on public.tutor_messages;
create policy tm_select_own on public.tutor_messages
  for select to authenticated using ((select auth.uid()) = user_id);

-- Memory: students see everything the tutor remembers, can delete any of it,
-- and can add their own notes ("I prefer worked examples").
drop policy if exists sm_select_own on public.student_memory;
create policy sm_select_own on public.student_memory
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists sm_delete_own on public.student_memory;
create policy sm_delete_own on public.student_memory
  for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists sm_insert_own on public.student_memory;
create policy sm_insert_own on public.student_memory
  for insert to authenticated with check ((select auth.uid()) = user_id and source = 'user');

revoke all on public.tutor_conversations, public.tutor_messages, public.student_memory from anon;
revoke insert, update, delete on public.tutor_conversations from authenticated;
grant update (title) on public.tutor_conversations to authenticated;
grant delete on public.tutor_conversations to authenticated;
revoke insert, update, delete on public.tutor_messages from authenticated;
revoke insert, update on public.student_memory from authenticated;
grant insert (kind, subject_key, content, source) on public.student_memory to authenticated;

-- ------------------------------------------------------------
-- Metering: tutor messages and AI-generated study material
-- ------------------------------------------------------------
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('pdf_scan', 'essay_mark', 'tutor_message', 'generate'));

create or replace function public.ai_monthly_cap(p_tier subscription_t, p_kind text)
returns integer language sql immutable as $$
  select case
    -- Free students get a real taste of the tutor, not a locked door.
    when p_tier = 'free' and p_kind = 'tutor_message' then 30
    when p_tier = 'free' and p_kind = 'generate' then 5
    when p_tier = 'free' then 0
    when p_kind = 'tutor_message' then 900
    when p_kind = 'generate' then 150
    when p_kind = 'pdf_scan' then 60
    when p_kind = 'essay_mark' then 120
    else 0 end;
$$;

-- Short-window limit on top of the monthly cap, so a loop in a client
-- cannot burn a month's allowance in a minute.
create or replace function private.ai_recent_calls(p_user uuid, p_seconds integer)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.ai_usage
   where user_id = p_user and created_at > now() - make_interval(secs => p_seconds);
$$;

-- ------------------------------------------------------------
-- Service-role entry points for Edge Functions. PostgREST only exposes the
-- public schema, so these live there, executable by service_role alone.
-- ------------------------------------------------------------
create or replace function public.service_can_use_ai(p_user uuid, p_kind text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare gate jsonb;
begin
  gate := private.can_use_ai(p_user, p_kind);
  if (gate ->> 'allowed')::boolean and private.ai_recent_calls(p_user, 60) >= 10 then
    gate := gate || jsonb_build_object('allowed', false, 'reason', 'slow_down');
  end if;
  return gate;
end $$;

-- Everything the tutor should know about a student, in one round trip.
-- Deliberately academic: no email, no billing, no other users.
create or replace function public.service_student_context(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'name', p.display_name, 'program', p.program, 'igcse_tier', p.igcse_tier,
        'tutor_style', p.tutor_style, 'timezone', p.timezone,
        'today', (now() at time zone p.timezone)::date,
        'streak_days', p.streak_days, 'last_study_date', p.last_study_date)
      from public.profiles p where p.id = p_user),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
               'subject', cs.name, 'program', cs.program, 'subject_key', s.subject_key,
               'exam_date', s.exam_date, 'target', s.target_grade, 'confidence', s.confidence)
             order by cs.sort)
        from public.student_subjects s join public.catalog_subjects cs on cs.key = s.subject_key
       where s.user_id = p_user), '[]'::jsonb),
    'weak_topics', coalesce((
      select jsonb_agg(w) from (
        select jsonb_build_object(
                 'subject', cs.name, 'topic', ct.name, 'attempts', t.attempts,
                 'accuracy', round(t.correct::numeric / t.attempts, 2),
                 'recent', round(t.recent_score::numeric, 2)) as w
          from public.topic_stats t
          join public.catalog_topics ct on ct.subject_key = t.subject_key and ct.key = t.topic_key
          join public.catalog_subjects cs on cs.key = t.subject_key
         where t.user_id = p_user and t.attempts >= 3 and t.recent_score < 0.6
         order by t.recent_score asc, t.attempts desc
         limit 6) x), '[]'::jsonb),
    'strong_topics', coalesce((
      select jsonb_agg(w) from (
        select jsonb_build_object('subject', cs.name, 'topic', ct.name) as w
          from public.topic_stats t
          join public.catalog_topics ct on ct.subject_key = t.subject_key and ct.key = t.topic_key
          join public.catalog_subjects cs on cs.key = t.subject_key
         where t.user_id = p_user and t.attempts >= 8 and t.recent_score >= 0.85
         order by t.recent_score desc
         limit 4) x), '[]'::jsonb),
    'recent_mistakes', coalesce((
      select jsonb_agg(m) from (
        select jsonb_build_object('subject', cs.name, 'topic', ct.name, 'question', a.question_text) as m
          from public.question_attempts a
          join public.catalog_topics ct on ct.subject_key = a.subject_key and ct.key = a.topic_key
          join public.catalog_subjects cs on cs.key = a.subject_key
         where a.user_id = p_user and not a.correct and a.question_text is not null
           and a.created_at > now() - interval '14 days'
         order by a.created_at desc
         limit 5) x), '[]'::jsonb),
    'memory', coalesce((
      select jsonb_agg(jsonb_build_object('kind', m.kind, 'content', m.content) order by m.updated_at desc)
        from (select * from public.student_memory where user_id = p_user
               order by updated_at desc limit 25) m), '[]'::jsonb),
    'recent_papers', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('title', pa.title, 'score', pa.score, 'max', pa.max_score, 'on', pa.completed_on) as x
          from public.paper_attempts pa where pa.user_id = p_user
         order by pa.completed_on desc limit 3) y), '[]'::jsonb)
  );
$$;

-- Records a remembered fact, merging with an existing identical one.
create or replace function public.service_remember(p_user uuid, p_kind text, p_subject text, p_content text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.student_memory (user_id, kind, subject_key, content, source)
  values (p_user, p_kind,
          case when exists (select 1 from public.catalog_subjects where key = p_subject) then p_subject end,
          left(btrim(p_content), 300), 'tutor')
  on conflict (user_id, kind, lower(content)) do update
    set evidence_count = public.student_memory.evidence_count + 1, updated_at = now();

  -- keep the memory focused: at most 60 facts, dropping the stalest
  delete from public.student_memory
   where id in (select id from public.student_memory where user_id = p_user
                 order by updated_at desc offset 60);
end $$;

-- ------------------------------------------------------------
-- Storage: scanned question images, private per student
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tutor-uploads', 'tutor-uploads', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "students read own tutor uploads" on storage.objects;
create policy "students read own tutor uploads" on storage.objects
  for select to authenticated
  using (bucket_id = 'tutor-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- export_my_data: include tutor history and memory
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
    'paper_attempts', (select coalesce(jsonb_agg(to_jsonb(pa)), '[]') from public.paper_attempts pa where pa.user_id = uid),
    'tutor_conversations', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.tutor_conversations c where c.user_id = uid),
    'tutor_messages', (select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]') from public.tutor_messages m where m.user_id = uid),
    'memory', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.student_memory m where m.user_id = uid)
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
grant execute on function public.service_can_use_ai(uuid, text) to service_role;
grant execute on function public.service_student_context(uuid) to service_role;
grant execute on function public.service_remember(uuid, text, text, text) to service_role;
