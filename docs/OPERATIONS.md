# Operations

Running Chapter day to day.

## Roles

- **Content administrator**: a row in `public.admin_users`. Add one in the SQL editor:
  ```sql
  insert into public.admin_users (user_id, note)
  select id, 'content team' from auth.users where email = 'someone@example.com';
  ```
  Admins see "Content admin" in the sidebar (`/admin`).

## Weekly routine

1. `/admin` → **Review queue**: approve, edit or reject generated questions that need a person.
2. `/admin` → **Reports**: fix or archive reported questions, then mark reports resolved.
3. `/admin` → **Quality**: look at flagged questions (too easy/hard, suspicious distractor, often skipped).
4. `/admin` → **Sources**: links marked unavailable; update or archive them. Approve pending resources only after checking the licence.
5. `/admin` → **AI usage**: cost by model and task; failures.
6. `/admin` → **Errors**: client errors from the last days.

## Paywall switch

`public.app_settings.paywall_enabled` (migration 019). Off: every feature is free for every account. On: tiers come from entitlements only. Change it in the SQL editor; clients cannot read or write it.

```sql
select paywall_enabled from public.app_settings;
update public.app_settings set paywall_enabled = true, updated_at = now();   -- when payments are live
```

## Scheduled jobs

**Link checker** (weekly). Deploy `link-checker` with `--no-verify-jwt` and set `CRON_SECRET` (24+ random characters). Schedule it with Supabase cron (pg_cron + pg_net) in the SQL editor:

```sql
select cron.schedule('link-check-weekly', '0 4 * * 1', $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/link-checker',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
  );
$$);
```

Or run it by hand: `SUPABASE_URL=... CRON_SECRET=... npm run links:check`.

**Review reminders** (hourly). Deploy `push-reminders` with `--no-verify-jwt`, set `ONESIGNAL_APP_ID` and `ONESIGNAL_API_KEY`, and schedule it the same way:

```sql
select cron.schedule('push-reminders-hourly', '5 * * * *', $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/push-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
$$);
```

Each run sends at most one reminder per student per local day (`service_due_reminders`, migration 022), uses a per-student-per-day idempotency key so a retried run cannot send twice, and forgets subscriptions OneSignal reports as gone. Check `select * from cron.job_run_details order by start_time desc limit 5` and the `reminders_done` log line (`due`, `sent`, `skipped`, `failed`, `forgotten`). Without a deployed project, `node scripts/check-links.mjs --local` checks the seed list directly.

## Observability

- **Edge Function logs** (Supabase → Edge Functions → Logs): one JSON line per event, e.g. `{"level":"error","event":"model_error","fn":"ai-tutor","task":"tutor_chat","code":"busy"}`. Useful events: `reminders_done`, `unhandled`, `model_error`, `verify_failed`, `questions_generated`, `link_check_done`.
- **Client errors**: `app_events` (admin Errors tab), scrubbed of personal data.
- **AI cost**: `ai_usage` (admin AI usage tab).
- **Database**: Supabase → Reports for slow queries.

Suggested alerts (configure in your log tool): any `unhandled` event; `model_error` rate above 5% in an hour; more than 10 client errors from one route in an hour.

## Incidents

| Symptom | Check |
| --- | --- |
| Tutor says "not available" | A provider key (`GROQ_API_KEY`, `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY`) set, and `AI_PROVIDER` naming one whose key is set? Function logs for `provider_unavailable` or `model_error` with `misconfigured` |
| Generation returns nothing | `content_generation_runs.report` for the failed checks; `verify_failed` in logs |
| Students cannot answer | `submit_attempt` errors in the browser network tab; `rate_limited` / `free_limit_reached` are expected limits |
| A student should have a paid tier | While the paywall is off everyone already has every feature. Once it is on: `insert into public.admin_grants (email, tier) values ('student@example.com', 'pro')` |
| A question is wrong | Archive it in `/admin` (students stop seeing it immediately), then fix and republish |

## Content takedown

Archive the question or resource, record the request in the review note, reply to the requester. See [CONTENT_POLICY.md](CONTENT_POLICY.md#takedown).

## Data requests

Students can export their data (Settings → Privacy → export) and delete their account (`delete-account` function). Deleting cascades to attempts, mastery, notes, flashcards, tutor history and uploads.
