# Production checklist

Items marked **Needs live verification** have not been exercised against real Supabase, Anthropic or hosting services from this repository. Everything else is covered by the automated suites (`npm run check`, `npm run test:e2e`).

## Before deploying

- [ ] `npm ci && npm run check` passes (typecheck, lint, content seed check, unit, database, build)
- [ ] `npx playwright install chromium && npm run test:e2e` passes (desktop and phone sizes, accessibility audit)
- [ ] Backup of the production database taken

## Database — Needs live verification

- [ ] Migrations 013–018 applied in order without errors
- [ ] As a signed-in student in the browser console: `await supabase.rpc('get_practice_pool', { p_subject: 'igcse.physics' })` returns rows
- [ ] Answer a question: a row appears in `question_attempts` with `question_id`, and `skill_mastery` updates
- [ ] `select count(*) from questions where status = 'published'` ≈ 445 (394 + 51 families)
- [ ] `select public.is_admin()` is false for a student and true for an admin
- [ ] `select paywall_enabled from app_settings` is false (free-access mode) and the plan page says "Everything unlocked"
- [ ] Student data export (Settings → Privacy) downloads and includes `skill_mastery`
- [ ] A hosted resource (if any) opens via a signed URL; a pending one does not

## Edge Functions — Needs live verification

- [ ] All four functions deployed (`ai-tutor`, `ai-generate`, `delete-account`, `link-checker`); `link-checker` with `--no-verify-jwt`
- [ ] Tutor: chat, hint (next hint), check my work (verdict badge), explain my mistake from practice, scan a photo, save as note, make flashcards
- [ ] Generate questions for a topic: some publish, the run appears in `/admin` → Overview, costs appear in AI usage for both the generate and verify models
- [ ] Generate from a PDF: questions are practised by the uploader and are not visible to another account
- [ ] Function logs are JSON lines with no tokens or student text
- [ ] Link checker run by hand returns a summary; schedule created

## Auth — Needs live verification

- [ ] Sign up → confirmation email (custom SMTP) → onboarding
- [ ] Wrong password and unknown email show the same message
- [ ] Password reset email and flow
- [ ] Token expiry (or revoke the session in the dashboard) → `/signin?reason=expired`

## Web app — Needs live verification

- [ ] Netlify production and preview contexts have separate Supabase values; preview shows the banner
- [ ] Security headers present (`curl -I https://your-domain`): CSP, HSTS, X-Frame-Options, Permissions-Policy
- [ ] PWA installs; offline: start a practice session from a subject practised before, answer, reconnect, answers sync once
- [ ] Real phone (iOS Safari and Android Chrome): tutor input stays above the keyboard; practice, plan and papers usable at 375 px

## Content

- [ ] At least one content administrator added
- [ ] Review queue triaged (12 seed questions are pending review by design)
- [ ] Official links checked (`node scripts/check-links.mjs --local` last passed on 2026-09-28)
- [ ] Privacy Policy and Terms reviewed by someone qualified; privacy contact set

## After release

- [ ] Watch `/admin` → Errors and function logs for the first days
- [ ] Review AI cost after the first week and adjust model routing if needed
