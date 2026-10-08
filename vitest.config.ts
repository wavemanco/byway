import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // scripts/test holds repo-level checks: the documents and scripts at the root that no package owns.
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'scripts/test/**/*.test.ts'],
  },
});
