/**
 * The store and the engine agree at start (OPS-1, R4). The store is the authority on which runs exist; the engine
 * (Temporal) is the authority on which of them are still moving. They are written separately, so after an engine whose
 * state was lost, a workflow closed from outside, or a restore that mixed files from different moments, they can
 * disagree in two ways, and each is settled before the worker polls:
 *
 * - The store shows a run as going (queued, running, waiting, paused) whose workflow the engine no longer runs: the
 *   engine's state was lost (a server that was not byway's own, a deleted or older `temporal.sqlite`), the workflow was
 *   closed from outside, or it was retired because it came from an older workflow bundle (C7). Nothing will ever move
 *   such a run on, so it is closed in the store: failed with a plain message (or cancelled, when the person asked to
 *   cancel it), its open questions withdrawn, and its terminal event logged, so "Your turn" and the waiting badge clear.
 * - The engine runs a run workflow whose run the store does not have: `byway.sqlite` came back from a backup older than
 *   `temporal.sqlite`. Such a workflow would make model calls for a run nobody can see, answer or cancel, so its
 *   workflow is terminated before any step of it runs.
 *
 * A third mix, the engine ahead of the store on the same run, is not detected (README "Back up and restore").
 *
 * Client-safe: used by the Runner client (web process) as well as the engine.
 */
import { WorkflowNotFoundError } from '@temporalio/common';
import type { Client } from '@temporalio/client';
import { TASK_QUEUE, type RunStatus, type Store } from '@byway/contracts';
import { RUN_WORKFLOW, workflowIdFor } from './types.ts';

const ENDED: ReadonlySet<RunStatus> = new Set(['done', 'failed', 'cancelled']);

/** Shown on a run whose workflow Temporal no longer has, or closed without byway closing the run. */
export const LOST_RUN_MESSAGE = "byway's engine no longer has this run, so it cannot continue. Start it again.";

/** Why the engine terminated a run workflow whose run byway's records do not have (Temporal's terminate reason). */
export const ORPHAN_RUN_MESSAGE = "byway's records do not have this run (its data directory was probably restored from an older backup), so the engine stopped it before any step ran.";

export type LostRunOutcome = { status: 'failed'; error: string } | { status: 'cancelled' };

/** The prefix workflowIdFor puts before a run id. */
const RUN_PREFIX = workflowIdFor('');

/** The run id a run workflow's id names, or undefined for any other workflow. */
export function runIdOfWorkflow(workflowId: string): string | undefined {
  return workflowId.startsWith(RUN_PREFIX) ? workflowId.slice(RUN_PREFIX.length) : undefined;
}

/**
 * Close a run whose workflow is gone. Idempotent, and a run that already ended keeps its status (its open questions
 * are still withdrawn). The terminal events use the same dedupe keys as the workflow's own, so they are never doubled.
 */
export async function settleLostRun(store: Store, runId: string, outcome: LostRunOutcome): Promise<void> {
  const run = await store.getRun(runId);
  if (!run) return;
  if (!ENDED.has(run.status)) {
    if (outcome.status === 'cancelled') {
      await store.updateRun(runId, { status: 'cancelled' });
    } else {
      await store.updateRun(runId, { status: 'failed', error: outcome.error });
    }
  }
  await store.withdrawCheckpoints(runId);
  if (ENDED.has(run.status)) return;
  if (outcome.status === 'cancelled') await store.appendEvent({ runId, type: 'run-cancelled', data: {} }, { dedupeKey: `${runId}/run-cancelled` });
  else await store.appendEvent({ runId, type: 'run-failed', data: { error: outcome.error } }, { dedupeKey: `${runId}/run-failed` });
}

/** Whether Temporal is still running this run's workflow (false when it has none, or it has closed). */
export async function workflowRunning(client: Client, runId: string): Promise<boolean> {
  try {
    const d = await client.workflow.getHandle(workflowIdFor(runId)).describe();
    return d.status.name === 'RUNNING';
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) return false;
    throw e;
  }
}

export interface ReconcileOptions {
  /** The task queue whose run workflows are checked against the store; defaults to byway's (TASK_QUEUE). */
  taskQueue?: string;
}

/** What reconcileLostRuns settled, as run ids. */
export interface Reconciled {
  /** Shown as going by the store, not run by the engine: closed in the store as failed. */
  lost: string[];
  /** Run by the engine, missing from the store: their workflows were terminated. */
  orphaned: string[];
}

/**
 * Terminate every running run workflow of this task queue whose run the store does not have. Returns their run ids.
 * Safe beside a Runner client starting runs: it writes the run to the store before it starts the workflow.
 */
export async function stopOrphanRuns(client: Client, store: Store, taskQueue: string): Promise<string[]> {
  const stopped: string[] = [];
  const open = client.workflow.list({ query: `WorkflowType = '${RUN_WORKFLOW}' AND ExecutionStatus = 'Running'` });
  for await (const wf of open) {
    const runId = runIdOfWorkflow(wf.workflowId);
    if (wf.taskQueue !== taskQueue || runId === undefined) continue;
    if (await store.getRun(runId)) continue;
    try {
      await client.workflow.getHandle(wf.workflowId, wf.runId).terminate(ORPHAN_RUN_MESSAGE);
    } catch (e) {
      // It closed on its own meanwhile: nothing is left to stop.
      if (e instanceof WorkflowNotFoundError) continue;
      throw e;
    }
    stopped.push(runId);
  }
  return stopped;
}

/**
 * At engine start, before the worker polls: both directions, store first. Runs of these workspaces that the store
 * shows as going but whose workflow is not running are closed in the store; run workflows on the task queue whose run
 * the store does not have are terminated. v1 has one workspace (the Store has no way to list or create others).
 */
export async function reconcileLostRuns(client: Client, store: Store, workspaceIds: readonly string[], opts: ReconcileOptions = {}): Promise<Reconciled> {
  const orphaned = await stopOrphanRuns(client, store, opts.taskQueue ?? TASK_QUEUE);
  const lost: string[] = [];
  for (const ws of workspaceIds) {
    for (const run of await store.listRuns(ws)) {
      if (ENDED.has(run.status)) continue;
      if (await workflowRunning(client, run.id)) continue;
      await settleLostRun(store, run.id, { status: 'failed', error: LOST_RUN_MESSAGE });
      lost.push(run.id);
    }
  }
  return { lost, orphaned };
}
