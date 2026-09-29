// ============================================================
// Database test harness
// ------------------------------------------------------------
// Runs the real migrations against PGlite (Postgres compiled to WASM)
// with a minimal emulation of what Supabase provides around them:
//   • roles anon / authenticated / service_role and Supabase's default grants
//   • auth.users and auth.uid() driven by request.jwt.claims, as PostgREST does
//   • storage.buckets / storage.objects
//
// `as(user)` switches the session into the same state PostgREST puts it in
// for a signed-in request, so RLS, column grants and triggers behave as they
// would in production.
// ============================================================
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

const SUPABASE_SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )
$$;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant execute on function storage.foldername(text) to authenticated;
`;

export interface TestUser {
  id: string;
  email: string;
}

export class TestDb {
  private constructor(readonly pg: PGlite) {}

  /**
   * Fresh database with migrations applied. `through` stops after the
   * migration with that numeric prefix (e.g. 7 applies 001–007).
   */
  static async create(opts: { through?: number; paywall?: boolean } = {}): Promise<TestDb> {
    const pg = new PGlite();
    await pg.exec(SUPABASE_SHIM);
    const db = new TestDb(pg);
    await db.migrate(1, opts.through ?? 999);
    // Most suites test the paid-plan rules that apply once payments are
    // connected; free-access mode (the 019 default) is tested explicitly.
    if ((opts.through ?? 999) >= 19) await db.setPaywall(opts.paywall ?? true);
    return db;
  }

  /** Turns the paywall on or off (migration 019), as the project owner would. */
  async setPaywall(on: boolean): Promise<void> {
    await this.asAdmin();
    await this.pg.query('update public.app_settings set paywall_enabled = $1, updated_at = now()', [on]);
  }

  /** Applies migrations whose numeric prefix is within [from, to]. */
  async migrate(from: number, to: number): Promise<void> {
    await this.asAdmin();
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      const n = Number.parseInt(f, 10);
      if (n < from || n > to) continue;
      try {
        await this.pg.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
      } catch (e) {
        throw new Error(`migration ${f} failed: ${(e as Error).message}`);
      }
    }
  }

  async makeAdmin(user: TestUser): Promise<void> {
    await this.asAdmin();
    await this.pg.query('insert into public.admin_users (user_id) values ($1) on conflict do nothing', [user.id]);
  }

  /** Creates an auth user (as the auth service would). */
  async createUser(opts: { email?: string; confirmed?: boolean; meta?: Record<string, unknown> } = {}): Promise<TestUser> {
    const id = randomUUID();
    const email = opts.email ?? `${id.slice(0, 8)}@example.com`;
    await this.asAdmin();
    await this.pg.query(
      `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3, $4)`,
      [id, email, opts.confirmed === false ? null : new Date().toISOString(), JSON.stringify(opts.meta ?? {})],
    );
    return { id, email };
  }

  /** Session state of a signed-in PostgREST request. */
  async as(user: TestUser): Promise<void> {
    await this.pg.exec('reset role');
    await this.pg.query(`select set_config('request.jwt.claims', $1, false)`, [
      JSON.stringify({ sub: user.id, role: 'authenticated' }),
    ]);
    await this.pg.exec('set role authenticated');
  }

  async asAnon(): Promise<void> {
    await this.pg.exec('reset role');
    await this.pg.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ role: 'anon' })]);
    await this.pg.exec('set role anon');
  }

  async asService(): Promise<void> {
    await this.pg.exec('reset role');
    await this.pg.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ role: 'service_role' })]);
    await this.pg.exec('set role service_role');
  }

  /** Migration owner (the dashboard SQL editor). */
  async asAdmin(): Promise<void> {
    await this.pg.exec('reset role');
    await this.pg.query(`select set_config('request.jwt.claims', '', false)`);
  }

  async rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const r = await this.pg.query<T>(sql, params);
    return r.rows;
  }

  async one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
    const r = await this.rows<T>(sql, params);
    if (r.length !== 1) throw new Error(`expected one row, got ${r.length}`);
    return r[0];
  }

  /** Runs sql and returns the error message, or null if it succeeded. */
  async error(sql: string, params: unknown[] = []): Promise<string | null> {
    try {
      await this.pg.query(sql, params);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  async close(): Promise<void> {
    await this.pg.close();
  }
}

export interface AnswerOptions {
  subject?: string;
  topic?: string;
  skill?: string;
  correct?: boolean;
  /** 'easy' = difficulty 1–2, 'medium' = 3, 'hard' = 4–5 */
  level?: 'easy' | 'medium' | 'hard';
  hints?: number;
  mode?: string;
  session_id?: string | null;
  client_id?: string;
  question_id?: string;
  /** pick the wrong option carrying this misconception, if any */
  misconception?: string;
}

export interface AnswerResult {
  duplicate: boolean;
  correct: boolean;
  correct_index: number;
  xp: number;
  skill_id: string | null;
  mastery_before: number;
  mastery_after: number;
  misconception: string | null;
  question_id: string;
  client_id: string;
}

const LEVELS = { easy: [1, 2], medium: [3, 3], hard: [4, 5] } as const;

/** Answers a real published question through submit_attempt(), as the app does. */
export async function answer(db: TestDb, o: AnswerOptions = {}): Promise<AnswerResult> {
  const client_id = o.client_id ?? randomUUID();
  let qid = o.question_id;
  let row: { id: string; correct_index: number; options: Array<{ misconception_id?: string }> } | undefined;
  if (qid) {
    [row] = await db.rows(`select id, correct_index, options from public.questions where id = $1`, [qid]);
  } else {
    const [lo, hi] = LEVELS[o.level ?? 'medium'];
    const rows = await db.rows<{ id: string; correct_index: number; options: Array<{ misconception_id?: string }> }>(
      `select id, correct_index, options from public.questions
        where status = 'published' and question_type = 'mcq'
          and ($1::text is null or subject_key = $1) and ($2::text is null or topic_key = $2)
          and ($3::text is null or skill_id = $3) and difficulty between $4 and $5
        order by random() limit 1`,
      [o.subject ?? o.skill?.split('/')[0] ?? 'igcse.physics', o.topic ?? null, o.skill ?? null, lo, hi]);
    row = rows[0];
    if (!row) throw new Error(`no question for ${JSON.stringify(o)}`);
    qid = row.id;
  }
  let selected = row!.correct_index;
  if (o.correct === false) {
    const n = row!.options.length;
    selected = (row!.correct_index + 1) % n;
    if (o.misconception) {
      const idx = row!.options.findIndex((x) => x.misconception_id === o.misconception);
      if (idx >= 0) selected = idx;
    }
  }
  const r = await db.one<{ r: AnswerResult }>(
    `select public.submit_attempt($1, $2, $3::smallint, $4, $5::smallint, $6, $7, null) as r`,
    [client_id, qid, selected, 20000, o.hints ?? 0, o.mode ?? 'practice', o.session_id ?? null]);
  return { ...r.r, question_id: qid!, client_id };
}
