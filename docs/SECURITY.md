# Security

How Chapter protects students' accounts and data, what is enforced where, and the known trade-offs. Report vulnerabilities to the privacy contact in the Privacy Policy.

## Principles

- **The database is the security boundary.** Row-level security is on for every table (a test fails if one is missed). Every client-callable function is on an explicit allow-list (tested). Service-only functions are executable by `service_role` alone.
- **Never trust the client** for roles, user ids, permissions, subscription status, correctness, XP, file types or URLs. Identity comes from `auth.uid()` or a verified JWT; tiers from `entitlements`; correctness from the stored answer key.
- **Least data.** Parents get aggregates; logs get hashes; AI prompts get a capped profile.

## Authentication

- Supabase Auth with PKCE, confirmed email, 8+ character passwords with letters and digits.
- Sign-in, sign-up and reset errors are deliberately generic, so they cannot be used to check whether an account exists.
- Redirect targets after sign-in must be same-site paths (`safeNext`).
- A session that ends without the student signing out (expired or revoked token) sends them to `/signin?reason=expired`, which says so plainly.
- Signing out clears all cached query data, so one account never sees another's.

## Authorisation (selected rules)

| Area | Rule | Where |
| --- | --- | --- |
| Answers | Only through `submit_attempt()`: the server looks up the answer key, decides correctness, XP, mastery and misconceptions. Direct inserts into `question_attempts` are revoked | 014 |
| Questions | Students read published, shared questions (or their own private ones). Only admins write, and the publish guard applies to admins too | 013 |
| Skill mastery, misconceptions, stats | Maintained by triggers; students read their own; nobody writes directly | 014 |
| Reports | Students insert `(question_id, reason, comment)` only, one open report per question; cannot set resolution; cannot read others' | 013 |
| Admin | `admin_users` is not readable or writable by clients. `is_admin()` is a security-definer check; every `admin_*` function raises `forbidden` for non-admins | 013, 015 |
| Parents | No table access. `parent_student_overview()` checks the link and returns academic aggregates only (no notes, tutor messages, question text or email; tested) | 012, 015 |
| Flashcards | `add_flashcards()` checks deck ownership, caps batch size and sanitises fields | 016 |
| Plans | Tiers come from `effective_tier()`: everyone gets every feature while `app_settings.paywall_enabled` is off (clients cannot read or change it; a missing setting fails closed), otherwise only server-side entitlements count. The client can never set its tier | 006, 008, 019 |
| Storage | Hosted papers are readable only when an active resource row allows redistribution; tutor uploads live under the owner's folder | 013, 011 |

The client hides the admin link and redirects non-admins from `/admin`, but that is convenience only: the data calls fail on the server.

## Integrity and abuse limits

- 30 answers a minute and 1,500 a day per account; 100 free questions a month enforced inside the attempt trigger.
- `submit_attempt()` is idempotent on the client-generated id, so offline replays never double-count.
- AI: 10 calls a minute and a monthly cap per plan, checked before any model call.
- Client error logging: 20 events per 10 minutes per user, silently dropped beyond that.

### Known trade-off: answers in the practice pool

Practice gives instant feedback and works offline, so `get_practice_pool()` returns answer keys to the signed-in student, and procedural questions are generated and checked on the device (the client reports the instance result). A determined student can therefore see answers or claim procedural questions correct. What the server does guarantee: answers are only recorded against real, published questions the student can see; each answer is recorded once; rate and quota limits hold; XP is computed on the server. Leagues and parent reports should be read with that in mind. A future "exam mode" that withholds keys until submission would close this for high-stakes use.

## Uploads

- Image and PDF types are decided by magic bytes, never by the declared type or file name. Sizes are checked before decoding.
- Questions generated from a student's PDF are private to that student (`owner_id`) and cannot be published to the shared bank (enforced by the publish guard).

## AI

See [AI.md](AI.md#safety). The Anthropic key is only in Edge Function secrets; student-derived text is fenced as data; output is rendered without raw HTML.

## Secrets

- The browser only ever gets the anon key. The app refuses to start if a service-role key is put in a `VITE_` variable.
- Edge Function secrets: `ANTHROPIC_API_KEY`, `CRON_SECRET` (link checker, compared in constant time). Never commit `supabase/functions/.env` (git-ignored).
- Use separate Supabase projects and keys for development, preview and production.

## Logging

- Edge Functions log structured JSON lines (`log()` in `_shared/server.ts`) with event names and codes only: no tokens, keys, passwords, prompts or student content.
- Client errors go to `app_events` through `log_client_event()`: messages are scrubbed on the device (emails, JWTs, keys, UUIDs and long numbers removed), routes have ids stripped, and the user is stored as a truncated one-way hash.
- `ai_usage` stores token counts and costs, never prompts or replies.

## Browser

Strict CSP (`script-src 'self'`, no inline scripts, `frame-ancestors 'none'`), HSTS with preload, `X-Content-Type-Options`, a restrictive Permissions-Policy (camera for the scan feature only), `Cross-Origin-Opener-Policy`. The service worker caches static assets only, never API responses. An e2e test checks the production CSP.

## Attacker checklist (what was tested)

| Attempt | Result | Test |
| --- | --- | --- |
| Insert an attempt with `correct = true` | Permission denied | `security.test.ts` |
| Answer an unpublished or another student's private question | `question_not_found` | `learning.test.ts` |
| Replay the same answer | Recorded once | `security.test.ts` |
| Write your own mastery or XP | Permission denied | `learning.test.ts`, `security.test.ts` |
| Call admin functions or read the audit log as a student | `forbidden` / no rows | `learning.test.ts` |
| Make yourself admin | Permission denied | `learning.test.ts` |
| Resolve your own report | Permission denied | `learning.test.ts` |
| Publish unknown/restricted/unvalidated content (even as admin, for unknown/restricted) | Rejected by the guard | `learning.test.ts` |
| Host a file without redistribution rights | Check constraint | `learning.test.ts` |
| Read another student's data, or a student's data as an unlinked parent | No rows / `not_linked` | `security.test.ts` |
| Add cards to someone else's deck | `deck_not_found` | `learning.test.ts` |
| Inject instructions through memory text | Stays in the data block | `edge.test.ts` |
| Evaluate code through the math checker | Returns null | `edge.test.ts` |
