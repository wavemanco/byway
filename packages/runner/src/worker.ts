/**
 * The runner worker: it builds the workflow bundle with esbuild (ADR-0070), points Temporal's `workflowsPath` at it,
 * and serves the activities built from the injected gateway, store and prompts.
 */
import { DEFAULT_TEMPORAL_ADDRESS, TASK_QUEUE, type Gateway, type PromptRenderer, type Store } from '@byway/contracts';
import { NativeConnection, Worker } from '@temporalio/worker';
import { createActivities } from './activities/index.ts';
import type { RunnerDeps } from './activities/deps.ts';
import { buildWorkflows } from './build.ts';
import { playwrightPages, type PageRenderer } from './pages.ts';

export interface CreateWorkerOptions {
  gateway: Gateway;
  store: Store;
  /** The prompt templates; @byway/prompts in the product (wired in Phase 3), a fake in tests. */
  prompts: PromptRenderer;
  /** A connection to Temporal; defaults to one to DEFAULT_TEMPORAL_ADDRESS. */
  connection?: NativeConnection;
  namespace?: string;
  taskQueue?: string;
  /** Web-page screenshots; defaults to Playwright Chromium. */
  pages?: PageRenderer;
  /** A prebuilt workflow bundle; by default the worker builds dist/workflows.js first. */
  workflowsPath?: string;
  labelFor?: RunnerDeps['labelFor'];
  seed?: RunnerDeps['seed'];
  random?: RunnerDeps['random'];
}

export interface RunnerWorker {
  worker: Worker;
  /** Runs until shutdown; resolves when the worker has stopped. */
  run(): Promise<void>;
  /** Stop polling, let in-flight activities finish, and close the browser. */
  shutdown(): Promise<void>;
}

export async function createWorker(opts: CreateWorkerOptions): Promise<RunnerWorker> {
  const workflowsPath = opts.workflowsPath ?? (await buildWorkflows());
  const ownConnection = opts.connection ? undefined : await NativeConnection.connect({ address: DEFAULT_TEMPORAL_ADDRESS });
  const connection = opts.connection ?? ownConnection!;
  const pages = opts.pages ?? playwrightPages();
  const ownPages = opts.pages === undefined;
  const deps: RunnerDeps = {
    gateway: opts.gateway,
    store: opts.store,
    prompts: opts.prompts,
    pages,
    ...(opts.labelFor ? { labelFor: opts.labelFor } : {}),
    ...(opts.seed ? { seed: opts.seed } : {}),
    ...(opts.random ? { random: opts.random } : {}),
  };
  const worker = await Worker.create({
    connection,
    namespace: opts.namespace ?? 'default',
    taskQueue: opts.taskQueue ?? TASK_QUEUE,
    workflowsPath,
    activities: createActivities(deps),
  });
  let running: Promise<void> | undefined;
  const cleanup = async () => {
    if (ownPages) await pages.close();
    await ownConnection?.close();
  };
  return {
    worker,
    run() {
      running ??= worker.run().finally(cleanup);
      return running;
    },
    async shutdown() {
      if (worker.getState() === 'RUNNING') worker.shutdown();
      if (running) await running;
      else await cleanup();
    },
  };
}
