# Content pipeline

How questions get into Chapter, how they are checked, and how the quality loop keeps them honest.

## 1. The model: skills, misconceptions, questions

```
subject (igcse.physics) → topic (electricity) → skill (igcse.physics/electricity/resistance)
                                                   └─ misconceptions (multiplies-v-and-r, inverts-ohms-law …)
questions → one skill, difficulty 1–5, provenance, options (each wrong option may name a misconception)
```

- Skills: `src/content/skills.ts` (name, objective, classification keywords). Seeded by `017_skills_seed.sql`.
- Misconceptions: `src/content/misconceptions.ts`, curated. Seeded by `017`.
- Difficulty scale: 1 Foundation, 2 Developing, 3 Standard, 4 Challenging, 5 Advanced.

Edit the TypeScript sources, then run `npm run content:build` to regenerate `017`/`018`. `npm run content:check` (part of `npm run check`) fails if they drift.

## 2. Sources of questions

| Source | Where | Notes |
| --- | --- | --- |
| Seed bank | `src/content/bank/*.js` → `018_content_seed.sql` | Owned. Classified to skills; unclassified rows are `pending_review` |
| Procedural families | `src/content/templates.ts` | 51 families, levels 1–5. One `questions` row per family (`question_type = 'procedural'`); each practice question is a fresh instance |
| AI generation | `ai-generate` Edge Function | Goes through the pipeline below |
| Admin editor | `/admin` | Drafts until approved |

### Procedural families

Each family varies wording and question style as well as numbers, computes the answer, and **re-checks it by an independent route** (`check`), for example Cramer's rule for simultaneous equations or `sin θ = h / space diagonal` for the cuboid angle. `instantiate()` discards any instance that fails the check, contains `NaN`/`Infinity`/`undefined`/`null`, has fewer than three distinct distractors, or has a distractor equal to the answer. Distractors are real mistakes tagged with curated misconception keys. A fuzz test instantiates every family hundreds of times.

Because the instance is generated on the device, the client reports its own verdict for procedural questions (`p_instance.correct`). This is a documented trade-off (see SECURITY.md): the answer key of an MCQ is also on the device during practice, so server verification is about recording integrity (no answers to unknown or unpublished questions, idempotency, rate limits), not about hiding answers.

## 3. Generation pipeline

```
generate → schema → answer validation → difficulty → curriculum → duplicate →
math consistency → explanation consistency → safety → store → optional human review → publish
```

Implemented in `supabase/functions/_shared/pipeline.ts` (pure, unit-tested) and orchestrated by `supabase/functions/ai-generate`.

1. **Generate** (`MODEL_GENERATE`): the prompt lists the topic's skills with objectives and curated misconceptions, the difficulty scale, and rules (4 options, one answer, believable distractors tagged with misconception keys, varied styles, no "of the above", arithmetic `working` for numeric answers). Output is constrained by a JSON schema.
2. **Schema** (hard): stem and explanation lengths, exactly 4 distinct non-empty options, valid index and difficulty, no invalid values in any text, the correct option not tagged as a misconception.
3. **Independent solve** (`MODEL_VERIFY`): a second model receives the stems and options **without the answer key** and reports every option it judges correct, its difficulty estimate, whether the question is in the syllabus, whether it is safe, and its confidence.
   - answer (hard): the verifier's only correct option must equal the key
   - single answer (hard): at most one option judged correct
   - difficulty (soft): within one level of the label
   - curriculum (hard), safety (hard), confidence (soft: low confidence → review)
   - no verification (e.g. the verifier call failed) → soft: nothing publishes
4. **Duplicate** (hard): word-pair Jaccard similarity ≥ 0.8 against existing stems in the topic and earlier drafts in the batch. The content hash also stops exact repeats at the database.
5. **Math** (hard/soft): if the answer is numeric, the `working` must evaluate (safe evaluator in `_shared/math.ts`: no eval, no variables) to the option's value within its written precision; no other option may share the value. A numeric answer without working → soft.
6. **Explanation** (soft/hard): the explanation must mention the answer (value or key words); naming a different option as the answer is a hard failure.
7. **Safety** (hard): a blocklist in addition to the verifier's judgement.

**Decision**: any hard failure → `rejected` (not stored). Any soft failure → stored as `pending_review` with the report and a review note. All checks pass → `published` with `validation.passed = true`.

Every run is recorded in `content_generation_runs` (requested, published, pending, rejected, and a per-item report). A request that publishes nothing does not use up the student's monthly generation allowance.

Questions generated from a student's uploaded PDF are stored with `source_type = 'user_uploaded'`, `copyright_status = 'user_provided'` and `owner_id` = that student: they are served only to that student and never enter the shared bank.

## 4. Human review

`/admin` → Review queue lists `pending_review` questions with their validation checks, review note, answer distribution and provenance. An administrator can edit, approve and publish (the review is recorded), reject or archive. The editor mirrors the publish guard, so problems show before saving.

## 5. Quality loop

Every answer updates `question_stats` (attempts, correct, time, hints, per-option counts); exits without answering record a skip. `admin_question_health()` flags:

| Flag | Rule (with enough attempts) |
| --- | --- |
| `too_easy` | ≥ 95% correct at difficulty ≥ 3 |
| `too_hard` | ≤ 20% correct |
| `difficulty_mismatch` | accuracy ≥ 25 points from the expected accuracy for its level |
| `suspicious_distractor` | a wrong option chosen more often than the answer (possible wrong key) |
| `slow` | average time over 150 s |
| `high_skip` | ≥ 25% of views skipped |
| `reported` | open student reports |
| `needs_review` | pending review |

Review flagged questions in `/admin` → Quality. Typical actions: fix the key, reword the stem, relabel the difficulty, or archive.

## 6. Official links

`src/content/official-resources.ts` lists publisher pages (verified 2026-09-28). The `link-checker` function checks each once a week and marks a link unavailable after two consecutive 404/410 results (restored automatically when it works). Pages that block automated checks (401/403/429) are left alone.
