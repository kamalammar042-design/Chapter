// ============================================================
// Edge Function: delete-account
// POST { confirm: 'DELETE' } → { ok }
// Permanently deletes the caller's account: removes uploaded files, then
// deletes the auth user; every table cascades from auth.users, so no
// personal data is left behind. (Store subscriptions are managed by Apple or
// Google; the app tells the student to cancel them there.)
// ============================================================
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { admin, readJson, serveAuthed } from '../_shared/server.ts';

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

  // 2. delete the account; all rows cascade
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) throw error;
  return jsonResponse({ ok: true }, 200, cors);
});
