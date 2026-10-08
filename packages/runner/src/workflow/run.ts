/**
 * The run workflow (spec §2 process model, §3 runs): one Temporal workflow per run. It starts the run, interprets the
 * recipe, and ends it as done, failed or cancelled, while answering four controls:
 * - RESOLVE_UPDATE: a person's answer to an open checkpoint, validated against that checkpoint (stale or mismatched
 *   answers are refused) and recorded in the store before the Update returns;
 * - CANCEL_SIGNAL: stop now, whatever the run is doing (also while paused or waiting);
 * - PAUSE_SIGNAL / RESUME_SIGNAL: stop starting steps (the running ones finish), and start again.
 */
import { ApplicationFailure, CancellationScope, allHandlersFinished, condition, defineSignal, defineUpdate, isCancellation, setHandler, upsertMemo } from '@temporalio/workflow';
import { CANCEL_SIGNAL, PAUSE_SIGNAL, RESOLVE_UPDATE, RESUME_SIGNAL, type CheckpointResolution } from '@byway/contracts';
import { checkResolution } from '@byway/store/resolution';
import type { RunInput } from '../types.ts';
import { quick } from './acts.ts';
import { RunControl } from './control.ts';
import { Interpreter, failureMessage } from './interpreter.ts';
import { WORKFLOW_HASH, WORKFLOW_HASH_MEMO } from './version.ts';

export const resolveUpdate = defineUpdate<void, [CheckpointResolution]>(RESOLVE_UPDATE);
export const cancelSignal = defineSignal(CANCEL_SIGNAL);
export const pauseSignal = defineSignal(PAUSE_SIGNAL);
export const resumeSignal = defineSignal(RESUME_SIGNAL);

export interface RunOutcome {
  status: 'done' | 'failed' | 'cancelled';
  outputArtifactId?: string;
  error?: string;
}

export async function runRecipe(input: RunInput): Promise<RunOutcome> {
  // The bundle this run started under (C7): a worker on other code retires the run instead of failing to replay it.
  upsertMemo({ [WORKFLOW_HASH_MEMO]: WORKFLOW_HASH });
  const control = new RunControl(input.runId);
  const interpreter = new Interpreter(input, control);
  const main = new CancellationScope();

  setHandler(
    resolveUpdate,
    async (res) => {
      const entry = control.pending.get(res.checkpointId);
      if (!entry || entry.recording || entry.resolution) throw ApplicationFailure.nonRetryable(`Checkpoint "${res.checkpointId}" is not waiting for an answer.`, 'StaleResolution');
      const check = checkResolution(entry.cp, res);
      if (!check.ok) throw ApplicationFailure.nonRetryable(check.problem, 'InvalidResolution');
      entry.recording = true;
      try {
        await quick.recordResolution({ runId: input.runId, call: entry.call, resolution: check.resolution });
      } catch (e) {
        entry.recording = false;
        throw e;
      }
      entry.resolution = check.resolution;
    },
    {
      validator: (res) => {
        if (control.finished || control.cancelRequested) throw new Error('This run is no longer running.');
        const id = (res as Partial<CheckpointResolution> | undefined)?.checkpointId;
        const entry = id === undefined ? undefined : control.pending.get(id);
        if (!entry || entry.recording || entry.resolution) throw new Error(`Checkpoint "${String(id)}" is not waiting for an answer: it was answered already or belongs to an earlier step.`);
        const check = checkResolution(entry.cp, res);
        if (!check.ok) throw new Error(check.problem);
      },
    },
  );
  setHandler(cancelSignal, () => {
    control.cancelRequested = true;
    main.cancel();
  });
  setHandler(pauseSignal, () => {
    control.pauseRequested = true;
  });
  setHandler(resumeSignal, () => {
    control.pauseRequested = false;
  });

  // Status and pause bookkeeping is best effort: if its writes ever fail for good, the run still ends with the status
  // its last activity writes, and an unhandled rejection must not wedge the workflow task.
  const loops = control.startLoops().catch(() => undefined);
  const end = async (finish: () => Promise<void>) => {
    control.finished = true;
    await loops;
    await condition(allHandlersFinished);
    await finish();
  };

  try {
    await quick.beginRun({ runId: input.runId, recipeId: input.recipe.id, profileId: input.profileId, budgetUsd: input.budgetUsd });
    if (control.cancelRequested) throw ApplicationFailure.nonRetryable('cancelled', 'Cancelled');
    const ports = await main.run(() => interpreter.runStages());
    if (!ports.artifact) throw new Error('The recipe finished without producing anything to deliver.');
    const outputArtifactId = ports.artifact;
    await end(() => quick.finishRun({ runId: input.runId, workspaceId: input.workspaceId, outputArtifactId }));
    return { status: 'done', outputArtifactId };
  } catch (e) {
    // Stop every candidate still running before the run is closed.
    main.cancel();
    if (control.cancelRequested || isCancellation(e)) {
      await end(() => quick.cancelRun({ runId: input.runId, workspaceId: input.workspaceId }));
      return { status: 'cancelled' };
    }
    const error = failureMessage(e);
    await end(() => quick.failRun({ runId: input.runId, workspaceId: input.workspaceId, error }));
    return { status: 'failed', error };
  }
}
