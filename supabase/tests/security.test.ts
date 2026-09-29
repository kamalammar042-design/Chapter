import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TestDb, TestUser, answer } from './harness';

let db: TestDb;
let aliceMistake = '';
let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  db = await TestDb.create();
  alice = await db.createUser({ meta: { display_name: 'Alice', role: 'student' } });
  bob = await db.createUser({ meta: { display_name: 'Bob' } });
});
afterAll(async () => { await db?.close(); });

const OWNED_TABLES = [
  'profiles', 'student_subjects', 'practice_sessions', 'question_attempts', 'topic_stats',
  'daily_activity', 'weekly_xp', 'goals', 'notes', 'flashcard_decks', 'flashcards',
  'paper_attempts', 'tutor_conversations', 'tutor_messages', 'student_memory',
  'free_quota', 'entitlements', 'ai_usage',
];

describe('signup', () => {
  it('creates a profile with display name and role from metadata', async () => {
    await db.as(alice);
    const p = await db.one<{ display_name: string; role: string; xp: number }>(
      'select display_name, role, xp from public.profiles where id = $1', [alice.id]);
    expect(p).toEqual({ display_name: 'Alice', role: 'student', xp: 0 });
  });

  it('never trusts a role other than student/parent from metadata', async () => {
    const eve = await db.createUser({ meta: { role: 'admin' } });
    await db.as(eve);
    const p = await db.one<{ role: string }>('select role from public.profiles where id = $1', [eve.id]);
    expect(p.role).toBe('student');
  });
});

describe('anonymous access', () => {
  it('cannot read any user table', async () => {
    await db.asAnon();
    for (const t of OWNED_TABLES) {
      const err = await db.error(`select * from public.${t} limit 1`);
      expect(err, t).toMatch(/permission denied/);
    }
  });

  it('cannot read legacy answer_events partitions directly', async () => {
    await db.asAdmin();
    const parts = await db.rows<{ relname: string }>(
      `select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid
        join pg_class p on p.oid = i.inhparent where p.relname = 'answer_events'`);
    expect(parts.length).toBeGreaterThan(0);
    await db.asAnon();
    for (const { relname } of parts) {
      expect(await db.error(`select * from public.${relname}`)).toMatch(/permission denied/);
    }
  });

  it('cannot call RPCs', async () => {
    await db.asAnon();
    expect(await db.error('select public.quota_status()')).toMatch(/permission denied/);
    expect(await db.error('select public.get_leaderboard(10)')).toMatch(/permission denied/);
  });
});

describe('profiles', () => {
  it('lets a student edit allowed fields', async () => {
    await db.as(alice);
    await db.rows(`update public.profiles set username = 'alice_s', program = 'igcse', igcse_tier = 'extended',
                   timezone = 'Asia/Dubai' where id = $1`, [alice.id]);
    const p = await db.one<{ username: string; timezone: string }>(
      'select username, timezone from public.profiles where id = $1', [alice.id]);
    expect(p).toEqual({ username: 'alice_s', timezone: 'Asia/Dubai' });
  });

  it('falls back to UTC for an invalid time zone', async () => {
    await db.as(bob);
    await db.rows(`update public.profiles set timezone = 'Mars/Olympus' where id = $1`, [bob.id]);
    const p = await db.one<{ timezone: string }>('select timezone from public.profiles where id = $1', [bob.id]);
    expect(p.timezone).toBe('UTC');
  });

  it('rejects writes to server-owned columns', async () => {
    await db.as(alice);
    expect(await db.error('update public.profiles set xp = 999999 where id = $1', [alice.id])).toMatch(/permission denied/);
    expect(await db.error(`update public.profiles set subscription = 'pro' where id = $1`, [alice.id])).toMatch(/permission denied/);
    expect(await db.error('update public.profiles set streak_days = 400 where id = $1', [alice.id])).toMatch(/permission denied/);
  });

  it('cannot see or edit another user\'s profile', async () => {
    await db.as(bob);
    expect(await db.rows('select * from public.profiles where id = $1', [alice.id])).toEqual([]);
    await db.rows(`update public.profiles set display_name = 'hacked' where id = $1`, [alice.id]);
    await db.as(alice);
    const p = await db.one<{ display_name: string }>('select display_name from public.profiles where id = $1', [alice.id]);
    expect(p.display_name).toBe('Alice');
  });

  it('enforces username format and case-insensitive uniqueness', async () => {
    await db.as(bob);
    expect(await db.error(`update public.profiles set username = 'a b<script>' where id = $1`, [bob.id])).toMatch(/profiles_username_format/);
    expect(await db.error(`update public.profiles set username = 'ALICE_S' where id = $1`, [bob.id])).toMatch(/duplicate key/);
  });
});

describe('question attempts', () => {
  it('decides correctness, XP, identity and timestamps on the server', async () => {
    await db.as(alice);
    const right = await answer(db, { subject: 'igcse.computer-science', level: 'hard', correct: true });
    expect(right).toMatchObject({ correct: true, xp: 35, duplicate: false });
    const wrong = await answer(db, { subject: 'igcse.computer-science', level: 'hard', correct: false });
    aliceMistake = wrong.question_id;
    expect(wrong).toMatchObject({ correct: false, xp: 0 });
    const rows = await db.rows<{ user_id: string; question_text: string | null; selected_index: number; correct: boolean }>(
      'select user_id, question_text, selected_index, correct from public.question_attempts where user_id = $1 order by id', [alice.id]);
    expect(rows.every((r) => r.user_id === alice.id)).toBe(true);
    // the stored mistake text comes from the server copy of the question, never the client
    expect(rows[0].question_text).toBeNull();
    const stem = await db.one<{ stem: string }>('select stem from public.questions where id = $1', [wrong.question_id]);
    expect(rows[1].question_text).toBe(stem.stem);
  });

  it('cannot be written directly: the client cannot claim a correct answer', async () => {
    await db.as(alice);
    expect(await db.error(
      `insert into public.question_attempts (client_id, subject_key, topic_key, question_ref, difficulty, correct, mode)
       values ($1, 'igcse.physics', 'waves', 'x', 'hard', true, 'practice')`, [randomUUID()],
    )).toMatch(/permission denied/);
  });

  it('rejects unpublished questions and out-of-range answers', async () => {
    await db.as(alice);
    const pending = await db.rows<{ id: string }>(`select id from public.questions where status = 'pending_review' limit 1`);
    expect(pending).toEqual([]); // hidden from students by RLS
    await db.asAdmin();
    const [hidden] = await db.rows<{ id: string }>(`select id from public.questions where status = 'pending_review' limit 1`);
    await db.as(alice);
    expect(await db.error(`select public.submit_attempt($1, $2, 0::smallint)`, [randomUUID(), hidden.id])).toMatch(/question_not_found/);
    const [pub] = await db.rows<{ id: string }>(`select id from public.questions where status = 'published' and question_type = 'mcq' limit 1`);
    expect(await db.error(`select public.submit_attempt($1, $2, 7::smallint)`, [randomUUID(), pub.id])).toMatch(/invalid_answer/);
  });

  it('is idempotent: a retried submission is counted once', async () => {
    const ivo = await db.createUser();
    await db.as(ivo);
    const first = await answer(db, { correct: true, level: 'easy' });
    const again = await answer(db, { client_id: first.client_id, question_id: first.question_id, correct: true });
    expect(again).toMatchObject({ duplicate: true, correct: true });
    const n = await db.one<{ n: number }>('select count(*)::int as n from public.question_attempts where user_id = $1', [ivo.id]);
    expect(n.n).toBe(1);
  });

  it('halves XP when a hint was used', async () => {
    const hana = await db.createUser();
    await db.as(hana);
    const r = await answer(db, { correct: true, level: 'medium', hints: 1 });
    expect(r.xp).toBe(10);
  });

  it('keeps aggregates and profile XP in step', async () => {
    await db.as(alice);
    const stats = await db.one<{ attempts: number; correct: number }>(
      `select sum(attempts)::int as attempts, sum(correct)::int as correct from public.topic_stats where user_id = $1`, [alice.id]);
    expect(stats).toEqual({ attempts: 2, correct: 1 });
    const p = await db.one<{ xp: number }>('select xp from public.profiles where id = $1', [alice.id]);
    expect(p.xp).toBe(35);
    const day = await db.one<{ questions: number; xp: number }>(
      'select questions, xp from public.daily_activity where user_id = $1', [alice.id]);
    expect(day).toEqual({ questions: 2, xp: 35 });
  });

  it('is append-only', async () => {
    await db.as(alice);
    expect(await db.error('update public.question_attempts set correct = true')).toMatch(/permission denied/);
    expect(await db.error('delete from public.question_attempts')).toMatch(/permission denied/);
    expect(await db.error('update public.topic_stats set correct = 100')).toMatch(/permission denied/);
    expect(await db.error('update public.skill_mastery set mastery = 100')).toMatch(/permission denied/);
    expect(await db.error('insert into public.daily_activity (user_id, day, xp) values ($1, current_date, 9999)', [alice.id])).toMatch(/permission denied/);
  });

  it("rejects attaching an attempt to someone else's session", async () => {
    await db.as(bob);
    const [s] = await db.rows<{ id: string }>(`insert into public.practice_sessions (mode) values ('practice') returning id`);
    await db.as(alice);
    await expect(answer(db, { session_id: s.id })).rejects.toThrow(/invalid_session/);
  });

  it('updates session counters server-side and forbids editing them', async () => {
    await db.as(bob);
    const [s] = await db.rows<{ id: string }>(`insert into public.practice_sessions (mode, subject_key) values ('practice', 'igcse.physics') returning id`);
    await answer(db, { session_id: s.id, correct: true, level: 'easy' });
    await answer(db, { session_id: s.id, correct: false });
    const row = await db.one<{ question_count: number; correct_count: number; practice_seconds: number; xp_earned: number }>(
      'select question_count, correct_count, practice_seconds, xp_earned from public.practice_sessions where id = $1', [s.id]);
    expect(row).toEqual({ question_count: 2, correct_count: 1, practice_seconds: 40, xp_earned: 10 });
    expect(await db.error('update public.practice_sessions set xp_earned = 500 where id = $1', [s.id])).toMatch(/permission denied/);
    await db.rows('update public.practice_sessions set ended_at = now(), explanations_viewed = 2 where id = $1', [s.id]);
  });

  it('rate-limits bursts of answers', async () => {
    const carol = await db.createUser();
    await db.as(carol);
    for (let i = 0; i < 30; i++) await answer(db);
    await expect(answer(db)).rejects.toThrow(/rate_limited/);
  });
});

describe('free quota', () => {
  it('stops recording progress past the monthly limit', async () => {
    const dan = await db.createUser();
    await db.asAdmin();
    await db.rows(`insert into public.free_quota (user_id, period_start, used) values ($1, date_trunc('month', now())::date, 99)`, [dan.id]);
    await db.as(dan);
    await answer(db);
    await expect(answer(db)).rejects.toThrow(/free_limit_reached/);
    const q = await db.one<{ quota_status: { remaining: number } }>('select public.quota_status()');
    expect(q.quota_status.remaining).toBe(0);
  });

  it('does not limit paid students', async () => {
    const erin = await db.createUser();
    await db.asAdmin();
    await db.rows(`insert into public.entitlements (user_id, tier, source) values ($1, 'pro', 'admin')`, [erin.id]);
    await db.rows(`insert into public.free_quota (user_id, period_start, used) values ($1, date_trunc('month', now())::date, 100)`, [erin.id]);
    await db.as(erin);
    await answer(db);
    const q = await db.one<{ quota_status: { unlimited: boolean } }>('select public.quota_status()');
    expect(q.quota_status.unlimited).toBe(true);
  });

  it('no longer exposes quota functions that take a user id', async () => {
    await db.as(alice);
    expect(await db.error('select public.consume_quota($1, 1)', [bob.id])).toMatch(/does not exist/);
    expect(await db.error('select public.quota_status($1)', [bob.id])).toMatch(/does not exist/);
    expect(await db.error('select public.recompute_streak($1)', [bob.id])).toMatch(/does not exist/);
    expect(await db.error('select public.effective_tier($1)', [bob.id])).toMatch(/permission denied/);
  });
});

describe('streaks', () => {
  it('counts a day once 5 questions are answered and continues from yesterday', async () => {
    const fay = await db.createUser();
    await db.asAdmin();
    // yesterday was day 3 of a streak
    await db.rows(`update public.profiles set streak_days = 3, longest_streak = 3,
                   last_study_date = (now() at time zone 'UTC')::date - 1 where id = $1`, [fay.id]);
    await db.as(fay);
    for (let i = 0; i < 4; i++) await answer(db, { correct: false });
    let p = await db.one<{ streak_days: number }>('select streak_days from public.profiles where id = $1', [fay.id]);
    expect(p.streak_days).toBe(3);
    await answer(db, { correct: false });
    p = await db.one<{ streak_days: number }>('select streak_days from public.profiles where id = $1', [fay.id]);
    expect(p.streak_days).toBe(4);
    await answer(db, { correct: false });
    p = await db.one<{ streak_days: number }>('select streak_days from public.profiles where id = $1', [fay.id]);
    expect(p.streak_days).toBe(4);
  });

  it('restarts after a missed day but keeps the longest streak', async () => {
    const gus = await db.createUser();
    await db.asAdmin();
    await db.rows(`update public.profiles set streak_days = 9, longest_streak = 12,
                   last_study_date = (now() at time zone 'UTC')::date - 3 where id = $1`, [gus.id]);
    await db.as(gus);
    for (let i = 0; i < 5; i++) await answer(db, { correct: false });
    const p = await db.one<{ streak_days: number; longest_streak: number }>(
      'select streak_days, longest_streak from public.profiles where id = $1', [gus.id]);
    expect(p).toEqual({ streak_days: 1, longest_streak: 12 });
  });

  it('awards the weekly consistency bonus on day 7', async () => {
    const hal = await db.createUser();
    await db.asAdmin();
    await db.rows(`update public.profiles set streak_days = 6, last_study_date = (now() at time zone 'UTC')::date - 1 where id = $1`, [hal.id]);
    await db.as(hal);
    for (let i = 0; i < 5; i++) await answer(db, { correct: false });
    const p = await db.one<{ streak_days: number; xp: number }>('select streak_days, xp from public.profiles where id = $1', [hal.id]);
    expect(p).toEqual({ streak_days: 7, xp: 35 });
  });
});

describe('isolation between students', () => {
  it('hides every owned row from other users', async () => {
    await db.as(alice);
    await db.rows(`insert into public.notes (title, body) values ('Moles', 'n = m / M')`);
    await db.rows(`insert into public.goals (kind, target) values ('questions', 50)`);
    await db.rows(`insert into public.student_subjects (subject_key, exam_date) values ('igcse.physics', '2027-05-10')`);
    await db.rows(`insert into public.paper_attempts (subject_key, title, score, max_score) values ('igcse.physics', 'Paper 4', 52, 80)`);
    await db.as(bob);
    for (const t of OWNED_TABLES) {
      const rows = await db.rows(`select * from public.${t} where user_id = $1`.replace('user_id', t === 'profiles' ? 'id' : 'user_id'), [alice.id]);
      expect(rows, t).toEqual([]);
    }
  });

  it('cannot write rows on behalf of another user', async () => {
    await db.as(bob);
    expect(await db.error(`insert into public.notes (user_id, title) values ($1, 'x')`, [alice.id])).toMatch(/row-level security/);
    expect(await db.error(`insert into public.goals (user_id, kind, target) values ($1, 'questions', 5)`, [alice.id])).toMatch(/row-level security/);
    const upd = await db.rows(`update public.notes set body = 'defaced' where user_id = $1 returning id`, [alice.id]);
    expect(upd).toEqual([]);
  });

  it('validates goal targets', async () => {
    await db.as(bob);
    expect(await db.error(`insert into public.goals (kind, target) values ('accuracy', 140)`)).toMatch(/check constraint/);
    expect(await db.error(`insert into public.goals (kind, target) values ('sat_score', 2000)`)).toMatch(/check constraint/);
    expect(await db.error(`insert into public.goals (kind, target, period) values ('papers', 3, 'by_date')`)).toMatch(/check constraint/);
  });
});

describe('flashcards', () => {
  it('schedules reviews on the server', async () => {
    await db.as(alice);
    const [deck] = await db.rows<{ id: string }>(`insert into public.flashcard_decks (title) values ('Waves') returning id`);
    const [card] = await db.rows<{ id: string }>(
      `insert into public.flashcards (deck_id, front, back) values ($1, 'v = ?', 'f × λ') returning id`, [deck.id]);
    type Card = { interval_days: number; repetitions: number; lapses: number };
    const review = (grade: number) => db.one<Card>('select * from public.review_flashcard($1, $2::smallint)', [card.id, grade]);
    expect((await review(2)).interval_days).toBe(1);
    expect((await review(2)).interval_days).toBe(6);
    expect((await review(3)).interval_days).toBeGreaterThan(6);
    expect(await review(0)).toMatchObject({ interval_days: 0, lapses: 1, repetitions: 0 });
    const act = await db.one<{ reviews: number }>('select reviews from public.daily_activity where user_id = $1', [alice.id]);
    expect(act.reviews).toBe(4);
    expect(await db.error('update public.flashcards set due_at = now() + interval \'1 year\' where id = $1', [card.id])).toMatch(/permission denied/);
  });

  it('cannot review or file cards into another student\'s deck', async () => {
    await db.as(alice);
    const [deck] = await db.rows<{ id: string }>(`select id from public.flashcard_decks limit 1`);
    const [card] = await db.rows<{ id: string }>(`select id from public.flashcards limit 1`);
    await db.as(bob);
    expect(await db.error('select public.review_flashcard($1, 2::smallint)', [card.id])).toMatch(/card_not_found/);
    expect(await db.error(`insert into public.flashcards (deck_id, front, back) values ($1, 'a', 'b')`, [deck.id])).toMatch(/deck_not_found/);
  });
});

describe('leaderboard', () => {
  it('shows opted-in usernames and weekly XP only', async () => {
    const ivy = await db.createUser();
    const jon = await db.createUser();
    for (const [u, name, optIn] of [[ivy, 'ivy', true], [jon, 'jon_hidden', false]] as const) {
      await db.as(u);
      await db.rows(`update public.profiles set username = $1, program = 'sat', leaderboard_opt_in = $2 where id = $3`, [name, optIn, u.id]);
      await answer(db, { subject: 'sat.math', level: 'hard', correct: true });
    }
    await db.as(ivy);
    const lb = await db.one<{ get_leaderboard: { entries: Array<Record<string, unknown>>; me: { rank: number } } }>(
      'select public.get_leaderboard(30)');
    const names = lb.get_leaderboard.entries.map((e) => e.username);
    expect(names).toContain('ivy');
    expect(names).not.toContain('jon_hidden');
    expect(Object.keys(lb.get_leaderboard.entries[0]).sort()).toEqual(['is_me', 'rank', 'username', 'xp']);
    expect(lb.get_leaderboard.me.rank).toBe(1);

    // an opted-out student still sees their own standing
    await db.as(jon);
    const own = await db.one<{ get_leaderboard: { me: { xp: number } | null } }>('select public.get_leaderboard(30)');
    expect(own.get_leaderboard.me?.xp).toBe(35);
  });
});

describe('admin grants', () => {
  it('are applied only after the email is confirmed', async () => {
    await db.asAdmin();
    await db.rows(`insert into public.admin_grants (email, tier) values ('founder@example.com', 'parent')`);
    const u = await db.createUser({ email: 'founder@example.com', confirmed: false });
    await db.as(u);
    let t = await db.one<{ my_tier: string }>('select public.my_tier()');
    expect(t.my_tier).toBe('free');
    await db.asAdmin();
    await db.rows('update auth.users set email_confirmed_at = now() where id = $1', [u.id]);
    await db.as(u);
    t = await db.one<{ my_tier: string }>('select public.my_tier()');
    expect(t.my_tier).toBe('parent');
  });
});

describe('parent access', () => {
  let student: TestUser;
  let parent: TestUser;
  let stranger: TestUser;
  const redeem = async (code: string) =>
    (await db.one<{ r: Record<string, unknown> }>('select public.accept_parent_invite($1) as r', [code])).r;

  beforeAll(async () => {
    student = await db.createUser({ meta: { display_name: 'Sam' } });
    parent = await db.createUser({ meta: { role: 'parent', display_name: 'Pat' } });
    stranger = await db.createUser();
  });

  it('requires the Pro + Parent plan to invite', async () => {
    await db.as(student);
    expect(await db.error('select public.create_parent_invite()')).toMatch(/upgrade_required/);
  });

  it('links a parent through a student-issued code and shows aggregates only', async () => {
    await db.asAdmin();
    await db.rows(`insert into public.entitlements (user_id, tier, source) values ($1, 'parent', 'admin')`, [student.id]);
    await db.as(student);
    await answer(db, { correct: false });
    const inv = await db.one<{ create_parent_invite: { code: string } }>('select public.create_parent_invite()');
    const code = inv.create_parent_invite.code;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    // the student cannot link themselves
    expect(await redeem(code)).toMatchObject({ ok: false, reason: 'invalid_code' });

    await db.as(parent);
    const res = await db.one<{ accept_parent_invite: { display_name: string } }>(
      'select public.accept_parent_invite($1)', [code.toLowerCase().slice(0, 4) + '-' + code.slice(4)]);
    expect(res.accept_parent_invite.display_name).toBe('Sam');

    // the code is single-use
    await db.as(stranger);
    expect(await redeem(code)).toMatchObject({ ok: false, reason: 'invalid_code' });

    await db.as(parent);
    const o = await db.one<{ parent_student_overview: Record<string, unknown> }>(
      'select public.parent_student_overview($1)', [student.id]);
    const overview = JSON.stringify(o.parent_student_overview);
    expect(overview).toContain('topic_stats');
    expect(overview).not.toContain('private mistake text');
    expect(Object.keys(o.parent_student_overview).sort()).toEqual(
      ['activity', 'goals', 'papers', 'skills', 'student', 'subjects', 'topic_stats']);
    // no private content: notes, tutor messages, question text or email
    expect(overview).not.toMatch(/"(email|notes|tutor|question_text|body)"/);
    // parents never get direct table access
    expect(await db.rows('select * from public.question_attempts where user_id = $1', [student.id])).toEqual([]);
    expect(await db.rows('select * from public.tutor_messages where user_id = $1', [student.id])).toEqual([]);
  });

  it('refuses overviews for students who are not linked', async () => {
    await db.as(stranger);
    expect(await db.error('select public.parent_student_overview($1)', [student.id])).toMatch(/not_linked/);
  });

  it('lets the student revoke access', async () => {
    await db.as(student);
    const links = await db.one<{ my_parent_links: { parents: Array<{ parent_id: string; email_hint: string }> } }>(
      'select public.my_parent_links()');
    expect(links.my_parent_links.parents).toHaveLength(1);
    expect(links.my_parent_links.parents[0].email_hint).toMatch(/•••@example\.com$/);
    await db.rows('select public.remove_parent_link($1)', [parent.id]);
    await db.as(parent);
    expect(await db.error('select public.parent_student_overview($1)', [student.id])).toMatch(/not_linked/);
  });

  it('locks out brute-force code guessing', async () => {
    const guesser = await db.createUser();
    await db.as(guesser);
    for (let i = 0; i < 10; i++) {
      expect(await redeem('ZZZZZZZZ')).toMatchObject({ ok: false, reason: 'invalid_code' });
    }
    expect(await redeem('ZZZZZZZZ')).toMatchObject({ ok: false, reason: 'too_many_attempts' });
  });
});

describe('tutor data', () => {
  it('only the server can write tutor messages or tutor-sourced memory', async () => {
    await db.as(alice);
    expect(await db.error(`insert into public.tutor_conversations (user_id) values ($1)`, [alice.id])).toMatch(/permission denied/);
    expect(await db.error(
      `insert into public.student_memory (kind, content, source) values ('strength', 'Mastered calculus', 'tutor')`,
    )).toMatch(/row-level security/);
    await db.rows(`insert into public.student_memory (kind, content, source) values ('preference', 'I like worked examples', 'user')`);
    const mine = await db.rows('select content from public.student_memory');
    expect(mine).toHaveLength(1);
    await db.as(bob);
    expect(await db.rows('select * from public.student_memory')).toEqual([]);
  });

  it('keeps uploaded images private to their owner', async () => {
    await db.asAdmin();
    await db.rows(`insert into storage.objects (bucket_id, name, owner) values ('tutor-uploads', $1, $2)`, [`${alice.id}/scan.png`, alice.id]);
    await db.as(bob);
    expect(await db.rows(`select * from storage.objects where bucket_id = 'tutor-uploads'`)).toEqual([]);
    await db.as(alice);
    expect(await db.rows(`select * from storage.objects where bucket_id = 'tutor-uploads'`)).toHaveLength(1);
  });
});

describe('service-only functions', () => {
  it('are not callable by students', async () => {
    await db.as(alice);
    expect(await db.error('select public.service_student_context($1)', [bob.id])).toMatch(/permission denied/);
    expect(await db.error('select public.service_can_use_ai($1, $2)', [bob.id, 'tutor_message'])).toMatch(/permission denied/);
    expect(await db.error(`select public.service_remember($1, 'strength', null, 'x')`, [bob.id])).toMatch(/permission denied/);
  });

  it('build a tutor context from real activity and merge duplicate memories', async () => {
    await db.asService();
    await db.rows(`select public.service_remember($1, 'misconception', 'igcse.physics', 'Confuses series and parallel resistance')`, [alice.id]);
    await db.rows(`select public.service_remember($1, 'misconception', 'igcse.physics', 'confuses series and parallel resistance')`, [alice.id]);
    const ctx = await db.one<{ c: { profile: { name: string }; memory: unknown[]; recent_mistakes: Array<{ question: string }> } }>(
      'select public.service_student_context($1, $2, null) as c', [alice.id, 'igcse.computer-science']);
    expect(ctx.c.profile.name).toBe('Alice');
    await db.asAdmin();
    const stem = await db.one<{ stem: string }>('select left(stem, 240) as stem from public.questions where id = $1', [aliceMistake]);
    expect(ctx.c.recent_mistakes[0].question).toBe(stem.stem);
    await db.asService();
    // scoped to the subject: another subject's mistakes do not leak in
    const other = await db.one<{ c: { recent_mistakes: unknown[] } }>(
      'select public.service_student_context($1, $2, null) as c', [alice.id, 'sat.math']);
    expect(other.c.recent_mistakes).toEqual([]);
    const mem = await db.one<{ n: number; e: number }>(
      `select count(*)::int as n, max(evidence_count)::int as e from public.student_memory where user_id = $1 and source = 'tutor'`, [alice.id]);
    expect(mem).toEqual({ n: 1, e: 2 });
    const gate = await db.one<{ g: { allowed: boolean; cap: number } }>(
      `select public.service_can_use_ai($1, 'tutor_message') as g`, [alice.id]);
    expect(gate.g).toMatchObject({ allowed: true, cap: 30 });
  });
});
