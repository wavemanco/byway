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
 * The same pass also runs every few minutes while the engine runs (dev-engine.ts, reconcileWhilePolling). A workflow
 * closed from outside, or one Temporal closed itself because it passed one of its limits (a payload, a batch of
 * commands or a history too large), never runs its own code again, so nothing in it ends its run: without that pass the
 * run would read "running" or "waiting" until byway next starts. While the engine runs, a start may be under way, so
 * that pass leaves alone a queued run Temporal has no workflow for; a queued run whose workflow has closed is closed
 * (ReconcileOptions.whilePolling). A workflow Temporal keeps running while its workflow task keeps failing (a completion
 * over gRPC's message size, a fault in the workflow code) never moves its run on either: that pass stops it and fails
 * its run plainly (STUCK_TASK_ATTEMPTS).
 *
 * Client-safe: used by the Runner client (web process) as well as the engine.
 */
import { WorkflowNotFoundError } from '@temporalio/common';
import type { Client } from '@temporalio/client';
import { TASK_QUEUE, type Store } from '@byway/contracts';
import { ENDED_STATUSES as ENDED, RUN_WORKFLOW, workflowIdFor } from './types.ts';

/** Shown on a run whose workflow Temporal no longer has, or closed without byway closing the run. */
export const LOST_RUN_MESSAGE = "byway's engine no longer has this run, so it cannot continue. Start it again.";

/** Why the engine terminated a run workflow whose run byway's records do not have (Temporal's terminate reason). */
export const ORPHAN_RUN_MESSAGE = "byway's records do not have this run (its data directory was probably restored from an older backup), so the engine stopped it before it could run another step. Any steps it ran before the restore, and their cost, are not undone.";

/** Shown on a run the pass stopped because the engine failed each time it tried the run's next step. */
export const STUCK_RUN_MESSAGE = "byway's engine failed each time it tried to take this run's next step, so it stopped the run. Start it again.";

/**
 * A workflow task on its fifth try in a row has failed or timed out four times: on byway's engine a failed task is
 * tried again about every 10 s, so that is under a minute of nothing but failures, which a worker restarting or a slow
 * step does not give. The pass runs every five minutes, so a stuck run is caught within about six.
 */
export const STUCK_TASK_ATTEMPTS = 5;

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
 * Says whether it closed the run: false when there is no such run or it had ended already (a workflow that ended it
 * a moment before, while the engine runs, or a Cancel and the pass settling the same run at once). The store ends the
 * run only if it has not ended (Store.endRun), so of two ends written at once, only the first lands and logs its event.
 */
export async function settleLostRun(store: Store, runId: string, outcome: LostRunOutcome): Promise<boolean> {
  if (!(await store.getRun(runId))) return false;
  const ended = await store.endRun(runId, outcome.status === 'cancelled' ? { status: 'cancelled' } : { status: 'failed', error: outcome.error });
  await store.withdrawCheckpoints(runId);
  if (!ended) return false;
  if (outcome.status === 'cancelled') await store.appendEvent({ runId, type: 'run-cancelled', data: {} }, { dedupeKey: `${runId}/run-cancelled` });
  else await store.appendEvent({ runId, type: 'run-failed', data: { error: outcome.error } }, { dedupeKey: `${runId}/run-failed` });
  return true;
}

/**
 * What Temporal has for this run's workflow: none ('absent'), one that has closed, one running whose workflow task has
 * been tried STUCK_TASK_ATTEMPTS times in a row ('stuck'), or one running.
 */
export async function workflowState(client: Client, runId: string): Promise<'absent' | 'closed' | 'stuck' | 'running'> {
  try {
    const d = await client.workflow.getHandle(workflowIdFor(runId)).describe();
    if (d.status.name !== 'RUNNING') return 'closed';
    return (d.raw.pendingWorkflowTask?.attempt ?? 0) >= STUCK_TASK_ATTEMPTS ? 'stuck' : 'running';
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) return 'absent';
    throw e;
  }
}

export interface ReconcileOptions {
  /** The task queue whose run workflows are checked against the store; defaults to byway's (TASK_QUEUE). */
  taskQueue?: string;
  /**
   * The pass runs while the worker polls (the pass the engine repeats sets this; the pass at start does not). Runner.start
   * writes a run as queued before it starts the run's workflow, so then a queued run Temporal has no workflow for may be
   * a start under way rather than a lost run, and is left alone; once its workflow begins, the run reads "running". A
   * queued run whose workflow exists and has closed is closed as any other. At start, byway's app starts after the
   * engine (scripts/serve.ts), so no start of its can be under way, and a run left queued by a start that never
   * reached Temporal is closed there.
   *
   * Only this pass stops a run whose workflow task keeps failing: it counts the tries the worker made while it polled,
   * and the pass at start, before the worker polls, would count tries made before this start, by another bundle.
   */
  whilePolling?: boolean;
}

/** What reconcileLostRuns settled, as run ids. */
export interface Reconciled {
  /** Shown as going by the store, not run by the engine: closed in the store as failed by this pass. */
  lost: string[];
  /** Run by the engine, missing from the store: their workflows were terminated. */
  orphaned: string[];
  /** Run by the engine while its workflow task kept failing (whilePolling only): stopped, and failed in the store. */
  stuck: string[];
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
 * At engine start, before the worker polls: both directions, engine first. Run workflows on the task queue whose run
 * the store does not have are terminated; then runs of these workspaces that the store shows as going but whose
 * workflow is not running are closed in the store. The two sets are disjoint, so the order does not change the result. v1 has one workspace (the Store has no way to list or create others).
 *
 * While the engine runs (whilePolling), workflows move on beside the pass: a run its workflow ends between the
 * listing and the look at Temporal keeps the end its workflow wrote first (settleLostRun reads the run again), and is
 * not counted in `lost`.
 */
export async function reconcileLostRuns(client: Client, store: Store, workspaceIds: readonly string[], opts: ReconcileOptions = {}): Promise<Reconciled> {
  const orphaned = await stopOrphanRuns(client, store, opts.taskQueue ?? TASK_QUEUE);
  const lost: string[] = [];
  const stuck: string[] = [];
  for (const ws of workspaceIds) {
    for (const run of await store.listRuns(ws)) {
      if (ENDED.has(run.status)) continue;
      const state = await workflowState(client, run.id);
      if (state === 'running' || (state === 'stuck' && !opts.whilePolling)) continue;
      if (state === 'absent' && opts.whilePolling && run.status === 'queued') continue;
      if (state === 'stuck') {
        try {
          await client.workflow.getHandle(workflowIdFor(run.id)).terminate(STUCK_RUN_MESSAGE);
        } catch (e) {
          // It closed meanwhile; the run is still settled below if the store shows it as going.
          if (!(e instanceof WorkflowNotFoundError)) throw e;
        }
        if (await settleLostRun(store, run.id, { status: 'failed', error: STUCK_RUN_MESSAGE })) stuck.push(run.id);
        continue;
      }
      if (await settleLostRun(store, run.id, { status: 'failed', error: LOST_RUN_MESSAGE })) lost.push(run.id);
    }
  }
  return { lost, orphaned, stuck };
}
