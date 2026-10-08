/**
 * Activity proxies with timeouts sized to what each does. Refused budgets and steps whose answers missed their
 * contract twice are never retried by Temporal (the workflow decides what happens next); transient failures are.
 *
 * Model and media steps heartbeat while they run (activities/liveness.ts; ENG-4, ENG-10): a worker that died is
 * noticed after the heartbeat timeout, so its step is retried within a minute instead of at its 15 or 45 minute limit,
 * and a cancel reaches the step, which then makes no new provider call.
 */
import { proxyActivities, type ActivityOptions } from '@temporalio/workflow';
import { FAILURE, type RunnerActivities } from '../types.ts';

const retry: ActivityOptions['retry'] = { initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '30 seconds', maximumAttempts: 3, nonRetryableErrorTypes: [FAILURE.budget, FAILURE.step, FAILURE.rejected] };

/** Store reads and writes. */
export const quick = proxyActivities<RunnerActivities>({ startToCloseTimeout: '1 minute', retry: { ...retry, maximumAttempts: 5 } });
/** A long step that has not heartbeated for this long is taken as lost (its worker died) and retried. */
const HEARTBEAT_TIMEOUT = '30 seconds';

/** One or two model calls, or a page render. */
export const model = proxyActivities<RunnerActivities>({ startToCloseTimeout: '15 minutes', heartbeatTimeout: HEARTBEAT_TIMEOUT, retry });
/** Image and video generation, which can take minutes per call. */
export const media = proxyActivities<RunnerActivities>({ startToCloseTimeout: '45 minutes', heartbeatTimeout: HEARTBEAT_TIMEOUT, retry: { ...retry, maximumAttempts: 2 } });
