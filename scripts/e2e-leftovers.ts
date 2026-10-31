/**
 * What earlier `pnpm e2e` runs left in the system temp folder (B-124). A run that is killed never reaches its `finally`.
 * On Windows Node ends the byway it started along with it, but not the Temporal server byway's engine started, which
 * the Temporal SDK's native code starts outside that tie and which runs on, holding its port and its database in the
 * run's data directory. So each run first stops such a server and removes the data directory it was left in.
 *
 * Each run's data directory is named for its process (`byway-e2e-<pid>-…`, scripts/e2e.ts), so only those whose process
 * is gone are touched: a run going on beside this one (another checkout, a check's clone) keeps its own. Folders of the
 * older form, and those apps/web/playwright.config.ts makes for a direct Playwright run, are left alone. On Linux and
 * macOS a killed run's byway outlives it and stops itself when it finds its runner gone, so there is usually nothing to
 * stop; a folder such a byway is still stopping in can be removed under it, which those systems allow.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

/** A data directory of `pnpm e2e`, with the process id of the run that made it. */
export const E2E_DATA_DIR = /^byway-e2e-(\d+)-/;

/** Whether a process is running (one we may not signal is running too). */
export const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/**
 * The Temporal servers whose database is in `folder`: the processes whose command line has `--db-filename` and the
 * folder (dev-engine.ts starts the server with `--db-filename <data dir>/temporal.sqlite`). On Windows from the process
 * table, on Linux from /proc; elsewhere none are found.
 */
export function enginesIn(folder: string): number[] {
  if (process.platform === 'win32') {
    const found = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('--db-filename') -and $_.CommandLine.ToLowerInvariant().Contains($env:BYWAY_E2E_LEFTOVER.ToLowerInvariant()) } | ForEach-Object { $_.ProcessId }",
      ],
      { encoding: 'utf8', windowsHide: true, env: { ...process.env, BYWAY_E2E_LEFTOVER: folder } },
    );
    return (found.stdout ?? '').split(/\s+/).filter(Boolean).map(Number).filter((pid) => pid !== process.pid);
  }
  let pids: string[];
  try {
    pids = readdirSync('/proc').filter((d) => /^\d+$/.test(d));
  } catch {
    return [];
  }
  return pids
    .filter((pid) => {
      try {
        const args = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
        return args.includes('--db-filename') && args.some((a) => a.startsWith(folder + path.sep));
      } catch {
        return false;
      }
    })
    .map(Number)
    .filter((pid) => pid !== process.pid);
}

/**
 * Stops the Temporal servers earlier runs left and removes their data directories, in `dir` (the system temp folder).
 * Says what it stopped, and which directory it could not remove.
 */
export function removeLeftovers(dir: string): void {
  for (const name of readdirSync(dir)) {
    const pid = E2E_DATA_DIR.exec(name)?.[1];
    if (!pid || alive(Number(pid))) continue;
    const folder = path.join(dir, name);
    for (const engine of enginesIn(folder)) {
      try {
        process.kill(engine);
        console.log(`e2e: stopped a Temporal server (process ${engine}) that an earlier run left running in ${name}.`);
      } catch {
        // Gone meanwhile.
      }
    }
    try {
      rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    } catch (err) {
      console.error(`e2e: ${name}, left by an earlier run, could not be removed (${(err as NodeJS.ErrnoException).code}).`);
    }
  }
}
