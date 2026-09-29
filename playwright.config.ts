import { defineConfig, devices } from '@playwright/test';

// Browser tests run the production build against a mocked Supabase
// (tests/e2e/mock-backend.ts), so no real backend or credentials are needed.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite build --mode e2e && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    // Full suite on one desktop and one phone size
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    // Layout checks at the other supported sizes
    ...([
      ['mobile-375', 375, 667, true], ['mobile-430', 430, 932, true],
      ['desktop-1366', 1366, 768, false], ['desktop-1920', 1920, 1080, false],
    ] as const).map(([name, width, height, mobile]) => ({
      name,
      testMatch: /viewports\.spec\.ts/,
      use: mobile
        ? { ...devices['Pixel 7'], viewport: { width, height } }
        : { ...devices['Desktop Chrome'], viewport: { width, height } },
    })),
  ],
});
