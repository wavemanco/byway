/**
 * One command starts all of byway on this computer (product spec §2, process model; C8):
 *
 * - `pnpm start` (`serve.ts start`): the normal way to use byway. Builds the web app (`next build`), then serves it
 *   with `next start` on 127.0.0.1, beside the run engine.
 * - `pnpm demo` (`serve.ts start --demo`): the same with the mock provider forced on (sample outputs, nothing charged).
 * - `pnpm dev` (`serve.ts dev`): contributor mode, with hot reload. `next dev` answers its own internal endpoints
 *   (opening files in an editor, attaching a debugger) before the app's guard runs, so it never runs as its own server:
 *   scripts/dev-web.ts creates the Next app in process inside byway's guarded server on 127.0.0.1
 *   (apps/web/src/server/dev-server.ts), which checks every request and WebSocket upgrade before Next sees it and is
 *   the only port the web process listens on (SEC-6). Contributor mode is not the way to use byway day to day.
 *
 * This process opens the data directory, the store, the gateway (the mock forced on for `--demo`), the prompt templates
 * and the run engine: a local Temporal server persisted in `<data dir>/temporal.sqlite` plus the runner worker. The web
 * app is a separate process and only a Temporal client of this engine; both use the same SQLite file (WAL, busy
 * timeout) and ledger (cross-process lock). If the engine stops, byway says so and stops (OPS-2). Ctrl+C stops it all.
 *
 * Keys: provider keys come from `.env.agents` at the repo root (never committed) or the shell; their values are never
 * printed. `next build` gets none of them, and Turbopack's dev cache is off (next.config.ts), so no key is written
 * under the repo (SEC-3). The web process gets them: it recommends and composes with real models. The page renderer's
 * Chromium, which the engine starts, gets none of them and nothing else from the secrets file (F18; ADR-0084).
 *
 * Data check (R4; ADR-0096): before the engine starts, byway reads the data directory and prints a "checked" line: the
 * database file, every recorded artifact file, the spend ledger against the spend book, and runs whose recorded cost the
 * spend book lacks (a partial restore). It changes no run record or file (the spend book reads in ledger lines it has not
 * seen, as the first model call would), and byway starts either way. The engine then ends what the store and it disagree on, and
 * says so under "engine".
 *
 * Renderer: while the engine starts, byway launches the page renderer's Chromium once and closes it again, and prints a
 * "renderer" line saying whether it can start. byway keeps running either way: prose, options and code-diff runs need
 * no renderer unless a lineup forms cards, and a web-page run whose renderer cannot start is refused before it spends.
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
import { fileURLToPath } from 'node:url';
import { ENGINE_STOPPED_MESSAGE, watchEngine } from '../apps/web/src/server/engine-watch.ts';
import { parseServeArgs } from '../apps/web/src/server/serving.ts';
import { createGateway, loadEnvFile, withoutSecrets } from '../packages/gateway/src/index.ts';
import { createPromptRenderer } from '../packages/prompts/src/index.ts';
import { checkRenderer, dataDirReport, engineStartLines, RENDERER_OS_SANDBOX, reportLines, startDevEngine, storeCaps, type DevEngine, type RendererCheck } from '../packages/runner/src/index.ts';
import { createStore, resolveDataDir } from '../packages/store/src/index.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps', 'web');
/** How long the page renderer's start-up check may take before byway says so and carries on (a launch takes ~100 ms). */
const RENDERER_CHECK_MS = 30_000;
/** Longer than the worker's forced shutdown (30 s), so a normal stop always finishes first. */
const ENGINE_STOP_DEADLINE_MS = 40_000;

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

/**
 * Stops the web process. Contributor mode's has an IPC channel and is asked first, so Next closes its dev server
 * cleanly; then, or for next start, the process tree is ended.
 */
async function stopWeb(child: ChildProcess): Promise<void> {
  if (child.connected && child.exitCode === null) {
    const exited = new Promise<true>((resolve) => child.once('exit', () => resolve(true)));
    child.send('stop');
    if (await Promise.race([exited, new Promise<false>((resolve) => setTimeout(() => resolve(false), 5000).unref())])) return;
  }
  await stopTree(child);
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
  const child = spawn(process.execPath, [nextBin(), 'build'], { cwd: WEB, stdio: ['ignore', 'pipe', 'pipe'], env: withoutSecrets(env) });
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
  // Turbopack's caches are off now (next.config.ts), but ones left by an earlier byway may hold a snapshot of the
  // environment, keys included (SEC-3); they are never needed again, so they go.
  const dist = path.join(WEB, process.env.BYWAY_NEXT_DIST_DIR?.trim() || '.next');
  for (const cache of [path.join(dist, 'dev', 'cache', 'turbopack'), path.join(dist, 'cache', 'turbopack')]) rmSync(cache, { recursive: true, force: true });
  const keys = loadEnvFile(path.join(ROOT, '.env.agents'));
  const dataDir = resolveDataDir();
  const store = createStore({ dataDir });
  // The spend book in byway.sqlite is the caps' authority, shared with the web process's gateways (ADR-0095).
  const gateway = createGateway({ ledgerPath: path.join(dataDir, 'ledger.jsonl'), artifacts: store.artifacts, spendBook: store.spendBook, caps: storeCaps(store), demo });
  const prompts = createPromptRenderer();

  console.log(`byway${demo ? ' (demo: sample outputs, no AI calls)' : ''}${mode === 'dev' ? ' — contributor mode (next dev)' : ''}`);
  console.log(`  data       ${dataDir}`);
  if (keys.found) console.log(`  keys       .env.agents (${keys.loaded.length} loaded; values are never shown)`);
  const withKeys = gateway.providers().filter((p) => p.provider !== 'mock' && p.configured).map((p) => p.provider);
  console.log(`  providers  ${withKeys.length > 0 ? withKeys.join(', ') : 'none (every run uses sample outputs)'}`);
  // R4: what a partial restore left behind is said before anything runs. The check changes no run record or file and never stops byway.
  try {
    const checked = reportLines(await dataDirReport({ dataDir, store, gateway, workspaceIds: [(await store.ensureDefaultWorkspace()).id] }));
    console.log(`  checked    ${checked.lines[0]}`);
    for (const line of checked.lines.slice(1)) console.log(`             - ${line}`);
  } catch (err) {
    console.log(`  checked    the data directory could not be checked (${err instanceof Error ? err.message : String(err)}); byway starts anyway`);
  }

  // The engine starts while the app builds.
  console.log('  engine     starting Temporal and the runner worker…');
  const engineStarting = startDevEngine({ dataDir, gateway, store, prompts, port: temporalPort });
  engineStarting.catch(() => undefined);
  // The renderer is checked meanwhile; the check never throws.
  const rendererChecking = Promise.race([
    checkRenderer(),
    new Promise<RendererCheck>((resolve) => setTimeout(() => resolve({ ready: false, message: `Playwright's Chromium did not start within ${RENDERER_CHECK_MS / 1000} s.` }), RENDERER_CHECK_MS).unref()),
  ]);
  const env: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined));
  try {
    if (mode === 'start') await build(env);
  } catch (err) {
    await engineStarting.then((e) => e.stop()).catch(() => undefined);
    await gateway.close();
    store.close();
    throw err;
  }
  let engine: DevEngine;
  try {
    engine = await engineStarting;
  } catch (err) {
    await gateway.close();
    store.close();
    throw err;
  }
  console.log(`  engine     ${engine.address}`);
  for (const line of engineStartLines(engine.atStart)) console.log(`             ${line}`);
  const renderer = await rendererChecking;
  console.log(`  renderer   ${renderer.ready ? `Playwright's Chromium, ready (${RENDERER_OS_SANDBOX ? 'inside its OS sandbox' : 'its OS sandbox is off; see Renderer in the README'})` : `not available: ${renderer.message}`}`);

  const webEnv = { ...env, BYWAY_DATA_DIR: dataDir, BYWAY_DEMO: demo ? '1' : '0', BYWAY_TEMPORAL_ADDRESS: engine.address, PORT: String(webPort) };
  let web: ChildProcess;
  if (mode === 'start') {
    web = spawn(process.execPath, [nextBin(), 'start', '-H', '127.0.0.1', '-p', String(webPort)], { cwd: WEB, stdio: ['ignore', 'inherit', 'inherit'], env: webEnv });
  } else {
    // Plain Node (it strips the script's types itself), from apps/web, as next dev ran. Over the IPC channel it is
    // asked to stop, and it stops by itself if this process goes away.
    web = spawn(process.execPath, [path.join(ROOT, 'scripts', 'dev-web.ts')], { cwd: WEB, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], env: { ...webEnv, NODE_ENV: 'development' } });
  }
  console.log(`  web        http://127.0.0.1:${webPort}${mode === 'dev' ? ' (next dev inside byway’s guard: every request and WebSocket is checked first)' : ''}`);

  let stopping: Promise<void> | undefined;
  const stop = (code: number) =>
    (stopping ??= (async () => {
      console.log('\nStopping byway…');
      watch.stop();
      await stopWeb(web);
      // ENG-10: the worker gives in-flight steps a grace period and then abandons them (they are retried on the next
      // start), so the engine's stop is bounded; the deadline guards against a stop that hangs anyway.
      const stopped = await Promise.race([
        engine.stop().then(
          () => true,
          (err: unknown) => (console.error('The engine did not stop cleanly:', err), true),
        ),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), ENGINE_STOP_DEADLINE_MS).unref()),
      ]);
      if (!stopped) console.error(`The engine did not stop within ${ENGINE_STOP_DEADLINE_MS / 1000} s; exiting anyway. Steps that were in flight will be retried when byway starts again.`);
      // Before the store: the gateway writes what is left of its outbox and stops its timer.
      await gateway.close();
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

  process.on('SIGINT', () => {
    // A second Ctrl+C while stopping exits at once; the engine retries abandoned steps on the next start.
    if (stopping) {
      console.error('\nStopping now. Steps that were in flight will be retried when byway starts again.');
      process.exit(130);
    }
    void stop(0);
  });
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
