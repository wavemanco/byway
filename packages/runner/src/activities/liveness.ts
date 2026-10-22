/**
 * Activity liveness (ENG-4, ENG-10). Temporal tells a running activity that it was cancelled (the run was cancelled or
 * failed, or the worker is stopping) only in the reply to a heartbeat, and notices a dead worker only by missed
 * heartbeats. So every activity invocation:
 * - heartbeats while it runs (the long proxies set a heartbeat timeout, so a killed worker's step is retried within
 *   seconds rather than at its 15 or 45 minute limit);
 * - gets its own gateway that refuses new provider calls once the invocation is cancelled or its run has ended;
 * - gets a stop (stopSignal; ADR-0111) that aborts when the cancel means its run is ending, so the gateway cuts off the
 *   calls in flight that it can (Anthropic's, OpenAI's and OpenRouter's streams, fal's queue jobs, the demo's mock),
 *   sends nothing again, and counts what a cut-off call leaves as "may have been billed"; the others finish and are
 *   recorded as usual, and a cancel that does not mean the run is ending (a timeout, a lost or stopping worker, with the
 *   run going) cuts nothing off, so another attempt can take the call over (ADR-0099);
 * - gets page renders that stop when it is cancelled;
 * - and, if it called the gateway for a run that has meanwhile ended, brings that run's cost up to its settled spend when it
 *   finishes: spend that landed after "cancelled" or "failed" still shows on the run, and so in the workspace's total.
 */
import { CancelledFailure, Context } from '@temporalio/activity';
import { ApplicationFailure } from '@temporalio/common';
import type { Gateway, RunStatus, Store } from '@byway/contracts';
import type { PageRenderer } from '../pages.ts';
import { FAILURE } from '../types.ts';

const ENDED: ReadonlySet<RunStatus> = new Set(['done', 'failed', 'cancelled']);

/** How often an invocation heartbeats; the worker sends them on at most every 2 s (worker.ts). */
export const HEARTBEAT_EVERY_MS = 1_000;

/** Why a provider call was not made after a cancel (a CancelledFailure, so Temporal records the activity as cancelled). */
export const CANCELLED_CALL = 'The step was stopped, so no new AI call was made.';
/** Why a provider call was not made for a run that has ended (non-retryable: retrying cannot help). */
export const ENDED_CALL = 'This run has ended, so no new AI call was made.';
/** How a step ends once its run is ending and its calls were stopped (a CancelledFailure, as Temporal records a cancel). */
export const STOPPED_STEP = 'This run was ending, so byway stopped this step and cut off the AI calls it could.';

/**
 * The stop rule (ADR-0111): whether a cancel of this invocation means its run is ending, so its calls are cut off.
 * Temporal's cancel carries a reason (the CancelledFailure that is the signal's reason):
 * - `CANCELLED`: the workflow cancelled the activity's scope. The run workflow has one cancellation scope (run.ts), and
 *   cancels it only on Cancel, on "Stop the run" and on a failure, so the run is ending: the call is cut off. This
 *   reading holds only while the workflow has that one scope (a source test checks it).
 * - anything else (`TIMED_OUT`, `NOT_FOUND` when the workflow closed, `WORKER_SHUTDOWN`, `PAUSED`, `RESET`): cut off
 *   only when the store already shows the run ended. Otherwise nothing is cut off: another attempt takes the call over
 *   (ADR-0099), or byway's clean stop hands it back.
 */
export function cancelEndsRun(reason: unknown): true | 'ask' {
  const name = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : undefined;
  return name === 'CANCELLED' ? true : 'ask';
}

/**
 * A signal that aborts when this invocation's cancel means its run is ending (cancelEndsRun): at once for `CANCELLED`,
 * and for any other reason once `runEnded` says the store shows the run ended. A failed read cuts nothing off. Never
 * aborts without a cancel: undefined outside an activity.
 */
export function stopSignal(cancel: AbortSignal | undefined, runEnded: () => Promise<boolean>): AbortSignal | undefined {
  if (!cancel) return undefined;
  const stop = new AbortController();
  const decide = () => {
    const ends = cancelEndsRun(cancel.reason);
    if (ends === true) return stop.abort(cancel.reason);
    void runEnded().then(
      (ended) => {
        if (ended) stop.abort(cancel.reason);
      },
      () => undefined,
    );
  };
  if (cancel.aborted) decide();
  else cancel.addEventListener('abort', decide, { once: true });
  return stop.signal;
}

/** Whether the store shows a run ended (done, failed or cancelled). */
export async function runHasEnded(store: Pick<Store, 'getRun'>, runId: string | undefined): Promise<boolean> {
  if (!runId) return false;
  const run = await store.getRun(runId);
  return run !== undefined && run !== null && ENDED.has(run.status);
}

export interface Invocation {
  /** Aborted when Temporal cancels this invocation; undefined outside an activity (unit tests call activities directly). */
  signal: AbortSignal | undefined;
  /**
   * Aborted when the invocation ends (stop(), in the activity wrapper's finally), whatever its outcome. The gateway holds
   * a step's settled call until then, while its result is kept (SpendContext.operation.until; ADR-0099).
   */
  done: AbortSignal;
  stop(): void;
}

/** Start heartbeating for the current activity invocation, if there is one. */
export function startInvocation(everyMs = HEARTBEAT_EVERY_MS): Invocation {
  const done = new AbortController();
  let ctx: Context;
  try {
    ctx = Context.current();
  } catch {
    return { signal: undefined, done: done.signal, stop: () => done.abort() };
  }
  const timer = setInterval(() => {
    try {
      ctx.heartbeat();
    } catch {
      // The invocation has already completed.
    }
  }, everyMs);
  return {
    signal: ctx.cancellationSignal,
    done: done.signal,
    stop: () => {
      clearInterval(timer);
      done.abort();
    },
  };
}

export interface GuardedGateway extends Gateway {
  /** Runs (with their workspace) this invocation made provider calls for. */
  readonly calledFor: ReadonlyMap<string, string>;
}

const PROVIDER_CALLS: ReadonlySet<PropertyKey> = new Set(['complete', 'image', 'video']);

/**
 * The gateway as one invocation sees it: `complete`, `image` and `video` first check that the invocation was not
 * cancelled and that the request's run has not ended; everything else passes through.
 */
export function guardGateway(inner: Gateway, store: Pick<Store, 'getRun'>, signal: AbortSignal | undefined): GuardedGateway {
  const calledFor = new Map<string, string>();
  const check = async (req: { runId?: string; workspaceId: string }): Promise<void> => {
    if (signal?.aborted) throw new CancelledFailure(CANCELLED_CALL);
    if (!req.runId) return;
    const run = await store.getRun(req.runId);
    if (run && ENDED.has(run.status)) throw ApplicationFailure.create({ type: FAILURE.step, message: ENDED_CALL, nonRetryable: true });
    if (signal?.aborted) throw new CancelledFailure(CANCELLED_CALL);
    calledFor.set(req.runId, req.workspaceId);
  };
  return new Proxy(inner, {
    get(target, prop) {
      if (prop === 'calledFor') return calledFor;
      const value: unknown = Reflect.get(target, prop, target);
      if (typeof value !== 'function') return value;
      if (!PROVIDER_CALLS.has(prop)) return (value as (...a: unknown[]) => unknown).bind(target);
      return async (req: { runId?: string; workspaceId: string }) => {
        await check(req);
        return (value as (r: unknown) => Promise<unknown>).call(target, req);
      };
    },
  }) as GuardedGateway;
}

/** Page renders and reads that stop (closing the page) when the invocation is cancelled. */
export function guardPages(inner: PageRenderer, signal: AbortSignal | undefined): PageRenderer {
  if (!signal) return inner;
  return {
    screenshots: (html, resolve, opts) => inner.screenshots(html, resolve, { ...opts, signal: opts?.signal ?? signal }),
    render: (html, resolve, surfaces, opts) => inner.render(html, resolve, surfaces, { ...opts, signal: opts?.signal ?? signal }),
    shownText: (html, resolve, opts) => inner.shownText(html, resolve, { ...opts, signal: opts?.signal ?? signal }),
    ready: () => inner.ready(),
    close: () => inner.close(),
  };
}

/**
 * After an invocation: for each run it called the gateway for that has ended, raise the run's cost to its settled spend
 * (never lower it). A run still going records its cost at the end of each step (events.ts recordCost).
 */
export async function settleLateCost(gateway: Pick<Gateway, 'spend'>, store: Pick<Store, 'getRun' | 'updateRun'>, calledFor: ReadonlyMap<string, string>): Promise<void> {
  for (const [runId, workspaceId] of calledFor) {
    const run = await store.getRun(runId);
    if (!run || !ENDED.has(run.status)) continue;
    const ledger = (await gateway.spend(workspaceId)).byRun[runId] ?? 0;
    if (ledger > run.costUsd) await store.updateRun(runId, { costUsd: ledger });
  }
}
