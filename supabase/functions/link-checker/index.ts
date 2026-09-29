// ============================================================
// Edge Function: link-checker
// ------------------------------------------------------------
// POST /functions/v1/link-checker   Authorization: Bearer <CRON_SECRET>
// Checks every external link in the resources directory once, a few
// seconds apart, and marks a link unavailable after two consecutive
// "not found" results (restored automatically when it works again).
// Deploy with --no-verify-jwt; the CRON_SECRET header is the credential.
// Schedule weekly (see docs/OPERATIONS.md) or run scripts/check-links.mjs.
// ============================================================
import { admin, log } from '../_shared/server.ts';
import { classifyLink, nextLinkState } from '../_shared/links.ts';

const USER_AGENT = 'ChapterLinkChecker/1.0 (+https://github.com/; checks that official links still work)';
const PAUSE_MS = 1500;
const TIMEOUT_MS = 15_000;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function check(url: string): Promise<{ status: number | null; networkError: boolean }> {
  const attempt = async (method: 'HEAD' | 'GET') => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { method, redirect: 'follow', signal: ac.signal, headers: { 'User-Agent': USER_AGENT } });
      await res.body?.cancel();
      return res.status;
    } finally {
      clearTimeout(t);
    }
  };
  try {
    let status = await attempt('HEAD');
    // some servers do not implement HEAD
    if (status === 405 || status === 501) status = await attempt('GET');
    return { status, networkError: false };
  } catch {
    return { status: null, networkError: true };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const secret = Deno.env.get('CRON_SECRET') ?? '';
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (secret.length < 24 || !timingSafeEqual(token, secret)) return new Response('forbidden', { status: 403 });

  const db = admin();
  const { data: rows, error } = await db.from('resources')
    .select('id, external_url, status, consecutive_failures')
    .not('external_url', 'is', null).neq('status', 'pending')
    .order('last_checked_at', { ascending: true, nullsFirst: true }).limit(200);
  if (error) {
    log('error', 'link_check_query_failed', { fn: 'link-checker', message: error.message });
    return new Response('error', { status: 500 });
  }

  // one request per distinct URL
  const results = new Map<string, Awaited<ReturnType<typeof check>>>();
  const summary = { checked: 0, ok: 0, broken: 0, blocked: 0, transient: 0, now_unavailable: 0, restored: 0 };
  for (const r of rows ?? []) {
    const url = r.external_url as string;
    if (!/^https:\/\//.test(url)) continue;
    if (!results.has(url)) {
      results.set(url, await check(url));
      await new Promise((res) => setTimeout(res, PAUSE_MS));
    }
    const res = results.get(url)!;
    const outcome = classifyLink(res.status, res.networkError);
    const next = nextLinkState({ status: r.status, consecutive_failures: r.consecutive_failures }, outcome);
    summary.checked++;
    summary[outcome]++;
    if (r.status === 'active' && next.status === 'unavailable') summary.now_unavailable++;
    if (r.status === 'unavailable' && next.status === 'active') summary.restored++;
    await db.from('resources').update({
      status: next.status,
      consecutive_failures: next.consecutive_failures,
      last_checked_at: new Date().toISOString(),
      last_status_code: res.status,
    }).eq('id', r.id);
  }
  log('info', 'link_check_done', { fn: 'link-checker', ...summary });
  return new Response(JSON.stringify({ ok: true, summary }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
