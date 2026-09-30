// Learning engine, content provenance and admin authorisation, against the
// real migrations (see harness.ts).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TestDb, TestUser, answer } from './harness';

let db: TestDb;
let admin: TestUser;
let student: TestUser;

beforeAll(async () => {
  db = await TestDb.create();
  admin = await db.createUser({ meta: { display_name: 'Admin' } });
  student = await db.createUser({ meta: { display_name: 'Student' } });
  await db.makeAdmin(admin);
});
afterAll(async () => { await db?.close(); });

interface Mastery {
  attempts: number; correct: number; rating: number; mastery: number; review_level: number;
  interval_days: number; next_review_at: string | null; incorrect_streak: number; correct_streak: number;
}

async function mastery(user: TestUser, skill: string): Promise<Mastery | undefined> {
  await db.as(user);
  const [m] = await db.rows<Mastery>('select * from public.skill_mastery where user_id = $1 and skill_id = $2', [user.id, skill]);
  return m;
}

/** A published skill with plenty of medium questions. */
async function busySkill(subject = 'igcse.computer-science'): Promise<string> {
  await db.asAdmin();
  const r = await db.one<{ skill_id: string }>(
    `select skill_id from public.questions where status = 'published' and question_type = 'mcq' and subject_key = $1
      and difficulty = 3 group by skill_id order by count(*) desc limit 1`, [subject]);
  return r.skill_id;
}

const hours = (from: Date, to: string) => (new Date(to).getTime() - from.getTime()) / 3_600_000;

/** Inserts a question as the migration owner (bypasses RLS, not the guard). */
async function insertQuestion(over: Record<string, unknown> = {}): Promise<string> {
  await db.asAdmin();
  const q = {
    subject_key: 'igcse.physics', topic_key: 'electricity', skill_id: 'igcse.physics/electricity/resistance',
    question_type: 'mcq', stem: `Test question ${randomUUID()}`, options: JSON.stringify([{ text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' }]),
    correct_index: 0, difficulty: 3, source_type: 'owned', source_name: 'Test suite', license: 'Proprietary: Chapter',
    copyright_status: 'owned', status: 'published', content_hash: randomUUID(), ...over,
  };
  const cols = Object.keys(q);
  const r = await db.one<{ id: string }>(
    `insert into public.questions (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
    Object.values(q));
  return r.id;
}

describe('skill mastery', () => {
  it('rises with correct answers, is capped by how much evidence there is, and falls after mistakes', async () => {
    const u = await db.createUser();
    const skill = await busySkill();
    await db.as(u);
    const first = await answer(db, { skill, level: 'medium', correct: true });
    expect(first.skill_id).toBe(skill);
    expect(first.mastery_before).toBe(0);
    // one answer is not enough evidence for a high mastery score
    expect(first.mastery_after).toBeGreaterThan(0);
    expect(first.mastery_after).toBeLessThanOrEqual(13);

    let last = first.mastery_after;
    for (let i = 0; i < 7; i++) {
      await db.as(u);
      const r = await answer(db, { skill, level: 'medium', correct: true });
      expect(r.mastery_after).toBeGreaterThanOrEqual(last);
      last = r.mastery_after;
    }
    const high = await mastery(u, skill);
    expect(high!.attempts).toBe(8);
    expect(high!.mastery).toBeGreaterThan(55);
    expect(high!.correct_streak).toBe(8);

    for (let i = 0; i < 3; i++) {
      await db.as(u);
      await answer(db, { skill, level: 'medium', correct: false });
    }
    const low = await mastery(u, skill);
    expect(low!.mastery).toBeLessThan(high!.mastery);
    expect(low!.rating).toBeLessThan(high!.rating);
    expect(low!.incorrect_streak).toBe(3);
    expect(low!.correct_streak).toBe(0);
  });

  it('credits a correct answer to a harder question more than to an easier one', async () => {
    const skill = await busySkill();
    await db.asAdmin();
    const [easy] = await db.rows<{ id: string }>(`select id from public.questions where skill_id = $1 and status = 'published' order by difficulty asc limit 1`, [skill]);
    const [hard] = await db.rows<{ id: string; difficulty: number }>(`select id, difficulty from public.questions where skill_id = $1 and status = 'published' order by difficulty desc limit 1`, [skill]);
    const e = await db.createUser();
    const h = await db.createUser();
    await db.as(e);
    await answer(db, { question_id: easy.id, correct: true });
    await db.as(h);
    await answer(db, { question_id: hard.id, correct: true });
    const me = await mastery(e, skill);
    const mh = await mastery(h, skill);
    if (hard.difficulty > 1) expect(mh!.rating).toBeGreaterThan(me!.rating);
  });

  it('gives less credit to an answer reached with a hint', async () => {
    const skill = await busySkill();
    const plain = await db.createUser();
    const hinted = await db.createUser();
    await db.asAdmin();
    const { id } = await db.one<{ id: string }>(`select id from public.questions where skill_id = $1 and status = 'published' and difficulty = 3 limit 1`, [skill]);
    await db.as(plain);
    await answer(db, { question_id: id, correct: true });
    await db.as(hinted);
    await answer(db, { question_id: id, correct: true, hints: 1 });
    expect((await mastery(hinted, skill))!.rating).toBeLessThan((await mastery(plain, skill))!.rating);
  });

  it('is private to the student', async () => {
    const skill = await busySkill();
    await db.as(student);
    await answer(db, { skill, level: 'medium', correct: true });
    const other = await db.createUser();
    await db.as(other);
    expect(await db.rows('select * from public.skill_mastery where user_id = $1', [student.id])).toHaveLength(0);
    expect(await db.error('update public.skill_mastery set mastery = 100')).toMatch(/permission denied/);
    expect(await db.error(`insert into public.skill_mastery (user_id, skill_id, mastery) values ($1, $2, 100)`, [other.id, skill])).toMatch(/permission denied/);
  });
});

describe('spaced review', () => {
  it('schedules the next review further out after each day of correct answers, and resets after a mistake', async () => {
    const u = await db.createUser();
    const skill = await busySkill();
    const t0 = new Date();
    await db.as(u);
    await answer(db, { skill, level: 'medium', correct: true });
    let m = await mastery(u, skill);
    expect(m!.review_level).toBe(1);
    expect(m!.interval_days).toBe(1);
    expect(hours(t0, m!.next_review_at!)).toBeGreaterThan(23);
    expect(hours(t0, m!.next_review_at!)).toBeLessThan(25);

    // a second correct answer on the same day does not promote again
    await db.as(u);
    await answer(db, { skill, level: 'medium', correct: true });
    m = await mastery(u, skill);
    expect(m!.review_level).toBe(1);

    // pretend the last review was yesterday: the next correct answer steps to 3 days
    await db.asAdmin();
    await db.pg.query(`update public.skill_mastery set last_review_day = last_review_day - 1 where user_id = $1 and skill_id = $2`, [u.id, skill]);
    await db.as(u);
    await answer(db, { skill, level: 'medium', correct: true });
    m = await mastery(u, skill);
    expect(m!.review_level).toBe(2);
    expect(m!.interval_days).toBe(3);

    await db.as(u);
    await answer(db, { skill, level: 'medium', correct: false });
    m = await mastery(u, skill);
    expect(m!.review_level).toBe(0);
    expect(m!.interval_days).toBe(0);
    const back = hours(new Date(), m!.next_review_at!);
    expect(back).toBeGreaterThan(19);
    expect(back).toBeLessThan(21);
  });

  it('does not promote a hinted answer and brings the skill back the next day', async () => {
    const u = await db.createUser();
    const skill = await busySkill();
    await db.as(u);
    await answer(db, { skill, level: 'medium', correct: true, hints: 2 });
    const m = await mastery(u, skill);
    expect(m!.review_level).toBe(0);
    expect(hours(new Date(), m!.next_review_at!)).toBeGreaterThan(23);
  });

  it('lists due skills for the caller only, weakest first', async () => {
    const u = await db.createUser();
    const skill = await busySkill();
    await db.as(u);
    await answer(db, { skill, level: 'medium', correct: false });
    expect(await db.rows('select * from public.due_reviews(20)')).toHaveLength(0);
    await db.asAdmin();
    await db.pg.query(`update public.skill_mastery set next_review_at = now() - interval '1 hour' where user_id = $1`, [u.id]);
    await db.as(u);
    const due = await db.rows<{ skill_id: string; name: string }>('select * from public.due_reviews(20)');
    expect(due.map((d) => d.skill_id)).toEqual([skill]);
    expect(due[0].name.length).toBeGreaterThan(2);
    const other = await db.createUser();
    await db.as(other);
    expect(await db.rows('select * from public.due_reviews(20)')).toHaveLength(0);
  });
});

describe('misconceptions', () => {
  it('records the misconception behind a chosen wrong option, and resolves it after the trap is avoided twice', async () => {
    await db.asAdmin();
    const { id: misc } = await db.one<{ id: string }>(
      `select id from public.misconceptions where skill_id = 'igcse.physics/electricity/resistance' and key = 'multiplies-v-and-r'`);
    const options = JSON.stringify([{ text: '2 A' }, { text: '72 A', misconception_id: misc }, { text: '0.5 A' }, { text: '3 A' }]);
    const q1 = await insertQuestion({ options });
    const q2 = await insertQuestion({ options });
    const q3 = await insertQuestion({ options });
    const u = await db.createUser();
    await db.as(u);
    const wrong = await answer(db, { question_id: q1, correct: false, misconception: misc });
    expect(wrong.correct).toBe(false);
    expect(wrong.misconception).toMatch(/Multiplies voltage by resistance/);

    const read = async () => {
      await db.as(u);
      return db.one<{ evidence_count: number; avoided_count: number; resolved_at: string | null }>(
        'select evidence_count, avoided_count, resolved_at from public.student_misconceptions where user_id = $1', [u.id]);
    };
    expect(await read()).toMatchObject({ evidence_count: 1, avoided_count: 0, resolved_at: null });
    await db.as(u);
    await answer(db, { question_id: q2, correct: true });
    expect(await read()).toMatchObject({ avoided_count: 1, resolved_at: null });
    await db.as(u);
    await answer(db, { question_id: q3, correct: true });
    expect((await read()).resolved_at).not.toBeNull();
  });

  it('accepts a misconception key from a procedural instance only if it belongs to that skill', async () => {
    await db.asAdmin();
    const { id: proc } = await db.one<{ id: string }>(`select id from public.questions where template_key = 'phys.ohm'`);
    const u = await db.createUser();
    await db.as(u);
    const r = await db.one<{ r: { correct: boolean; misconception: string | null; skill_id: string } }>(
      `select public.submit_attempt($1, $2, null, 15000, 0::smallint, 'practice', null, $3) as r`,
      [randomUUID(), proc, JSON.stringify({ correct: false, misconception: 'inverts-ohms-law', ref: 'phys.ohm:42', text: 'A 12 V battery…' })]);
    expect(r.r).toMatchObject({ correct: false, skill_id: 'igcse.physics/electricity/resistance' });
    expect(r.r.misconception).toMatch(/inverting Ohm/);

    const foreign = await db.one<{ r: { misconception: string | null } }>(
      `select public.submit_attempt($1, $2, null, 15000, 0::smallint, 'practice', null, $3) as r`,
      [randomUUID(), proc, JSON.stringify({ correct: false, misconception: 'moles-inverted' })]);
    expect(foreign.r.misconception).toBeNull();
  });

  it('requires a procedural instance to report a boolean result', async () => {
    await db.asAdmin();
    const { id: proc } = await db.one<{ id: string }>(`select id from public.questions where template_key = 'phys.ohm'`);
    await db.as(student);
    for (const inst of [null, { correct: 'yes' }, {}]) {
      expect(await db.error(`select public.submit_attempt($1, $2, null, 1000, 0::smallint, 'practice', null, $3)`,
        [randomUUID(), proc, inst === null ? null : JSON.stringify(inst)])).toMatch(/invalid_answer/);
    }
  });
});

describe('question analytics', () => {
  it('counts attempts, chosen options, hints and skips', async () => {
    const q = await insertQuestion();
    const u = await db.createUser();
    await db.as(u);
    await answer(db, { question_id: q, correct: true });
    await db.as(u);
    await answer(db, { question_id: q, correct: false, hints: 1 });
    await db.as(u);
    await db.pg.query('select public.record_skip($1)', [q]);
    await db.asAdmin();
    const s = await db.one<{ attempts: number; correct: number; hint_uses: number; skips: number; option_counts: number[] }>(
      'select attempts, correct, hint_uses, skips, option_counts from public.question_stats where question_id = $1', [q]);
    expect(s).toMatchObject({ attempts: 2, correct: 1, hint_uses: 1, skips: 1 });
    expect(s.option_counts.slice(0, 2)).toEqual([1, 1]);
  });

  it('ignores skips of unpublished questions and hides stats from students', async () => {
    const q = await insertQuestion({ status: 'draft' });
    await db.as(student);
    await db.pg.query('select public.record_skip($1)', [q]);
    expect(await db.rows('select * from public.question_stats')).toHaveLength(0);
    await db.asAdmin();
    expect(await db.rows('select * from public.question_stats where question_id = $1', [q])).toHaveLength(0);
  });
});

describe('practice pool', () => {
  it('serves only published questions in scope and puts recently seen ones last', async () => {
    const u = await db.createUser();
    const skill = await busySkill();
    await db.as(u);
    const seen = await answer(db, { skill, level: 'medium', correct: true });
    await db.as(u);
    const pool = await db.rows<{ id: string; skill_id: string; recently_seen: boolean }>(
      `select * from public.get_practice_pool('igcse.computer-science', null, array[$1]::text[], 1::smallint, 5::smallint, 200)`, [skill]);
    expect(pool.length).toBeGreaterThan(1);
    expect(pool.every((p) => p.skill_id === skill)).toBe(true);
    expect(pool.at(-1)).toMatchObject({ id: seen.question_id, recently_seen: true });
    expect(pool.filter((p) => p.recently_seen)).toHaveLength(1);

    await db.asAdmin();
    const { topic_key } = await db.one<{ topic_key: string }>('select topic_key from public.skills where id = $1', [skill]);
    const draft = await insertQuestion({ status: 'draft', subject_key: 'igcse.computer-science', topic_key, skill_id: skill });
    await db.as(u);
    const again = await db.rows<{ id: string }>(`select id from public.get_practice_pool('igcse.computer-science', null, array[$1]::text[], 1::smallint, 5::smallint, 200)`, [skill]);
    expect(again.map((r) => r.id)).not.toContain(draft);
  });

  it('respects the core tier', async () => {
    const u = await db.createUser();
    await db.asAdmin();
    await db.pg.query(`update public.profiles set igcse_tier = 'core' where id = $1`, [u.id]);
    const ext = await insertQuestion({ tier: 'extended' });
    await db.as(u);
    const ids = (await db.rows<{ id: string }>(`select id from public.get_practice_pool('igcse.physics', 'electricity', null, 1::smallint, 5::smallint, 200)`)).map((r) => r.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain(ext);
  });

  it('is not available to anonymous visitors', async () => {
    await db.asAnon();
    expect(await db.error(`select * from public.get_practice_pool('igcse.physics')`)).toMatch(/permission denied/);
  });
});

describe('provenance guard', () => {
  const blocked: Array<[string, Record<string, unknown>, RegExp]> = [
    ['unknown copyright', { copyright_status: 'unknown' }, /copyright status is unknown/],
    ['restricted copyright', { copyright_status: 'restricted' }, /copyright status is restricted/],
    ['licensed content without a source URL', { source_type: 'licensed', copyright_status: 'licensed', license: 'CC BY 4.0' }, /needs a source URL/],
    ['open-licence content without a source URL', { source_type: 'open_license', copyright_status: 'open', license: 'CC BY 4.0' }, /needs a source URL/],
    ['generated content without validation', { source_type: 'generated', copyright_status: 'generated' }, /not passed validation/],
    ['generated content that failed validation', { source_type: 'generated', copyright_status: 'generated', validation: JSON.stringify({ passed: false }) }, /not passed validation/],
    ['a question with no skill', { skill_id: null }, /has no skill/],
  ];
  for (const [what, over, msg] of blocked) {
    it(`refuses to publish ${what}`, async () => {
      await expect(insertQuestion(over)).rejects.toThrow(msg);
      // but it can be stored for review
      await expect(insertQuestion({ ...over, status: 'pending_review' })).resolves.toMatch(/-/);
    });
  }

  it('publishes validated generated questions and licensed content with a source URL', async () => {
    await expect(insertQuestion({ source_type: 'generated', copyright_status: 'generated', license: 'Proprietary: Chapter', validation: JSON.stringify({ passed: true }) })).resolves.toBeTruthy();
    await expect(insertQuestion({ source_type: 'open_license', copyright_status: 'open', license: 'CC BY 4.0', source_url: 'https://example.org/q/1' })).resolves.toBeTruthy();
  });

  it('refuses to publish an existing draft whose provenance is unknown', async () => {
    const id = await insertQuestion({ status: 'draft', copyright_status: 'unknown' });
    await db.asAdmin();
    expect(await db.error(`update public.questions set status = 'published' where id = $1`, [id])).toMatch(/copyright status is unknown/);
  });

  it('never publishes seed questions whose skill could not be classified', async () => {
    await db.asAdmin();
    const r = await db.one<{ n: number }>(`select count(*)::int as n from public.questions where skill_id is null and question_type = 'mcq' and status = 'published'`);
    expect(r.n).toBe(0);
    const unknown = await db.one<{ n: number }>(`select count(*)::int as n from public.questions where status = 'published' and copyright_status in ('unknown', 'restricted')`);
    expect(unknown.n).toBe(0);
  });

  it('bumps the version when content changes and records every change in the audit log', async () => {
    const id = await insertQuestion({ status: 'draft' });
    await db.as(admin);
    await db.pg.query(`update public.questions set stem = 'Edited stem text' where id = $1`, [id]);
    await db.pg.query(`update public.questions set status = 'published' where id = $1`, [id]);
    const q = await db.one<{ version: number; reviewed_by: string; reviewed_at: string | null }>('select version, reviewed_by, reviewed_at from public.questions where id = $1', [id]);
    expect(q.version).toBe(2);
    expect(q.reviewed_by).toBe(admin.id);
    expect(q.reviewed_at).not.toBeNull();
    const log = await db.rows<{ action: string; actor: string | null }>(
      `select action, actor from public.content_audit_log where entity = 'question' and entity_id = $1 order by id`, [id]);
    expect(log.map((l) => l.action)).toEqual(['create', 'edit', 'status:published']);
    expect(log[2].actor).toBe(admin.id);
  });
});

describe('content administration', () => {
  it('lets admins create, edit and archive questions through RLS, and nobody else', async () => {
    await db.as(admin);
    const { id } = await db.one<{ id: string }>(
      `insert into public.questions (subject_key, topic_key, skill_id, stem, options, correct_index, difficulty, source_type,
         source_name, license, copyright_status, status, content_hash)
       values ('igcse.physics', 'electricity', 'igcse.physics/electricity/resistance', 'Admin-written question?',
         '[{"text":"a"},{"text":"b"},{"text":"c"}]', 1, 2, 'owned', 'Chapter editorial', 'Proprietary: Chapter', 'owned', 'draft', $1)
       returning id`, [randomUUID()]);
    await db.pg.query(`update public.questions set status = 'archived' where id = $1`, [id]);

    await db.as(student);
    expect(await db.rows('select id from public.questions where id = $1', [id])).toHaveLength(0);
    expect(await db.error(
      `insert into public.questions (subject_key, topic_key, stem, difficulty, source_type, source_name, license, copyright_status, content_hash, options, correct_index)
       values ('igcse.physics', 'electricity', 'Sneaky', 2, 'owned', 'x y', 'x y', 'owned', 'h', '[{"text":"a"},{"text":"b"}]', 0)`))
      .toMatch(/row-level security|permission denied/);
    const r = await db.pg.query(`update public.questions set correct_index = 1 where status = 'published'`);
    expect(r.affectedRows ?? 0).toBe(0);
    const d = await db.pg.query(`delete from public.questions`);
    expect(d.affectedRows ?? 0).toBe(0);
  });

  it('keeps admin analytics server-side', async () => {
    await db.as(student);
    expect(await db.one<{ is_admin: boolean }>('select public.is_admin()')).toEqual({ is_admin: false });
    expect(await db.error('select * from public.admin_question_health()')).toMatch(/forbidden/);
    expect(await db.error('select public.admin_ai_usage(30)')).toMatch(/forbidden/);
    expect(await db.error('select public.admin_overview()')).toMatch(/forbidden/);
    expect(await db.rows('select * from public.content_audit_log')).toHaveLength(0);
    expect(await db.error('select * from public.admin_users')).toMatch(/permission denied/);
    expect(await db.error(`insert into public.admin_users (user_id) values ($1)`, [student.id])).toMatch(/permission denied/);

    await db.as(admin);
    expect(await db.one<{ is_admin: boolean }>('select public.is_admin()')).toEqual({ is_admin: true });
    const o = await db.one<{ o: { questions_by_status: Record<string, number> } }>('select public.admin_overview() as o');
    expect(o.o.questions_by_status.published).toBeGreaterThan(300);
    expect(await db.one<{ u: { totals: { requests: number } } }>('select public.admin_ai_usage(7) as u')).toBeTruthy();
  });

  it('flags a question whose distractor is chosen more than the right answer', async () => {
    const q = await insertQuestion();
    for (let i = 0; i < 12; i++) {
      const u = await db.createUser();
      await db.as(u);
      await answer(db, { question_id: q, correct: i < 3 });
    }
    await db.as(admin);
    const rows = await db.rows<{ question_id: string; flags: string[]; attempts: number }>(
      'select question_id, flags, attempts from public.admin_question_health(20, true, 1000)');
    const row = rows.find((r) => r.question_id === q);
    expect(row?.attempts).toBe(12);
    expect(row?.flags).toContain('suspicious_distractor');
  });

  it('lets a student report a question once, without resolving it themselves', async () => {
    const q = await insertQuestion();
    const u = await db.createUser();
    await db.as(u);
    await db.pg.query(`insert into public.question_reports (question_id, reason, comment) values ($1, 'wrong_answer', 'B is right')`, [q]);
    expect(await db.error(`insert into public.question_reports (question_id, reason) values ($1, 'typo')`, [q])).toMatch(/duplicate|unique/);
    expect(await db.error(`insert into public.question_reports (question_id, reason, resolved_at) values ($1, 'typo', now())`, [q])).toMatch(/permission denied/);
    const upd = await db.pg.query(`update public.question_reports set resolution = 'self-resolved'`);
    expect(upd.affectedRows ?? 0).toBe(0);
    const other = await db.createUser();
    await db.as(other);
    expect(await db.rows('select * from public.question_reports')).toHaveLength(0);
    await db.as(admin);
    const flagged = await db.rows<{ question_id: string; flags: string[] }>('select question_id, flags from public.admin_question_health(30, true, 1000)');
    expect(flagged.find((f) => f.question_id === q)?.flags).toContain('reported');
  });
});

describe('resources', () => {
  const base = { subject_key: 'igcse.physics', program: 'igcse', title: 'Paper 2 2024', provider: 'Test', resource_type: 'question_paper' };
  const insert = async (over: Record<string, unknown>) => {
    await db.asAdmin();
    const r = { ...base, ...over };
    const cols = Object.keys(r);
    return db.error(`insert into public.resources (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(r));
  };

  it('only hosts material Chapter may redistribute', async () => {
    expect(await insert({ access: 'hosted', source_type: 'official_reference', storage_path: 'x.pdf', redistribution_allowed: true, license: 'n/a' })).toMatch(/check constraint/);
    expect(await insert({ access: 'hosted', source_type: 'licensed', storage_path: 'x.pdf', redistribution_allowed: false, license: 'Licence A' })).toMatch(/check constraint/);
    expect(await insert({ access: 'download', source_type: 'owned', storage_path: 'x.pdf', redistribution_allowed: true })).toMatch(/check constraint/);
    expect(await insert({ access: 'external', source_type: 'official_reference' })).toMatch(/check constraint/);
    expect(await insert({ access: 'external', source_type: 'official_reference', external_url: 'http://insecure.example' })).toMatch(/check constraint/);
    expect(await insert({ access: 'hosted', source_type: 'owned', storage_path: 'own.pdf', redistribution_allowed: true, license: 'Proprietary: Chapter' })).toBeNull();
    expect(await insert({ access: 'external', source_type: 'official_reference', external_url: 'https://example.org/paper' })).toBeNull();
  });

  it('seeds the official-source directory as external links only', async () => {
    await db.as(student);
    const r = await db.rows<{ access: string; source_type: string; redistribution_allowed: boolean; external_url: string }>(
      `select access, source_type, redistribution_allowed, external_url from public.resources where provider in ('Cambridge International', 'College Board', 'Khan Academy')`);
    expect(r.length).toBeGreaterThanOrEqual(15);
    expect(r.every((x) => x.access === 'external' && x.source_type === 'official_reference' && !x.redistribution_allowed && x.external_url.startsWith('https://'))).toBe(true);
  });

  it('hides pending resources from students and lets only admins change the directory', async () => {
    await insert({ access: 'external', source_type: 'external_link', external_url: 'https://example.org/pending', status: 'pending', title: 'Pending one' });
    await db.as(student);
    expect(await db.rows(`select * from public.resources where title = 'Pending one'`)).toHaveLength(0);
    const u = await db.pg.query(`update public.resources set external_url = 'https://evil.example/'`);
    expect(u.affectedRows ?? 0).toBe(0);
    await db.as(admin);
    expect(await db.rows(`select * from public.resources where title = 'Pending one'`)).toHaveLength(1);
  });
});

describe('add_flashcards', () => {
  it('adds cards to your own deck and skips repeats, ignoring case and spacing', async () => {
    const u = await db.createUser();
    await db.as(u);
    const { id: deck } = await db.one<{ id: string }>(`insert into public.flashcard_decks (title, subject_key) values ('Mistakes', 'igcse.physics') returning id`);
    const cards = [
      { front: 'What is Ohm’s law?', back: 'V = IR', skill_id: 'igcse.physics/electricity/resistance', source_kind: 'mistake', difficulty: 2 },
      { front: '  what is  ohm’s LAW? ', back: 'dup' },
      { front: 'Unit of charge', back: 'coulomb', skill_id: 'not/a/skill', source_kind: 'hacker' },
      { front: '', back: 'empty' },
    ];
    const r = await db.one<{ r: { added: number; skipped: number } }>('select public.add_flashcards($1, $2) as r', [deck, JSON.stringify(cards)]);
    expect(r.r).toEqual({ added: 2, skipped: 2 });
    const rows = await db.rows<{ front: string; skill_id: string | null; source_kind: string; user_id: string }>(
      'select front, skill_id, source_kind, user_id from public.flashcards where deck_id = $1 order by front', [deck]);
    expect(rows).toHaveLength(2);
    expect(rows.find((c) => c.front === 'Unit of charge')).toMatchObject({ skill_id: null, source_kind: 'manual', user_id: u.id });
    expect(rows.find((c) => c.front.startsWith('What'))).toMatchObject({ source_kind: 'mistake' });
    const again = await db.one<{ r: { added: number; skipped: number } }>('select public.add_flashcards($1, $2) as r', [deck, JSON.stringify(cards.slice(0, 1))]);
    expect(again.r).toEqual({ added: 0, skipped: 1 });
  });

  it("refuses someone else's deck and oversized batches", async () => {
    const owner = await db.createUser();
    await db.as(owner);
    const { id: deck } = await db.one<{ id: string }>(`insert into public.flashcard_decks (title) values ('Mine') returning id`);
    const thief = await db.createUser();
    await db.as(thief);
    expect(await db.error('select public.add_flashcards($1, $2)', [deck, JSON.stringify([{ front: 'a', back: 'b' }])])).toMatch(/deck_not_found/);
    await db.as(owner);
    const many = Array.from({ length: 101 }, (_, i) => ({ front: `f${i}`, back: 'b' }));
    expect(await db.error('select public.add_flashcards($1, $2)', [deck, JSON.stringify(many)])).toMatch(/invalid_request/);
  });
});

describe('client event log', () => {
  it('stores a hashed user, never the raw id, and drops floods', async () => {
    const u = await db.createUser();
    await db.as(u);
    for (let i = 0; i < 25; i++) {
      await db.pg.query(`select public.log_client_event('error', 'render_failed', '/study', 'boom', '{"code":1}'::jsonb, '1.0.0')`);
    }
    await db.asAdmin();
    const rows = await db.rows<{ user_hash: string; detail: unknown }>(`select user_hash, detail from public.app_events where event = 'render_failed'`);
    expect(rows).toHaveLength(20);
    expect(rows[0].user_hash).not.toContain(u.id.slice(0, 8));
    expect(JSON.stringify(rows)).not.toContain(u.id);
    await db.as(u);
    expect(await db.rows('select * from public.app_events')).toHaveLength(0);
  });
});

describe('private questions from a student upload', () => {
  it('are visible to and answerable by their owner only, and never publish to the shared bank', async () => {
    const owner = await db.createUser();
    const other = await db.createUser();
    await expect(insertQuestion({ source_type: 'user_uploaded', copyright_status: 'user_provided', license: 'Private: student upload' }))
      .rejects.toThrow(/only be private/);
    const id = await insertQuestion({ source_type: 'user_uploaded', copyright_status: 'user_provided', license: 'Private: student upload', owner_id: owner.id });

    await db.as(owner);
    expect(await db.rows('select id from public.questions where id = $1', [id])).toHaveLength(1);
    const pool = await db.rows<{ id: string }>(`select id from public.get_practice_pool('igcse.physics', 'electricity', null, 1::smallint, 5::smallint, 200)`);
    expect(pool.map((p) => p.id)).toContain(id);
    await answer(db, { question_id: id, correct: true });

    await db.as(other);
    expect(await db.rows('select id from public.questions where id = $1', [id])).toHaveLength(0);
    const theirs = await db.rows<{ id: string }>(`select id from public.get_practice_pool('igcse.physics', 'electricity', null, 1::smallint, 5::smallint, 200)`);
    expect(theirs.map((p) => p.id)).not.toContain(id);
    expect(await db.error(`select public.submit_attempt($1, $2, 0::smallint, 1000, 0::smallint, 'practice', null, null)`, [randomUUID(), id]))
      .toMatch(/question_not_found/);
  });
});

describe('human review of generated questions', () => {
  it('lets an admin publish a generated question that needs review, and records the review', async () => {
    const id = await insertQuestion({ source_type: 'generated', copyright_status: 'generated', status: 'pending_review', validation: JSON.stringify({ passed: false }) });
    await db.as(student);
    const r = await db.pg.query(`update public.questions set status = 'published' where id = $1`, [id]);
    expect(r.affectedRows ?? 0).toBe(0);
    await db.as(admin);
    await db.pg.query(`update public.questions set status = 'published' where id = $1`, [id]);
    const q = await db.one<{ status: string; validation: { human_review?: { by: string } } }>('select status, validation from public.questions where id = $1', [id]);
    expect(q.status).toBe('published');
    expect(q.validation.human_review?.by).toBe(admin.id);
  });
});

describe('data export', () => {
  it('includes the student’s learning data and nobody else’s', async () => {
    const u = await db.createUser();
    const skill = await busySkill();
    await db.as(u);
    await answer(db, { skill, level: 'medium', correct: false });
    const e = await db.one<{ e: Record<string, unknown[]> }>('select public.export_my_data() as e');
    expect(e.e.skill_mastery).toHaveLength(1);
    expect(e.e.attempts).toHaveLength(1);
    expect(JSON.stringify(e.e)).not.toContain(student.id);
  });
});

describe('free access until payments are connected (019)', () => {
  it('gives every account all paid features while the paywall is off, and only entitlements once it is on', async () => {
    const free = await TestDb.create({ paywall: false });
    try {
      const u = await free.createUser({ meta: { display_name: 'Early' } });
      await free.as(u);
      expect(await free.one('select public.my_tier() as t')).toEqual({ t: 'parent' });
      const sub = await free.one<{ s: { tier: string; paywall_enabled: boolean } }>('select public.my_subscription() as s');
      expect(sub.s).toMatchObject({ tier: 'parent', paywall_enabled: false });
      const quota = await free.one<{ q: { unlimited: boolean } }>('select public.quota_status() as q');
      expect(quota.q.unlimited).toBe(true);
      const ai = await free.one<{ a: { allowed: boolean; cap: number } }>(`select public.my_ai_allowance('generate') as a`);
      expect(ai.a).toMatchObject({ allowed: true, cap: 150 }); // paid-plan cap still bounds AI cost
      // parent access works without buying anything
      const invite = await free.one<{ i: { code: string } }>('select public.create_parent_invite() as i');
      expect(invite.i.code).toMatch(/\w{8}/);

      // students cannot see or flip the switch
      expect(await free.error('select * from public.app_settings')).toMatch(/permission denied/);
      expect(await free.error('update public.app_settings set paywall_enabled = false')).toMatch(/permission denied/);
      expect(await free.error('select public.paywall_enabled()')).toMatch(/permission denied/);

      // connecting payments: the owner turns the paywall on
      await free.setPaywall(true);
      await free.as(u);
      expect(await free.one('select public.my_tier() as t')).toEqual({ t: 'free' });
      expect((await free.one<{ q: { unlimited: boolean } }>('select public.quota_status() as q')).q.unlimited).toBe(false);
      expect(await free.error('select public.create_parent_invite()')).toMatch(/upgrade_required/);
    } finally {
      await free.close();
    }
  });

  it('fails closed if the settings row is missing', async () => {
    const d = await TestDb.create({ paywall: false });
    try {
      await d.asAdmin();
      await d.pg.query('delete from public.app_settings');
      const u = await d.createUser();
      await d.as(u);
      expect(await d.one('select public.my_tier() as t')).toEqual({ t: 'free' });
    } finally {
      await d.close();
    }
  });
});

describe('Chapter Plus (020)', () => {
  it('triples AI allowances for an active RevenueCat entitlement, which students cannot create themselves', async () => {
    const u = await db.createUser();
    await db.as(u);
    const before = await db.one<{ a: { cap: number; plus: boolean } }>(`select public.my_ai_allowance('tutor_message') as a`);
    expect(before.a.plus).toBe(false);
    expect(await db.error(`insert into public.entitlements (user_id, tier, source, external_ref, expires_at) values ($1, 'pro', 'revenuecat', 'rc:x', now() + interval '30 days')`, [u.id]))
      .toMatch(/permission denied|row-level security/);
    expect(await db.error('select * from public.revenuecat_events')).toMatch(/permission denied/);

    // what the webhook / sync function does with the service role
    await db.asService();
    await db.pg.query(`insert into public.entitlements (user_id, tier, source, external_ref, expires_at, source_event_at) values ($1, 'pro', 'revenuecat', $2, now() + interval '30 days', now())`, [u.id, `rc:${u.id}`]);
    await db.as(u);
    const after = await db.one<{ a: { cap: number; plus: boolean } }>(`select public.my_ai_allowance('tutor_message') as a`);
    expect(after.a.plus).toBe(true);
    expect(after.a.cap).toBe(900 * 3); // paid-level base (as in free-access mode), tripled
    const sub = await db.one<{ s: { plus: boolean } }>('select public.my_subscription() as s');
    expect(sub.s.plus).toBe(true);

    // expired or revoked Plus no longer counts
    await db.asService();
    await db.pg.query(`update public.entitlements set revoked_at = now() where user_id = $1 and source = 'revenuecat'`, [u.id]);
    await db.as(u);
    expect((await db.one<{ a: { plus: boolean } }>(`select public.my_ai_allowance('tutor_message') as a`)).a.plus).toBe(false);
  });

  it('lets a Plus supporter delete their account (021)', async () => {
    const u = await db.createUser();
    await db.asService();
    await db.pg.query(`insert into public.entitlements (user_id, tier, source, external_ref, expires_at, source_event_at) values ($1, 'pro', 'revenuecat', $2, now() + interval '30 days', now())`, [u.id, `rc:${u.id}`]);
    await db.asAdmin();
    // Supabase Auth deletes users with search_path = auth
    await db.pg.exec('begin; set local search_path = auth');
    await db.pg.query('delete from auth.users where id = $1', [u.id]);
    await db.pg.exec('commit');
    const left = await db.one<{ n: number }>('select count(*)::int as n from public.entitlements where user_id = $1', [u.id]);
    expect(left.n).toBe(0);
  });
});

describe('review reminders (022)', () => {
  const SUB = '6b1f4a2e-3c5d-4e7f-8a9b-0c1d2e3f4a5b';
  const SUB2 = '7c2a5b3f-4d6e-4f80-9bac-1d2e3f4a5b6c';

  async function dueSkill(userId: string) {
    await db.asAdmin();
    const skill = await db.one<{ id: string }>('select id from public.skills order by key limit 1');
    await db.pg.query(
      `insert into public.skill_mastery (user_id, skill_id, attempts, next_review_at) values ($1, $2, 1, now() - interval '1 hour')
       on conflict (user_id, skill_id) do update set next_review_at = excluded.next_review_at`, [userId, skill.id]);
  }
  async function due(at: string) {
    await db.asService();
    return db.rows<{ user_id: string; subscription_ids: string[]; due_count: number; local_date: string }>(
      'select user_id, subscription_ids, due_count, local_date::text as local_date from public.service_due_reminders($1::timestamptz)', [at]);
  }

  it('keeps reminder data behind functions and validates input', async () => {
    const u = await db.createUser();
    await db.as(u);
    expect(await db.error('select * from public.review_reminders')).toMatch(/permission denied/);
    expect(await db.error('select * from public.push_subscriptions')).toMatch(/permission denied/);
    expect(await db.error(`select public.set_reminders(true, 17, 'not-a-uuid')`)).toMatch(/invalid subscription/);
    expect(await db.error(`select public.set_reminders(false, 24)`)).toMatch(/invalid hour/);
    expect(await db.error('select * from public.service_due_reminders()')).toMatch(/permission denied/);
    const r = await db.one<{ r: { enabled: boolean; hour: number; devices: number } }>(`select public.set_reminders(true, 18, $1) as r`, [SUB]);
    expect(r.r).toMatchObject({ enabled: true, hour: 18, devices: 1 });
    const e = await db.one<{ e: { review_reminders: { hour: number }; push_subscriptions: Array<{ subscription_id: string }> } }>('select public.export_my_data() as e');
    expect(e.e.review_reminders.hour).toBe(18);
    expect(e.e.push_subscriptions.map((x) => x.subscription_id)).toEqual([SUB]);
  });

  it('reminds once, at the chosen local hour, only when reviews are due and the student has not studied', async () => {
    const u = await db.createUser();
    await db.asAdmin();
    await db.pg.query(`update public.profiles set timezone = 'Asia/Dubai', last_study_date = null where id = $1`, [u.id]);
    await db.as(u);
    await db.pg.query(`select public.set_reminders(true, 17, $1)`, [SUB2]);

    // 17:00 in Dubai is 13:00 UTC; nothing is due yet
    const at = '2026-10-05T13:10:00Z';
    expect((await due(at)).find((r) => r.user_id === u.id)).toBeUndefined();

    await dueSkill(u.id);
    const row = (await due(at)).find((r) => r.user_id === u.id);
    expect(row).toMatchObject({ subscription_ids: [SUB2], due_count: 1 });
    expect(String(row!.local_date)).toContain('2026-10-05');
    // another hour: not yet
    expect((await due('2026-10-05T12:10:00Z')).find((r) => r.user_id === u.id)).toBeUndefined();

    // once a day
    await db.asService();
    await db.pg.query('select public.service_mark_reminded($1, $2::date)', [u.id, '2026-10-05']);
    expect((await due(at)).find((r) => r.user_id === u.id)).toBeUndefined();
    expect((await due('2026-10-06T13:10:00Z')).find((r) => r.user_id === u.id)).toBeDefined();

    // studied today: no reminder
    await db.asAdmin();
    await db.pg.query(`update public.profiles set last_study_date = '2026-10-06' where id = $1`, [u.id]);
    expect((await due('2026-10-06T13:10:00Z')).find((r) => r.user_id === u.id)).toBeUndefined();

    // dead subscriptions are forgotten; turning reminders off forgets every device
    await db.asService();
    expect((await db.one<{ n: number }>('select public.service_forget_push_subscriptions($1) as n', [[SUB2]])).n).toBe(1);
    await db.as(u);
    await db.pg.query(`select public.set_reminders(true, 17, $1)`, [SUB2]);
    const off = await db.one<{ r: { enabled: boolean; devices: number } }>('select public.set_reminders(false, 17) as r');
    expect(off.r).toMatchObject({ enabled: false, devices: 0 });
  });

  it('moves a browser to the account that registered it last', async () => {
    const a = await db.createUser();
    const b = await db.createUser();
    const SHARED = '8d3b6c4a-5e7f-4a91-8cbd-2e3f4a5b6c7d';
    await db.as(a);
    await db.pg.query(`select public.set_reminders(true, 9, $1)`, [SHARED]);
    await db.as(b);
    await db.pg.query(`select public.set_reminders(true, 9, $1)`, [SHARED]);
    await db.as(a);
    expect((await db.one<{ r: { devices: number } }>('select public.my_reminders() as r')).r.devices).toBe(0);
  });
});
