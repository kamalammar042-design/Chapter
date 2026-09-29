# Database

Postgres on Supabase. All schema lives in `supabase/migrations`, applied in order. `npm run test:db` runs every migration on real Postgres (PGlite) with Supabase's roles, auth and storage emulated.

## Migrations

| File | Contents |
| --- | --- |
| 001–007 | Original schema (profiles, attempts, quota, entitlements, admin grants) |
| 008 | Security hardening: server-derived XP and streaks, function allow-list, leaderboard privacy |
| 009 | Study platform: subjects, sessions, attempts, aggregates, goals, notes, flashcards, papers |
| 010 | Catalogue seed (generated from `src/content/catalog.ts`) |
| 011 | AI tutor: conversations, messages, memory, allowances |
| 012 | Parents and plan summary |
| 013 | Content system: skills, misconceptions, questions with provenance and publish guard, question stats and reports, audit log, resources (replaces `past_papers`), admin role |
| 014 | Learning engine: `submit_attempt()`, skill mastery, spaced review, misconceptions, practice pool |
| 015 | AI operations and observability: usage detail, generation runs, app events, focused tutor context, admin analytics, parent overview with skills |
| 016 | Study tools: note topics, flashcard metadata and de-duplication, study-time preferences, data export |
| 017 | Skills and misconceptions seed (generated) |
| 018 | Content seed: questions, procedural families, official links (generated) |
| 019 | Free-access switch: `app_settings.paywall_enabled` (off by default); while off, `effective_tier()` gives everyone the highest tier |

## Applying

**New project**: `supabase db push`, or run 001–018 in order in the SQL editor.

**Existing project with 001–012 applied**: run 013–018 in order (or `supabase db push` after `supabase migration repair --status applied 001 … 012`). The upgrade is tested against a database holding Phase 1 data (`migrations.test.ts`): past papers move into `resources` with the same ids (hosted files become `pending` until an admin confirms the licence), paper attempts keep their links, and existing attempts, flashcards, notes and profiles are untouched.

**Re-running**: 013–018 are idempotent (`if not exists`, `drop … if exists`, `on conflict do nothing`). A test applies them twice and checks nothing is duplicated.

**Before production**: take a backup (Supabase → Database → Backups, or `pg_dump`) immediately before applying.

## Key tables (013–016)

| Table | Purpose |
| --- | --- |
| `skills`, `misconceptions` | Syllabus map below topics; curated wrong ideas per skill |
| `questions` | Every question served, with provenance, status, validation report, version and optional `owner_id` for private questions |
| `question_stats` | Attempts, correct, time, hints, skips and per-option counts |
| `question_reports` | Student reports |
| `content_audit_log` | Who changed which question, when |
| `resources` | Official-source links and hosted material, with licence, access mode and link-check status |
| `skill_mastery` | Per student and skill: rating, mastery, streaks, spaced-review schedule |
| `student_misconceptions` | Evidence and resolution per student and misconception |
| `content_generation_runs`, `app_events` | Operations |
| `admin_users` | Content administrators (insert rows with the SQL editor) |

## The learning model

- **Mastery**: an explainable rating per skill. For a question of difficulty d, b = (d − 3) × 0.8; the expected chance of success is p = 1 / (1 + e^(b − θ)); after an answer θ += k × (outcome − p) with outcome 1 (correct), 0.6 (correct with a hint) or 0 (wrong), and k shrinking from 0.6 towards 0.15 as evidence grows. Mastery % = 100 × sigmoid(θ) × min(1, attempts / 8), so a few lucky answers cannot show high mastery.
- **Spaced review**: a correct unaided answer moves the skill along 1, 3, 7, 14, 30, 60 days (at most one step per day); a hinted answer brings it back tomorrow; a wrong answer resets it to 20 hours. Review sessions serve different questions on the due skills.
- **Misconceptions**: choosing a wrong option tagged with a misconception adds evidence; answering a question that contains that trap correctly twice resolves it.

## Rollback

Migrations are forward-only; there is no automatic down migration. To roll back 013–018:

1. **Preferred**: restore the backup taken before applying (point-in-time recovery on paid plans).
2. **Manual**, if a restore is not possible. The web app from before this release must be redeployed at the same time, because it inserts attempts directly and reads `past_papers`:
   ```sql
   -- restore direct attempt inserts for the old client
   grant insert (client_id, session_id, subject_key, topic_key, question_ref, question_text, source, difficulty, correct, time_ms, mode)
     on public.question_attempts to authenticated;
   -- remove the learning trigger (keeps data)
   drop trigger if exists trg_attempt_learning on public.question_attempts;
   ```
   Recreating `past_papers` requires the definition from 009 and copying rows back from `resources where access <> 'external' or source_type = 'external_link'`. The new tables (`questions`, `skill_mastery`, …) can be left in place; the old client ignores them. Dropping them loses mastery history, so do not drop unless required.
3. Edge Functions: redeploy the previous versions (`supabase functions deploy` from the previous release). The previous `ai-tutor` calls the one-argument `service_student_context`, which 015 replaces; if you must run the old function against the new schema, recreate a one-argument wrapper that calls the three-argument version with nulls.

## Needs live verification

Everything above runs in PGlite. Not yet verified against a live Supabase project: the storage policy for hosted resources (PGlite has a minimal storage shim), PostgREST embedding of `misconceptions` in the client's `student_misconceptions` query, and performance of `admin_question_health()` on large tables (add indexes if it is slow).
