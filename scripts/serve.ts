/**
 * One command starts all of byway on this computer (product spec §2, process model; C8):
 *
 * - `pnpm start` (`serve.ts start`): the normal way to use byway. Builds the web app (`next build`), then serves it
 *   with `next start` on 127.0.0.1, beside the run engine.
 * - `pnpm demo` (`serve.ts start --demo`): the same with the mock provider forced on (sample outputs, nothing charged).
 * - `pnpm dev` (`serve.ts dev`): contributor mode, with hot reload. `next dev` answers its own internal endpoints
 *   (opening files in an editor, attaching a debugger) before the app's guard runs, so it listens on an internal
 *   loopback port picked at random, and a small guarding reverse proxy (apps/web/src/server/dev-proxy.ts) listens on
 *   the public port and checks every request and WebSocket upgrade first (SEC-6). The internal port itself is not
 *   guarded; it is unannounced and changes every start, and contributor mode is not the way to use byway day to day.
 *
 * This process opens the data directory, the store, the gateway (the mock forced on for `--demo`), the prompt templates
 * and the run engine: a local Temporal server persisted in `<data dir>/temporal.sqlite` plus the runner worker. The web
 * app is a separate process and only a Temporal client of this engine; both use the same SQLite file (WAL, busy
 * timeout) and ledger (cross-process lock). If the engine stops, byway says so and stops (OPS-2). Ctrl+C stops it all.
 *
 * Keys: provider keys come from `.env.agents` at the repo root (never committed) or the shell; their values are never
 * printed. `next build` gets none of them, and Turbopack's dev cache is off (next.config.ts), so no key is written
 * under the repo (SEC-3). The web process gets them: it recommends and composes with real models.
 *
 * Environment: BYWAY_DATA_DIR (data directory), PORT (web, default 3000), BYWAY_TEMPORAL_PORT (default 7233),
 * BYWAY_DEMO=1 (same as `--demo`), BYWAY_NEXT_DIST_DIR (the web build's folder inside apps/web, default .next; the e2e
 * suite uses its own, so it never rebuilds under a byway you are running).
 *
 * The packages are imported by path: the repo root has no dependencies of its own, and each package resolves its own.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createGuardProxy } from '../apps/web/src/server/dev-proxy.ts';
import { ENGINE_STOPPED_MESSAGE, watchEngine } from '../apps/web/src/server/engine-watch.ts';
import { isInternalAddressLine, parseServeArgs, withoutSecrets } from '../apps/web/src/server/serving.ts';
import { createGateway, KEY_VARS, loadEnvFile } from '../packages/gateway/src/index.ts';
import { createPromptRenderer } from '../packages/prompts/src/index.ts';
import { startDevEngine, storeCaps, type DevEngine } from '../packages/runner/src/index.ts';
import { createStore, resolveDataDir } from '../packages/store/src/index.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps', 'web');

function port(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65_535) throw new Error(`${name} must be a port number, not "${raw}".`);
  return n;
}

/** Stops a process and everything it started: on Windows `next` runs its server in a child of its own. */
function stopTree(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return Promise.resolve();
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

const exitCode = (child: ChildProcess) => new Promise<number | null>((resolve) => (child.exitCode !== null ? resolve(child.exitCode) : child.once('exit', (code) => resolve(code))));

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

/** A free loopback port, chosen by the system. */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port: p } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(p));
    });
  });

/** Answers when something accepts a TCP connection at host:port (the Temporal server, here). */
const reachable = (address: string) =>
  new Promise<void>((resolve, reject) => {
    const [host, p] = [address.slice(0, address.lastIndexOf(':')), Number(address.slice(address.lastIndexOf(':') + 1))];
    const socket = net.connect({ host, port: p });
    socket.setTimeout(3000, () => socket.destroy(new Error('timeout')));
    socket.once('connect', () => {
      socket.end();
      resolve();
    });
    socket.once('error', reject);
  });

function nextBin(): string {
  const require = createRequire(path.join(WEB, 'package.json'));
  return path.join(path.dirname(require.resolve('next/package.json')), 'dist', 'bin', 'next');
}

/** Runs `next build` without any secret in its environment, so none can reach the build's caches (SEC-3). */
async function build(env: Record<string, string>): Promise<void> {
  console.log('  web        building the app (next build)…');
  const child = spawn(process.execPath, [nextBin(), 'build'], { cwd: WEB, stdio: ['ignore', 'pipe', 'pipe'], env: withoutSecrets(env, Object.values(KEY_VARS)) });
  const output: string[] = [];
  for (const stream of [child.stdout, child.stderr]) stream?.on('data', (chunk: Buffer) => output.push(chunk.toString()));
  const code = await exitCode(child);
  if (code !== 0) {
    process.stderr.write(output.join(''));
    throw new Error(`The web app did not build (next build exited with code ${code}).`);
  }
}

async function main(): Promise<void> {
  const { mode, demo } = parseServeArgs(process.argv.slice(2), process.env);
  const webPort = port('PORT', 3000);
  const temporalPort = port('BYWAY_TEMPORAL_PORT', 7233);

  quietTemporal();
  // Next.js's dev cache is off now (next.config.ts), but one left by an earlier byway may hold a snapshot of the
  // environment, keys included (SEC-3); it is never needed again, so it goes.
  rmSync(path.join(WEB, process.env.BYWAY_NEXT_DIST_DIR?.trim() || '.next', 'dev', 'cache', 'turbopack'), { recursive: true, force: true });
  const keys = loadEnvFile(path.join(ROOT, '.env.agents'));
  const dataDir = resolveDataDir();
  const store = createStore({ dataDir });
  const gateway = createGateway({ ledgerPath: path.join(dataDir, 'ledger.jsonl'), artifacts: store.artifacts, caps: storeCaps(store), demo });
  const prompts = createPromptRenderer();

  console.log(`byway${demo ? ' (demo: sample outputs, no AI calls)' : ''}${mode === 'dev' ? ' — contributor mode (next dev)' : ''}`);
  console.log(`  data       ${dataDir}`);
  if (keys.found) console.log(`  keys       .env.agents (${keys.loaded.length} loaded; values are never shown)`);
  const withKeys = gateway.providers().filter((p) => p.provider !== 'mock' && p.configured).map((p) => p.provider);
  console.log(`  providers  ${withKeys.length > 0 ? withKeys.join(', ') : 'none (every run uses sample outputs)'}`);

  // The engine starts while the app builds.
  console.log('  engine     starting Temporal and the runner worker…');
  const engineStarting = startDevEngine({ dataDir, gateway, store, prompts, port: temporalPort });
  engineStarting.catch(() => undefined);
  const env: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined));
  try {
    if (mode === 'start') await build(env);
  } catch (err) {
    await engineStarting.then((e) => e.stop()).catch(() => undefined);
    store.close();
    throw err;
  }
  let engine: DevEngine;
  try {
    engine = await engineStarting;
  } catch (err) {
    store.close();
    throw err;
  }
  console.log(`  engine     ${engine.address}`);

  const webEnv = { ...env, BYWAY_DATA_DIR: dataDir, BYWAY_DEMO: demo ? '1' : '0', BYWAY_TEMPORAL_ADDRESS: engine.address, PORT: String(webPort) };
  let web: ChildProcess;
  let proxy: ReturnType<typeof createGuardProxy> | undefined;
  if (mode === 'start') {
    web = spawn(process.execPath, [nextBin(), 'start', '-H', '127.0.0.1', '-p', String(webPort)], { cwd: WEB, stdio: ['ignore', 'inherit', 'inherit'], env: webEnv });
  } else {
    const internal = await freePort();
    web = spawn(process.execPath, [nextBin(), 'dev', '-H', '127.0.0.1', '-p', String(internal)], { cwd: WEB, stdio: ['ignore', 'pipe', 'inherit'], env: webEnv });
    // next dev names its internal address, which a browser refuses; only the public one is shown.
    if (web.stdout) createInterface({ input: web.stdout }).on('line', (line) => (isInternalAddressLine(line) ? undefined : console.log(line)));
    proxy = createGuardProxy({ targetPort: internal });
    await new Promise<void>((resolve, reject) => {
      proxy!.once('error', reject);
      proxy!.listen(webPort, '127.0.0.1', () => resolve());
    });
  }
  console.log(`  web        http://127.0.0.1:${webPort}${mode === 'dev' ? ' (every request passes byway’s guard before next dev)' : ''}`);

  let stopping: Promise<void> | undefined;
  const stop = (code: number) =>
    (stopping ??= (async () => {
      console.log('\nStopping byway…');
      watch.stop();
      await new Promise<void>((resolve) => (proxy ? proxy.close(() => resolve()) : resolve()));
      proxy?.closeAllConnections();
      await stopTree(web);
      await engine.stop().catch((err: unknown) => console.error('The engine did not stop cleanly:', err));
      store.close();
      console.log('Stopped.');
      process.exit(code);
    })());

  // OPS-2: the engine stopping under a running byway is said plainly, and byway stops rather than half-working.
  const watch = watchEngine({
    ping: () => reachable(engine.address),
    onDown: () => {
      console.error(`\n${ENGINE_STOPPED_MESSAGE}`);
      void stop(1);
    },
  });
  engine.worker.run().then(
    () => {
      if (!stopping) {
        console.error(`\n${ENGINE_STOPPED_MESSAGE}`);
        void stop(1);
      }
    },
    (err: unknown) => {
      if (!stopping) {
        console.error(`\n${ENGINE_STOPPED_MESSAGE} (${err instanceof Error ? err.message : String(err)})`);
        void stop(1);
      }
    },
  );

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
      console.error(`next ${mode} exited${code === null ? '' : ` with code ${code}`}.`);
      void stop(code || 1);
    }
  });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
