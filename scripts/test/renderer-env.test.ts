/**
 * The renderer's Chromium gets no name the secrets file listed, however the gateway was loaded (B1; ADR-0100 item 6,
 * ADR-0109). On Windows, a `pnpm start` from a current directory whose drive letter is lowercase (`c:\…`) loads the
 * gateway's env module twice: scripts/serve.ts imports it by a relative path (`file:///c:/…`) and pages.ts through the
 * @byway/gateway link (`file:///C:/…`). The names `.env.agents` listed were kept per module copy, so pages.ts's copy
 * knew none of them and Chromium got every name from the file that does not look secret. The fixture loads the gateway
 * a second time under the other spelling of the drive letter, as such a start does, and loads the secrets file with
 * that copy, as serve.ts does. It makes the copy itself, so the test does not depend on how a machine writes its paths.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it, onTestFinished } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = path.join('scripts', 'test', 'fixtures', 'renderer-env-twice.ts');

describe('the renderer’s environment, with the gateway loaded twice', () => {
  it.runIf(process.platform === 'win32')('the gateway loaded twice, as from a lowercase drive letter, still gives Chromium no name from the secrets file', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'byway-renderer-env-'));
    try {
      const file = path.join(dir, '.env.agents');
      // Names that do not look secret, which only the secrets-file rule leaves out.
      writeFileSync(file, 'ODD_CREDENTIAL=hunter2\nPLAIN_SETTING=x\n');
      // A failed exit rejects, with the child's stderr in its message; a child still running when the test ends is killed.
      const stop = new AbortController();
      onTestFinished(() => stop.abort());
      const { stdout } = await promisify(execFile)(process.execPath, ['--import', 'tsx', FIXTURE, file], { cwd: ROOT, encoding: 'utf8', signal: stop.signal });
      // Two copies of the gateway, as on such a start, and Chromium still gets only what the shell had.
      expect(JSON.parse(stdout)).toEqual({ twoCopies: true, chromiumEnv: { PATH: 'C:\\Windows' } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    // The child loads the gateway and the runner through tsx, which took 5.5 s with the whole suite running on the
    // owner's machine. It is waited for as long as it takes, without blocking the event loop, so vitest's hang guard is
    // the only limit and stops a hung one (backlog row B-120).
  });
});
