-- ============================================================
-- CHAPTER — Migration 012: parent access + plan summary
-- ------------------------------------------------------------
-- Run AFTER 011.
--
-- Parent access is granted by the student, never claimed by the parent:
--   1. the student creates a short-lived invite code (Pro + Parent plan)
--   2. the parent, signed in to their own account, redeems it
--   3. a parent_links row now authorises parent_student_overview()
-- Parents never get table access to student data. The overview function
-- returns progress aggregates only: no tutor conversations, notes, memory
-- or flashcard content. Either side can remove the link at any time.
-- ============================================================

create table if not exists public.parent_invites (
  code       text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  student_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours',
  used_at    timestamptz,
  used_by    uuid references auth.users(id) on delete set null
);
create index if not exists parent_invites_student_idx on public.parent_invites (student_id);

create table if not exists public.parent_links (
  parent_id  uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id),
  check (parent_id <> student_id)
);
create index if not exists parent_links_student_idx on public.parent_links (student_id);

-- failed redemption attempts, for brute-force protection
create table if not exists public.parent_invite_failures (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists pif_user_idx on public.parent_invite_failures (user_id, created_at desc);

alter table public.parent_invites         enable row level security;
alter table public.parent_links           enable row level security;
alter table public.parent_invite_failures enable row level security;
-- No client policies: all access goes through the functions below.
revoke all on public.parent_invites, public.parent_links, public.parent_invite_failures from anon, authenticated;

-- ------------------------------------------------------------
-- Student: create an invite code
-- ------------------------------------------------------------
create or replace function public.create_parent_invite()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
  i int;
  inv public.parent_invites;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if (select role from public.profiles where id = uid) <> 'student' then
    raise exception 'students_only' using errcode = '42501';
  end if;
  if public.effective_tier(uid) <> 'parent' then
    raise exception 'upgrade_required' using errcode = 'P0001',
      hint = 'Parent access is part of the Pro + Parent plan.';
  end if;
  if (select count(*) from public.parent_links where student_id = uid) >= 4 then
    raise exception 'too_many_parents' using errcode = 'P0001';
  end if;

  -- one live code at a time
  delete from public.parent_invites where student_id = uid and used_at is null;

  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.parent_invites (code, student_id) values (c, uid) returning * into inv;
      exit;
    exception when unique_violation then
      -- astronomically unlikely; try another code
    end;
  end loop;

  return jsonb_build_object('code', inv.code, 'expires_at', inv.expires_at);
end $$;

-- ------------------------------------------------------------
-- Parent: redeem a code
-- ------------------------------------------------------------
create or replace function public.accept_parent_invite(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  inv public.parent_invites;
  failures int;
  norm text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select count(*) into failures from public.parent_invite_failures
   where user_id = uid and created_at > now() - interval '1 hour';
  -- Failures are returned rather than raised: raising would roll back the
  -- failure record and defeat the lockout.
  if failures >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;

  select * into inv from public.parent_invites
   where code = norm and used_at is null and expires_at > now()
   for update;
  if not found or inv.student_id = uid then
    insert into public.parent_invite_failures (user_id) values (uid);
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  update public.parent_invites set used_at = now(), used_by = uid where code = inv.code;
  insert into public.parent_links (parent_id, student_id) values (uid, inv.student_id)
  on conflict do nothing;
  -- the redeeming account is acting as a parent from now on
  update public.profiles set role = 'parent' where id = uid and role <> 'parent';

  return jsonb_build_object(
    'ok', true,
    'student_id', inv.student_id,
    'display_name', (select coalesce(display_name, username, 'Your student') from public.profiles where id = inv.student_id));
end $$;

-- ------------------------------------------------------------
-- Either side: remove a link
-- ------------------------------------------------------------
create or replace function public.remove_parent_link(p_other uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from public.parent_links
   where (parent_id = uid and student_id = p_other)
      or (student_id = uid and parent_id = p_other);
end $$;

-- Student: who can see my progress?
create or replace function public.my_parent_links()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'parents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'parent_id', l.parent_id,
               'name', coalesce(p.display_name, 'Parent'),
               -- enough to recognise the account, not a full address
               'email_hint', case when p.email is null then null
                             else left(split_part(p.email, '@', 1), 2) || '•••@' || split_part(p.email, '@', 2) end,
               'linked_at', l.created_at) order by l.created_at)
        from public.parent_links l join public.profiles p on p.id = l.parent_id
       where l.student_id = auth.uid()), '[]'::jsonb),
    'invite', (
      select jsonb_build_object('code', i.code, 'expires_at', i.expires_at)
        from public.parent_invites i
       where i.student_id = auth.uid() and i.used_at is null and i.expires_at > now()
       limit 1));
$$;

-- Parent: which students am I linked to?
create or replace function public.my_students()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'student_id', l.student_id,
           'name', coalesce(p.display_name, p.username, 'Student'),
           'program', p.program,
           'linked_at', l.created_at) order by l.created_at), '[]'::jsonb)
    from public.parent_links l join public.profiles p on p.id = l.student_id
   where l.parent_id = auth.uid();
$$;

-- ------------------------------------------------------------
-- Parent: progress overview for one linked student
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
      'program', p.program,
      'igcse_tier', p.igcse_tier,
      'timezone', p.timezone,
      'xp', p.xp,
      'streak_days', p.streak_days,
      'longest_streak', p.longest_streak,
      'last_study_date', p.last_study_date,
      'today', today),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
               'subject_key', s.subject_key, 'exam_date', s.exam_date, 'target_grade', s.target_grade))
        from public.student_subjects s where s.user_id = p_student), '[]'::jsonb),
    'topic_stats', coalesce((
      select jsonb_agg(jsonb_build_object(
               'subject_key', t.subject_key, 'topic_key', t.topic_key, 'attempts', t.attempts,
               'correct', t.correct, 'recent_score', t.recent_score, 'last_attempt_at', t.last_attempt_at))
        from public.topic_stats t where t.user_id = p_student), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day', a.day, 'questions', a.questions, 'correct', a.correct,
               'practice_seconds', a.practice_seconds, 'reviews', a.reviews, 'xp', a.xp) order by a.day)
        from public.daily_activity a where a.user_id = p_student and a.day > today - 56), '[]'::jsonb),
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'kind', g.kind, 'period', g.period, 'subject_key', g.subject_key,
               'target', g.target, 'target_label', g.target_label, 'due_date', g.due_date,
               'created_at', g.created_at))
        from public.goals g where g.user_id = p_student and g.archived_at is null), '[]'::jsonb),
    'papers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'subject_key', pa.subject_key, 'title', pa.title, 'score', pa.score,
               'max_score', pa.max_score, 'completed_on', pa.completed_on) order by pa.completed_on desc)
        from (select * from public.paper_attempts where user_id = p_student
               order by completed_on desc limit 20) pa), '[]'::jsonb)
  );
end $$;

-- Entitlement summary for the signed-in user (plan page).
create or replace function public.my_subscription()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tier', public.effective_tier(auth.uid()),
    'founding_member', coalesce((select founding_member from public.profiles where id = auth.uid()), false),
    'active', coalesce((
      select jsonb_agg(jsonb_build_object('tier', e.tier, 'source', e.source, 'expires_at', e.expires_at))
        from public.entitlements e
       where e.user_id = auth.uid() and e.revoked_at is null
         and e.starts_at <= now() and (e.expires_at is null or e.expires_at > now())), '[]'::jsonb));
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
