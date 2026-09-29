import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { AppError, authErrorMessage, toAppError } from '@/lib/errors';
import { parseSse } from '@/lib/functions';
import { safeNext } from '@/features/auth/guards';
import { passwordProblem } from '@/features/auth/password';
import { gradeWritten } from '@/features/study/written-grading';
import { fnv1a } from '@/lib/hash';

describe('error messages', () => {
  it('maps server exceptions to actionable messages', () => {
    expect(toAppError({ message: 'free_limit_reached', code: 'P0001' }).code).toBe('free_limit_reached');
    expect(toAppError({ message: 'rate_limited' }).code).toBe('rate_limited');
    expect(toAppError({ message: 'not_authenticated' }).code).toBe('session_expired');
    expect(toAppError({ code: '23505', message: 'duplicate key value' }).code).toBe('conflict');
    expect(toAppError({ code: '42501', message: 'permission denied for table notes' }).code).toBe('forbidden');
    expect(toAppError({ error: 'monthly_cap_reached' }).code).toBe('monthly_cap_reached');
    expect(toAppError(new TypeError('Failed to fetch')).code).toBe('offline');
  });

  it('never exposes raw internals', () => {
    const e = toAppError(new Error('relation "public.secret" does not exist at char 42'));
    expect(e.code).toBe('unknown');
    expect(e.message).toBe('Something went wrong. Please try again.');
  });

  it('keeps sign-in errors generic to prevent account discovery', () => {
    expect(authErrorMessage({ message: 'Invalid login credentials', code: 'invalid_credentials' }, 'signin')).toBe('That email and password combination is not right.');
    expect(authErrorMessage({ message: 'User not found' }, 'signin')).toBe('That email and password combination is not right.');
    expect(authErrorMessage({ code: 'email_not_confirmed', message: 'Email not confirmed' }, 'signin')).toMatch(/confirm your email/);
    expect(authErrorMessage({ status: 429, message: 'rate limit' }, 'signin')).toMatch(/Too many attempts/);
  });

  it('passes AppErrors through', () => {
    const e = new AppError('slow_down');
    expect(toAppError(e)).toBe(e);
  });
});

describe('redirect safety', () => {
  it('only allows same-site paths', () => {
    expect(safeNext('/tutor?x=1')).toBe('/tutor?x=1');
    expect(safeNext(encodeURIComponent('/study/igcse.physics'))).toBe('/study/igcse.physics');
    expect(safeNext('https://evil.example')).toBeNull();
    expect(safeNext('//evil.example/path')).toBeNull();
    expect(safeNext('/\\evil.example')).toBeNull();
    expect(safeNext('javascript:alert(1)')).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});

describe('password rules', () => {
  it('match the server policy', () => {
    expect(passwordProblem('short1')).toMatch(/8 characters/);
    expect(passwordProblem('onlyletters')).toMatch(/letters and numbers/);
    expect(passwordProblem('12345678')).toMatch(/letters and numbers/);
    expect(passwordProblem('revision2027')).toBeNull();
  });
});

describe('SSE parsing', () => {
  it('reassembles events split across chunks', async () => {
    const enc = new TextEncoder();
    const chunks = ['event: meta\ndata: {"conversation_id":"c1"}\n\nevent: del', 'ta\ndata: {"text":"Hel"}\n\nevent: delta\ndata: {"text":"lo"}\n', '\nevent: done\ndata: {}\n\n'];
    const stream = new ReadableStream<Uint8Array>({
      start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); },
    });
    const events = [];
    for await (const e of parseSse(stream)) events.push(e);
    expect(events).toEqual([
      { event: 'meta', data: '{"conversation_id":"c1"}' },
      { event: 'delta', data: '{"text":"Hel"}' },
      { event: 'delta', data: '{"text":"lo"}' },
      { event: 'done', data: '{}' },
    ]);
  });
});

describe('written answer check', () => {
  const q = { subjectId: 5, topic: 'Grammar', q: 'Write a compound sentence.', connectorsAnyOf: ['and', 'but', 'so'], minWords: 6, mustStartCapital: true, mustEndPunctuation: true };
  it('checks the ideas and form it claims to check', () => {
    const good = gradeWritten(q, 'I wanted to go outside, but it was raining.');
    expect(good.pass).toBe(true);
    expect(good.checks.every((c) => c.ok)).toBe(true);
    const bad = gradeWritten(q, 'raining outside today');
    expect(bad.pass).toBe(false);
    expect(bad.checks.filter((c) => !c.ok).map((c) => c.label)).toEqual([
      'Joins ideas with a connective (and, but, so)', 'At least 6 words (you wrote 3)', 'Starts with a capital letter', 'Ends with punctuation',
    ]);
  });
});

describe('question references', () => {
  it('are stable', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'));
    expect(fnv1a('')).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ---- offline outbox -----------------------------------------------------------
const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
let failMode: 'none' | 'offline' | 'quota' | 'withdrawn' = 'none';
const offlineError = { data: null, error: { message: 'Failed to fetch', name: 'TypeError' } };
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (failMode === 'offline') return offlineError;
        inserts.push({ table, row });
        return { data: null, error: null };
      },
      update: () => ({ eq: async () => (failMode === 'offline' ? offlineError : { data: null, error: null }) }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (failMode === 'offline') return offlineError;
      if (failMode === 'quota' && fn === 'submit_attempt') return { data: null, error: { message: 'free_limit_reached', code: 'P0001' } };
      if (failMode === 'withdrawn' && fn === 'submit_attempt') return { data: null, error: { message: 'question_not_found', code: 'P0002' } };
      rpcs.push({ fn, args });
      if (fn === 'submit_attempt') {
        const duplicate = rpcs.filter((r) => r.fn === fn && r.args.p_client_id === args.p_client_id).length > 1;
        return { data: { duplicate, correct: args.p_selected === 2, correct_index: 2, xp: 10, skill_id: 's/t/k', mastery_before: 10, mastery_after: 14 }, error: null };
      }
      return { data: null, error: null };
    },
  },
}));

describe('attempt recording', () => {
  beforeEach(() => { inserts.length = 0; rpcs.length = 0; failMode = 'none'; localStorage.clear(); });
  afterEach(() => { failMode = 'none'; });

  const attempt = { sessionId: null, questionId: 'q-1', selected: 2, timeMs: 5000, hints: 0, mode: 'practice' as const };

  it('sends only the chosen option; the server decides correctness and XP', async () => {
    const { recordAttempt } = await import('@/data/attempts');
    const r = await recordAttempt('u1', attempt);
    expect(r).toMatchObject({ status: 'saved', result: { correct: true, xp: 10, mastery_after: 14 } });
    const sent = rpcs[0].args;
    expect(rpcs[0].fn).toBe('submit_attempt');
    expect(sent).toMatchObject({ p_question_id: 'q-1', p_selected: 2, p_hints: 0, p_mode: 'practice', p_instance: null });
    // the client never claims correctness, XP or a user id for multiple-choice answers
    expect(JSON.stringify(sent)).not.toMatch(/"correct"|xp|user_id/);
    const second = await recordAttempt('u1', { ...attempt, selected: 0 });
    expect(rpcs[1].args.p_client_id).not.toBe(sent.p_client_id);
    expect(second).toMatchObject({ result: { correct: false } });
  });

  it('clamps hints and time, and reports procedural results with the instance', async () => {
    const { recordAttempt } = await import('@/data/attempts');
    await recordAttempt('u1', { ...attempt, selected: null, hints: 9, timeMs: -5, instance: { correct: false, misconception: 'inverts-ohms-law', ref: 'q-1:0', text: 'x'.repeat(5000) } });
    const a = rpcs[0].args as { p_hints: number; p_time_ms: number; p_instance: { text: string; misconception: string } };
    expect(a.p_hints).toBe(5);
    expect(a.p_time_ms).toBe(0);
    expect(a.p_instance.text).toHaveLength(1200);
    expect(a.p_instance.misconception).toBe('inverts-ohms-law');
  });

  it('queues answers while offline and replays them in order, never losing or duplicating one', async () => {
    const { recordAttempt, flushOutbox, pendingCount, startSession } = await import('@/data/attempts');
    failMode = 'offline';
    await startSession('u2', { mode: 'practice', subjectKey: 'igcse.physics', topicKey: null });
    expect(await recordAttempt('u2', attempt)).toEqual({ status: 'queued' });
    expect(await recordAttempt('u2', { ...attempt, questionId: 'q-2' })).toEqual({ status: 'queued' });
    expect(pendingCount('u2')).toBe(2);
    // a flush while still offline keeps everything
    expect(await flushOutbox('u2')).toEqual({ sent: 0, dropped: 0 });
    expect(pendingCount('u2')).toBe(2);
    failMode = 'none';
    expect(await flushOutbox('u2')).toEqual({ sent: 3, dropped: 0 });
    expect(inserts.map((i) => i.table)).toEqual(['practice_sessions']);
    expect(rpcs.map((r) => r.args.p_question_id)).toEqual(['q-1', 'q-2']);
    expect(pendingCount('u2')).toBe(0);
    // the same client id is reused on replay, so the server can de-duplicate
    const ids = rpcs.map((r) => r.args.p_client_id);
    expect(new Set(ids).size).toBe(2);
  });

  it('drops an answer the server refuses for good, without blocking the queue', async () => {
    const { recordAttempt, flushOutbox, pendingCount } = await import('@/data/attempts');
    failMode = 'offline';
    await recordAttempt('u4', attempt);
    await recordAttempt('u4', { ...attempt, questionId: 'q-2' });
    failMode = 'withdrawn';
    expect(await flushOutbox('u4')).toEqual({ sent: 0, dropped: 2 });
    expect(pendingCount('u4')).toBe(0);
  });

  it('ignores outbox items written by older versions of the app', async () => {
    const { pendingCount, flushOutbox } = await import('@/data/attempts');
    localStorage.setItem('chapter.outbox.u5', JSON.stringify([{ type: 'attempt', row: { question_ref: 'b:1' } }]));
    expect(pendingCount('u5')).toBe(0);
    expect(await flushOutbox('u5')).toEqual({ sent: 0, dropped: 0 });
  });

  it('surfaces the free-question limit instead of queueing', async () => {
    const { recordAttempt, pendingCount } = await import('@/data/attempts');
    failMode = 'quota';
    await expect(recordAttempt('u3', attempt)).rejects.toMatchObject({ code: 'free_limit_reached' });
    expect(pendingCount('u3')).toBe(0);
  });
});

describe('practice pool offline cache', () => {
  beforeEach(() => { localStorage.clear(); failMode = 'none'; });

  it('starts a session from the last pool when offline', async () => {
    const { fetchPool } = await import('@/data/learning');
    // first call "online": the mock returns null data, which is cached as []
    await fetchPool('u6', { subject: 'igcse.physics' });
    localStorage.setItem('chapter.pool.u6.igcse.physics.*.*', JSON.stringify({ at: Date.now(), rows: [{ id: 'q1', recently_seen: true }] }));
    failMode = 'offline';
    const r = await fetchPool('u6', { subject: 'igcse.physics' });
    expect(r.offline).toBe(true);
    expect(r.rows).toEqual([{ id: 'q1', recently_seen: false }]);
  });

  it('does not use a stale cache', async () => {
    const { fetchPool } = await import('@/data/learning');
    localStorage.setItem('chapter.pool.u7.igcse.physics.*.*', JSON.stringify({ at: Date.now() - 30 * 86_400_000, rows: [{ id: 'q1' }] }));
    failMode = 'offline';
    await expect(fetchPool('u7', { subject: 'igcse.physics' })).rejects.toBeTruthy();
  });
});

// ---- design tokens: WCAG contrast -----------------------------------------------
function parseTokens(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const block = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
function lum(hex: string): number {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('design token contrast (WCAG 2.1)', () => {
  const css = readFileSync('src/styles/tokens.css', 'utf8');
  for (const [name, selector] of [['dark', ":root[data-theme='dark']"], ['light', ":root[data-theme='light']"]] as const) {
    const t = parseTokens(css, selector);
    it(`${name}: body text is AAA, secondary text AA, muted text AA`, () => {
      for (const bg of ['bg', 'surface', 'surface-2']) {
        expect(contrast(t.text, t[bg]), `text on ${bg}`).toBeGreaterThanOrEqual(7);
        expect(contrast(t['text-2'], t[bg]), `text-2 on ${bg}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t['text-3'], t[bg]), `text-3 on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${name}: accent and status colours are legible`, () => {
      expect(contrast(t['on-primary'], t.primary), 'button label').toBeGreaterThanOrEqual(4.5);
      expect(contrast(t['primary-text'], t.surface), 'accent text').toBeGreaterThanOrEqual(4.5);
      for (const s of ['success', 'warning', 'danger']) expect(contrast(t[s], t.surface), s).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('hosting configs', () => {
  it('ship the same security headers on Vercel, Netlify and other static hosts', () => {
    const netlify = /Content-Security-Policy = "([^"]+)"/.exec(readFileSync('netlify.toml', 'utf8'))![1];
    const vercel = (JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: Array<{ headers: Array<{ key: string; value: string }> }> })
      .headers[0].headers.find((h) => h.key === 'Content-Security-Policy')!.value;
    const other = /Content-Security-Policy: ([^\n]+)/.exec(readFileSync('public/_headers', 'utf8'))![1].trim();
    expect(vercel).toBe(netlify);
    expect(other).toBe(netlify);
    expect(netlify).toContain("script-src 'self' https://js.stripe.com");
    expect(netlify).not.toMatch(/'unsafe-eval'|script-src[^;]*'unsafe-inline'/);
  });
});
