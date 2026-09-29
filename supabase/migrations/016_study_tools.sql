-- ============================================================
-- CHAPTER — Migration 016: study tools upgrade
-- ------------------------------------------------------------
-- Run AFTER 015.
--   notes.topic_key
--   flashcards: subject/topic/skill, difficulty, source kind, duplicate guard
--   add_flashcards(): bulk add that skips repeats
--   profiles: study-time preferences used by the exam plan
-- ============================================================

alter table public.notes add column if not exists topic_key text check (topic_key is null or topic_key ~ '^[a-z0-9-]{1,48}$');
grant insert (title, body, subject_key, topic_key) on public.notes to authenticated;

alter table public.flashcards
  add column if not exists topic_key   text check (topic_key is null or topic_key ~ '^[a-z0-9-]{1,48}$'),
  add column if not exists skill_id    text references public.skills(id) on delete set null,
  add column if not exists difficulty  smallint check (difficulty is null or difficulty between 1 and 5),
  add column if not exists source_kind text not null default 'manual'
    check (source_kind in ('manual', 'ai', 'note', 'mistake', 'tutor', 'upload'));

-- One card per front text within a deck (case and spacing insensitive).
create unique index if not exists flashcards_front_unique
  on public.flashcards (deck_id, md5(lower(regexp_replace(btrim(front), '\s+', ' ', 'g'))));

revoke insert on public.flashcards from authenticated;
grant insert (id, deck_id, front, back, topic_key, skill_id, difficulty, source_kind) on public.flashcards to authenticated;
grant update (front, back, deck_id, topic_key, skill_id, difficulty) on public.flashcards to authenticated;

alter table public.flashcard_decks drop constraint if exists flashcard_decks_source_check;
alter table public.flashcard_decks add constraint flashcard_decks_source_check
  check (source in ('manual', 'ai', 'note', 'mistake', 'tutor', 'upload'));

-- Adds cards to one of the caller's decks, skipping any whose front already
-- exists in that deck. Returns how many were added and skipped.
create or replace function public.add_flashcards(p_deck uuid, p_cards jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c jsonb;
  added int := 0;
  skipped int := 0;
  n int;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.flashcard_decks where id = p_deck and user_id = uid) then
    raise exception 'deck_not_found' using errcode = '42501';
  end if;
  if jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) > 100 then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  for c in select * from jsonb_array_elements(p_cards) loop
    if coalesce(btrim(c ->> 'front'), '') = '' or coalesce(btrim(c ->> 'back'), '') = '' then
      skipped := skipped + 1;
      continue;
    end if;
    insert into public.flashcards (deck_id, user_id, front, back, topic_key, skill_id, difficulty, source_kind)
    values (p_deck, uid, left(btrim(c ->> 'front'), 500), left(btrim(c ->> 'back'), 2000),
            nullif(c ->> 'topic_key', ''),
            case when exists (select 1 from public.skills where id = c ->> 'skill_id') then c ->> 'skill_id' end,
            case when (c ->> 'difficulty') ~ '^[1-5]$' then (c ->> 'difficulty')::smallint end,
            case when c ->> 'source_kind' in ('manual', 'ai', 'note', 'mistake', 'tutor', 'upload') then c ->> 'source_kind' else 'manual' end)
    on conflict do nothing;
    get diagnostics n = row_count;
    if n = 1 then added := added + 1; else skipped := skipped + 1; end if;
  end loop;
  return jsonb_build_object('added', added, 'skipped', skipped);
end $$;

-- Study-time preferences (used to size the exam plan; never mandatory).
alter table public.profiles
  add column if not exists study_minutes_per_day smallint not null default 30,
  add column if not exists study_days_per_week  smallint not null default 5;
do $$ begin
  alter table public.profiles add constraint profiles_study_minutes_range check (study_minutes_per_day between 10 and 240);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_study_days_range check (study_days_per_week between 1 and 7);
exception when duplicate_object then null; end $$;
grant update (study_minutes_per_day, study_days_per_week) on public.profiles to authenticated;

grant execute on function public.add_flashcards(uuid, jsonb) to authenticated;

-- ------------------------------------------------------------
-- Data export includes the learning data added in 013–016.
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
    'skill_mastery', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.skill_mastery m where m.user_id = uid),
    'misconceptions', (select coalesce(jsonb_agg(to_jsonb(m) || jsonb_build_object('description', mc.description)), '[]')
                         from public.student_misconceptions m join public.misconceptions mc on mc.id = m.misconception_id where m.user_id = uid),
    'question_reports', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.question_reports r where r.user_id = uid),
    'private_questions', (select coalesce(jsonb_agg(jsonb_build_object('stem', q.stem, 'options', q.options, 'created_at', q.created_at)), '[]')
                            from public.questions q where q.owner_id = uid),
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
revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
