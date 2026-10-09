/**
 * `pnpm e2e`: the Playwright suite (apps/web/e2e) against a real `pnpm demo` (the production server, C8). It starts
 * byway in demo mode on a fresh temp data directory and free ports, building the web app into its own folder
 * (apps/web/.next-e2e), so a byway you are running from this checkout is not rebuilt under you (DEV-1). Stand-in
 * provider keys are set, and the suite fails if any of them shows up in a request, a response or the build folder
 * (apps/web/e2e/keys.ts; SEC-3). When the suite ends it stops byway the clean way (the same path as Ctrl+C) and removes
 * the data directory. Arguments are passed to `playwright test`.
 *
 * Both byways still build the runner's workflow bundle into packages/runner/dist/workflows.js; it is the same code from
 * the same checkout, so a second build writes the same file.
 *
 * The server's output goes to byway-e2e-server.log in the system temp folder (Playwright empties its own output folder).
 * Its start-up lines must say the page renderer is ready (F18): the suite renders pages, so here it has to start.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_KEYS, SENTINEL } from '../apps/web/e2e/keys.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps', 'web');
/** The e2e build's own folder inside apps/web (next.config.ts). */
const DIST_DIR = '.next-e2e';

/** Files under a folder that contain a stand-in key: none may (keys are never written under the repo, SEC-3). */
function filesWithKeys(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  const values = Object.values(E2E_KEYS).map((v) => Buffer.from(v));
  const marker = Buffer.from(SENTINEL);
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && statSync(full).size < 256 * 1024 * 1024) {
        const bytes = readFileSync(full);
        if (bytes.includes(marker) && values.some((v) => bytes.includes(v))) found.push(path.relative(ROOT, full));
      }
    }
  };
  walk(dir);
  return found;
}

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
  const server = spawn(process.execPath, ['--import', 'tsx', path.join('scripts', 'serve.ts'), 'start', '--demo'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
      ...process.env,
      ...E2E_KEYS,
      BYWAY_DATA_DIR: dataDir,
      BYWAY_DEMO: '1',
      BYWAY_NEXT_DIST_DIR: DIST_DIR,
      PORT: String(webPort),
      BYWAY_TEMPORAL_PORT: String(temporalPort),
    },
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);
  // The start-up lines, kept until the "renderer" line has been printed.
  let startup = '';
  const keep = (d: Buffer) => {
    startup += d.toString();
    if (/^ {2}renderer {3}.*\n/m.test(startup)) server.stdout?.off('data', keep);
  };
  server.stdout?.on('data', keep);

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
    // The clean stop: the same path as Ctrl+C in `pnpm demo` (the web app, then the worker and Temporal, then the store).
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
  // The start-up "renderer" line (serve.ts) says whether the page renderer's Chromium can start.
  const renderer = /^ {2}renderer {3}(.*)$/m.exec(startup)?.[1]?.trim();
  if (renderer?.startsWith("Playwright's Chromium, ready")) console.log(`e2e: renderer ${renderer}`);
  else {
    console.error(`e2e: byway did not say at start-up that its page renderer is ready (${renderer ?? 'no "renderer" line'}).`);
    code ||= 1;
  }
  // The start-up "checked" line (serve.ts; R4, ADR-0096, ADR-0095): a fresh data directory is reported complete, not damaged.
  const checked = /^ {2}checked {4}(.*)$/m.exec(startup)?.[1]?.trim();
  if (checked?.startsWith('the database and its ') && checked.endsWith('holds every call the spend book counts')) console.log(`e2e: checked ${checked}`);
  else {
    console.error(`e2e: byway's start-up check of a fresh data directory did not report it complete (${checked ?? 'no "checked" line'}).`);
    code ||= 1;
  }
  // The build ran with the stand-in keys in byway's environment: none may have reached the build folder.
  const leaked = filesWithKeys(path.join(WEB, DIST_DIR));
  if (leaked.length > 0) {
    console.error(`e2e: a stand-in provider key was written under the repo:\n  ${leaked.join('\n  ')}`);
    code ||= 1;
  } else console.log(`e2e: no stand-in key under apps/web/${DIST_DIR}`);
  return code;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
