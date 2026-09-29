// RevenueCat → Chapter Plus entitlement mapping (pure; unit-tested).
//
// The Supabase user id is the RevenueCat app_user_id (the web app configures
// the SDK with it), so a purchase can only ever be credited to the account
// that made it. Access lasts until the expiration RevenueCat reports, plus a
// day of grace for late renewals.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRACE_MS = 86_400_000;

export interface RevenueCatEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number;
  environment?: 'SANDBOX' | 'PRODUCTION';
  store?: string;
  product_id?: string;
}

export type EventDecision =
  | { kind: 'ignore'; reason: string }
  | {
    kind: 'apply';
    userId: string;
    active: boolean;
    expiresAt: string | null;
    eventAt: string;
    environment: string;
  };

// Events that (re)state the current subscription period.
const GRANTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT', 'REFUND_REVERSED', 'PURCHASE_REDEEMED']);
// Auto-renew turned off or a payment problem: access continues until the period ends.
const UNTIL_EXPIRY = new Set(['CANCELLATION', 'BILLING_ISSUE', 'SUBSCRIPTION_PAUSED']);

function userIdOf(e: RevenueCatEvent): string | null {
  for (const id of [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])]) {
    if (id && UUID.test(id)) return id.toLowerCase();
  }
  return null;
}

export function decideEvent(e: RevenueCatEvent, entitlementId: string, now = Date.now()): EventDecision {
  const type = e.type ?? '';
  if (type === 'TEST') return { kind: 'ignore', reason: 'test event' };
  const userId = userIdOf(e);
  if (!userId) return { kind: 'ignore', reason: 'no Chapter user id' };
  const eventAt = new Date(e.event_timestamp_ms ?? now).toISOString();
  const environment = e.environment ?? 'PRODUCTION';
  const mentions = !e.entitlement_ids || e.entitlement_ids.includes(entitlementId);
  if (!mentions) return { kind: 'ignore', reason: `not the ${entitlementId} entitlement` };

  const expiry = e.expiration_at_ms ?? null;
  const expiresAt = expiry ? new Date(expiry + GRACE_MS).toISOString() : null;
  if (type === 'EXPIRATION') return { kind: 'apply', userId, active: false, expiresAt, eventAt, environment };
  if (GRANTS.has(type) || UNTIL_EXPIRY.has(type)) {
    const active = expiry === null ? type === 'NON_RENEWING_PURCHASE' : expiry + GRACE_MS > now;
    return { kind: 'apply', userId, active, expiresAt, eventAt, environment };
  }
  return { kind: 'ignore', reason: `event type ${type || 'missing'} does not change access` };
}

/** Shape of GET /v1/subscribers/{app_user_id} (only the fields used). */
export interface Subscriber {
  entitlements?: Record<string, { expires_date?: string | null; purchase_date?: string; product_identifier?: string }>;
}

/** Current access from a subscriber record. Lifetime purchases have no expiry. */
export function accessFromSubscriber(s: Subscriber | null | undefined, entitlementId: string, now = Date.now()): { active: boolean; expiresAt: string | null } {
  const ent = s?.entitlements?.[entitlementId];
  if (!ent) return { active: false, expiresAt: null };
  if (ent.expires_date == null) return { active: true, expiresAt: null };
  const end = Date.parse(ent.expires_date);
  if (!Number.isFinite(end)) return { active: false, expiresAt: null };
  return { active: end + GRACE_MS > now, expiresAt: new Date(end + GRACE_MS).toISOString() };
}

/** Constant-time comparison of an "Authorization: Bearer <secret>" header (or the bare secret). */
export function authorizationMatches(header: string | null, secret: string): boolean {
  if (!header || secret.length < 16) return false;
  const given = header.replace(/^Bearer\s+/i, '');
  if (given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

export function isNewer(eventAt: string, lastAppliedAt: string | null | undefined): boolean {
  return !lastAppliedAt || Date.parse(eventAt) >= Date.parse(lastAppliedAt);
}
