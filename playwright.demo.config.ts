import { defineConfig, devices } from '@playwright/test';

// Records demo videos against a live deployment. Not part of the test suite.
// showcase.spec.ts creates and deletes its own account; record-demo.spec.ts
// uses yours. See tests/demo/README.md.
export default defineConfig({
  testDir: 'tests/demo',
  timeout: 6 * 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: 'demo-video/raw',
  use: {
    baseURL: process.env.DEMO_URL,
    ...devices['Pixel 7'],
    viewport: { width: 412, height: 860 },
    colorScheme: 'dark',
    // Chromium records at CSS pixels; a larger size only pads the frame
    video: { mode: 'on', size: { width: 412, height: 860 } },
  },
});
