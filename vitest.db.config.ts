import { defineConfig } from 'vitest/config';

// Database tests: real migrations on PGlite. Slower than unit tests, so they
// run separately (`npm run test:db`).
export default defineConfig({
  test: {
    include: ['supabase/tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
});
