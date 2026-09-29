# Deploying Chapter

Three parts: the **database** (Supabase migrations), the **Edge Functions** and the **app** (a static build, served on the web or wrapped for the App Store and Google Play). Steps marked *external* need an account or secret that is not in this repository.

Use **separate Supabase projects** for development, preview and production, each with its own keys. Netlify deploy previews should point at the preview project.

---

## 1. Database

Take a backup first (Supabase → Database → Backups).

### Existing project (001–012 applied)

Run in order in the SQL editor, each file as one query:

```
013_content_system.sql
014_learning_engine.sql
015_ai_ops.sql
016_study_tools.sql
017_skills_seed.sql
018_content_seed.sql
019_free_access.sql
```

Or with the CLI: `supabase migration repair --status applied 001 … 012` then `supabase db push`.

### Existing project (only 001–007 applied)

Run 008–019 in order. See the notes on 008 in [DATABASE.md](DATABASE.md).

### New project

`supabase db push`, or 001–019 in order.

### What 013–018 change for existing clients

- **Answers must go through `submit_attempt()`**; direct inserts into `question_attempts` are revoked. Deploy the new web app at the same time as the migrations: an old tab will fail to record answers until reloaded (answers queued offline by the old app are discarded by the new one, because they cannot be matched to a question).
- `past_papers` is replaced by `resources`. Hosted files move across as `pending` until an administrator confirms the licence.
- The tutor function must be redeployed (it calls the new three-argument `service_student_context`).

### Content administrators

```sql
insert into public.admin_users (user_id, note)
select id, 'content team' from auth.users where email = 'you@example.com';
```

### Verify

```bash
npm run test:db     # every migration on real Postgres: RLS, grants, triggers, learning engine, upgrade path
```

---

## 2. Authentication (*external*: Supabase → Authentication)

| Setting | Value |
| --- | --- |
| Site URL | `https://your-domain` |
| Redirect URLs | `https://your-domain/auth/callback`, `https://your-domain/reset-password` (plus `http://localhost:5173/**` in development, and your preview domain in the preview project) |
| Confirm email | On |
| Minimum password length | 8, letters and digits |
| Secure password change | On |
| JWT expiry | Default (1 hour) is fine; the app handles refresh and expiry |
| SMTP | A custom provider (Resend, Postmark, SES…). The built-in mailer is rate-limited and not for production |

---

## 3. Edge Functions

```bash
supabase functions deploy ai-tutor
supabase functions deploy ai-generate
supabase functions deploy delete-account
supabase functions deploy link-checker --no-verify-jwt   # authenticated by CRON_SECRET
```

Secrets (*external*): copy `supabase/functions/.env.example` to `supabase/functions/.env`, fill it in, then `supabase secrets set --env-file supabase/functions/.env`.

| Secret | Required | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | For AI | Without it AI features say "not available"; everything else works |
| `MODEL_TUTOR`, `MODEL_TUTOR_DEEP`, `MODEL_GENERATE`, `MODEL_VERIFY`, `MODEL_LIGHT` | No | Model routing; see [AI.md](AI.md) |
| `ALLOWED_ORIGINS` | Recommended | Comma-separated origins |
| `CRON_SECRET` | For the link checker | 24+ random characters |

Schedule the link checker weekly: see [OPERATIONS.md](OPERATIONS.md#scheduled-jobs).

---

## 4. Plans and payments

Chapter currently has **no payment integration**, so it runs in **free-access mode** (migration 019): every account gets every paid feature, including unlimited practice, the AI tutor, generation and parent access. Monthly AI allowances still apply at the paid-plan level (900 tutor messages, 150 generations per account), which keeps AI cost bounded. The plan page says "Everything unlocked".

When store payments are connected, turn the paywall on in the SQL editor:

```sql
update public.app_settings set paywall_enabled = true, updated_at = now();
```

From then on tiers come only from `entitlements` (store purchases, or `admin_grants` for accounts you comp). Turn it on only after purchases work end to end, and tell existing users first.

For the App Store and Google Play, digital subscriptions must use Apple In-App Purchase and Google Play Billing. The `entitlements` table already accepts `source = 'play_billing'`; a future store integration should verify receipts on the server (for example in an Edge Function, or through a service such as RevenueCat) and write entitlements there. Never grant a tier from the app itself.

---

## 5. Web app

### Netlify

1. Connect the repository.
2. Environment variables per deploy context (*external*): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon key only). Give deploy previews the preview project's values. `VITE_APP_ENV` is set per context by `netlify.toml`; previews show a "Preview environment" banner.
3. Deploy. `netlify.toml` sets SPA routing, a strict CSP, HSTS and cache headers.

### Other hosts

Serve `dist/` as a single-page app and copy the headers from `netlify.toml`. With a custom Supabase domain, add it to `connect-src` and `img-src`.

---

## 6. Content

- The seed (018) publishes 394 questions and 51 procedural families, and lists 15 official links.
- Add links to publisher pages with `npm run resources:import -- --links links.json`.
- Host files only with written redistribution rights (see [CONTENT_POLICY.md](CONTENT_POLICY.md)).

---

## 7. Release

Follow [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md).
