/**
 * Workflow versioning for a local app whose run histories persist (C7, ENG-11, RUN-1). Runs wait days for a person;
 * when byway is updated in between, a waiting run's history no longer replays on the new workflow code (Temporal
 * raises a nondeterminism error on every workflow task), so answers hang and Cancel does nothing. Each run records the
 * hash of the workflow bundle it started under (workflow/version.ts). When the worker starts, before it polls, every
 * open run of its task queue started under another hash, or before hashes were recorded, is terminated and marked
 * failed with a plain message, and its questions are withdrawn.
 *
 * A run that has not yet run a single workflow task has nothing to replay, so it is left to start on the new code.
 */
import type { Client } from '@temporalio/client';
import { WorkflowNotFoundError } from '@temporalio/common';
import type { Store } from '@byway/contracts';
import { settleLostRun } from './lost-runs.ts';
import { RUN_WORKFLOW } from './types.ts';
import { WORKFLOW_HASH_MEMO } from './workflow/version.ts';

/** C7's message, word for word. */
export const OLDER_VERSION_MESSAGE = 'This run was started by an older version of byway and cannot continue. Start it again.';

const RUN_PREFIX = 'byway-run-';

/** A started workflow's first two events (started, first task scheduled): nothing has run yet. */
const NOTHING_RAN = 2;

export interface RetireOptions {
  client: Client;
  store: Store;
  taskQueue: string;
  /** The hash of the bundle the worker runs (build.ts workflowBundleHash). */
  hash: string;
}

/** Terminate and fail every open run of this task queue that another workflow bundle started. Returns their run ids. */
export async function retireStaleRuns(opts: RetireOptions): Promise<string[]> {
  const retired: string[] = [];
  const open = opts.client.workflow.list({ query: `WorkflowType = '${RUN_WORKFLOW}' AND ExecutionStatus = 'Running'` });
  for await (const wf of open) {
    if (wf.taskQueue !== opts.taskQueue || !wf.workflowId.startsWith(RUN_PREFIX)) continue;
    const handle = opts.client.workflow.getHandle(wf.workflowId, wf.runId);
    // The listing's memo can lag the workflow's own; describe reads the current one.
    const d = await handle.describe();
    if (d.status.name !== 'RUNNING') continue;
    const started = d.memo?.[WORKFLOW_HASH_MEMO];
    if (started === opts.hash) continue;
    if (started === undefined && d.historyLength <= NOTHING_RAN) continue;
    try {
      await handle.terminate(OLDER_VERSION_MESSAGE);
    } catch (e) {
      // It closed on its own meanwhile; it is still settled below if the store shows it as going.
      if (!(e instanceof WorkflowNotFoundError)) throw e;
    }
    const runId = wf.workflowId.slice(RUN_PREFIX.length);
    await settleLostRun(opts.store, runId, { status: 'failed', error: OLDER_VERSION_MESSAGE });
    retired.push(runId);
  }
  return retired;
}
