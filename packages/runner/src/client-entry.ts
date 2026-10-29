/**
 * `@byway/runner/client`: what a process that only talks to a running engine needs (spec §2: the web app is a
 * Temporal client). The package's main entry also exports the worker and the dev engine, which pull in
 * `@temporalio/worker`, `@temporalio/testing`, esbuild and Playwright; a Next.js server must not load or bundle any of
 * them, so it imports this entry instead. Nothing imported here (directly or through its imports) may reach those.
 */
import { Client, Connection } from '@temporalio/client';
import { DEFAULT_TEMPORAL_ADDRESS, type Runner, type Store } from '@byway/contracts';
import { createRunnerClient } from './client.ts';

export { createRunnerClient, ResolutionRejectedError, RunStartConflictError, RunStartInvalidError, titleOf, type RunnerClientOptions } from './client.ts';
export { storeCaps } from './caps.ts';
// The web app reads an engine call's failure with these (apps/web/src/services/engine-runner.ts).
export { isTimeout, isTransportFailure } from './start-failure.ts';
export { RUN_WORKFLOW, workflowIdFor } from './types.ts';
// reconcileLostRuns is client-safe too: the e2e suite runs the engine's lost-run pass itself, to check that the runs it
// seeds outlast it (apps/web/e2e/seed.ts).
export { LOST_RUN_MESSAGE, reconcileLostRuns } from './lost-runs.ts';
export { OLDER_VERSION_MESSAGE } from './versioning.ts';

export interface ConnectedRunner {
  runner: Runner;
  close(): Promise<void>;
}

/**
 * A Runner for another process (the web app) talking to a running engine. Defined here, not in dev-engine.ts (which
 * re-exports it), because that module imports the worker and the Temporal test server at load time.
 */
export async function connectRunner(opts: { store: Store; address?: string; namespace?: string }): Promise<ConnectedRunner> {
  const connection = await Connection.connect({ address: opts.address ?? DEFAULT_TEMPORAL_ADDRESS });
  const client = new Client({ connection, namespace: opts.namespace ?? 'default' });
  return { runner: createRunnerClient({ client, store: opts.store }), close: () => connection.close() };
}
