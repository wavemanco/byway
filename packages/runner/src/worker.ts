/**
 * The runner worker: it builds the workflow bundle with esbuild (ADR-0070), points Temporal's `workflowsPath` at it,
 * and serves the activities built from the injected gateway and store, and the prompt templates (@byway/prompts unless a
 * test injects its own).
 */
import { DEFAULT_TEMPORAL_ADDRESS, TASK_QUEUE, type Gateway, type PromptRenderer, type Store } from '@byway/contracts';
import { createPromptRenderer } from '@byway/prompts';
import type { Client } from '@temporalio/client';
import type { Duration } from '@temporalio/common';
import { GracefulShutdownPeriodExpiredError, NativeConnection, Worker } from '@temporalio/worker';
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
  /** How long a stopping worker lets steps in flight finish before cancelling them (default 10 s; ENG-10). */
  shutdownGraceTime?: Duration;
  /** When a stopping worker gives up on steps that ignore the cancel (a provider call in flight; default 30 s). */
  shutdownForceTime?: Duration;
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
  /**
   * Stop polling, give in-flight activities the grace time, then cancel them (they stop their renders and make no new
   * provider call), and close the browser. Bounded by the force time: an activity still running then is abandoned,
   * and Temporal retries it on the next start once its heartbeat times out.
   */
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
    shutdownGraceTime: opts.shutdownGraceTime ?? '10 seconds',
    shutdownForceTime: opts.shutdownForceTime ?? '30 seconds',
    // Heartbeats reach the server at least every 2 s, so a cancel reaches a running step within about that.
    maxHeartbeatThrottleInterval: '2 seconds',
    defaultHeartbeatThrottleInterval: '2 seconds',
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
      if (!running) return cleanup();
      try {
        await running;
      } catch (e) {
        // The force time passed with a step still running: it is abandoned (and retried later), as intended. The SDK
        // then also fails to release the worker the abandoned step still holds; the process is about to stop anyway.
        if (!abandoned(e)) throw e;
      }
    },
  };
}

/** The errors a forced shutdown ends with (shutdownForceTime passed with an activity still running). */
function abandoned(e: unknown): boolean {
  if (e instanceof GracefulShutdownPeriodExpiredError) return true;
  return e instanceof Error && e.name === 'IllegalStateError' && /still in use/i.test(e.message);
}
