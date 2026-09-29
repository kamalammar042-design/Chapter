// Writes a Chapter Plus entitlement from a verified RevenueCat decision.
// (source, external_ref) has a partial unique index, which upsert cannot
// target, so this selects then updates or inserts.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { isNewer } from './revenuecat.ts';

export async function applyPlus(db: SupabaseClient, a: { userId: string; active: boolean; expiresAt: string | null; eventAt: string }): Promise<'applied' | 'stale' | 'unknown_user'> {
  const { data: profile } = await db.from('profiles').select('id').eq('id', a.userId).maybeSingle();
  if (!profile) return 'unknown_user';
  const externalRef = `rc:${a.userId}`;
  const { data: existing } = await db.from('entitlements').select('id, source_event_at')
    .eq('source', 'revenuecat').eq('external_ref', externalRef).maybeSingle();
  if (existing && !isNewer(a.eventAt, existing.source_event_at)) return 'stale';
  const row = {
    user_id: a.userId,
    tier: 'pro',
    source: 'revenuecat',
    external_ref: externalRef,
    expires_at: a.expiresAt,
    revoked_at: a.active ? null : new Date().toISOString(),
    source_event_at: a.eventAt,
  };
  const { error } = existing
    ? await db.from('entitlements').update(row).eq('id', existing.id)
    : await db.from('entitlements').insert(row);
  if (error) throw error;
  return 'applied';
}
