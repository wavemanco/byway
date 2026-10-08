/**
 * End-to-end tests (spec §7 Phase 3): the whole product in demo mode, through the browser. `pnpm e2e` (scripts/e2e.ts)
 * starts `pnpm demo` on a temp data directory and free ports, waits for it, runs this suite against it
 * (BYWAY_E2E_BASE_URL) and stops it cleanly. Run directly (`playwright test`), the suite starts its own demo through
 * `webServer` on ports 3210 and 7290, so a byway you are running on 3000 and 7233 is never touched; its data directory
 * is then left in the system temp folder (`pnpm e2e` removes its own).
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { E2E_KEYS } from './e2e/keys.ts';

const external = process.env.BYWAY_E2E_BASE_URL;
const port = Number(process.env.BYWAY_E2E_PORT ?? 3210);
/** The data directory of the suite's own server: made once in the main process, and Playwright's workers inherit it. */
const ownDataDir = (): string => (process.env.BYWAY_E2E_DATA_DIR ??= mkdtempSync(path.join(tmpdir(), 'byway-e2e-')));

export default defineConfig({
  testDir: './e2e',
  // One demo server and one workspace: runs go one after another.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 6 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: external ?? `http://127.0.0.1:${port}`,
    // A control that never appears fails the test in a minute, not at the run's six-minute limit.
    actionTimeout: 60_000,
    navigationTimeout: 90_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(external
    ? {}
    : {
        webServer: {
          command: 'node --import tsx scripts/dev.ts --demo',
          cwd: path.resolve(import.meta.dirname, '..', '..'),
          url: `http://127.0.0.1:${port}/`,
          timeout: 240_000,
          reuseExistingServer: false,
          stdout: 'pipe',
          env: {
            ...E2E_KEYS,
            BYWAY_DATA_DIR: ownDataDir(),
            PORT: String(port),
            BYWAY_TEMPORAL_PORT: process.env.BYWAY_E2E_TEMPORAL_PORT ?? '7290',
          },
        },
      }),
});
