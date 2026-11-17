/**
 * Only a run this byway started is carried out (backlog row B-188). Temporal's port answers any program on the
 * computer, which can start a byway workflow, replay one from its history or reset one to an earlier step. Runner.start
 * keeps a random start token with each run and hands it to the workflow; the run's first step claims the run for its
 * Temporal execution with that token, once, and every later step checks that it runs in the claiming execution. A
 * workflow started, replayed or reset from outside runs in another execution, so its steps stop here, before any paid
 * call, and leave the run as it was. Signals that move no money (pause, resume, cancel) stay possible through the port;
 * a checkpoint's answer is checked apart (answer-check.ts).
 */
import { ApplicationFailure, Context } from '@temporalio/activity';
import type { RunnerDeps } from './deps.ts';

export const NOT_STARTED_HERE = 'RunNotStartedHere';

const MESSAGE =
  'This run was not started by this byway, so its steps are not carried out: a workflow was started, replayed or reset through the engine’s port by another program.';

/** The Temporal execution the current activity runs in, or undefined outside one (the runner's own tests call activities directly). */
export function currentExecution(): string | undefined {
  try {
    return Context.current()?.info?.workflowExecution?.runId;
  } catch {
    return undefined;
  }
}

/** The run's first step, before any other: claims the run for this execution with the run's start token, or refuses. */
export async function claimRun(deps: RunnerDeps, input: { runId: string; startToken: string }): Promise<void> {
  const execution = currentExecution();
  if (execution === undefined) return;
  if (!(await deps.store.claimRun(input.runId, input.startToken, execution))) throw ApplicationFailure.nonRetryable(MESSAGE, NOT_STARTED_HERE);
}

/** Every later step: refuses unless the run was claimed by the execution this step runs in. */
export async function checkClaim(deps: RunnerDeps, runId: string | undefined): Promise<void> {
  const execution = currentExecution();
  if (execution === undefined || runId === undefined) return;
  if ((await deps.store.runClaim(runId)) !== execution) throw ApplicationFailure.nonRetryable(MESSAGE, NOT_STARTED_HERE);
}
