// ============================================================
// Edge Function: revenuecat-sync
// POST {} → { ok, plus, expires_at }
// Called by the app right after a purchase (webhooks can take a moment).
// Asks RevenueCat's REST API, with the secret key, what the signed-in user
// is entitled to, and records it. The user id comes from the verified JWT,
// never from the request body.
// ============================================================
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { admin, log, serveAuthed } from '../_shared/server.ts';
import { accessFromSubscriber, type Subscriber } from '../_shared/revenuecat.ts';
import { applyPlus } from '../_shared/revenuecat-db.ts';

serveAuthed('revenuecat-sync', async ({ user, cors }) => {
  const secret = Deno.env.get('REVENUECAT_SECRET_KEY') ?? '';
  if (!secret) return errorResponse('not_configured', 503, cors);
  const entitlementId = Deno.env.get('REVENUECAT_ENTITLEMENT_ID') || 'plus';

  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`, {
    headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    log('error', 'rc_sync_failed', { fn: 'revenuecat-sync', status: res.status });
    return errorResponse('server_error', 502, cors);
  }
  const body = await res.json() as { subscriber?: Subscriber };
  const access = accessFromSubscriber(body.subscriber, entitlementId);
  const result = await applyPlus(admin(), { userId: user.id, ...access, eventAt: new Date().toISOString() });
  log('info', 'rc_sync', { fn: 'revenuecat-sync', active: access.active, result });
  return jsonResponse({ ok: true, plus: access.active, expires_at: access.expiresAt }, 200, cors);
});
