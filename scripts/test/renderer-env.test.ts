/**
 * The renderer's Chromium gets no name the secrets file listed, however the gateway was loaded (B1; ADR-0100 item 6,
 * ADR-0109). On Windows, a `pnpm start` from a current directory whose drive letter is lowercase (`c:\…`) loads the
 * gateway's env module twice: scripts/serve.ts imports it by a relative path (`file:///c:/…`) and pages.ts through the
 * @byway/gateway link (`file:///C:/…`). The names `.env.agents` listed were kept per module copy, so pages.ts's copy
 * knew none of them and Chromium got every name from the file that does not look secret. The fixture loads both as
 * serve.ts does and is started from the lowercase spelling of the repository's own directory, as a person's shell can.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = path.join('scripts', 'test', 'fixtures', 'renderer-env-twice.ts');

describe('the renderer’s environment, with the gateway loaded twice', () => {
  it.runIf(process.platform === 'win32')('a start from a lowercase drive letter still gives Chromium no name from the secrets file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'byway-renderer-env-'));
    try {
      const file = path.join(dir, '.env.agents');
      // Names that do not look secret, which only the secrets-file rule leaves out.
      writeFileSync(file, 'ODD_CREDENTIAL=hunter2\nPLAIN_SETTING=x\n');
      const cwd = ROOT[0]!.toLowerCase() + ROOT.slice(1);
      expect(cwd).toMatch(/^[a-z]:\\/);
      const run = spawnSync(process.execPath, ['--import', 'tsx', FIXTURE, file], { cwd, encoding: 'utf8', timeout: 60_000 });
      expect(run.status, run.stderr).toBe(0);
      // Two copies of the gateway, as on such a start, and Chromium still gets only what the shell had.
      expect(JSON.parse(run.stdout)).toEqual({ twoCopies: true, chromiumEnv: { PATH: 'C:\\Windows' } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    // The child loads the gateway and the runner through tsx, which took 5.5 s with the whole suite running on the
    // owner's machine: more than vitest's default 5 s. The child's own limit (60 s) stops a hung one.
  }, 120_000);
});
