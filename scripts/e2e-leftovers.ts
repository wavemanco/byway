/**
 * What earlier `pnpm e2e` runs left in the system temp folder (B-124). A run that is killed never reaches its `finally`,
 * so its data directory stays. On Windows Node ends the byway it started along with it, but not the Temporal server
 * byway's engine started, which the Temporal SDK's native code starts outside that tie: it runs on, holding its port and
 * its database in the run's data directory. On Linux and macOS byway outlives its runner and stops its engine itself
 * when it finds the runner gone. So each run first stops such a server and removes the data directories killed runs left.
 *
 * Each run's data directory is named for its process (`byway-e2e-<pid>-…`, scripts/e2e.ts), so only those whose process
 * is gone are touched: a run going on beside this one (another checkout, a check's clone) keeps its own. Folders of the
 * older form, and those apps/web/playwright.config.ts makes for a direct Playwright run, are left alone. Limits: a process
 * id is judged in this system's own process table, so if a killed run's id has since been given to another process, its
 * folder and server are left until that process ends (never the other way round: a live run is never taken for a dead
 * one); and a run in a container that shares this temp folder has ids this system does not know. On Linux and macOS a
 * folder a byway is still stopping in can be removed under it, which those systems allow.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

/** A data directory of `pnpm e2e`, with the process id of the run that made it. */
export const E2E_DATA_DIR = /^byway-e2e-(\d+)-/;
/** The engine's database in a data directory (packages/runner/src/dev-engine.ts TEMPORAL_DB_FILENAME). */
export const ENGINE_DB = 'temporal.sqlite';
/** How long a server just stopped is given to let go of its files before its folder is given up on. */
const REMOVE_WITHIN_MS = 5000;

/** Whether a process is running (one we may not signal is running too). */
export const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
};

const sleep = (ms: number): void => void Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * The Temporal servers whose database is `db`: the processes started with `--db-filename <db>`, as dev-engine.ts starts
 * the server. On Windows from the process table, on Linux from /proc; on other systems none are found. `{ unread }`,
 * saying why, when the table could not be read.
 */
export function enginesUsing(db: string): number[] | { unread: string } {
  if (process.platform === 'win32') {
    const found = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        // The path comes in the environment, so nothing in this query's own command line names it.
        "$p = '--db-filename\\s+\"?' + [regex]::Escape($env:BYWAY_E2E_LEFTOVER_DB) + '\"?(\\s|$)'; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match $p } | ForEach-Object { $_.ProcessId }",
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 30_000, env: { ...process.env, BYWAY_E2E_LEFTOVER_DB: db } },
    );
    if (found.error || found.status !== 0) return { unread: found.error?.message ?? (found.stderr.trim().split('\n')[0] || `PowerShell exited with code ${found.status}`) };
    return found.stdout.split(/\s+/).filter(Boolean).map(Number).filter((pid) => pid !== process.pid);
  }
  if (process.platform !== 'linux') return [];
  let pids: string[];
  try {
    pids = readdirSync('/proc').filter((d) => /^\d+$/.test(d));
  } catch (err) {
    return { unread: (err as Error).message };
  }
  return pids
    .filter((pid) => {
      try {
        const args = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
        return args.some((a, i) => a === '--db-filename' && args[i + 1] === db);
      } catch {
        return false;
      }
    })
    .map(Number)
    .filter((pid) => pid !== process.pid);
}

/** Removes `folder`, waiting for a server just stopped to let go of its files; the error if it could not. */
function removeWithin(folder: string, ms: number): NodeJS.ErrnoException | undefined {
  const until = Date.now() + ms;
  for (;;) {
    try {
      rmSync(folder, { recursive: true, force: true });
      return undefined;
    } catch (err) {
      if (Date.now() >= until) return err as NodeJS.ErrnoException;
      sleep(100);
    }
  }
}

/**
 * Stops the Temporal servers earlier runs left and removes their data directories, in `dir` (the system temp folder).
 * Says what it stopped, what it could not, and which directory it could not remove.
 */
export function removeLeftovers(dir: string): void {
  for (const name of readdirSync(dir)) {
    const pid = E2E_DATA_DIR.exec(name)?.[1];
    if (!pid || alive(Number(pid))) continue;
    const folder = path.join(dir, name);
    const engines = enginesUsing(path.join(folder, ENGINE_DB));
    if (!Array.isArray(engines)) console.error(`e2e: the process table could not be read (${engines.unread}), so a Temporal server an earlier run left in ${name} may still be running.`);
    else
      for (const engine of engines) {
        try {
          process.kill(engine);
          console.log(`e2e: stopped a Temporal server (process ${engine}) that an earlier run left running in ${name}.`);
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code !== 'ESRCH') console.error(`e2e: could not stop the Temporal server (process ${engine}) an earlier run left running in ${name} (${code}).`);
        }
      }
    const failed = removeWithin(folder, REMOVE_WITHIN_MS);
    if (failed) console.error(`e2e: ${name}, left by an earlier run, could not be removed (${failed.code}); a Temporal server it started may still hold it.`);
  }
}
