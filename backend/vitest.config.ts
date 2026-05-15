import { defineConfig } from 'vitest/config';

/**
 * Test runner configuration.
 *
 * We stick to the Node environment (no jsdom) — this is an Express API and
 * none of the suites touch the DOM. Suites mock the TypeORM repository so
 * we don't pull in a live Postgres for the unit-style tests; integration
 * tests that exercise the full Express pipeline use a stub DataSource that
 * the auth service consults via dependency injection.
 *
 * `setupFiles` populates the env vars our `env.ts` insists on so importing
 * any module under src/ doesn't blow up with "missing required env var".
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
