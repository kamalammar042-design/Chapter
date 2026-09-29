import { defineConfig, devices } from '@playwright/test';

// Records a demo video against a live deployment with a real account.
// Not part of the test suite. See tests/demo/README.md.
export default defineConfig({
  testDir: 'tests/demo',
  timeout: 5 * 60_000,
  retries: 0,
  reporter: [['list']],
  outputDir: 'demo-video',
  use: {
    baseURL: process.env.DEMO_URL,
    ...devices['Pixel 7'],
    viewport: { width: 412, height: 860 },
    video: { mode: 'on', size: { width: 412, height: 860 } },
  },
});
