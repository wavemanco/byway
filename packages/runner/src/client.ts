/**
 * The Runner contract as a Temporal client (spec §2: the app is a Temporal client). `start` writes the RunRecord
 * (with its budget and intake) and starts the run's workflow; `resolve` sends the RESOLVE_UPDATE Update, which the
 * workflow validates against the open checkpoint; cancel, pause and resume are signals; `view` reads the store.
 */
import { randomUUID } from 'node:crypto';
import { WorkflowUpdateFailedError, type Client } from '@temporalio/client';
import { WorkflowNotFoundError } from '@temporalio/common';
import { CANCEL_SIGNAL, PAUSE_SIGNAL, RESOLVE_UPDATE, RESUME_SIGNAL, TASK_QUEUE, type CheckpointResolution, type RunRecord, type RunView, type Runner, type StartRunInput, type Store } from '@byway/contracts';
import { recipeHash } from '@byway/recipe';
import { RUN_WORKFLOW, workflowIdFor, type RunInput } from './types.ts';

export interface RunnerClientOptions {
  client: Client;
  store: Store;
  taskQueue?: string;
}

/** A run title from the problem: its first line, cut at a word near 72 characters. */
export function titleOf(text: string): string {
  const line = text.trim().split('\n')[0]?.replace(/\s+/g, ' ').trim() ?? '';
  if (line.length <= 72) return line || 'Untitled run';
  return `${line.slice(0, 72).replace(/\s+\S*$/, '')}…`;
}

/** A refused answer or a stale checkpoint, in the workflow's own words. */
export class ResolutionRejectedError extends Error {
  override name = 'ResolutionRejectedError';
}

export function createRunnerClient(opts: RunnerClientOptions): Runner {
  const { client, store } = opts;
  const taskQueue = opts.taskQueue ?? TASK_QUEUE;
  const handle = (runId: string) => client.workflow.getHandle(workflowIdFor(runId));

  /** Signals to a run that has already ended are no-ops; to a run that never existed, an error. */
  const signal = async (runId: string, name: string) => {
    if (!(await store.getRun(runId))) throw new Error(`There is no run "${runId}".`);
    try {
      await handle(runId).signal(name);
    } catch (e) {
      if (e instanceof WorkflowNotFoundError) return;
      throw e;
    }
  };

  return {
    async start(input: StartRunInput): Promise<RunRecord> {
      const medium = input.recipe.medium;
      if (!medium) throw new Error(`Recipe "${input.recipe.id}" names no medium, so it cannot run.`);
      const id = randomUUID();
      const record = await store.createRun({
        id,
        workspaceId: input.workspaceId,
        recipeId: input.recipe.id,
        recipeHash: input.recipe.hash ?? recipeHash(input.recipe),
        profileId: input.profileId,
        ...(input.intakeId ? { intakeId: input.intakeId } : {}),
        title: titleOf(input.problem.text),
        problem: input.problem.text,
        medium,
        budgetUsd: input.budgetUsd,
        status: 'queued',
      });
      const args: RunInput = {
        runId: id,
        workspaceId: input.workspaceId,
        recipe: input.recipe,
        problem: input.problem,
        profileId: input.profileId,
        budgetUsd: input.budgetUsd,
        medium,
        routes: input.routes ?? {},
        inputs: input.inputs ?? {},
      };
      try {
        await client.workflow.start(RUN_WORKFLOW, { taskQueue, workflowId: workflowIdFor(id), args: [args] });
      } catch (e) {
        await store.updateRun(id, { status: 'failed', error: `The run could not be started: ${(e as Error).message}` });
        throw e;
      }
      return record;
    },

    async resolve(resolution: CheckpointResolution): Promise<void> {
      const cp = await store.getCheckpoint(resolution.checkpointId);
      if (!cp) throw new ResolutionRejectedError(`There is no checkpoint "${resolution.checkpointId}".`);
      if (cp.status !== 'open') throw new ResolutionRejectedError(`Checkpoint "${cp.id}" was already answered.`);
      try {
        await handle(cp.runId).executeUpdate(RESOLVE_UPDATE, { args: [resolution] });
      } catch (e) {
        if (e instanceof WorkflowUpdateFailedError) throw new ResolutionRejectedError((e.cause as Error | undefined)?.message ?? e.message);
        if (e instanceof WorkflowNotFoundError) throw new ResolutionRejectedError('This run is no longer running.');
        // A validator's rejection arrives as the Update's failure.
        const cause = (e as { cause?: { message?: string } }).cause;
        throw new ResolutionRejectedError(cause?.message ?? (e as Error).message);
      }
    },

    cancel: (runId) => signal(runId, CANCEL_SIGNAL),
    pause: (runId) => signal(runId, PAUSE_SIGNAL),
    resume: (runId) => signal(runId, RESUME_SIGNAL),

    async view(runId: string, afterSeq?: number): Promise<RunView> {
      const run = await store.getRun(runId);
      if (!run) throw new Error(`There is no run "${runId}".`);
      const [events, checkpoints] = await Promise.all([store.events(runId, afterSeq ?? 0), store.checkpointsForRun(runId)]);
      return { run, events, checkpoints };
    },
  };
}
