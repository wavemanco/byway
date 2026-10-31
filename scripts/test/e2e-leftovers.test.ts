/**
 * B-124: what a killed `pnpm e2e` left is stopped and removed by the next run (scripts/e2e-leftovers.ts), with real
 * processes: a stand-in for the Temporal server, started as dev-engine.ts starts it (`--db-filename` in the run's data
 * directory), and a bystander that names the folder without being a server. Windows reads the process table, Linux
 * /proc; on macOS no server is found, so only the removal is checked there.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { alive, enginesIn, removeLeftovers } from '../e2e-leftovers.ts';

const IDLE = 'setInterval(() => {}, 1000)';
const started: ChildProcess[] = [];
const dirs: string[] = [];

const idle = (...args: string[]): ChildProcess => {
  const child = spawn(process.execPath, ['-e', IDLE, '--', ...args], { stdio: 'ignore', windowsHide: true });
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
  writeFileSync(path.join(dir, 'temporal.sqlite'), '');
  return dir;
};

afterEach(() => {
  for (const child of started.splice(0)) if (child.exitCode === null && child.signalCode === null) child.kill();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
});

describe('the next e2e run stops what a killed one left, and removes its data directory (B-124)', () => {
  it('a running process is alive, an ended one is not', async () => {
    expect(alive(process.pid)).toBe(true);
    expect(alive(await deadPid())).toBe(false);
  });

  it('stops the server whose database is in a dead run’s folder and removes the folder; leaves a bystander, a live run’s folder and older ones', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'byway-left-'));
    dirs.push(root);
    const dead = folder(root, `byway-e2e-${await deadPid()}-aaaaaa`);
    const live = folder(root, `byway-e2e-${process.pid}-bbbbbb`);
    const older = folder(root, 'byway-e2e-cccccc');
    const engine = idle('--db-filename', path.join(dead, 'temporal.sqlite'));
    const bystander = idle(dead);
    const liveEngine = idle('--db-filename', path.join(live, 'temporal.sqlite'));
    await new Promise((r) => setTimeout(r, 500));

    const finds = process.platform === 'win32' || process.platform === 'linux';
    expect(enginesIn(dead)).toEqual(finds ? [engine.pid] : []);
    removeLeftovers(root);

    if (finds) expect(await exited(engine, 15_000), 'the left server was stopped').toBe(true);
    expect(existsSync(dead), "the dead run's folder").toBe(false);
    expect(bystander.exitCode, 'a process that only names the folder is not stopped').toBeNull();
    expect(liveEngine.exitCode, "a live run's server is not stopped").toBeNull();
    expect(existsSync(live), "a live run's folder").toBe(true);
    expect(existsSync(older), 'a folder of the older form').toBe(true);
  }, 60_000);
});
