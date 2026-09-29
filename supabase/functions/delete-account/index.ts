// ============================================================
// Edge Function: delete-account
// POST { confirm: 'DELETE' } → { ok }
// Permanently deletes the caller's account: removes uploaded files and the
// student's RevenueCat customer record, then deletes the auth user; every
// table cascades from auth.users, so no personal data is left behind.
// Deleting the RevenueCat record does not cancel a subscription; the app
// tells Plus supporters to cancel first.
// ============================================================
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { admin, log, readJson, serveAuthed } from '../_shared/server.ts';

serveAuthed('delete-account', async ({ req, user, cors }) => {
  const body = await readJson(req, 1024);
  if (body?.confirm !== 'DELETE') return errorResponse('invalid_request', 400, cors, { field: 'confirm' });
  const db = admin();

  // 1. remove uploaded files (stored under <user id>/...)
  const bucket = db.storage.from('tutor-uploads');
  const { data: folders } = await bucket.list(user.id, { limit: 1000 });
  for (const folder of folders ?? []) {
    const prefix = `${user.id}/${folder.name}`;
    const { data: files } = await bucket.list(prefix, { limit: 1000 });
    const paths = (files ?? []).map((f) => `${prefix}/${f.name}`);
    if (paths.length) await bucket.remove(paths);
  }

  // 2. remove the RevenueCat customer (best effort; the account is deleted regardless)
  const rcKey = Deno.env.get('REVENUECAT_SECRET_KEY');
  if (rcKey) {
    try {
      const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${rcKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok && res.status !== 404) log('warn', 'revenuecat_delete_failed', { fn: 'delete-account', status: res.status });
    } catch {
      log('warn', 'revenuecat_delete_failed', { fn: 'delete-account' });
    }
  }

  // 3. delete the account; all rows cascade
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) throw error;
  return jsonResponse({ ok: true }, 200, cors);
});
