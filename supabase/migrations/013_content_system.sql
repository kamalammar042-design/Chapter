-- ============================================================
-- CHAPTER — Migration 013: content system with provenance
-- ------------------------------------------------------------
-- Run AFTER 012.
--
--   skills, misconceptions       fine-grained syllabus map (seeded in 016)
--   questions                    every question Chapter serves, with provenance
--   question_stats               per-question analytics (maintained in 014)
--   question_reports             "report a problem" from students
--   resources                    official-source directory + hosted material
--                                (replaces past_papers; rows migrated)
--   admin_users, is_admin()      content administrators (server-side role)
--   content_audit_log            who changed what
--
-- Provenance rules enforced here, not just in the app:
--   • a question cannot be published without a known source type, source
--     name and licence; restricted content can never be published
--   • AI-generated questions need a passing validation report to publish
--   • a resource can only be hosted/downloadable if redistribution is
--     explicitly allowed; otherwise it must be an external link
-- ============================================================

-- ------------------------------------------------------------
-- Administrators
-- ------------------------------------------------------------
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

-- ------------------------------------------------------------
-- Skills & misconceptions
-- ------------------------------------------------------------
create table if not exists public.skills (
  id          text primary key check (id ~ '^[a-z0-9_.-]+/[a-z0-9-]+/[a-z0-9-]+$'),
  subject_key text not null,
  topic_key   text not null,
  key         text not null,
  name        text not null,
  objective   text not null,
  sort        smallint not null default 0,
  foreign key (subject_key, topic_key) references public.catalog_topics(subject_key, key) on delete cascade,
  unique (subject_key, topic_key, key)
);

create table if not exists public.misconceptions (
  id          uuid primary key default gen_random_uuid(),
  skill_id    text not null references public.skills(id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9-]{2,60}$'),
  description text not null check (char_length(description) between 5 and 300),
  source      text not null default 'curated' check (source in ('curated', 'generated', 'admin')),
  created_at  timestamptz not null default now(),
  unique (skill_id, key)
);

alter table public.skills enable row level security;
alter table public.misconceptions enable row level security;
drop policy if exists skills_read on public.skills;
create policy skills_read on public.skills for select to authenticated using (true);
drop policy if exists misconceptions_read on public.misconceptions;
create policy misconceptions_read on public.misconceptions for select to authenticated using (true);
drop policy if exists misconceptions_admin on public.misconceptions;
create policy misconceptions_admin on public.misconceptions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.skills, public.misconceptions from anon;
revoke insert, update, delete on public.skills from authenticated;

-- ------------------------------------------------------------
-- Questions
-- ------------------------------------------------------------
create table if not exists public.questions (
  id               uuid primary key default gen_random_uuid(),
  subject_key      text not null references public.catalog_subjects(key),
  topic_key        text not null,
  skill_id         text references public.skills(id) on delete set null,
  question_type    text not null default 'mcq' check (question_type in ('mcq', 'procedural')),
  -- procedural questions are families produced by a deterministic generator
  template_key     text,
  stem             text not null check (char_length(stem) between 3 and 2000),
  -- [{ "text": "...", "misconception_id": uuid|null }]
  options          jsonb not null default '[]'::jsonb,
  correct_index    smallint,
  explanation      text not null default '' check (char_length(explanation) <= 3000),
  hint             text check (hint is null or char_length(hint) <= 600),
  difficulty       smallint not null check (difficulty between 1 and 5),
  cognitive_level  text not null default 'understand' check (cognitive_level in ('recall', 'understand', 'apply', 'analyse')),
  tier             text not null default 'all' check (tier in ('all', 'core', 'extended')),
  tags             text[] not null default '{}',
  -- provenance
  source_type      text not null check (source_type in ('owned', 'licensed', 'open_license', 'generated', 'user_uploaded')),
  source_name      text not null check (char_length(source_name) between 2 and 200),
  source_url       text check (source_url is null or source_url ~ '^https://'),
  license          text not null check (char_length(license) between 2 and 200),
  copyright_status text not null check (copyright_status in ('owned', 'licensed', 'open', 'generated', 'user_provided', 'restricted', 'unknown')),
  syllabus_version text,
  created_by       uuid references auth.users(id) on delete set null,
  -- private questions (made from a student's own upload) are visible only to
  -- that student and never enter the shared bank
  owner_id         uuid references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  reviewed_at      timestamptz,
  reviewed_by      uuid references auth.users(id) on delete set null,
  version          integer not null default 1,
  status           text not null default 'draft' check (status in ('draft', 'pending_review', 'published', 'archived', 'rejected')),
  review_note      text check (review_note is null or char_length(review_note) <= 1000),
  -- output of the validation pipeline and generation metadata
  validation       jsonb,
  generator        jsonb,
  content_hash     text not null,
  foreign key (subject_key, topic_key) references public.catalog_topics(subject_key, key),
  check (question_type <> 'mcq' or (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6
                                    and correct_index is not null and correct_index >= 0 and correct_index < jsonb_array_length(options))),
  check (question_type <> 'procedural' or template_key is not null)
);

create unique index if not exists questions_hash_idx on public.questions (content_hash);
create index if not exists questions_skill_idx on public.questions (skill_id, difficulty) where status = 'published';
create index if not exists questions_topic_idx on public.questions (subject_key, topic_key) where status = 'published';
create index if not exists questions_status_idx on public.questions (status, updated_at desc);
create index if not exists questions_owner_idx on public.questions (owner_id) where owner_id is not null;

-- Provenance and quality gate for publishing.
create or replace function public.guard_question()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and (new.stem, new.options, new.correct_index, new.explanation)
       is distinct from (old.stem, old.options, old.correct_index, old.explanation) then
    new.version := old.version + 1;
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') and auth.uid() is not null then
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
  end if;
  if new.status = 'published' then
    if new.copyright_status in ('restricted', 'unknown') then
      raise exception 'cannot publish: copyright status is %', new.copyright_status using errcode = '23514';
    end if;
    if new.source_type in ('licensed', 'open_license') and new.source_url is null then
      raise exception 'cannot publish: licensed or openly licensed content needs a source URL' using errcode = '23514';
    end if;
    -- AI-generated questions publish only after passing validation, or after
    -- an administrator has reviewed them (recorded in the validation report)
    if new.source_type = 'generated' and coalesce((new.validation ->> 'passed')::boolean, false) is not true then
      if public.is_admin() then
        new.validation := coalesce(new.validation, '{}'::jsonb)
          || jsonb_build_object('human_review', jsonb_build_object('by', auth.uid(), 'at', now()));
      else
        raise exception 'cannot publish: generated question has not passed validation' using errcode = '23514';
      end if;
    end if;
    if new.source_type = 'user_uploaded' and new.owner_id is null then
      raise exception 'cannot publish: material from a student upload can only be private to that student' using errcode = '23514';
    end if;
    if new.question_type = 'mcq' and new.skill_id is null then
      raise exception 'cannot publish: question has no skill' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_question on public.questions;
create trigger trg_guard_question before insert or update on public.questions
  for each row execute function public.guard_question();

create table if not exists public.question_stats (
  question_id      uuid primary key references public.questions(id) on delete cascade,
  attempts         integer not null default 0,
  correct          integer not null default 0,
  total_time_ms    bigint not null default 0,
  hint_uses        integer not null default 0,
  skips            integer not null default 0,
  option_counts    integer[] not null default '{0,0,0,0,0,0}',
  last_attempt_at  timestamptz
);

create table if not exists public.question_reports (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reason      text not null check (reason in ('wrong_answer', 'unclear', 'typo', 'off_syllabus', 'other')),
  comment     text check (comment is null or char_length(comment) <= 500),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution  text check (resolution is null or char_length(resolution) <= 500)
);
create index if not exists question_reports_open_idx on public.question_reports (question_id) where resolved_at is null;
create unique index if not exists question_reports_once_idx on public.question_reports (question_id, user_id) where resolved_at is null;

alter table public.questions enable row level security;
alter table public.question_stats enable row level security;
alter table public.question_reports enable row level security;

-- Students see published questions; admins see everything.
drop policy if exists questions_read on public.questions;
create policy questions_read on public.questions for select to authenticated
  using ((status = 'published' and (owner_id is null or owner_id = (select auth.uid()))) or public.is_admin());
drop policy if exists questions_admin_write on public.questions;
create policy questions_admin_write on public.questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists question_stats_admin on public.question_stats;
create policy question_stats_admin on public.question_stats for select to authenticated using (public.is_admin());

drop policy if exists reports_insert_own on public.question_reports;
create policy reports_insert_own on public.question_reports for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists reports_select on public.question_reports;
create policy reports_select on public.question_reports for select to authenticated
  using ((select auth.uid()) = user_id or public.is_admin());
drop policy if exists reports_admin_update on public.question_reports;
create policy reports_admin_update on public.question_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.questions, public.question_stats, public.question_reports from anon;
revoke insert, update, delete on public.question_stats from authenticated;
revoke update on public.question_reports from authenticated;
grant update (resolved_at, resolved_by, resolution) on public.question_reports to authenticated;
revoke insert on public.question_reports from authenticated;
grant insert (question_id, reason, comment) on public.question_reports to authenticated;

-- ------------------------------------------------------------
-- Audit log for content changes
-- ------------------------------------------------------------
create table if not exists public.content_audit_log (
  id          bigint generated always as identity primary key,
  actor       uuid references auth.users(id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   text not null,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists content_audit_entity_idx on public.content_audit_log (entity, entity_id, created_at desc);
alter table public.content_audit_log enable row level security;
drop policy if exists audit_admin_read on public.content_audit_log;
create policy audit_admin_read on public.content_audit_log for select to authenticated using (public.is_admin());
revoke all on public.content_audit_log from anon;
revoke insert, update, delete on public.content_audit_log from authenticated;

create or replace function private.audit_question()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.content_audit_log (actor, action, entity, entity_id, details)
  values (
    auth.uid(),
    case when tg_op = 'INSERT' then 'create'
         when new.status is distinct from old.status then 'status:' || new.status
         else 'edit' end,
    'question',
    new.id::text,
    jsonb_build_object('version', new.version, 'status', new.status,
                       'previous_status', case when tg_op = 'UPDATE' then old.status end));
  return null;
end $$;

drop trigger if exists trg_audit_question on public.questions;
create trigger trg_audit_question after insert or update on public.questions
  for each row execute function private.audit_question();

-- ------------------------------------------------------------
-- Resources: official-source directory + hosted material
-- ------------------------------------------------------------
create table if not exists public.resources (
  id                     uuid primary key default gen_random_uuid(),
  subject_key            text references public.catalog_subjects(key) on delete cascade,
  program                text check (program in ('igcse', 'sat')),
  title                  text not null check (char_length(title) between 2 and 200),
  provider               text not null check (char_length(provider) between 2 and 120),
  resource_type          text not null check (resource_type in
                           ('question_paper', 'mark_scheme', 'insert', 'specimen', 'syllabus', 'practice_test',
                            'examiner_report', 'notes', 'video', 'other')),
  year                   smallint check (year between 1990 and 2100),
  session                text check (session in ('feb_mar', 'may_jun', 'oct_nov', 'specimen', 'practice')),
  paper_number           smallint check (paper_number between 1 and 9),
  variant                smallint check (variant between 1 and 9),
  component              text check (component is null or char_length(component) <= 120),
  tier                   text check (tier in ('core', 'extended')),
  access                 text not null check (access in ('external', 'hosted', 'download')),
  source_type            text not null check (source_type in ('official_reference', 'external_link', 'owned', 'licensed', 'open_license', 'generated')),
  license                text,
  redistribution_allowed boolean not null default false,
  external_url           text check (external_url is null or external_url ~ '^https://'),
  storage_path           text,
  duration_minutes       smallint,
  max_marks              smallint,
  status                 text not null default 'active' check (status in ('active', 'unavailable', 'pending')),
  last_checked_at        timestamptz,
  last_status_code       integer,
  consecutive_failures   integer not null default 0,
  created_at             timestamptz not null default now(),
  check (access <> 'external' or external_url is not null),
  -- Chapter only hosts what it may redistribute
  check (access = 'external' or (storage_path is not null and redistribution_allowed
                                 and source_type in ('owned', 'licensed', 'open_license', 'generated')
                                 and license is not null)),
  check (source_type not in ('licensed', 'open_license') or license is not null)
);
create index if not exists resources_subject_idx on public.resources (subject_key, year desc);
create unique index if not exists resources_url_idx on public.resources (external_url, subject_key) where external_url is not null;

alter table public.resources enable row level security;
drop policy if exists resources_read on public.resources;
create policy resources_read on public.resources for select to authenticated
  using (status in ('active', 'unavailable') or public.is_admin());
drop policy if exists resources_admin on public.resources;
create policy resources_admin on public.resources for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.resources from anon;

-- Carry over anything in past_papers (009), keeping ids so paper_attempts
-- links stay valid, then point paper_attempts at resources.
do $$
begin
  if to_regclass('public.past_papers') is not null then
    insert into public.resources (id, subject_key, program, title, provider, resource_type, year, session, paper_number,
                                  variant, tier, access, source_type, license, redistribution_allowed, external_url,
                                  storage_path, duration_minutes, max_marks, created_at, status)
    select p.id, p.subject_key, cs.program, p.title, 'Imported',
           case p.kind when 'question_paper' then 'question_paper' when 'mark_scheme' then 'mark_scheme'
                       when 'insert' then 'insert' when 'practice_test' then 'practice_test' else 'other' end,
           p.year, p.session, p.paper_number, p.variant, p.tier,
           case when p.storage_path is not null then 'hosted' else 'external' end,
           case when p.storage_path is not null then 'licensed' else 'external_link' end,
           case when p.storage_path is not null then 'Imported before provenance tracking; review' end,
           p.storage_path is not null, p.external_url, p.storage_path, p.duration_minutes, p.max_marks, p.created_at,
           -- hosted files had no recorded licence: hide them until an admin confirms the right to redistribute
           case when p.storage_path is not null then 'pending' else 'active' end
      from public.past_papers p join public.catalog_subjects cs on cs.key = p.subject_key
    on conflict (id) do nothing;

    alter table public.paper_attempts drop constraint if exists paper_attempts_paper_id_fkey;
    drop table public.past_papers;
  end if;
end $$;

do $$ begin
  alter table public.paper_attempts
    add constraint paper_attempts_resource_fkey foreign key (paper_id) references public.resources(id) on delete set null;
exception when duplicate_object then null; end $$;

-- Hosted files are readable only when a live resource row points at them.
drop policy if exists "past papers readable by students" on storage.objects;
drop policy if exists "hosted resources readable" on storage.objects;
create policy "hosted resources readable" on storage.objects
  for select to authenticated
  using (bucket_id = 'past-papers' and exists (
    select 1 from public.resources r
     where r.storage_path = storage.objects.name and r.access in ('hosted', 'download') and r.status = 'active'));

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;
