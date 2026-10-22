/**
 * D2 probe, part 5 again: a host whose sandbox cannot start, simulated. echo.exe (writes to stdout only) stands in for
 * Chromium and prints the marker Chromium prints there, then exits. Shows what Playwright reports and what main's
 * launchFailure() would make of it if only RENDERER_OS_SANDBOX were switched on. Writes probe-fail-results.json.
 */
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WT = 'C:/Users/arvik/code/byway/.claude/worktrees/wf_6371d503-2fc-3';
const ECHO = 'C:/Program Files/Git/usr/bin/echo.exe';
const { chromiumLaunchOptions, launchFailure } = await import(pathToFileURL(`${WT}/packages/runner/src/pages.ts`).href);
const { chromium } = createRequire(`${WT}/packages/runner/package.json`)('playwright');
const on = { ...chromiumLaunchOptions(), chromiumSandbox: true };

const markers: Record<string, string> = {
  userns: '--marker=No usable sandbox! If this is a Debian system, please install the chromium-sandbox package to solve this problem.',
  root: '--marker=Running as root without --no-sandbox is not supported. See https://crbug.com/638180.',
  unrelated: '--marker=some other start-up failure',
};
const out: Record<string, unknown> = {};
for (const [k, marker] of Object.entries(markers)) {
  try {
    const b = await chromium.launch({ ...on, executablePath: ECHO, args: [...(on.args ?? []), marker], timeout: 15_000 });
    await b.close();
    out[k] = 'launched?!';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    out[k] = {
      firstLine: msg.split(/\r?\n/)[0],
      mentionsSandboxingFailed: msg.includes('Chromium sandboxing failed!'),
      suggestsSandboxFalse: msg.includes('chromiumSandbox: false'),
      bywayWouldSay: launchFailure(e).message,
    };
  }
}
writeFileSync(path.join(HERE, 'probe-fail-results.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
