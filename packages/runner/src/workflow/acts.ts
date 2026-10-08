/**
 * Activity proxies with timeouts sized to what each does. Refused budgets and steps whose answers missed their
 * contract twice are never retried by Temporal (the workflow decides what happens next); transient failures are.
 */
import { proxyActivities, type ActivityOptions } from '@temporalio/workflow';
import { FAILURE, type RunnerActivities } from '../types.ts';

const retry: ActivityOptions['retry'] = { initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '30 seconds', maximumAttempts: 3, nonRetryableErrorTypes: [FAILURE.budget, FAILURE.step] };

/** Store reads and writes. */
export const quick = proxyActivities<RunnerActivities>({ startToCloseTimeout: '1 minute', retry: { ...retry, maximumAttempts: 5 } });
/** One or two model calls, or a page render. */
export const model = proxyActivities<RunnerActivities>({ startToCloseTimeout: '15 minutes', retry });
/** Image and video generation, which can take minutes per call. */
export const media = proxyActivities<RunnerActivities>({ startToCloseTimeout: '45 minutes', retry: { ...retry, maximumAttempts: 2 } });
