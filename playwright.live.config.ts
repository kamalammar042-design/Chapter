import { defineConfig, devices } from '@playwright/test';

// Smoke test against the LIVE Supabase project configured in .env.local.
// Creates a throwaway account, uses the app for real, then deletes the
// account through the delete-account function. Not part of `npm run check`.
//   npx playwright test --config playwright.live.config.ts
export default defineConfig({
  testDir: 'tests/live',
  timeout: 4 * 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results-live',
  use: {
    baseURL: 'http://localhost:4174',
    ...devices['Desktop Chrome'],
    viewport: { width: 1366, height: 800 },
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite build --outDir dist-live && npx vite preview --outDir dist-live --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
