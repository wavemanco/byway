/**
 * `pnpm dev` and `pnpm demo` (product spec §2, process model): one command starts all of byway on this computer.
 *
 * This process opens the data directory, the store, the gateway (the mock forced on for `pnpm demo`), the prompt
 * templates and the dev engine: a local Temporal server persisted in `<data dir>/temporal.sqlite` plus the runner
 * worker. Then it starts `next dev` on 127.0.0.1, which is only a Temporal client of this engine. Both processes use
 * the same SQLite file (WAL, busy timeout) and ledger (cross-process lock). Ctrl+C stops everything.
 *
 * Environment: BYWAY_DATA_DIR (data directory), PORT (web, default 3000), BYWAY_TEMPORAL_PORT (default 7233),
 * BYWAY_DEMO=1 (same as `--demo`). Provider keys come from `.env.agents` at the repo root (never committed) or the
 * shell; their values are never printed.
 *
 * The packages are imported by path: the repo root has no dependencies of its own, and each package resolves its own.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGateway, loadEnvFile } from '../packages/gateway/src/index.ts';
import { createPromptRenderer } from '../packages/prompts/src/index.ts';
import { startDevEngine, storeCaps, type DevEngine } from '../packages/runner/src/index.ts';
import { createStore, resolveDataDir } from '../packages/store/src/index.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps', 'web');

const flagOn = (value: string | undefined) => ['1', 'true'].includes(value?.trim().toLowerCase() ?? '');

function port(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65_535) throw new Error(`${name} must be a port number, not "${raw}".`);
  return n;
}

/** Stops a process and everything it started: on Windows `next dev` runs its server in a child of its own. */
function stopTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return Promise.resolve();
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
  const timeout = new Promise<void>((resolve) =>
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve();
    }, 10_000).unref(),
  );
  return Promise.race([exited, timeout]);
}

/**
 * Temporal's worker logs every bundle build and state change at INFO; keep warnings and errors only. The SDK is the
 * runner's own dependency, resolved from its package, so this is the instance the dev engine uses.
 */
function quietTemporal(): void {
  const requireFromRunner = createRequire(path.join(ROOT, 'packages', 'runner', 'package.json'));
  const { DefaultLogger, Runtime } = requireFromRunner('@temporalio/worker') as {
    DefaultLogger: new (level: 'WARN') => unknown;
    Runtime: { install(options: { logger: unknown }): unknown };
  };
  Runtime.install({ logger: new DefaultLogger('WARN') });
}

async function main(): Promise<void> {
  const demo = process.argv.includes('--demo') || flagOn(process.env.BYWAY_DEMO);
  const webPort = port('PORT', 3000);
  const temporalPort = port('BYWAY_TEMPORAL_PORT', 7233);

  quietTemporal();
  const keys = loadEnvFile(path.join(ROOT, '.env.agents'));
  const dataDir = resolveDataDir();
  const store = createStore({ dataDir });
  const gateway = createGateway({ ledgerPath: path.join(dataDir, 'ledger.jsonl'), artifacts: store.artifacts, caps: storeCaps(store), demo });
  const prompts = createPromptRenderer();

  console.log(`byway${demo ? ' (demo: sample outputs, no AI calls)' : ''}`);
  console.log(`  data       ${dataDir}`);
  if (keys.found) console.log(`  keys       .env.agents (${keys.loaded.length} loaded; values are never shown)`);
  const withKeys = gateway.providers().filter((p) => p.provider !== 'mock' && p.configured).map((p) => p.provider);
  console.log(`  providers  ${withKeys.length > 0 ? withKeys.join(', ') : 'none (every run uses sample outputs)'}`);
  console.log('  engine     starting Temporal and the runner worker…');

  let engine: DevEngine;
  try {
    engine = await startDevEngine({ dataDir, gateway, store, prompts, port: temporalPort });
  } catch (err) {
    store.close();
    throw err;
  }
  console.log(`  engine     ${engine.address}`);

  const require = createRequire(path.join(WEB, 'package.json'));
  const nextBin = path.join(path.dirname(require.resolve('next/package.json')), 'dist', 'bin', 'next');
  const web = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(webPort)], {
    cwd: WEB,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, BYWAY_DATA_DIR: dataDir, BYWAY_DEMO: demo ? '1' : '0', BYWAY_TEMPORAL_ADDRESS: engine.address, PORT: String(webPort) },
  });
  console.log(`  web        http://127.0.0.1:${webPort}`);

  let stopping: Promise<void> | undefined;
  const stop = (code: number) =>
    (stopping ??= (async () => {
      console.log('\nStopping byway…');
      await stopTree(web);
      await engine.stop().catch((err: unknown) => console.error('The engine did not stop cleanly:', err));
      store.close();
      console.log('Stopped.');
      process.exit(code);
    })());

  process.on('SIGINT', () => void stop(0));
  process.on('SIGTERM', () => void stop(0));
  // The e2e runner asks for a clean stop over IPC (a signal cannot be sent gracefully to a child on Windows).
  process.on('message', (message) => {
    if (message === 'stop') void stop(0);
  });
  // Started by a runner that has gone away: nobody can stop us any more, so stop now.
  process.on('disconnect', () => void stop(0));
  web.on('exit', (code) => {
    if (!stopping) {
      console.error(`next dev exited${code === null ? '' : ` with code ${code}`}.`);
      void stop(code ?? 1);
    }
  });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
