# Architecture

## Overview

```
Browser (React SPA, PWA)
  │  supabase-js (anon key + user JWT)          fetch + SSE (user JWT)
  ▼                                             ▼
Supabase PostgREST ── Postgres (RLS)     Edge Functions (Deno)
                         ▲                 │ service role, filtered by caller
                         └─────────────────┤
                                           └──► AI provider (Groq, OpenRouter or Anthropic)
```

- **Web app**: React 19, React Router 7, TanStack Query, TypeScript (strict). Every route is code-split; the Markdown/KaTeX renderer, skills map and practice engine load only on the screens that need them. The question bank is no longer shipped to the browser: questions come from the database.
- **Data access**: the client reads and writes its own rows directly through PostgREST, and row-level security decides what is allowed. Anything that needs elevated rights (AI calls, account deletion, parent overviews) runs in an Edge Function or a `security definer` RPC that checks the caller first.
- **Offline**: the last practice pool for each scope is cached on the device (14 days), so a session can start without a connection. Answers go to a per-user outbox and replay in order through `submit_attempt()`, which is idempotent on the client-generated id: nothing is lost or counted twice.

## The learning loop

```
LEARN → PRACTICE → MAKE MISTAKE → UNDERSTAND MISTAKE → PRACTISE RELATED SKILL → RETEST LATER → MEASURE MASTERY → ADAPT
```

| Step | Where |
| --- | --- |
| Skills below topics, misconceptions per skill | `skills`, `misconceptions` (013, seeded by 017) |
| Practice set adapted to mastery | `get_practice_pool()` + `src/content/engine.ts` (weak/overdue skills weighted up, difficulty band from mastery, unseen first, no same skill back to back) |
| Answer recorded and judged on the server | `submit_attempt()` (014) |
| Mistake understood | wrong option → misconception shown in feedback; "Explain my mistake" sends it to the tutor |
| Guided session on one skill | `src/content/adaptive.ts`: two probes, escalate after two unaided correct, concept card and a different easier question after a mistake, stop after three wrong |
| Retest later | spaced review (1, 3, 7, 14, 30, 60 days) in `skill_mastery`; review sessions use different questions |
| Mastery | difficulty-adjusted rating, capped by evidence ([DATABASE.md](DATABASE.md#the-learning-model)) |
| Adapt | home recommendation (`src/lib/recommend.ts`), exam plan (`src/lib/plan.ts`), tutor context (`service_student_context`) |

## Data model (main tables)

| Table | Purpose | Client access |
| --- | --- | --- |
| `profiles` | Account, onboarding, preferences; server-maintained XP and streak | Own row; column-level update grants (no XP, streak or tier) |
| `student_subjects` | Chosen subjects, exam dates, targets | Own rows |
| `question_attempts` | Every answered question (the source of truth), with question id, version, chosen option, hints, skill and misconception | Only through `submit_attempt()`; select own; immutable |
| `questions`, `skills`, `misconceptions` | Content with provenance | Read published; admins write (guarded) |
| `skill_mastery`, `student_misconceptions` | Learning model, maintained by trigger | Read own |
| `question_stats`, `question_reports`, `content_audit_log` | Quality loop | Reports: insert own; the rest admin only |
| `resources` + `past-papers` bucket | Official links and hosted material (replaces `past_papers`) | Read active; files via signed URL only when redistribution is allowed |
| `practice_sessions` | One row per practice set; counters maintained by trigger | Insert/end own; counters read-only |
| `topic_stats`, `daily_activity`, `weekly_xp` | Aggregates maintained by triggers | Read own only |
| `goals`, `notes`, `flashcard_decks`, `flashcards`, `paper_attempts` | Student tools | Own rows; flashcard scheduling only via `review_flashcard()` |
| `tutor_conversations`, `tutor_messages` | Tutor history, written only by the Edge Function | Read, rename, delete own |
| `student_memory` | Durable academic notes the tutor keeps | Read and delete own; add own notes |
| `parent_links`, `parent_invites` | Student-granted parent access | None; functions only |
| `entitlements`, `free_quota`, `ai_usage` | Plans, limits, metering | Read own or none; server writes |

The catalogue of programs, subjects and topics is defined once in `src/content/catalog.ts`. `010_catalog_seed.sql` is generated from it and a test fails if the two drift.

## Integrity rules (enforced in the database)

- **XP** is computed by `private.xp_for()` when an attempt is inserted (10/20/35 by difficulty, correct answers only). Clients cannot set XP, timestamps or the user id.
- **Streaks** advance once per day in the student's time zone after 5 answered questions or 10 flashcard reviews. Every 7th consecutive day adds a capped bonus. A missed day restarts the streak; the longest streak is kept.
- **Free quota** (100 questions a month) is consumed inside the attempt trigger, so progress cannot be recorded past the limit whatever the client does.
- **Abuse limits**: 30 answers a minute and 1,500 a day per account. AI calls are limited to 10 a minute and a monthly cap by plan.
- **Mastery** (shown to students) is computed in `src/lib/mastery.ts` from the counts above; the formula is documented there.

## Security model

Summary below; details and the attacker checklist are in [SECURITY.md](SECURITY.md).

- **Authentication**: Supabase Auth with PKCE, confirmed email, 8+ character passwords with letters and digits. Sign-in and reset messages are deliberately generic to prevent account enumeration. Redirect targets must be same-site paths.
- **Authorization**: RLS on every table (a test asserts none is missed). Every client-callable function is on an explicit allow-list (tested). Service-only functions are executable by `service_role` alone. Nothing takes a user id from the client: identity always comes from `auth.uid()` or the verified JWT.
- **Parents** never get table access. `parent_student_overview()` checks the link and returns aggregates only (no tutor messages, notes, memory or flashcards). Invite codes are single-use, expire after 48 hours, and redemption is rate-limited (10 failures an hour).
- **Uploads**: image and PDF types are decided by magic bytes, not by the declared MIME type or file name. Size limits apply before decoding. Images are stored under the owner's folder in a private bucket.
- **AI**: the API key exists only in Edge Function secrets. Student-derived text (memory, mistakes) goes inside a labelled data block that the system prompt says is never instructions, and delimiter characters are stripped. Model output is rendered with react-markdown (no raw HTML) and a URL allow-list. JSON output is constrained by schema, then validated again before use.
- **Plans**: there is no payment integration. Paid tiers exist only as server-side entitlements (admin grants); the client cannot set its own tier.
- **Transport and browser**: strict CSP (`script-src 'self'`), HSTS, `frame-ancestors 'none'`, a restrictive Permissions-Policy. The service worker caches only static assets, never API responses.

### Issues fixed from the original schema

1. `SECURITY DEFINER` functions trusted a client-supplied user id (`consume_quota`, `quota_status`, `can_use_ai`, `recompute_streak`, `effective_tier`).
2. `answer_events` monthly partitions had RLS disabled and were readable by anyone through the REST API.
3. `leaderboard` (view), `public_leaderboard` and `leaderboard_mv` bypassed RLS; the materialized view exposed user ids and subscription tiers to anonymous users.
4. Every function was executable by `anon`, including a `security definer` materialized-view refresh.
5. Admin comp grants were applied to unconfirmed emails.
6. Clients could raise their own XP by up to 5,000 per update with no limit on updates.

## AI design

See [AI.md](AI.md) for model routing, cost tracking, the student context builder and tutor modes, and [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md) for question generation and validation.

## Testing

| Suite | Scope |
| --- | --- |
| `tests/unit` (Vitest) | Maths for mastery, streaks, goals, reports, exam plan and recommendations; content integrity (seed rows, skills, official links), procedural template fuzzing (no NaN/Infinity/undefined/duplicates, single answer, curated misconception tags); practice engine and guided loop; outbox (queue, replay, drop, legacy items) and offline pool cache; Edge Function modules (upload validation, prompts and context builder, verdict parsing, model routing and cost, safe math evaluator, question pipeline, link-check policy); telemetry scrubbing; WCAG token contrast; UI (dialog focus, sign-in, practice with hints, reports, server verdicts, guided concept card) |
| `supabase/tests` (PGlite) | All migrations on real Postgres with Supabase roles; RLS isolation; column grants; server-decided answers; mastery, spaced review and misconceptions; provenance guard; admin authorisation; question analytics; resources constraints; flashcard de-duplication; private questions; parent overview privacy; data export; re-running 013–018; upgrading a database holding Phase 1 data |
| `tests/e2e` (Playwright) | Production build against a mocked backend at 375×667, 390×844, 430×932, 1366×768, 1440×900 and 1920×1080: every screen renders without console errors or horizontal overflow; empty states; onboarding; parent and admin routing; tutor streaming and save-as-note; practice through `submit_attempt`; guided practice; hints; reports; papers badges and unavailable links; plan page without purchases; axe-core WCAG 2.1 AA audit; production CSP |
