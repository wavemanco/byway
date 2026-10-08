/**
 * Activity liveness (ENG-4, ENG-10). Temporal tells a running activity that it was cancelled (the run was cancelled or
 * failed, or the worker is stopping) only in the reply to a heartbeat, and notices a dead worker only by missed
 * heartbeats. So every activity invocation:
 * - heartbeats while it runs (the long proxies set a heartbeat timeout, so a killed worker's step is retried within
 *   seconds rather than at its 15 or 45 minute limit);
 * - gets its own gateway that refuses new provider calls once the invocation is cancelled or its run has ended (a call
 *   already in flight finishes and is recorded in the ledger as usual);
 * - gets page renders that stop when it is cancelled;
 * - and, if it called the gateway for a run that has meanwhile ended, brings that run's cost up to the ledger when it
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

export interface Invocation {
  /** Aborted when Temporal cancels this invocation; undefined outside an activity (unit tests call activities directly). */
  signal: AbortSignal | undefined;
  stop(): void;
}

/** Start heartbeating for the current activity invocation, if there is one. */
export function startInvocation(everyMs = HEARTBEAT_EVERY_MS): Invocation {
  let ctx: Context;
  try {
    ctx = Context.current();
  } catch {
    return { signal: undefined, stop: () => undefined };
  }
  const timer = setInterval(() => {
    try {
      ctx.heartbeat();
    } catch {
      // The invocation has already completed.
    }
  }, everyMs);
  return { signal: ctx.cancellationSignal, stop: () => clearInterval(timer) };
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

/** Page renders that stop (closing the page) when the invocation is cancelled. */
export function guardPages(inner: PageRenderer, signal: AbortSignal | undefined): PageRenderer {
  if (!signal) return inner;
  return {
    screenshots: (html, resolve, opts) => inner.screenshots(html, resolve, { ...opts, signal: opts?.signal ?? signal }),
    render: (html, resolve, surfaces, opts) => inner.render(html, resolve, surfaces, { ...opts, signal: opts?.signal ?? signal }),
    close: () => inner.close(),
  };
}

/**
 * After an invocation: for each run it called the gateway for that has ended, raise the run's cost to the ledger's
 * figure (never lower it). A run still going records its cost at the end of each step (events.ts recordCost).
 */
export async function settleLateCost(gateway: Pick<Gateway, 'spend'>, store: Pick<Store, 'getRun' | 'updateRun'>, calledFor: ReadonlyMap<string, string>): Promise<void> {
  for (const [runId, workspaceId] of calledFor) {
    const run = await store.getRun(runId);
    if (!run || !ENDED.has(run.status)) continue;
    const ledger = (await gateway.spend(workspaceId)).byRun[runId] ?? 0;
    if (ledger > run.costUsd) await store.updateRun(runId, { costUsd: ledger });
  }
}
