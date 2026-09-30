-- ============================================================
-- 022: review reminders (web push through OneSignal)
-- ------------------------------------------------------------
-- Opt-in only. A student turns reminders on in Settings → Study, which
-- registers this browser's OneSignal push subscription. Once an hour the
-- push-reminders function asks service_due_reminders() who should get one:
-- reminders on, at least one registered device, it is their chosen hour in
-- their own time zone, skills are due for review, they have not studied
-- today, and they have not been reminded today. At most one a day.
-- Clients never read these tables directly; everything goes through the
-- functions below.
-- ============================================================

create table if not exists public.review_reminders (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  enabled      boolean not null default false,
  -- local hour (0–23) in profiles.timezone
  hour         smallint not null default 17 check (hour between 0 and 23),
  last_sent_on date,
  updated_at   timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- OneSignal subscription id (uuid) for one browser
  subscription_id text not null check (subscription_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  created_at      timestamptz not null default now(),
  primary key (user_id, subscription_id)
);
create unique index if not exists push_subscriptions_id_idx on public.push_subscriptions (subscription_id);

alter table public.review_reminders enable row level security;
alter table public.push_subscriptions enable row level security;
revoke all on public.review_reminders, public.push_subscriptions from anon, authenticated;

-- ---- student-facing ---------------------------------------------------

create or replace function public.my_reminders()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'enabled', coalesce(r.enabled, false),
    'hour', coalesce(r.hour, 17),
    'devices', (select count(*) from public.push_subscriptions s where s.user_id = auth.uid()),
    'timezone', (select p.timezone from public.profiles p where p.id = auth.uid())
  )
  from (select 1) one
  left join public.review_reminders r on r.user_id = auth.uid();
$$;

-- Turns reminders on or off and sets the hour. Turning them on needs this
-- browser's subscription id; turning them off forgets every device.
create or replace function public.set_reminders(p_enabled boolean, p_hour integer, p_subscription text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_hour is null or p_hour < 0 or p_hour > 23 then raise exception 'invalid hour'; end if;
  if p_enabled then
    if p_subscription is null or p_subscription !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'invalid subscription';
    end if;
    -- one browser belongs to one account: move it if someone else registered it
    delete from public.push_subscriptions where subscription_id = p_subscription and user_id <> uid;
    insert into public.push_subscriptions (user_id, subscription_id) values (uid, p_subscription)
      on conflict do nothing;
    -- at most five devices per student; the oldest go first
    delete from public.push_subscriptions
     where user_id = uid and subscription_id in (
       select subscription_id from public.push_subscriptions where user_id = uid
        order by created_at desc offset 5);
  else
    delete from public.push_subscriptions where user_id = uid;
  end if;
  insert into public.review_reminders (user_id, enabled, hour, updated_at)
    values (uid, p_enabled, p_hour, now())
    on conflict (user_id) do update set enabled = excluded.enabled, hour = excluded.hour, updated_at = now();
  return public.my_reminders();
end $$;

revoke all on function public.my_reminders(), public.set_reminders(boolean, integer, text) from public, anon;
grant execute on function public.my_reminders(), public.set_reminders(boolean, integer, text) to authenticated;

-- ---- server-side (push-reminders function) -----------------------------

create or replace function public.service_due_reminders(p_now timestamptz default now())
returns table (user_id uuid, subscription_ids text[], due_count integer, local_date date)
language sql stable security definer set search_path = public, pg_temp as $$
  with candidates as (
    select r.user_id, (p_now at time zone p.timezone) as local_ts, p.last_study_date, r.last_sent_on, r.hour
      from public.review_reminders r
      join public.profiles p on p.id = r.user_id
     where r.enabled
  )
  select c.user_id,
         array(select s.subscription_id from public.push_subscriptions s where s.user_id = c.user_id order by s.created_at),
         (select count(*)::int from public.skill_mastery m
           where m.user_id = c.user_id and m.next_review_at is not null and m.next_review_at <= p_now),
         c.local_ts::date
    from candidates c
   where extract(hour from c.local_ts)::int = c.hour
     and (c.last_sent_on is null or c.last_sent_on < c.local_ts::date)
     and (c.last_study_date is null or c.last_study_date < c.local_ts::date)
     and exists (select 1 from public.push_subscriptions s where s.user_id = c.user_id)
     and exists (select 1 from public.skill_mastery m
                  where m.user_id = c.user_id and m.next_review_at is not null and m.next_review_at <= p_now);
$$;

create or replace function public.service_mark_reminded(p_user uuid, p_date date)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.review_reminders set last_sent_on = p_date where user_id = p_user;
$$;

-- OneSignal reports subscriptions that no longer exist (browser data cleared,
-- permission revoked); stop sending to them.
create or replace function public.service_forget_push_subscriptions(p_ids text[])
returns integer language sql security definer set search_path = public, pg_temp as $$
  with gone as (delete from public.push_subscriptions where subscription_id = any(p_ids) returning 1)
  select count(*)::int from gone;
$$;

revoke all on function public.service_due_reminders(timestamptz), public.service_mark_reminded(uuid, date),
  public.service_forget_push_subscriptions(text[]) from public, anon, authenticated;
grant execute on function public.service_due_reminders(timestamptz), public.service_mark_reminded(uuid, date),
  public.service_forget_push_subscriptions(text[]) to service_role;

-- ---- data export includes reminder settings ----------------------------

create or replace function public.export_my_data()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
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
    'memory', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.student_memory m where m.user_id = uid),
    'review_reminders', (select to_jsonb(r) from public.review_reminders r where r.user_id = uid),
    'push_subscriptions', (select coalesce(jsonb_agg(jsonb_build_object('subscription_id', s.subscription_id, 'created_at', s.created_at)), '[]')
                             from public.push_subscriptions s where s.user_id = uid)
  );
end $$;
revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
