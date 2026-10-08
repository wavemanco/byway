/**
 * The e2e harness: a local Temporal dev server (the cached CLI, no download), the real gateway in demo mode (the mock
 * provider, no keys, no network), a temp store, the fake prompt renderer and fake pages, and the real worker and
 * Runner client. One per test file; tests within a file run one after another.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { DefaultLogger, Runtime } from '@temporalio/worker';
import type { CheckpointRecord, CheckpointResolution, CompletionRequest, Gateway, ImageRequest, ModelProfile, ProblemBrief, RunRecord, RunView, StartRunInput, VideoRequest } from '@byway/contracts';
import { createGateway, PRICES, PROFILES, type PriceRow, type Responder } from '@byway/gateway';
import type { Recipe } from '@byway/recipe';
import { createStore, type SqliteStore } from '@byway/store';
import { buildWorkflows } from '../../src/build.ts';
import { cachedTemporalExecutable } from '../../src/dev-engine.ts';
import { createRunnerClient, ResolutionRejectedError } from '../../src/client.ts';
import { storeCaps } from '../../src/caps.ts';
import { createWorker, type RunnerWorker } from '../../src/worker.ts';
import { workflowIdFor } from '../../src/types.ts';
import { fakePages, type FakePages } from './fake-pages.ts';
import { fakePrompts, type FakePrompts } from './fake-prompts.ts';

/** A demo profile with no video model: C5 relay links finish as skipped (ADR-0069). */
export const NO_VIDEO_PROFILE: ModelProfile = {
  id: 'demo-novideo',
  label: 'Demo without video',
  tiers: { big: { provider: 'mock', model: 'mock-big' }, mid: { provider: 'mock', model: 'mock-mid' } },
  image: { provider: 'mock', model: 'mock-image' },
};

/** Mock text models with a small price, so costs, cost events and budgets are exercised (the real mock is free). */
const PRICED: PriceRow[] = [
  ...PRICES.filter((p) => !(p.provider === 'mock' && (p.model === 'mock-big' || p.model === 'mock-mid'))),
  { provider: 'mock', model: 'mock-big', inputPerMTok: 0.1, outputPerMTok: 1, source: 'runner tests' },
  { provider: 'mock', model: 'mock-mid', inputPerMTok: 0.1, outputPerMTok: 1, source: 'runner tests' },
];

export interface GatewayCall {
  kind: 'complete' | 'image' | 'video';
  purpose: string;
  runId?: string;
  stepId?: string;
  request: CompletionRequest | ImageRequest | VideoRequest;
}

export type Answer = (cp: CheckpointRecord) => CheckpointResolution | 'wait' | undefined;

export interface Harness {
  env: TestWorkflowEnvironment;
  store: SqliteStore;
  gateway: Gateway;
  prompts: FakePrompts;
  pages: FakePages;
  runner: ReturnType<typeof createRunnerClient>;
  workspaceId: string;
  /** Mock answers by purpose or role; mutable per test. */
  responders: Record<string, Responder>;
  calls: GatewayCall[];
  start(recipe: Recipe, opts?: Partial<Omit<StartRunInput, 'recipe' | 'workspaceId'>>): Promise<RunRecord>;
  /** Answer checkpoints as they open (default answers unless `answer` says otherwise) until the run ends. */
  drive(runId: string, answer?: Answer, timeoutMs?: number): Promise<RunView>;
  waitFor<T>(what: string, probe: () => Promise<T | undefined | false>, timeoutMs?: number): Promise<T>;
  close(): Promise<void>;
}

export const AUTHOR_DRAFT = '# What the river kept\n\nMara counted the boats each morning, though no one had asked her to. On the ninth day there were eleven.\n';

export const PROBLEM: ProblemBrief = { text: 'A landing page for a neighborhood bakery that delivers sourdough before 7am' };

export function defaultAnswer(cp: CheckpointRecord): CheckpointResolution {
  switch (cp.kind) {
    case 'pick':
      return { checkpointId: cp.id, choice: (cp.options ?? []).slice(0, cp.k ?? 1).map((o) => o.id) };
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
    Runtime.install({ logger: new DefaultLogger('ERROR') });
  } catch {
    // Already installed in this process.
  }
}

export async function createHarness(): Promise<Harness> {
  quietRuntime();
  const dir = mkdtempSync(path.join(tmpdir(), 'byway-runner-'));
  const store = createStore({ dataDir: dir });
  const ws = await store.ensureDefaultWorkspace();
  const responders: Record<string, Responder> = {};
  const calls: GatewayCall[] = [];
  const inner = createGateway({
    ledgerPath: path.join(dir, 'ledger.jsonl'),
    artifacts: store.artifacts,
    caps: storeCaps(store),
    demo: true,
    env: {},
    mockResponders: responders,
    profiles: [...PROFILES, NO_VIDEO_PROFILE],
    prices: PRICED,
    retry: { maxAttempts: 1 },
  });
  const record = (kind: GatewayCall['kind'], request: GatewayCall['request']) =>
    calls.push({ kind, purpose: request.purpose, ...(request.runId ? { runId: request.runId } : {}), ...(request.stepId ? { stepId: request.stepId } : {}), request });
  const gateway: Gateway = {
    complete: (req) => (record('complete', req), inner.complete(req)),
    image: (req) => (record('image', req), inner.image(req)),
    video: (req) => (record('video', req), inner.video(req)),
    spend: (id) => inner.spend(id),
    providers: () => inner.providers(),
    profiles: () => inner.profiles(),
    profileStatus: () => inner.profileStatus(),
    verifyLedger: () => inner.verifyLedger(),
  };
  const prompts = fakePrompts();
  const pages = fakePages();
  const executable = cachedTemporalExecutable();
  const env = await TestWorkflowEnvironment.createLocal(executable ? { server: { executable } } : {});
  const taskQueue = `runner-test-${path.basename(dir)}`;
  const bundle = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', 'dist', `test-${path.basename(dir)}.js`);
  const workflowsPath = await buildWorkflows({ outfile: bundle });
  let seeds = 0;
  let worker: RunnerWorker;
  try {
    worker = await createWorker({ connection: env.nativeConnection, taskQueue, gateway, store, prompts, pages, workflowsPath, seed: () => `sd${++seeds}x${path.basename(dir).slice(-6)}` });
  } catch (e) {
    await env.teardown();
    throw e;
  }
  const running = worker.run();
  const runner = createRunnerClient({ client: env.client, store, taskQueue });

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
    runner,
    workspaceId: ws.id,
    responders,
    calls,
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
    async close() {
      await worker.shutdown();
      await running.catch(() => undefined);
      await env.teardown();
      store.close();
      rmSync(dir, { recursive: true, force: true });
      rmSync(bundle, { force: true });
    },
  };
}
