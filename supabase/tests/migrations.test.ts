import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TestDb } from './harness';

let db: TestDb;
beforeAll(async () => { db = await TestDb.create(); });
afterAll(async () => { await db?.close(); });

describe('migrations', () => {
  it('apply cleanly in order and seed the catalogue', async () => {
    await db.asAdmin();
    const subjects = await db.rows<{ key: string }>('select key from public.catalog_subjects order by sort');
    expect(subjects.map((s) => s.key)).toContain('igcse.physics');
    expect(subjects.map((s) => s.key)).toContain('sat.reading-writing');
    const topics = await db.one<{ n: number }>('select count(*)::int as n from public.catalog_topics');
    expect(topics.n).toBeGreaterThan(30);
  });

  it('removed the RLS-bypassing leaderboard objects', async () => {
    await db.asAdmin();
    const objs = await db.rows<{ relname: string }>(
      `select relname from pg_class where relname in ('leaderboard', 'public_leaderboard', 'leaderboard_mv')`,
    );
    expect(objs).toEqual([]);
  });

  it('enables RLS on every table in public', async () => {
    await db.asAdmin();
    const rows = await db.rows<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it('exposes no public function to anon', async () => {
    await db.asAdmin();
    const rows = await db.rows<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`,
    );
    expect(rows).toEqual([]);
  });

  it('keeps privileged functions out of reach of signed-in clients', async () => {
    await db.asAdmin();
    const rows = await db.rows<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype
          and has_function_privilege('authenticated', p.oid, 'execute')
        order by 1`,
    );
    // An explicit allow-list: adding a client-callable function must be a
    // deliberate change to this test.
    expect(rows.map((r) => r.proname)).toEqual([
      'accept_parent_invite',
      'add_flashcards',
      'admin_ai_usage',
      'admin_overview',
      'admin_question_health',
      'create_parent_invite',
      'due_reviews',
      'export_my_data',
      'get_leaderboard',
      'get_practice_pool',
      'is_admin',
      'log_client_event',
      'my_ai_allowance',
      'my_parent_links',
      'my_reminders',
      'my_students',
      'my_subscription',
      'my_tier',
      'parent_student_overview',
      'quota_status',
      'record_skip',
      'remove_parent_link',
      'review_flashcard',
      'set_reminders',
      'submit_attempt',
    ]);
  });
});

describe('Phase 2 migrations (013–019)', () => {
  it('can be re-applied without errors or duplicate content', async () => {
    await db.asAdmin();
    const count = async () => db.one<{ q: number; s: number; m: number; r: number }>(
      `select (select count(*)::int from public.questions) as q, (select count(*)::int from public.skills) as s,
              (select count(*)::int from public.misconceptions) as m, (select count(*)::int from public.resources) as r`);
    const before = await count();
    await db.migrate(13, 20);
    expect(await count()).toEqual(before);
  });

  it('upgrade a database that already holds Phase 1 data without losing it', async () => {
    const old = await TestDb.create({ through: 12 });
    try {
      const user = await old.createUser({ meta: { display_name: 'Existing' } });
      await old.asAdmin();
      const external = randomUUID();
      const hosted = randomUUID();
      await old.pg.query(
        `insert into public.past_papers (id, subject_key, year, session, paper_number, kind, title, external_url)
         values ($1, 'igcse.physics', 2023, 'may_jun', 2, 'question_paper', 'Physics Paper 2', 'https://example.org/p2.pdf')`, [external]);
      await old.pg.query(
        `insert into public.past_papers (id, subject_key, year, session, paper_number, kind, title, storage_path)
         values ($1, 'igcse.physics', 2022, 'oct_nov', 4, 'mark_scheme', 'Physics Paper 4 MS', 'igcse.physics/2022-p4-ms.pdf')`, [hosted]);
      await old.pg.query(
        `insert into public.paper_attempts (user_id, paper_id, subject_key, title, score, max_score)
         values ($1, $2, 'igcse.physics', 'Physics Paper 2', 31, 40)`, [user.id, external]);
      await old.pg.query(
        `insert into public.question_attempts (client_id, user_id, subject_key, topic_key, question_ref, difficulty, correct, mode)
         values ($1, $2, 'igcse.physics', 'electricity', 'legacy:1', 'medium', true, 'practice')`, [randomUUID(), user.id]);
      await old.pg.query(`insert into public.flashcard_decks (id, user_id, title) values ($1, $2, 'Old deck')`, [hosted, user.id]);
      await old.pg.query(`insert into public.flashcards (deck_id, user_id, front, back) values ($1, $2, 'Old front', 'Old back')`, [hosted, user.id]);
      await old.pg.query(`insert into public.notes (user_id, title, body) values ($1, 'Old note', 'Body')`, [user.id]);

      await old.migrate(13, 999);
      await old.asAdmin();

      expect(await old.one<{ n: number }>(`select count(*)::int as n from pg_class where relname = 'past_papers'`)).toEqual({ n: 0 });
      const res = await old.rows<{ id: string; access: string; status: string; source_type: string; resource_type: string }>(
        `select id, access, status, source_type, resource_type from public.resources where id in ($1, $2) order by year desc`, [external, hosted]);
      expect(res).toEqual([
        { id: external, access: 'external', status: 'active', source_type: 'external_link', resource_type: 'question_paper' },
        // hosted files had no recorded licence: kept, but hidden until reviewed
        { id: hosted, access: 'hosted', status: 'pending', source_type: 'licensed', resource_type: 'mark_scheme' },
      ]);
      expect(await old.one<{ paper_id: string }>('select paper_id from public.paper_attempts')).toEqual({ paper_id: external });
      expect(await old.one<{ n: number }>(`select count(*)::int as n from public.question_attempts where question_ref = 'legacy:1'`)).toEqual({ n: 1 });
      expect(await old.one<{ source_kind: string; topic_key: string | null }>('select source_kind, topic_key from public.flashcards'))
        .toEqual({ source_kind: 'manual', topic_key: null });
      expect(await old.one<{ n: number }>(`select count(*)::int as n from public.notes`)).toEqual({ n: 1 });
      expect(await old.one<{ study_minutes_per_day: number }>('select study_minutes_per_day from public.profiles where id = $1', [user.id]))
        .toEqual({ study_minutes_per_day: 30 });

      // the student can keep practising after the upgrade
      await old.as(user);
      const { id } = await old.one<{ id: string }>(`select id from public.questions where status = 'published' and question_type = 'mcq' limit 1`);
      const r = await old.one<{ r: { duplicate: boolean } }>(
        `select public.submit_attempt($1, $2, 0::smallint, 1000, 0::smallint, 'practice', null, null) as r`, [randomUUID(), id]);
      expect(r.r.duplicate).toBe(false);
      await old.as(user);
      expect(await old.rows(`select * from public.resources where id = $1`, [hosted])).toHaveLength(0);
    } finally {
      await old.close();
    }
  });
});
