/**
 * `pnpm e2e`: the Playwright suite (apps/web/e2e) against a real `pnpm demo`. It starts byway in demo mode on a fresh
 * temp data directory and free ports, so a byway you are running is never touched, with stand-in provider keys the
 * suite checks never leak (apps/web/e2e/keys.ts). When the suite ends it stops byway the clean way (the same path as
 * Ctrl+C) and removes the data directory. Arguments are passed to `playwright test`.
 *
 * The server's output goes to byway-e2e-server.log in the system temp folder (Playwright empties its own output folder).
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_KEYS } from '../apps/web/e2e/keys.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps', 'web');

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });

const exited = (child: ChildProcess) => new Promise<number | null>((resolve) => (child.exitCode !== null ? resolve(child.exitCode) : child.once('exit', (code) => resolve(code))));

async function waitUntilReady(url: string, server: ChildProcess, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`byway exited with code ${server.exitCode} before it was ready.`);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`byway was not ready at ${url} within ${timeoutMs / 1000} s.`);
}

async function main(): Promise<number> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'byway-e2e-'));
  const webPort = await freePort();
  const temporalPort = await freePort();
  const baseUrl = `http://127.0.0.1:${webPort}`;
  const logFile = path.join(tmpdir(), 'byway-e2e-server.log');
  const log = createWriteStream(logFile);

  console.log(`e2e: starting byway in demo mode at ${baseUrl} (engine port ${temporalPort}, data ${dataDir})`);
  const server = spawn(process.execPath, ['--import', 'tsx', path.join('scripts', 'dev.ts'), '--demo'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, ...E2E_KEYS, BYWAY_DATA_DIR: dataDir, BYWAY_DEMO: '1', PORT: String(webPort), BYWAY_TEMPORAL_PORT: String(temporalPort) },
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);

  let code = 1;
  try {
    await waitUntilReady(`${baseUrl}/`, server, 240_000);
    console.log('e2e: byway is ready; running the suite');
    const cli = path.join(WEB, 'node_modules', '@playwright', 'test', 'cli.js');
    const suite = spawn(process.execPath, [cli, 'test', ...process.argv.slice(2)], {
      cwd: WEB,
      stdio: 'inherit',
      env: { ...process.env, BYWAY_E2E_BASE_URL: baseUrl, BYWAY_E2E_DATA_DIR: dataDir },
    });
    code = (await exited(suite)) ?? 1;
    if (code !== 0) console.error(`e2e: the server's output is in ${logFile}`);
  } catch (err) {
    console.error(`e2e: ${err instanceof Error ? err.message : String(err)}`);
    console.error(readFileSync(logFile, 'utf8').split('\n').slice(-40).join('\n'));
  } finally {
    // The clean stop: the same path as Ctrl+C in `pnpm demo` (next dev, then the worker and Temporal, then the store).
    if (server.exitCode === null) {
      server.send('stop');
      const stopped = await Promise.race([exited(server), new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 60_000))]);
      if (stopped === 'timeout') {
        console.error('e2e: byway did not stop within 60 s; ending it.');
        if (process.platform === 'win32' && server.pid) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
        else server.kill('SIGKILL');
        code ||= 1;
      } else {
        console.log(`e2e: byway stopped${stopped === 0 ? ' cleanly' : ` with code ${stopped}`}`);
        if (stopped !== 0) code ||= 1;
      }
    }
    log.end();
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
  return code;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
