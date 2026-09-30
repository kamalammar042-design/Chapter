// ============================================================
// Edge Function: push-reminders
// ------------------------------------------------------------
// POST /functions/v1/push-reminders   Authorization: Bearer <CRON_SECRET>
// Runs hourly (pg_cron, see docs/OPERATIONS.md). Sends one web push
// through OneSignal to each student who turned reminders on, has skills
// due, has not studied today and has not been reminded today, at their
// chosen hour in their time zone (service_due_reminders, migration 022).
// Deploy with --no-verify-jwt; the CRON_SECRET header is the credential.
// Secrets: ONESIGNAL_APP_ID, ONESIGNAL_API_KEY, SITE_URL (optional).
// ============================================================
import { admin, log } from '../_shared/server.ts';
import { deadSubscriptions, reminderKey, reminderMessage } from '../_shared/reminders.ts';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const secret = Deno.env.get('CRON_SECRET') ?? '';
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (secret.length < 24 || !timingSafeEqual(token, secret)) return new Response('forbidden', { status: 403 });

  const appId = Deno.env.get('ONESIGNAL_APP_ID') ?? '';
  const apiKey = Deno.env.get('ONESIGNAL_API_KEY') ?? '';
  if (!appId || !apiKey) {
    log('warn', 'push_not_configured', { fn: 'push-reminders' });
    return Response.json({ ok: false, error: 'not_configured' }, { status: 503 });
  }
  const siteUrl = Deno.env.get('SITE_URL') || 'https://chapter-sepia-omega.vercel.app';

  const db = admin();
  const { data: rows, error } = await db.rpc('service_due_reminders');
  if (error) {
    log('error', 'reminder_query_failed', { fn: 'push-reminders', message: error.message });
    return new Response('error', { status: 500 });
  }

  let sent = 0, skipped = 0, failed = 0, forgotten = 0;
  for (const r of (rows ?? []) as Array<{ user_id: string; subscription_ids: string[]; due_count: number; local_date: string }>) {
    if (!r.subscription_ids?.length) { skipped++; continue; }
    try {
      const res = await fetch('https://api.onesignal.com/notifications?c=push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Key ${apiKey}` },
        body: JSON.stringify({
          app_id: appId,
          include_subscription_ids: r.subscription_ids,
          ...reminderMessage(r.due_count, siteUrl),
          idempotency_key: await reminderKey(r.user_id, String(r.local_date)),
          // expire after four hours: a late reminder is worse than none
          ttl: 4 * 3600,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = await res.json().catch(() => ({})) as { id?: string; errors?: unknown };
      if (!res.ok) {
        failed++;
        log('warn', 'reminder_send_failed', { fn: 'push-reminders', status: res.status });
        continue;
      }
      const dead = deadSubscriptions(body.errors, r.subscription_ids);
      if (dead.length) {
        const { data: n } = await db.rpc('service_forget_push_subscriptions', { p_ids: dead });
        forgotten += Number(n ?? 0);
      }
      // mark the day even if nobody matched, so a dead device is not retried every hour
      await db.rpc('service_mark_reminded', { p_user: r.user_id, p_date: r.local_date });
      if (body.id) sent++; else skipped++;
    } catch {
      failed++;
      log('warn', 'reminder_send_failed', { fn: 'push-reminders' });
    }
  }

  log('info', 'reminders_done', { fn: 'push-reminders', due: rows?.length ?? 0, sent, skipped, failed, forgotten });
  return Response.json({ ok: true, due: rows?.length ?? 0, sent, skipped, failed, forgotten });
});
