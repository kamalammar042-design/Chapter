// ============================================================
// Edge Function: revenuecat-webhook
// ------------------------------------------------------------
// RevenueCat → Chapter. Records Chapter Plus purchases, renewals,
// cancellations and expirations. Deploy with --no-verify-jwt: RevenueCat
// authenticates with the Authorization header configured in its dashboard,
// compared here in constant time against REVENUECAT_WEBHOOK_AUTH.
// Redelivered events are ignored; an event older than the last one applied
// never overwrites it.
// ============================================================
import { admin, log } from '../_shared/server.ts';
import { authorizationMatches, decideEvent, type RevenueCatEvent } from '../_shared/revenuecat.ts';
import { applyPlus } from '../_shared/revenuecat-db.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!authorizationMatches(req.headers.get('Authorization'), Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '')) {
    return new Response('forbidden', { status: 403 });
  }
  let event: RevenueCatEvent;
  try {
    const body = await req.json();
    event = body?.event ?? {};
  } catch {
    return new Response('invalid payload', { status: 400 });
  }
  if (!event.id || !event.type) return new Response('invalid payload', { status: 400 });

  const db = admin();
  const { error: dupErr } = await db.from('revenuecat_events').insert({ id: event.id, type: event.type, environment: event.environment ?? null });
  if (dupErr) {
    if (dupErr.code === '23505') return new Response('already processed', { status: 200 });
    log('error', 'rc_event_log_failed', { fn: 'revenuecat-webhook', message: dupErr.message });
    return new Response('retry', { status: 500 });
  }

  const decision = decideEvent(event, Deno.env.get('REVENUECAT_ENTITLEMENT_ID') || 'plus');
  if (decision.kind === 'ignore') {
    log('info', 'rc_event_ignored', { fn: 'revenuecat-webhook', type: event.type, reason: decision.reason });
    return new Response('ignored', { status: 200 });
  }
  try {
    const result = await applyPlus(db, decision);
    log('info', 'rc_event_applied', { fn: 'revenuecat-webhook', type: event.type, result, active: decision.active, environment: decision.environment });
    return new Response(result, { status: 200 });
  } catch (e) {
    log('error', 'rc_apply_failed', { fn: 'revenuecat-webhook', type: event.type, message: e instanceof Error ? e.message : String(e) });
    await db.from('revenuecat_events').delete().eq('id', event.id); // let RevenueCat retry
    return new Response('retry', { status: 500 });
  }
});
