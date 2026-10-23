import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // scripts/test holds repo-level checks: the documents and scripts at the root that no package owns.
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'scripts/test/**/*.test.ts'],
    // A hang guard, not a speed check: vitest's 5 s default failed two tests on Windows CI run 39936616796 during a runner stall (backlog row "CI time").
    testTimeout: 60_000,
  },
});
