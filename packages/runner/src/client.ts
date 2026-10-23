/**
 * The Runner contract as a Temporal client (spec §2: the app is a Temporal client). `start` stores the brief once
 * (P2, stored-inputs.ts), writes the RunRecord (with its budget and intake) and starts the run's workflow with the
 * brief's id; `resolve` sends the RESOLVE_UPDATE Update, which the workflow validates against the open checkpoint;
 * cancel, pause and resume are signals; `view` reads the store.
 */
import { randomUUID } from 'node:crypto';
import { WorkflowExecutionAlreadyStartedError, WorkflowUpdateFailedError, type Client } from '@temporalio/client';
import { WorkflowNotFoundError } from '@temporalio/common';
import { CANCEL_SIGNAL, PAUSE_SIGNAL, RecipeRefusedError, RESOLVE_UPDATE, RESUME_SIGNAL, TASK_QUEUE, type CheckpointResolution, type RunRecord, type RunStatus, type RunView, type Runner, type StartRunInput, type Store } from '@byway/contracts';
import { engineProblems, parseRecipe, recipeHash } from '@byway/recipe';
import { LOST_RUN_MESSAGE, settleLostRun } from './lost-runs.ts';
import { startFailureMessage, type WorkflowAfterFailedStart } from './start-failure.ts';
import { BRIEF_MEDIA_TYPE, briefFile } from './stored-inputs.ts';
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

/** A start naming the id of a run in another workspace or from another intake (StartRunInput.runId). */
export class RunStartConflictError extends Error {
  override name = 'RunStartConflictError';
}

/** A start naming a run id that is not a lowercase UUID (StartRunInput.runId). */
export class RunStartInvalidError extends Error {
  override name = 'RunStartInvalidError';
}

/** A run id a caller may choose: a lowercase UUID, as crypto.randomUUID() makes. */
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The code the store's errors carry (StoreError), read by shape: the client does not depend on @byway/store. */
const storeCode = (e: unknown): unknown => (e as { code?: unknown } | null)?.code;

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

  /**
   * The run a start names, when it exists already (a start delivered twice: StartRunInput.runId): the same run if it is
   * in the same workspace, from the same intake, of the same recipe, for the same problem and with the same model
   * profile, else a conflict (as when it is gone: it was there a moment ago). These are what the run record holds and
   * never changes. The recipe is compared by its hash because the app may name a recipe it composed again under the
   * same key ('composed'): a start of another recipe is another start, whatever its id says. The budget (a person can
   * raise it), the routes and the examples are not on the record, so the screen keeps the id only while they are
   * unchanged (startIdentity.ts; ADR-0099).
   */
  const startedBefore = async (input: StartRunInput, id: string, hash: string): Promise<RunRecord> => {
    const existing = await store.getRun(id);
    const same =
      existing !== undefined &&
      existing.workspaceId === input.workspaceId &&
      existing.intakeId === input.intakeId &&
      existing.recipeHash === hash &&
      existing.problem === input.problem.text &&
      existing.profileId === input.profileId;
    if (!existing || !same) {
      throw new RunStartConflictError('This start names a run that was started for another problem or recipe. Start the run again.');
    }
    return existing;
  };

  /**
   * Whether Temporal has a workflow under a run's id, asked after that run's workflow start failed: it 'exists' (the
   * start reached Temporal after all, or another delivery's did), it is 'absent' (the run did not start, and a start
   * that lands later finds the run failed, so its calls are refused), or byway could not ask ('unknown'). This second RPC
   * is made only after a start that failed.
   */
  const workflowAfterFailedStart = async (runId: string): Promise<'exists' | WorkflowAfterFailedStart> => {
    try {
      await handle(runId).describe();
      return 'exists';
    } catch (e) {
      return e instanceof WorkflowNotFoundError ? 'absent' : 'unknown';
    }
  };

  return {
    async start(input: StartRunInput): Promise<RunRecord> {
      if (input.runId !== undefined && !RUN_ID.test(input.runId)) throw new RunStartInvalidError('A run id must be a lowercase UUID.');
      // A recipe that does not parse would only fail inside the workflow; refuse it before a run exists.
      const recipe = parseRecipe(input.recipe);
      const medium = recipe.medium;
      if (!medium) throw new Error(`Recipe "${recipe.id}" names no medium, so it cannot run.`);
      // What the engine cannot run, whoever admitted it (F02): past its limits, a C pick nobody decides, a retrying gate
      // in a fan-out. No product policy here (VOICE, composed limits): that is the advisor's and web start's. It is
      // refused before any run record exists, so a start naming its run id leaves nothing behind.
      const problems = engineProblems(recipe);
      if (problems.length) throw new RecipeRefusedError(recipe.id, problems.map((p) => p.message));
      // The brief is stored once, before the run exists, and the workflow is handed its id (P2, stored-inputs.ts): a
      // write that fails leaves no run behind, and a start sent twice writes the same bytes to the same file.
      const { id: problemId } = await store.artifacts.putText(briefFile(input.problem), BRIEF_MEDIA_TYPE);
      const id = input.runId ?? randomUUID();
      const hash = recipeHash(recipe);
      let record: RunRecord;
      let created = true;
      try {
        record = await store.createRun({
          id,
          workspaceId: input.workspaceId,
          recipeId: recipe.id,
          recipeHash: hash,
          profileId: input.profileId,
          ...(input.intakeId ? { intakeId: input.intakeId } : {}),
          title: titleOf(input.problem.text),
          problem: input.problem.text,
          medium,
          budgetUsd: input.budgetUsd,
          status: 'queued',
        });
      } catch (e) {
        // The store refuses a second run with one id; a caller that named the id gets the first one back instead.
        if (input.runId === undefined || storeCode(e) !== 'already-exists') throw e;
        record = await startedBefore(input, id, hash);
        created = false;
      }
      // Its workflow has ended (Temporal would start a new one under a closed id): the run is as it was left.
      if (!created && ENDED.has(record.status)) return record;
      const args: RunInput = {
        runId: id,
        workspaceId: input.workspaceId,
        recipe,
        problemId,
        profileId: input.profileId,
        budgetUsd: input.budgetUsd,
        medium,
        routes: input.routes ?? {},
        inputs: input.inputs ?? {},
      };
      try {
        await client.workflow.start(RUN_WORKFLOW, { taskQueue, workflowId: workflowIdFor(id), args: [args] });
      } catch (e) {
        // A named run's workflow id is derived from its id, and only a delivery of this same start passes the checks
        // above, so a running execution under it is this run's: another delivery got to Temporal first, whichever of
        // them wrote the run. One workflow, already running; the run must not be marked failed under it.
        if (input.runId !== undefined && e instanceof WorkflowExecutionAlreadyStartedError) return record;
        // A repeated start leaves the run as the first one made it.
        if (!created) throw e;
        // The start may have failed after Temporal accepted it (B1, ADR-0109): its reply timed out, or another delivery's
        // start went through. Whatever ran under this run's workflow id is this run's, so it is left to its workflow.
        const workflow = await workflowAfterFailedStart(id);
        if (workflow === 'exists') return record;
        await store.updateRun(id, { status: 'failed', error: startFailureMessage(e, workflow) });
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
