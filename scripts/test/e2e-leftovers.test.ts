/**
 * B-124: what a killed `pnpm e2e` left is stopped and removed by the next run (scripts/e2e-leftovers.ts), with real
 * processes. The stand-in for the Temporal server is started as dev-engine.ts starts it (`--db-filename` and the run's
 * database) and, on Windows, holds that database open with no delete sharing, as the server does, through a child that
 * ends with it; so its folder can be removed only once the stand-in's files are let go. Bystanders that name the folder
 * or have `--db-filename` for another database are left. Windows reads the process table, Linux /proc; on macOS no server
 * is found, so only the removal is checked there.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { alive, ENGINE_DB, enginesUsing, removeLeftovers } from '../e2e-leftovers.ts';

/** Idles until stopped, and ends when its parent has gone (so a killed test leaves none behind). */
const IDLE = 'setInterval(() => { try { process.kill(process.ppid, 0); } catch { process.exit(); } }, 1000)';
/** The stand-in server: on Windows it holds its database open with no delete sharing, through a child that ends with it. */
const SERVER = `
const db = process.argv[process.argv.indexOf('--db-filename') + 1];
if (process.platform === 'win32')
  require('node:child_process').spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', "$f = [IO.File]::Open($env:HOLD, 'OpenOrCreate', 'ReadWrite', 'None'); Start-Sleep -Seconds 600"], { stdio: 'ignore', windowsHide: true, env: { ...process.env, HOLD: db } });
${IDLE}`;
const started: ChildProcess[] = [];
const dirs: string[] = [];

const run = (script: string, ...args: string[]): ChildProcess => {
  const child = spawn(process.execPath, ['-e', script, '--', ...args], { stdio: 'ignore', windowsHide: true });
  started.push(child);
  return child;
};
const exited = (child: ChildProcess, ms: number) =>
  new Promise<boolean>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve(true);
    const timer = setTimeout(() => resolve(false), ms);
    child.once('exit', () => (clearTimeout(timer), resolve(true)));
  });
/** The id of a process that has ended. */
async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore', windowsHide: true });
  await exited(child, 10_000);
  return child.pid!;
}
const folder = (root: string, name: string) => {
  const dir = path.join(root, name);
  mkdirSync(dir);
  writeFileSync(path.join(dir, ENGINE_DB), '');
  return dir;
};
/** Whether another process holds `file` open with no sharing (Windows): opening it fails then. */
const held = (file: string): boolean => {
  try {
    closeSync(openSync(file, 'r+'));
    return false;
  } catch {
    return true;
  }
};
async function until(ok: () => boolean, ms: number): Promise<boolean> {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 100))) if (ok()) return true;
  return ok();
}

afterEach(() => {
  for (const child of started.splice(0)) if (child.exitCode === null && child.signalCode === null) child.kill();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
});

describe('the next e2e run stops what a killed one left, and removes its data directory (B-124)', () => {
  it('a running process is alive, an ended one is not', async () => {
    expect(alive(process.pid)).toBe(true);
    expect(alive(await deadPid())).toBe(false);
  });

  it('stops the server whose database is in a dead run’s folder, waits for its files, removes the folder; leaves bystanders, a live run’s folder and older ones', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'byway-left-'));
    dirs.push(root);
    const dead = folder(root, `byway-e2e-${await deadPid()}-aaaaaa`);
    const live = folder(root, `byway-e2e-${process.pid}-bbbbbb`);
    const older = folder(root, 'byway-e2e-cccccc');
    const db = path.join(dead, ENGINE_DB);
    const engine = run(SERVER, '--db-filename', db);
    const namesFolder = run(IDLE, dead);
    const otherDb = run(IDLE, '--db-filename', path.join(root, 'other.sqlite'), path.join(dead, 'log.txt'));
    const liveEngine = run(IDLE, '--db-filename', path.join(live, ENGINE_DB));
    const windows = process.platform === 'win32';
    if (windows) expect(await until(() => held(db), 20_000), 'the stand-in holds its database as the server does').toBe(true);
    else await new Promise((r) => setTimeout(r, 500));

    const finds = windows || process.platform === 'linux';
    expect(enginesUsing(db)).toEqual(finds ? [engine.pid] : []);
    removeLeftovers(root);

    if (finds) expect(await exited(engine, 15_000), 'the left server was stopped').toBe(true);
    expect(existsSync(dead), "the dead run's folder, once the server let go of it").toBe(false);
    expect(await exited(namesFolder, 1000), 'a process that only names the folder').toBe(false);
    expect(await exited(otherDb, 1000), 'a process whose --db-filename is another database').toBe(false);
    expect(await exited(liveEngine, 1000), "a live run's server").toBe(false);
    expect(existsSync(live), "a live run's folder").toBe(true);
    expect(existsSync(older), 'a folder of the older form').toBe(true);
  }, 90_000);
});
