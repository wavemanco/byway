/**
 * How activity errors reach the workflow. Temporal serializes errors, so a GatewayError's code and budget details
 * would be lost as plain text; they travel as typed ApplicationFailures instead. A failure Temporal should not retry
 * (a refused budget, a step whose answer missed its contract twice, a missing prompt) is non-retryable; transient
 * trouble is left to the activity's retry policy.
 */
import { ApplicationFailure } from '@temporalio/common';
import { GatewayError } from '@byway/contracts';
import { FAILURE, type BudgetFailureDetails } from '../types.ts';

/** A step that cannot be done as asked: the run fails with this plain message. */
export class StepError extends Error {
  override name = 'StepError';
}

export function toFailure(err: unknown): unknown {
  if (err instanceof ApplicationFailure) return err;
  if (err instanceof GatewayError) {
    if (err.code === 'budget-exceeded' && err.budget) {
      const details: BudgetFailureDetails = { scope: err.budget.scope, capUsd: err.budget.capUsd, shortfallUsd: err.budget.shortfallUsd };
      return ApplicationFailure.create({ type: FAILURE.budget, message: err.message, nonRetryable: true, details: [details] });
    }
    return ApplicationFailure.create({ type: FAILURE.step, message: err.message, nonRetryable: !err.retryable });
  }
  if (err instanceof StepError) return ApplicationFailure.create({ type: FAILURE.step, message: err.message, nonRetryable: true });
  return err;
}

/** Run an activity body, translating its errors for the workflow. */
export async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toFailure(e);
  }
}
