/**
 * The local engine (spec §2 process model): a Temporal dev server persisted in `<dataDir>/temporal.sqlite`, the
 * worker (built with esbuild, ADR-0070) in the same process, and a Runner for another process via connectRunner. While
 * it runs it repeats its lost-run pass; these tests record what it asks to repeat and run the pass themselves.
 *
 * Engine starts and stops are slow on a busy machine (a Temporal server with its database, the worker, settling runs),
 * so each test's limit is counted in engine starts and stops. The file builds its own workflow bundle once, so no start
 * rebuilds it and none shares dist/workflows.js with a byway or another suite building it at the same moment.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DefaultLogger, Runtime } from '@temporalio/worker';
import { createGateway } from '@byway/gateway';
import { buildWorkflows } from '../src/build.ts';
import { storeCaps } from '../src/caps.ts';
import { assertPortFree, connectRunner, portInUseMessage, RECONCILE_EVERY_MS, startDevEngine, TEMPORAL_DB_FILENAME, type DevEngine, type DevEngineOptions } from '../src/dev-engine.ts';
import { LOST_RUN_MESSAGE } from '../src/lost-runs.ts';
import { workflowIdFor } from '../src/types.ts';
import { fakePages } from './helpers/fake-pages.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { createTestStore } from './helpers/memo.ts';
import { PROBLEM } from './helpers/harness.ts';
import { tiny } from './helpers/recipes.ts';

try {
  Runtime.install({ logger: new DefaultLogger('ERROR') });
} catch {
  // Installed already.
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });

const dir = mkdtempSync(path.join(tmpdir(), 'byway-engine-'));
const store = createTestStore({ dataDir: dir });
const gateway = createGateway({ ledgerPath: path.join(dir, 'ledger.jsonl'), artifacts: store.artifacts, spendBook: store.spendBook, caps: storeCaps(store), demo: true, env: {} });
let engine: DevEngine | undefined;
let httpPort = 0;

/** How long one engine start, or one stop, may take on a busy machine; a quiet one needs a few seconds. */
const ENGINE_MS = 60_000;

const bundle = fileURLToPath(new URL(`../dist/test-engine-${path.basename(dir)}.js`, import.meta.url));
let workflowsPath = '';
beforeAll(async () => {
  workflowsPath = await buildWorkflows({ outfile: bundle });
}, ENGINE_MS);

afterAll(async () => {
  await engine?.stop();
  await gateway.close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
  rmSync(bundle, { force: true });
}, ENGINE_MS);

/** What an engine asked to repeat while it runs (its lost-run pass), recorded instead of timed. */
interface Repeated {
  everyMs: number;
  pass: () => Promise<void>;
  onError: (e: unknown) => void;
  stopped: boolean;
}
const repeated: Repeated[] = [];
const recordRepeat: NonNullable<DevEngineOptions['repeat']> = (everyMs, pass, onError) => {
  const r: Repeated = { everyMs, pass, onError, stopped: false };
  repeated.push(r);
  return {
    stop: async () => {
      r.stopped = true;
    },
  };
};
/** What the engines said while they ran. */
const warned: string[] = [];

const start = (port: number, more: { httpPort?: number } = {}) =>
  startDevEngine({ dataDir: dir, gateway, store, prompts: fakePrompts(), port, pages: fakePages(), workflowsPath, repeat: recordRepeat, warn: (m) => warned.push(m), ...more });

/** An HTTP request to the dev server's HTTP API, with the headers a hostile page or a rebinding attack would send. */
const http = (port: number, method: 'GET' | 'POST', headers: Record<string, string>, body?: string) =>
  new Promise<number>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path: '/api/v1/namespaces', headers }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end(body);
  });

describe('the dev engine', () => {
  it('refuses to attach to whatever already listens on its port (OPS-1)', async () => {
    const port = await freePort();
    const squatter = createServer();
    await new Promise<void>((r) => squatter.listen(port, '127.0.0.1', () => r()));
    try {
      const err = await start(port).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain(String(port));
      expect((err as Error).message).toMatch(/already in use/);
      expect((err as Error).message).toMatch(/BYWAY_TEMPORAL_PORT/);
    } finally {
      await new Promise((r) => squatter.close(r));
    }
  });

  it("refuses a taken port with the caller's own message, when it gives one (BUILD-2)", async () => {
    const port = await freePort();
    const squatter = createServer();
    await new Promise<void>((r) => squatter.listen(port, '127.0.0.1', () => r()));
    try {
      await expect(assertPortFree(port, (p) => `web port ${p} is taken`)).rejects.toThrow(`web port ${port} is taken`);
      await expect(assertPortFree(port)).rejects.toThrow(portInUseMessage(port));
    } finally {
      await new Promise((r) => squatter.close(r));
    }
    await expect(assertPortFree(port, () => 'unused')).resolves.toBeUndefined();
  });

  it('runs a recipe end to end, and keeps its history in the data directory across restarts', async () => {
    const port = await freePort();
    engine = await start(port);
    expect(engine.address).toBe(`127.0.0.1:${port}`);
    expect(existsSync(path.join(dir, TEMPORAL_DB_FILENAME))).toBe(true);

    // The app is another process: it talks to the engine through its own client.
    const app = await connectRunner({ store, address: engine.address });
    const ws = await store.ensureDefaultWorkspace();
    const run = await app.runner.start({ workspaceId: ws.id, recipe: tiny, problem: PROBLEM, profileId: 'demo', budgetUsd: 5 });
    for (;;) {
      const view = await app.runner.view(run.id);
      const open = view.checkpoints.find((c) => c.status === 'open');
      if (open) await app.runner.resolve({ checkpointId: open.id, text: 'Good.' });
      if (view.run.status === 'done') break;
      await new Promise((r) => setTimeout(r, 25));
    }
    // "done" is written just before the workflow returns; let it return before the engine stops.
    expect(await engine.client.workflow.getHandle(workflowIdFor(run.id)).result()).toMatchObject({ status: 'done' });
    await app.close();
    await engine.stop();

    // Restarted on the same data directory, the server still knows the finished workflow.
    engine = await start(port);
    const described = await engine.client.workflow.getHandle(workflowIdFor(run.id)).describe();
    expect(described.status.name).toBe('COMPLETED');
  }, 3 * ENGINE_MS);

  it('keeps the Temporal HTTP API closed: no rebinding reads, no cross-site writes (SEC-2)', async () => {
    expect(engine).toBeDefined();
    const port = Number(engine!.address.split(':')[1]);
    engine = await restartWithHttpPort(port);
    expect(await http(httpPort, 'GET', { Host: `127.0.0.1:${httpPort}` })).toBe(403);
    expect(await http(httpPort, 'GET', { Host: `rebind.attacker.example:${httpPort}` })).toBe(403);
    expect(await http(httpPort, 'POST', { Host: `127.0.0.1:${httpPort}`, Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site', 'Content-Type': 'text/plain;charset=UTF-8' }, '{}')).toBe(403);
  }, 2 * ENGINE_MS);

  it('repeats its lost-run pass every five minutes while it runs, says what the pass ended, and stops it when it stops', async () => {
    expect(engine).toBeDefined();
    // The engines the tests above stopped stopped theirs; the running one's is the last.
    const running = repeated.filter((r) => !r.stopped);
    expect(running).toEqual([repeated.at(-1)]);
    const repeating = running[0]!;
    expect(repeating.everyMs).toBe(RECONCILE_EVERY_MS);
    expect(RECONCILE_EVERY_MS).toBe(5 * 60_000);

    // Written while the engine runs, after its pass at start: a run shown as waiting that the engine has no workflow
    // for, and a queued one, whose start may be under way.
    const ws = await store.ensureDefaultWorkspace();
    const record = (id: string, status: 'queued' | 'waiting') =>
      store.createRun({ id, workspaceId: ws.id, recipeId: 'tiny', recipeHash: tiny.hash ?? 'sha256:x', profileId: 'demo', title: 'A run', problem: PROBLEM.text, medium: 'prose', budgetUsd: 5, status });
    const lost = await record(`lost-${Date.now()}`, 'waiting');
    const queued = await record(`queued-${Date.now()}`, 'queued');
    warned.length = 0;
    await repeating.pass();
    expect(await store.getRun(lost.id)).toMatchObject({ status: 'failed', error: LOST_RUN_MESSAGE });
    expect((await store.getRun(queued.id))?.status).toBe('queued');
    expect(warned).toEqual(['  engine     ended 1 run the engine no longer has, which cannot continue']);
    // A pass with nothing to end says nothing.
    await repeating.pass();
    expect(warned).toHaveLength(1);
    // A pass that fails is said, and the engine carries on.
    repeating.onError(new Error('14 UNAVAILABLE: connection refused'));
    expect(warned.at(-1)).toBe('  engine     could not look for runs the engine no longer has (14 UNAVAILABLE: connection refused); it looks again in 5 minutes');

    await engine!.stop();
    engine = undefined;
    expect(repeating.stopped).toBe(true);
  }, 2 * ENGINE_MS);
});

/** The engine again on the same port, with its HTTP API pinned to a known port so the test can find it. */
async function restartWithHttpPort(port: number): Promise<DevEngine> {
  await engine?.stop();
  engine = undefined;
  httpPort = await freePort();
  return start(port, { httpPort });
}
