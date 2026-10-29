/**
 * The e2e harness: a local Temporal dev server (the cached CLI, no download), the real gateway in demo mode (the mock
 * provider, no keys, no network), a temp store, a recorded prompt renderer (the fake by default, the real templates on
 * request) and fake pages, and the real worker and Runner client. One per test file; tests within a file run one after
 * another.
 *
 * With `book: 'store'` the worker runs as production's does (F03 stage 3; ADR-0099): on a store connection of its own,
 * with the store's spend book in byway.sqlite and one ledger, so a test can stop it cleanly (serve.ts's order: the
 * worker, its gateways, its store) and start a new one on the same data directory and task queue, or run a worker as a
 * process of its own and kill it outright mid-step (spawnWorkerProcess).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Duration } from '@temporalio/common';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { DefaultLogger, Runtime } from '@temporalio/worker';
import { GatewayError, type CheckpointRecord, type CheckpointResolution, type CompletionRequest, type Gateway, type ImageRequest, type LedgerEntry, type ProblemBrief, type PromptRenderer, type ProviderId, type RunRecord, type RunView, type StartRunInput, type VideoRequest } from '@byway/contracts';
import type { ModelGateway, ProviderAdapter, Responder } from '@byway/gateway';
import type { Recipe } from '@byway/recipe';
import { buildWorkflows } from '../../src/build.ts';
import { cachedTemporalExecutable, startOnceMore } from '../../src/dev-engine.ts';
import { createRunnerClient, ResolutionRejectedError } from '../../src/client.ts';
import { createWorker, type RunnerWorker } from '../../src/worker.ts';
import { workflowIdFor } from '../../src/types.ts';
import { fakePages, type FakePages } from './fake-pages.ts';
import { fakePrompts, recordPrompts, type RecordingPrompts } from './fake-prompts.ts';
import { createTestStore, type MemoStore } from './memo.ts';
import { testGateways, type TestGateways } from './worker-config.ts';
import type { WorkerProcessOptions } from './worker-process.ts';

export { NO_VIDEO_PROFILE } from './worker-config.ts';

export interface GatewayCall {
  kind: 'complete' | 'image' | 'video';
  purpose: string;
  runId?: string;
  stepId?: string;
  request: CompletionRequest | ImageRequest | VideoRequest;
  /** When the call was made (Date.now()). */
  at: number;
  /** What the gateway returned, once it has. */
  result?: unknown;
}

export type Answer = (cp: CheckpointRecord) => CheckpointResolution | 'wait' | undefined;

export interface HarnessOptions {
  /** The templates to render; defaults to the fake renderer. The agreement test passes @byway/prompts' renderer. */
  prompts?: PromptRenderer;
  /** Worker shutdown timing, for the shutdown tests. */
  shutdownGraceTime?: Duration;
  shutdownForceTime?: Duration;
  /** 'store': the worker on its own store connection, with the store's spend book and one ledger (see the header). */
  book?: 'memory' | 'store';
  /** Provider adapters the workers' gateways use in place of the built-in ones (the relay board's mock). */
  adapters?: Partial<Record<ProviderId, ProviderAdapter>>;
  /** The spend book's lease and renewal, shortened for the restart tests. */
  leaseMs?: number;
  renewEveryMs?: number;
}

/** A worker the harness started as a process of its own (spawnWorkerProcess). */
export interface WorkerProcess {
  child: ChildProcess;
  /** Kills it outright: no clean stop, nothing handed back. Resolves once it has exited. */
  kill(): Promise<void>;
}

export interface Harness {
  env: TestWorkflowEnvironment;
  store: MemoStore;
  gateway: Gateway;
  prompts: RecordingPrompts;
  pages: FakePages;
  worker: RunnerWorker;
  taskQueue: string;
  /** This harness's workflow bundle, for a test that starts a worker of its own on another task queue. */
  workflowsPath: string;
  /**
   * Leave demo mode for the calls that follow (a placeholder key is "configured", so profiles are taken at their
   * word: a profile with no video model has no video). Every profile these tests run is backed by the mock.
   */
  useKeys(on: boolean): void;
  /** The ledger entries of a run (both the demo and the keyed gateway's ledgers). */
  ledger(runId: string): LedgerEntry[];
  runner: ReturnType<typeof createRunnerClient>;
  workspaceId: string;
  /** Mock answers by purpose or role; mutable per test. */
  responders: Record<string, Responder>;
  /** How long every provider call takes before the mock answers (0 by default): a call "in flight". */
  setLatency(ms: number): void;
  /**
   * Refuse the next call that matches for budget, before it reaches the provider, as the gateway's reservation does: a
   * budget-exceeded GatewayError with details asking for $0.50 more. Each refusal is used once.
   */
  refuseOnce(match: (call: GatewayCall) => boolean): void;
  calls: GatewayCall[];
  /**
   * A run's gateway calls that returned. On Windows a retried activity can repeat a call whose ledger write failed
   * (the gateway's lock file); counting the calls that returned keeps assertions about the run, not the platform.
   */
  succeeded(runId: string): GatewayCall[];
  start(recipe: Recipe, opts?: Partial<Omit<StartRunInput, 'recipe' | 'workspaceId'>>): Promise<RunRecord>;
  /** Answer checkpoints as they open (default answers unless `answer` says otherwise) until the run ends. */
  drive(runId: string, answer?: Answer, timeoutMs?: number): Promise<RunView>;
  waitFor<T>(what: string, probe: () => Promise<T | undefined | false>, timeoutMs?: number): Promise<T>;
  /**
   * `book: 'store'` only. Stops the worker as byway stops cleanly (scripts/serve.ts's order): the Temporal worker, then
   * its gateways (which hand back the calls they hold), then its store.
   */
  stopWorker(): Promise<void>;
  /** `book: 'store'` only. Starts a new worker in this process: a new store connection, new gateways, the same task queue. */
  startWorker(): Promise<void>;
  /**
   * `book: 'store'` only, with no worker running here. Starts a worker as a process of its own on the same data directory,
   * Temporal server and task queue (worker-process.ts), and resolves once it polls.
   */
  spawnWorkerProcess(extra?: Pick<WorkerProcessOptions, 'boardUrl'>): Promise<WorkerProcess>;
  close(): Promise<void>;
}

export const AUTHOR_DRAFT = '# What the river kept\n\nMara counted the boats each morning, though no one had asked her to. On the ninth day there were eleven.\n';

export const PROBLEM: ProblemBrief = { text: 'A landing page for a neighborhood bakery that delivers sourdough before 7am' };

export function defaultAnswer(cp: CheckpointRecord): CheckpointResolution {
  switch (cp.kind) {
    case 'pick':
      return { checkpointId: cp.id, choice: (cp.options ?? []).slice(0, cp.k ?? 1).map((o) => o.id) };
    case 'select':
      // Every TELLS hit swapped, as the sweep did before hits were chosen one by one (convention C2).
      return { checkpointId: cp.id, choice: (cp.options ?? []).map((o) => o.id) };
    case 'choose':
      return { checkpointId: cp.id, choice: [cp.options![0]!.id] };
    case 'compare':
      return { checkpointId: cp.id, choice: ['B'] };
    case 'confirm':
      return { checkpointId: cp.id, approved: true };
    case 'write':
      return { checkpointId: cp.id, text: cp.initialText?.trim() ? cp.initialText : AUTHOR_DRAFT };
    case 'directive':
      return { checkpointId: cp.id, text: '- Remove the second call to action.' };
    default:
      return { checkpointId: cp.id, text: 'Warmer and plainer, please; avoid jargon.' };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Quiet the SDK: errors only (refused budgets and failed steps are expected here). Installed once per test process, before any worker or server. */
function quietRuntime(): void {
  try {
    Runtime.install({ logger: new DefaultLogger(process.env.BYWAY_TEST_LOG === 'WARN' ? 'WARN' : 'ERROR') });
  } catch {
    // Already installed in this process.
  }
}

export async function createHarness(opts: HarnessOptions = {}): Promise<Harness> {
  quietRuntime();
  const dir = mkdtempSync(path.join(tmpdir(), 'byway-runner-'));
  const store = createTestStore({ dataDir: dir });
  const ws = await store.ensureDefaultWorkspace();
  const responders: Record<string, Responder> = {};
  const calls: GatewayCall[] = [];
  const own = opts.book === 'store';
  /** The worker's store: the harness's own, or (book 'store') a connection of its own, which stopWorker closes. */
  let workerStore: MemoStore = own ? createTestStore({ dataDir: dir }) : store;
  const gatewaysFor = (s: MemoStore): TestGateways =>
    testGateways({
      dir,
      store: s,
      book: opts.book ?? 'memory',
      responders,
      ...(opts.adapters ? { adapters: opts.adapters } : {}),
      ...(opts.leaseMs !== undefined ? { leaseMs: opts.leaseMs } : {}),
      ...(opts.renewEveryMs !== undefined ? { renewEveryMs: opts.renewEveryMs } : {}),
    });
  let gateways = gatewaysFor(workerStore);
  const ledgers = gateways.ledgers;
  let keysOn = false;
  let inner: ModelGateway = gateways.demo;
  let latencyMs = 0;
  const refusals: ((call: GatewayCall) => boolean)[] = [];
  const record = async <T>(kind: GatewayCall['kind'], request: GatewayCall['request'], send: () => Promise<T>): Promise<T> => {
    const call: GatewayCall = { kind, purpose: request.purpose, ...(request.runId ? { runId: request.runId } : {}), ...(request.stepId ? { stepId: request.stepId } : {}), request, at: Date.now() };
    calls.push(call);
    if (latencyMs > 0) await sleep(latencyMs);
    const refusal = refusals.findIndex((m) => m(call));
    if (refusal >= 0) {
      refusals.splice(refusal, 1);
      const err = new GatewayError('budget-exceeded', 'This call would exceed the run budget.');
      err.budget = { scope: 'run', capUsd: 50, spentUsd: 49.9, reservedUsd: 0, estimateUsd: 0.6, shortfallUsd: 0.5 };
      throw err;
    }
    const r = await send();
    call.result = r;
    return r;
  };
  const gateway: Gateway = {
    get demo() {
      return inner.demo;
    },
    complete: (req) => record('complete', req, () => inner.complete(req)),
    image: (req) => record('image', req, () => inner.image(req)),
    video: (req) => record('video', req, () => inner.video(req)),
    spend: (id) => inner.spend(id),
    providers: () => inner.providers(),
    profiles: () => inner.profiles(),
    profileStatus: () => inner.profileStatus(),
    verifyLedger: () => inner.verifyLedger(),
    spendRecords: (id) => inner.spendRecords(id),
    auditLedger: () => inner.auditLedger(),
    close: () => inner.close(),
  };
  const readLedger = (file: string): LedgerEntry[] => {
    try {
      // A line still being appended does not parse yet; it is skipped, as the gateway's own reader does.
      return readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((l) => {
          try {
            return l.trim() ? [JSON.parse(l) as LedgerEntry] : [];
          } catch {
            return [];
          }
        });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  };
  const prompts = opts.prompts ? recordPrompts(opts.prompts) : fakePrompts();
  const pages = fakePages();
  const executable = cachedTemporalExecutable();
  // No port is named, so a second start (startOnceMore, B-117) is on a fresh one: a first that could not bind its port,
  // or missed Temporal's 5 s on a loaded machine, has been killed by Temporal's core.
  const env = await startOnceMore(() => TestWorkflowEnvironment.createLocal(executable ? { server: { executable } } : {}));
  const taskQueue = `runner-test-${path.basename(dir)}`;
  const bundle = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', 'dist', `test-${path.basename(dir)}.js`);
  const workflowsPath = await buildWorkflows({ outfile: bundle });
  let seeds = 0;
  const newWorker = () =>
    createWorker({
      connection: env.nativeConnection,
      taskQueue,
      gateway,
      store: workerStore,
      prompts,
      pages,
      workflowsPath,
      seed: () => `sd${++seeds}x${path.basename(dir).slice(-6)}`,
      ...(opts.shutdownGraceTime ? { shutdownGraceTime: opts.shutdownGraceTime } : {}),
      ...(opts.shutdownForceTime ? { shutdownForceTime: opts.shutdownForceTime } : {}),
    });
  let worker: RunnerWorker;
  try {
    worker = await newWorker();
  } catch (e) {
    await env.teardown();
    throw e;
  }
  let running: Promise<void> | undefined = worker.run();
  const processes: WorkerProcess[] = [];
  const runner = createRunnerClient({ client: env.client, store, taskQueue });
  const storeMode = (what: string) => {
    if (!own) throw new Error(`${what} needs createHarness({ book: 'store' })`);
  };
  const stopWorker = async () => {
    storeMode('stopWorker');
    if (!running) return;
    await worker.shutdown();
    await running.catch(() => undefined);
    running = undefined;
    await gateways.demo.close();
    await gateways.keyed.close();
    workerStore.close();
  };

  const waitFor = async <T>(what: string, probe: () => Promise<T | undefined | false>, timeoutMs = 30_000): Promise<T> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const v = await probe();
      if (v !== undefined && v !== false) return v;
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
      await sleep(20);
    }
  };

  return {
    env,
    store,
    gateway,
    prompts,
    pages,
    worker,
    taskQueue,
    workflowsPath,
    useKeys(on) {
      keysOn = on;
      inner = on ? gateways.keyed : gateways.demo;
    },
    // One ledger with book 'store' (both gateways write it), two otherwise.
    ledger: (runId) => [...new Set([ledgers.demo, ledgers.keyed])].flatMap(readLedger).filter((e) => e.runId === runId),
    runner,
    workspaceId: ws.id,
    responders,
    refuseOnce(match) {
      refusals.push(match);
    },
    setLatency(ms) {
      latencyMs = ms;
    },
    calls,
    succeeded: (runId) => calls.filter((c) => c.runId === runId && c.result !== undefined),
    waitFor,
    start: (recipe, opts = {}) => runner.start({ workspaceId: ws.id, recipe, problem: PROBLEM, profileId: 'demo', budgetUsd: 50, ...opts }),
    async drive(runId, answer = () => undefined, timeoutMs = 120_000) {
      const answered = new Set<string>();
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const run = await store.getRun(runId);
        if (run && (run.status === 'done' || run.status === 'failed' || run.status === 'cancelled')) {
          await env.client.workflow.getHandle(workflowIdFor(runId)).result();
          return runner.view(runId);
        }
        for (const cp of await store.checkpointsForRun(runId)) {
          if (cp.status !== 'open' || answered.has(cp.id)) continue;
          const res = answer(cp) ?? defaultAnswer(cp);
          if (res === 'wait') continue;
          answered.add(cp.id);
          try {
            await runner.resolve(res);
          } catch (e) {
            // A run that ended meanwhile (cancelled, failed) refuses answers; the loop sees it end next.
            if (!(e instanceof ResolutionRejectedError)) throw e;
          }
        }
        if (Date.now() > deadline) {
          const open = (await store.checkpointsForRun(runId)).filter((c) => c.status === 'open').map((c) => `${c.kind} ${c.stepId}`);
          throw new Error(`run ${runId} did not finish (status ${run?.status}; open: ${open.join(', ') || 'none'})`);
        }
        await sleep(15);
      }
    },
    stopWorker,
    async startWorker() {
      storeMode('startWorker');
      if (running) throw new Error('a worker is already running here');
      workerStore = createTestStore({ dataDir: dir });
      gateways = gatewaysFor(workerStore);
      inner = keysOn ? gateways.keyed : gateways.demo;
      worker = await newWorker();
      running = worker.run();
    },
    async spawnWorkerProcess(extra = {}) {
      storeMode('spawnWorkerProcess');
      if (running) throw new Error('stop this process’s worker first: two workers would share the task queue');
      const options: WorkerProcessOptions = {
        address: env.address,
        taskQueue,
        dataDir: dir,
        workflowsPath,
        ...extra,
        ...(opts.leaseMs !== undefined ? { leaseMs: opts.leaseMs } : {}),
        ...(opts.renewEveryMs !== undefined ? { renewEveryMs: opts.renewEveryMs } : {}),
      };
      const file = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'worker-process.ts');
      const child = spawn(process.execPath, [file, JSON.stringify(options)], { stdio: ['ignore', 'pipe', 'pipe'] });
      const output: string[] = [];
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`the worker process was not ready in 60 s:\n${output.join('')}`)), 60_000);
        child.stdout?.on('data', (d: Buffer) => {
          output.push(d.toString());
          if (output.join('').includes('ready')) (clearTimeout(timer), resolve());
        });
        child.stderr?.on('data', (d: Buffer) => output.push(d.toString()));
        child.once('exit', (code) => (clearTimeout(timer), reject(new Error(`the worker process exited with code ${code}:\n${output.join('')}`))));
      });
      const exited = new Promise<void>((r) => child.once('exit', () => r()));
      const handle: WorkerProcess = {
        child,
        async kill() {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
          await exited;
        },
      };
      processes.push(handle);
      return handle;
    },
    async close() {
      // The Temporal server is always stopped, even when the worker did not stop cleanly: it is a child process.
      try {
        for (const p of processes) await p.kill();
        if (running) {
          await worker.shutdown();
          await running.catch(() => undefined);
        }
      } finally {
        await env.teardown();
        if (running || !own) {
          await gateways.demo.close();
          await gateways.keyed.close();
        }
        if (own && running) workerStore.close();
        store.close();
        rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
        rmSync(bundle, { force: true });
      }
    },
  };
}
