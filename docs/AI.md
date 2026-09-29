# AI in Chapter

## Where AI is used

| Feature | Function | Task (model group) |
| --- | --- | --- |
| Tutor chat, explain, hint (3 levels), simplify, practice questions | `ai-tutor` | `MODEL_TUTOR` |
| Check my work (verdict), explain my mistake, study plan, scanned question | `ai-tutor` | `MODEL_TUTOR_DEEP` |
| Tutor memory notes | `ai-tutor` (after the reply) | `MODEL_LIGHT` |
| Question generation | `ai-generate` | `MODEL_GENERATE` |
| Independent solving of generated questions | `ai-generate` | `MODEL_VERIFY` |
| Flashcards from notes, tutor replies or a topic | `ai-generate` | `MODEL_LIGHT` |

Nothing AI-written is presented as human-written: generated questions carry "AI-written, checked" in practice, and the tutor footer says it can make mistakes.

## Model routing and cost control

`supabase/functions/_shared/ai/models.ts` maps each task to a model group. Defaults:

| Group | Default | Why |
| --- | --- | --- |
| `MODEL_TUTOR` | `claude-sonnet-5` | Fast, strong everyday tutoring at a lower price |
| `MODEL_TUTOR_DEEP` | `claude-opus-5` | Careful reasoning where a wrong verdict would mislead |
| `MODEL_GENERATE` | `claude-sonnet-5` | Good writing at volume |
| `MODEL_VERIFY` | `claude-opus-5` (effort low) | The independent check should be the strongest model |
| `MODEL_LIGHT` | `claude-haiku-4-5` | Small structured jobs |

Override any group with an Edge Function secret (`MODEL_TUTOR=...`), and its effort with `<GROUP>_EFFORT` (`low`/`medium`/`high`). Invalid model names fall back to the default. Adaptive thinking and effort are only sent to models that support them (not Haiku 4.5); server-side refusal fallback only to Opus 5 / Fable 5 families. `TUTOR_MODEL`/`TUTOR_EFFORT` from earlier versions still work for the everyday tutor.

Other cost controls:

- Prompt caching on the stable tutor system prompt.
- A compact, capped student profile (≤ 2,800 characters) instead of the full history.
- Hint replies are capped at 4,000 output tokens.
- Monthly allowances per plan (`public.ai_monthly_cap`) and a 10-calls-per-minute limit. In free-access mode (no payments connected) every account has the paid-plan allowance: up to 900 tutor messages and 150 generations a month. Watch `/admin` → AI usage and lower the caps in `ai_monthly_cap()` if cost is too high. Internal calls (verification, memory) do not count against the student.
- A generation request that publishes nothing does not use up an allowance.

## Usage tracking

Every request writes a row to `ai_usage`: user, kind, task, model, input/output/cache-read tokens, duration, estimated cost, success and error code. Prompts and replies are **not** stored there. `/admin` → AI usage shows totals, failures, cost by model, by task and by day (`admin_ai_usage()`). Costs are estimates from list prices in `models.ts`; the Anthropic invoice is authoritative. Update `PRICES` when prices change.

## Student context builder

`service_student_context(user, subject, topic)` (migration 015) returns only what matters for the current request: profile and preferences; subjects (with the focused one and those with exams); the 8 weakest skills in scope with difficulty-adjusted mastery and wrong streaks; up to 5 unresolved misconceptions; the 4 latest mistakes in the subject/topic; memory notes; the last two past-paper scores. `buildStudentProfile()` (`_shared/prompts.ts`) turns that into a compact block, ordered by usefulness and capped.

## Tutor modes

| Mode | Behaviour |
| --- | --- |
| Explain | Core idea, worked example, common exam mistake, one check question |
| Hint | Never the final answer. Level 1 names the principle, level 2 shows the first step, level 3 goes as far as the last step. "Next hint" in the UI moves up a level |
| Check my work | Reply must start with a verdict line (Correct / Partially correct / Incorrect / Unclear), shown as a badge; then the exact failing step |
| Simplify | Plain-language re-explanation with an analogy, linked back to exam terms |
| Explain my mistake | Why the answer is right and the chosen one tempting, starting from the misconception Chapter detected; flags recurring patterns |
| Study plan | From exam dates and weak skills |
| Practice questions | Three original questions aimed at weak skills, answers at the end |
| Scan | Reads a photo; says plainly if it is unreadable; guides rather than answering outright |

Replies can be saved as notes or turned into flashcards (duplicates skipped).

## Safety

- The API key exists only in Edge Function secrets.
- Student-derived text (memory, mistakes, names) is placed inside a labelled data block that the system prompt says is never instructions; delimiter characters are stripped.
- Uploaded documents are described as study material, not instructions.
- Output is rendered with react-markdown (no raw HTML).
- JSON output is schema-constrained and validated again before use.
- The system prompt covers academic honesty and wellbeing (encouraging a trusted adult or emergency services where there is risk).

## Providers

`_shared/ai/provider.ts` is the provider interface; `anthropic.ts` is the implementation (official SDK). Each call carries its route, so switching or adding a provider means adding one module.
