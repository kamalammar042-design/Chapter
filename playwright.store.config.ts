import { defineConfig } from '@playwright/test';

// Captures the Devpost / store screenshots (1179 × 2556, no device frame)
// from the LIVE site with a throwaway account that practises for real and
// is deleted afterwards. Not part of the test suite.
//   $env:LIVE_URL = "https://chapter-sepia-omega.vercel.app"
//   npx playwright test --config playwright.store.config.ts
export default defineConfig({
  testDir: 'tests/store',
  timeout: 8 * 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results-store',
  use: {
    baseURL: process.env.LIVE_URL,
    browserName: 'chromium',
    // 393 × 852 CSS pixels at 3× = 1179 × 2556, the iPhone 6.1" size Devpost asks for
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
  },
});
