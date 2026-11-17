/**
 * A run is carried out only in the Temporal execution byway started for it (backlog row B-188). Temporal's port answers
 * any program on the computer, which can start a byway workflow, replay one from its history or reset one to an earlier
 * step. Runner.start keeps a digest of each run's workflow input with its record (start-digest.ts); the run's first
 * step claims the run for its Temporal execution, once, only with an input of that digest, and every later step that
 * names its run checks that it runs in the claiming execution. A workflow for a run byway never made, or with another
 * input, stops at its claim; one replayed or reset from outside runs in another execution, so its steps stop here;
 * either way before any paid call. A checkpoint's answer is checked apart (answer-check.ts).
 *
 * What this does not stop (ADR-0117 item 5): the claim binds a step to an execution, not to the code that scheduled it,
 * so a program that polls byway's task queue as a second worker and wins a run's workflow tasks chooses that run's
 * steps; and pause, resume and cancel stay possible through the port. Closing the port itself is being looked at
 * (Temporal's own TLS, the owner's choice of 2026-11-17).
 */
import { ApplicationFailure, Context } from '@temporalio/activity';
import { settleLostRun } from '../lost-runs.ts';
import { startDigest } from '../start-digest.ts';
import { workflowIdFor, type RunInput } from '../types.ts';
import type { RunnerDeps } from './deps.ts';

export const NOT_STARTED_HERE = 'RunNotStartedHere';

const MESSAGE =
  'This run was not started by this byway, so its steps are not carried out: a workflow was started, replayed or reset through the engine’s port by another program.';

/** What the person reads when byway's own workflow for a new run is refused at its claim. */
export const REFUSED_START_MESSAGE = 'byway stopped this run before it spent anything: the engine started it with other settings than byway kept for it. Start it again.';

/** The Temporal workflow execution the current activity runs in, or undefined outside one (the runner's own tests call activities directly). */
function currentWorkflow(): { runId: string; workflowId: string } | undefined {
  try {
    return Context.current()?.info?.workflowExecution;
  } catch {
    return undefined;
  }
}

/** The Temporal execution the current activity runs in, or undefined outside one. */
export const currentExecution = (): string | undefined => currentWorkflow()?.runId;

/** The run's first step, before any other: claims the run for this execution with its whole input, or refuses. */
export async function claimRun(deps: RunnerDeps, input: RunInput): Promise<void> {
  const workflow = currentWorkflow();
  if (workflow === undefined) return;
  if (await deps.store.claimRun(input.runId, startDigest(input), workflow.runId)) return;
  // byway's own workflow for a run it made, refused before anything claimed the run, would leave the run queued until
  // the next lost-run pass: the run fails plainly now. A refused replay, reset or forged workflow leaves the run alone.
  if (workflow.workflowId === workflowIdFor(input.runId) && (await deps.store.runClaim(input.runId)) === undefined && (await deps.store.getRun(input.runId))?.status === 'queued') {
    await settleLostRun(deps.store, input.runId, { status: 'failed', error: REFUSED_START_MESSAGE });
  }
  throw ApplicationFailure.nonRetryable(MESSAGE, NOT_STARTED_HERE);
}

/** Every later step: refuses unless the run was claimed by the execution this step runs in. */
export async function checkClaim(deps: RunnerDeps, runId: string | undefined): Promise<void> {
  const execution = currentExecution();
  if (execution === undefined || runId === undefined) return;
  if ((await deps.store.runClaim(runId)) !== execution) throw ApplicationFailure.nonRetryable(MESSAGE, NOT_STARTED_HERE);
}
