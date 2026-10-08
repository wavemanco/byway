/**
 * The runner worker: it builds the workflow bundle with esbuild (ADR-0070), points Temporal's `workflowsPath` at it,
 * and serves the activities built from the injected gateway and store, and the prompt templates (@byway/prompts unless a
 * test injects its own).
 */
import { DEFAULT_TEMPORAL_ADDRESS, TASK_QUEUE, type Gateway, type PromptRenderer, type Store } from '@byway/contracts';
import { createPromptRenderer } from '@byway/prompts';
import type { Client } from '@temporalio/client';
import { NativeConnection, Worker } from '@temporalio/worker';
import { createActivities } from './activities/index.ts';
import type { RunnerDeps } from './activities/deps.ts';
import { buildWorkflows, workflowBundleHash } from './build.ts';
import { playwrightPages, type PageRenderer } from './pages.ts';
import { retireStaleRuns } from './versioning.ts';

export interface CreateWorkerOptions {
  gateway: Gateway;
  store: Store;
  /** The prompt templates. Defaults to @byway/prompts (checked when it loads); tests may inject a fake. */
  prompts?: PromptRenderer;
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
  taskQueue: string;
  /** The hash of the workflow bundle this worker runs (C7); undefined for a bundle not built by buildWorkflows. */
  workflowHash: string | undefined;
  /**
   * Before `run()`: terminate and fail the open runs of this task queue that another workflow bundle started (C7).
   * Does nothing when this worker's own hash is unknown. Returns their run ids.
   */
  retireStaleRuns(client: Client): Promise<string[]>;
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
    prompts: opts.prompts ?? createPromptRenderer(),
    pages,
    ...(opts.labelFor ? { labelFor: opts.labelFor } : {}),
    ...(opts.seed ? { seed: opts.seed } : {}),
    ...(opts.random ? { random: opts.random } : {}),
  };
  const taskQueue = opts.taskQueue ?? TASK_QUEUE;
  const workflowHash = workflowBundleHash(workflowsPath);
  const worker = await Worker.create({
    connection,
    namespace: opts.namespace ?? 'default',
    taskQueue,
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
    taskQueue,
    workflowHash,
    retireStaleRuns: async (client) => (workflowHash ? retireStaleRuns({ client, store: opts.store, taskQueue, hash: workflowHash }) : []),
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
