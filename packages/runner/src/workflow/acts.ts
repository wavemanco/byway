/**
 * Activity proxies with timeouts sized to what each does. Refused budgets and steps whose answers missed their
 * contract twice are never retried by Temporal (the workflow decides what happens next); transient failures are.
 *
 * Model, image and relay steps heartbeat while they run (activities/liveness.ts; ENG-4, ENG-10): a worker that died is
 * noticed after the heartbeat timeout, so its step is retried within a minute instead of at its own limit, and a cancel
 * reaches the step, which then makes no new provider call.
 *
 * Each step's limit is a backstop (the waits design of 2026-10-22, section 4). Every call a step makes keeps its own
 * model's answer wait, chosen in Settings' "How long to wait for an answer" (the gateway reads it on every call), so a
 * step's limit only ends a step stuck in byway's own code; the heartbeat catches a dead worker, not a hung live one. The
 * owner chose on 2026-10-22 "Relay from your video wait, 24 h elsewhere (Recommended)": "The video (relay) step is sized
 * from your video wait, as your video choice said. Model and image steps get a 24-hour backstop that the per-call waits
 * normally make unnecessary; a stuck step could hold its run up to 24 hours a try (72 for a model step's 3 tries). No
 * healthy step is ever cut short, and no clip is bought twice." The video choice it names, "30 minutes (Recommended)":
 * "Choices 30, 45, 60, 75 with 30 as the default. Block 2 sizes the relay step to the chosen wait (today's 45-minute
 * media step also holds the link call and the frame extraction, so 45 or more would not fit one attempt)." So:
 * - quick: store reads and writes, one minute, five tries;
 * - model: a model step (one or two model calls, a critic's shuffles, a rerank), a page render and a person's step's
 *   finish, 24 hours, three tries;
 * - media: an image (ASSET) step, 24 hours, two tries;
 * - a relay step: its own proxy (relayProxy), whose limit is worked out from the waits read just before it by a quick
 *   step (relayWaits): 5 times the link model's wait (its link call's two asks, as a builder's, with the decline's
 *   retry), plus the video wait, plus 15 minutes for the start frame's upload, the downloads and the frame (relayLimitMs):
 *   two hours at the defaults, six and a half at the longest choices. The step's calls keep that same reading, so its
 *   limit always fits them. Two tries: a second one takes its link answer from the memo and polls its clip by its id.
 */
import { proxyActivities, type ActivityOptions } from '@temporalio/workflow';
import { FAILURE, type RelayWaits, type RunnerActivities } from '../types.ts';

const retry: ActivityOptions['retry'] = { initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '30 seconds', maximumAttempts: 3, nonRetryableErrorTypes: [FAILURE.budget, FAILURE.step, FAILURE.rejected] };

/** A long step that has not heartbeated for this long is taken as lost (its worker died) and retried. */
const HEARTBEAT_TIMEOUT = '30 seconds';
/** The backstop of a model or an image step (see the header). */
const STEP_BACKSTOP = '24 hours';

/** Store reads and writes. */
export const QUICK_OPTIONS: ActivityOptions = { startToCloseTimeout: '1 minute', retry: { ...retry, maximumAttempts: 5 } };
/** A model step, a page render, a person's step's finish. */
export const MODEL_OPTIONS: ActivityOptions = { startToCloseTimeout: STEP_BACKSTOP, heartbeatTimeout: HEARTBEAT_TIMEOUT, retry };
/** An image (ASSET) step, which can take minutes per image. */
export const MEDIA_OPTIONS: ActivityOptions = { startToCloseTimeout: STEP_BACKSTOP, heartbeatTimeout: HEARTBEAT_TIMEOUT, retry: { ...retry, maximumAttempts: 2 } };

/** What a relay step's limit allows beside its calls' waits: the start frame's upload, the clip's and frame's downloads. */
export const RELAY_ALLOWANCE_MS = 15 * 60_000;

/**
 * A relay step's limit, in milliseconds, from the waits read just before it (the waits design, section 4): 5 times the
 * link model's wait, plus the video wait, plus RELAY_ALLOWANCE_MS. At the defaults (15 and 30 minutes) two hours; at the
 * longest choices (60 and 75) six and a half.
 */
export const relayLimitMs = (waits: RelayWaits): number => 5 * waits.linkMs + waits.videoMs + RELAY_ALLOWANCE_MS;

/** A relay step's options, from the waits read just before it. */
export const relayOptions = (waits: RelayWaits): ActivityOptions => ({ startToCloseTimeout: relayLimitMs(waits), heartbeatTimeout: HEARTBEAT_TIMEOUT, retry: { ...retry, maximumAttempts: 2 } });

export const quick = proxyActivities<RunnerActivities>(QUICK_OPTIONS);
export const model = proxyActivities<RunnerActivities>(MODEL_OPTIONS);
export const media = proxyActivities<RunnerActivities>(MEDIA_OPTIONS);

/**
 * The proxy one relay step runs on, its limit worked out from `waits` (relayOptions). Made in the workflow from a
 * recorded activity result, so it is the same on every replay.
 */
export const relayProxy = (waits: RelayWaits): Pick<RunnerActivities, 'relayLink'> => proxyActivities<RunnerActivities>(relayOptions(waits));
