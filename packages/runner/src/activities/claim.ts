/**
 * Only a run this byway started is carried out (backlog row B-188). Temporal's port answers any program on the
 * computer, which can start a byway workflow, replay one from its history or reset one to an earlier step. Runner.start
 * keeps a digest of each run's workflow input with its record (start-digest.ts); the run's first step claims the run for
 * its Temporal execution, once, only with an input of that digest, and every later step checks that it runs in the
 * claiming execution. A workflow for a run byway never made, or with another input, stops at its claim; one replayed or
 * reset from outside runs in another execution, so its steps stop here; either way before any paid call, leaving the
 * run as it was. Signals that move no money (pause, resume, cancel) stay possible through the port;
 * a checkpoint's answer is checked apart (answer-check.ts).
 */
import { ApplicationFailure, Context } from '@temporalio/activity';
import { startDigest } from '../start-digest.ts';
import type { RunInput } from '../types.ts';
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

/** The run's first step, before any other: claims the run for this execution with its whole input, or refuses. */
export async function claimRun(deps: RunnerDeps, input: RunInput): Promise<void> {
  const execution = currentExecution();
  if (execution === undefined) return;
  if (!(await deps.store.claimRun(input.runId, startDigest(input), execution))) throw ApplicationFailure.nonRetryable(MESSAGE, NOT_STARTED_HERE);
}

/** Every later step: refuses unless the run was claimed by the execution this step runs in. */
export async function checkClaim(deps: RunnerDeps, runId: string | undefined): Promise<void> {
  const execution = currentExecution();
  if (execution === undefined || runId === undefined) return;
  if ((await deps.store.runClaim(runId)) !== execution) throw ApplicationFailure.nonRetryable(MESSAGE, NOT_STARTED_HERE);
}
