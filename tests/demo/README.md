# Recording the demo video

This walks through the **live** app with a **real** account and records it. Nothing is mocked.

1. Create an account on the live site, finish onboarding (IGCSE, Physics, add an exam date) and answer a few questions so the progress pages have something real to show.
2. Run (PowerShell):

   ```powershell
   $env:DEMO_URL = "https://your-chapter-site.vercel.app"
   $env:DEMO_EMAIL = "you@example.com"
   $env:DEMO_PASSWORD = "your-password"
   npx playwright test --config playwright.demo.config.ts
   ```

3. The video is saved under `demo-video/` as a `.webm` file. Trim it to under 2 minutes, add a voice-over or captions using the script in `docs/SUBMISSION.md`, and upload it.

A screen recording from your phone works just as well. The automated recording is only a convenience.
