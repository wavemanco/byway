/**
 * Runs the store still shows as going (queued, running, waiting, paused) whose workflow Temporal no longer runs
 * (OPS-1): the engine's state was lost (a server that was not byway's own, a deleted database), the workflow was
 * closed from outside, or it was retired because it came from an older workflow bundle (C7). Nothing will ever move
 * such a run on, so it is closed in the store: failed with a plain message (or cancelled, when the person asked to
 * cancel it), its open questions withdrawn, and its terminal event logged, so "Your turn" and the waiting badge clear.
 *
 * Client-safe: used by the Runner client (web process) as well as the engine.
 */
import { WorkflowNotFoundError } from '@temporalio/common';
import type { Client } from '@temporalio/client';
import type { RunStatus, Store } from '@byway/contracts';
import { workflowIdFor } from './types.ts';

const ENDED: ReadonlySet<RunStatus> = new Set(['done', 'failed', 'cancelled']);

/** Shown on a run whose workflow Temporal no longer has, or closed without byway closing the run. */
export const LOST_RUN_MESSAGE = "byway's engine no longer has this run, so it cannot continue. Start it again.";

export type LostRunOutcome = { status: 'failed'; error: string } | { status: 'cancelled' };

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

/**
 * At engine start: close every run of these workspaces that the store shows as going but whose workflow is not
 * running. Returns the ids it closed.
 */
export async function reconcileLostRuns(client: Client, store: Store, workspaceIds: readonly string[]): Promise<string[]> {
  const closed: string[] = [];
  for (const ws of workspaceIds) {
    for (const run of await store.listRuns(ws)) {
      if (ENDED.has(run.status)) continue;
      if (await workflowRunning(client, run.id)) continue;
      await settleLostRun(store, run.id, { status: 'failed', error: LOST_RUN_MESSAGE });
      closed.push(run.id);
    }
  }
  return closed;
}
