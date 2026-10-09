/**
 * The Runner contract as a Temporal client (spec §2: the app is a Temporal client). `start` writes the RunRecord
 * (with its budget and intake) and starts the run's workflow; `resolve` sends the RESOLVE_UPDATE Update, which the
 * workflow validates against the open checkpoint; cancel, pause and resume are signals; `view` reads the store.
 */
import { randomUUID } from 'node:crypto';
import { WorkflowUpdateFailedError, type Client } from '@temporalio/client';
import { WorkflowNotFoundError } from '@temporalio/common';
import { CANCEL_SIGNAL, PAUSE_SIGNAL, RecipeRefusedError, RESOLVE_UPDATE, RESUME_SIGNAL, TASK_QUEUE, type CheckpointResolution, type RunRecord, type RunStatus, type RunView, type Runner, type StartRunInput, type Store } from '@byway/contracts';
import { engineProblems, parseRecipe, recipeHash } from '@byway/recipe';
import { LOST_RUN_MESSAGE, settleLostRun } from './lost-runs.ts';
import { startFailureMessage } from './start-failure.ts';
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

const ENDED: ReadonlySet<RunStatus> = new Set(['done', 'failed', 'cancelled']);

/** What the app shows for an answer to a question its run withdrew (contracts v4 CheckpointRecord.status). */
const WITHDRAWN = 'This question was withdrawn: its run was cancelled or failed.';

/** A refused answer or a stale checkpoint, in the workflow's own words. */
export class ResolutionRejectedError extends Error {
  override name = 'ResolutionRejectedError';
}

export function createRunnerClient(opts: RunnerClientOptions): Runner {
  const { client, store } = opts;
  const taskQueue = opts.taskQueue ?? TASK_QUEUE;
  const handle = (runId: string) => client.workflow.getHandle(workflowIdFor(runId));

  /**
   * Controls (contracts v4 Runner): an unknown run throws; cancel, pause and resume on a run that has ended do nothing.
   * The store's status settles it first, so a run that ended moments ago is not sent a signal it would only ignore.
   * A run the store shows as going whose workflow Temporal no longer runs (OPS-1) cannot be moved on by anyone: it is
   * closed in the store, as cancelled when the person asked to cancel it and as failed otherwise (lost-runs.ts).
   */
  const signal = async (runId: string, name: string) => {
    const run = await store.getRun(runId);
    if (!run) throw new Error(`There is no run "${runId}".`);
    if (ENDED.has(run.status)) return;
    try {
      await handle(runId).signal(name);
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) throw e;
      await settleLostRun(store, runId, name === CANCEL_SIGNAL ? { status: 'cancelled' } : { status: 'failed', error: LOST_RUN_MESSAGE });
    }
  };

  return {
    async start(input: StartRunInput): Promise<RunRecord> {
      // A recipe that does not parse would only fail inside the workflow; refuse it before a run exists.
      const recipe = parseRecipe(input.recipe);
      const medium = recipe.medium;
      if (!medium) throw new Error(`Recipe "${recipe.id}" names no medium, so it cannot run.`);
      // What the engine cannot run, whoever admitted it (F02): past its limits, a C pick nobody decides, a retrying gate
      // in a fan-out. No product policy here (VOICE, composed limits): that is the advisor's and web start's.
      const problems = engineProblems(recipe);
      if (problems.length) throw new RecipeRefusedError(recipe.id, problems.map((p) => p.message));
      const id = randomUUID();
      const record = await store.createRun({
        id,
        workspaceId: input.workspaceId,
        recipeId: recipe.id,
        recipeHash: recipeHash(recipe),
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
        recipe,
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
        await store.updateRun(id, { status: 'failed', error: startFailureMessage(e) });
        throw e;
      }
      return record;
    },

    async resolve(resolution: CheckpointResolution): Promise<void> {
      const cp = await store.getCheckpoint(resolution.checkpointId);
      if (!cp) throw new ResolutionRejectedError(`There is no checkpoint "${resolution.checkpointId}".`);
      if (cp.status === 'withdrawn') throw new ResolutionRejectedError(WITHDRAWN);
      if (cp.status !== 'open') throw new ResolutionRejectedError(`Checkpoint "${cp.id}" was already answered.`);
      // Answers are accepted while the run is paused (it carries on when resumed), never once it has ended.
      const run = await store.getRun(cp.runId);
      if (!run || ENDED.has(run.status)) throw new ResolutionRejectedError('This run is no longer running.');
      try {
        await handle(cp.runId).executeUpdate(RESOLVE_UPDATE, { args: [resolution] });
      } catch (e) {
        // The workflow's validator (stale or mismatched answers) and handler refusals arrive as the Update's failure.
        if (e instanceof WorkflowUpdateFailedError) throw new ResolutionRejectedError((e.cause as Error | undefined)?.message ?? e.message);
        if (e instanceof WorkflowNotFoundError) {
          // The store says the run is going but Temporal has no running workflow for it: nobody can answer it now.
          await settleLostRun(store, cp.runId, { status: 'failed', error: LOST_RUN_MESSAGE });
          throw new ResolutionRejectedError(LOST_RUN_MESSAGE);
        }
        throw e;
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
