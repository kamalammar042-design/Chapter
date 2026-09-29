# Shipaton 2026 submission (Next Gen / student category)

Everything needed for the Devpost form, ready to paste. Deadline: **30 September 2026, 11:45 pm PDT**.

## Checklist

- [ ] Devpost account uses your **student email** (Next Gen eligibility is checked against academic emails)
- [ ] Under 18? A parent or guardian completes the **consent form** before the deadline
- [x] **Public GitHub repository** (https://github.com/kamalammar042-design/Chapter), with the MIT licence showing in the repo's About panel (GitHub detects `LICENSE` automatically)
- [ ] **Demo video under 2 minutes** (script below), uploaded to YouTube or Vimeo as public or unlisted
- [x] **Try-it link**: https://chapter-sepia-omega.vercel.app (Vercel, connected to the live Supabase project)
- [ ] Text description (below)
- [ ] Payments: the official rules say entries must use the RevenueCat SDK for at least one in-app or web purchase, and one judging criterion is RevenueCat monetization. Chapter is deliberately free with no purchase flow, so it may not meet that requirement. Read the rules at https://revenuecat-shipaton-2026.devpost.com/rules before submitting.

## Title

Chapter

## Tagline

Chapter knows what you don't understand yet, and teaches it until it sticks.

## Description

### Inspiration

Revision apps for IGCSE and SAT mostly count right and wrong answers. But a wrong answer carries information: *which* wrong option you chose usually reveals *why* you got it wrong. Pick 48 A when a 12 V battery drives current through 4 Ω, and you multiplied instead of divided. I wanted an app that notices that, teaches the idea behind it, and checks a few days later that the fix stuck.

### What it does

- **Skill-level mastery.** Every topic is broken into skills. Mastery is a difficulty-weighted rating computed on the server, capped by how much evidence there is, so a few lucky answers never show as mastered.
- **Misconception detection.** Wrong options are linked to curated misconceptions. Chapter names the mistake in the feedback, tracks it, and marks it resolved once you avoid the same trap twice.
- **Guided practice.** Two probe questions find your level; two unaided correct answers step you up; a mistake brings a concept card and a different, easier question; three wrong in a row stops and points you to an explanation instead of piling on.
- **Spaced review.** Skills come back after 1, 3, 7, 14, 30 and 60 days, as fresh questions.
- **An AI tutor that teaches.** Three hint levels that never reveal the answer, "check my work" with a clear verdict (correct, partly correct, incorrect, unclear), explain-my-mistake starting from the detected misconception, study plans and photo scanning. Replies can be saved as notes or turned into flashcards.
- **An exam plan that adapts.** Built from exam dates and weak skills and rebuilt every day, so a missed day never creates a backlog.
- **Honest content.** Every question records its source and licence. AI-generated questions are solved independently by a second model that never sees the answer key, and only published if every check passes. Past papers link to Cambridge and the College Board rather than being copied.
- **Parents.** A student can share progress with a parent, who sees skills and activity but never tutor chats, notes or flashcards.
- **Free**, with fair-use limits on the AI features.

### How I built it

- React 19, TypeScript and Vite, installable as a PWA; works on phones from 375 px up to wide desktops.
- Supabase: Postgres with row-level security on every table, Auth and Edge Functions. Every answer goes through a server function that judges it against the stored key and updates mastery, the review schedule and misconceptions in one transaction, so progress cannot be faked from the client.
- Anthropic Claude through a small provider layer with per-task model routing (a faster model for everyday tutoring, a stronger one for checking work and verifying generated questions) and per-request cost tracking.
- 51 procedural question families that re-check their own answers by an independent method, plus a seed bank of about 400 questions classified to skills.
- Tests: about 150 unit tests, 90 database tests that run the real migrations on Postgres (PGlite), and 160 browser tests at six screen sizes, including an automated accessibility audit.

### Challenges

- Making mastery trustworthy: plain accuracy rewards easy questions, so I used a difficulty-adjusted rating that grows cautiously with evidence.
- Making AI-generated questions safe to show students. The pipeline checks the schema, evaluates the arithmetic with a safe parser, compares explanations with answers, removes near-duplicates and has a second model solve each question blind.
- Being careful about copyright: exam boards restrict redistribution of past papers, so Chapter links to official pages and records the provenance of every question.

### What I'm proud of

The loop actually closes: mistake → named misconception → targeted explanation → a different question → review days later → mastery that reflects it.

### What's next

Native iOS and Android builds, more questions at the Advanced level, and teacher dashboards.

### Built with

react, typescript, vite, supabase, postgresql, deno, anthropic-claude, playwright, vitest

## Demo video script (about 1 minute 50 seconds)

Record the live app on a phone-sized window or a phone. Speak over it or add captions.

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:10 | Landing page | "Revision apps count your mistakes. Chapter works out why you made them." |
| 0:10–0:25 | Sign up, pick IGCSE, Physics and Chemistry, set an exam date | "Two-minute setup: subjects and exam dates." |
| 0:25–0:55 | Subject page → Electricity → Guided on "Resistance & Ohm's law". Answer one right, then pick the tempting wrong answer | "Guided practice finds my level. I pick 48 amps, and Chapter names the misconception: I multiplied instead of divided." |
| 0:55–1:05 | Concept card, then the next easier question | "It explains the idea and gives me a different, easier question on the same skill." |
| 1:05–1:20 | Session summary: mastery change, pattern in mistakes, next step | "Mastery is weighted by difficulty and updated on the server. The skill comes back for review in a day, then three, then seven." |
| 1:20–1:35 | Tutor: ask for a hint, then "Next hint"; "Check my work" verdict badge | "The tutor gives hints in levels, never the answer, and checks my working with a clear verdict." |
| 1:35–1:45 | Exam plan and Progress | "An exam plan rebuilt every day, and a list of the skills and mistakes still to fix." |
| 1:45–1:50 | Landing tagline | "Chapter: it knows what you don't understand yet, and teaches it until it sticks." |

To record automatically against the live site, see `tests/demo/README.md`.
