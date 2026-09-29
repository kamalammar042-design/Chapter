# Content and provenance policy

Chapter's value comes from knowing what a student does not understand, teaching it, generating the right practice and checking whether it stuck. It does not come from copying other people's question banks. This policy sets out where content may come from and how that is enforced.

**This document is an engineering policy, not legal advice.** Have licences and the Terms reviewed by someone qualified before relying on them.

## Content sources

| Source type | What it means | May be hosted by Chapter? | Shown to students |
| --- | --- | --- | --- |
| `owned` | Written by or for Chapter (including the original app's bank, owned by Whitespace Studio) | Yes | After classification to a skill |
| `licensed` | Used under a written licence that permits redistribution | Yes, if the licence allows it, with `source_url` and licence recorded | After review |
| `open_license` | Openly licensed (for example CC BY) with a compatible licence | Yes, with attribution, `source_url` and licence | After review |
| `generated` | Written by Chapter's AI pipeline | Yes | Only after passing validation, or after an administrator reviews it |
| `user_uploaded` | Derived from a file a student uploaded | Never shared | Only to that student (`owner_id`) |
| `external_link` / `official_reference` | A link to someone else's page | No: link only | Yes |

## What Chapter does not do

- It does not copy, mirror, redistribute or bulk-import copyrighted questions, mark schemes, examiner reports, model answers or notes because a website lets students view or download them for free. Free to download is not permission to redistribute.
- It does not assume Cambridge International, Physics & Maths Tutor, the College Board or any other publisher permits redistribution. Cambridge restricts electronic publication of its past papers; Chapter links to Cambridge's own pages.
- It does not scrape, and it does not bypass robots.txt, logins, paywalls, rate limits, CAPTCHAs or other protections. The only automated requests Chapter makes to third-party sites are the weekly link check (one request per listed link, identified by user agent, paced, and a "blocked" answer is left alone rather than retried).
- It does not publish anything whose provenance is unknown.

## Enforcement in the database

These rules are checked by the database (`public.guard_question()`, migration 013), not just by the app:

- A question cannot be published with copyright status `restricted` or `unknown`.
- Licensed or openly licensed content cannot be published without a `source_url`.
- Generated content cannot be published without `validation.passed = true`, unless an administrator publishes it; the administrator's review is then recorded in `validation.human_review`.
- A multiple-choice question cannot be published without a skill.
- Material from a student upload can only be published privately to that student.
- A resource can only be hosted or downloadable if `redistribution_allowed` is true, its source type is owned, licensed, open or generated, and a licence is recorded. Otherwise it must be an external link. Storage only serves files for active rows that meet this rule.
- Every question change is written to `content_audit_log` with the actor, and content edits bump the question's version (attempts record the version they answered).

## Provenance fields

Every question row carries: `id`, `subject_key` (curriculum and qualification are derived from the subject), `topic_key`, `skill_id` (subtopic), `difficulty` (1–5), `question_type`, `source_type`, `source_name`, `source_url`, `license`, `copyright_status`, `created_by`, `created_at`, `reviewed_at`, `reviewed_by`, `version`, `syllabus_version`, `tags`, plus `validation` (the pipeline report) and `generator` (model, prompt version, run id).

## The seed bank

`scripts/generate-content-sql.ts` builds `018_content_seed.sql` from the bundled sources with explicit provenance:

- `core.js`, `extra.js`: questions from the original Chapter app, owned by Whitespace Studio.
- `igcse.js`, `sat.js`: questions written for Chapter in 2026.
- Procedural families (`src/content/templates.ts`): Chapter's own generators.

Questions the classifier cannot place on a skill are seeded as `pending_review`, not published. A-level-only material is excluded from IGCSE.

## Adding content

- **Your own questions**: the admin screen (`/admin` → New question). They start as drafts.
- **Licensed or open material**: record the licence and source URL in the admin screen; do not import it until the licence is confirmed in writing.
- **Past papers**: add links with `node scripts/import-past-papers.mjs --links links.json`. Hosting files requires `--source-type`, `--licence` and `--i-have-redistribution-rights`, and every row starts `pending` until an administrator approves it.
- **Questions students report** appear in the admin Reports tab and in the quality view with a "reported" flag.

## Takedown

If a rights holder asks for content to be removed, archive the question or resource in the admin screen (it disappears from students immediately), note the request in the review note, and reply using the privacy contact in the Privacy Policy.
