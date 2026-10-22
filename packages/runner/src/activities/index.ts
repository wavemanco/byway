/**
 * The runner's activities: every bit of I/O a run does (spec §3: "activities do all I/O"), built from injected
 * dependencies. Errors are translated for the workflow (failures.ts).
 *
 * Each invocation runs with liveness (liveness.ts; ENG-4, ENG-10): it heartbeats while it runs, sees a gateway that
 * makes no new provider call once it is cancelled or its run has ended, renders pages that stop when it is cancelled,
 * and afterwards brings an ended run's cost up to the ledger if it spent anything for it. Its calls carry a stop that
 * aborts when the cancel means the run is ending (ADR-0111): the gateway then cuts off the calls it can, and the step
 * ends as cancelled.
 *
 * A step call's provider calls are memoized under its key (memo.ts; ENG-3, ENG-12, convention C5): Temporal's retry
 * of a step whose local work failed, or the same step run again after a budget raise, reuses what it already bought.
 * Each call also carries its operation key and this invocation's signals to the gateway (Temporal's cancel, and the
 * invocation's end): an attempt that overlaps another of the same step waits for that one's result, and a timed-out or
 * dead one's call is taken over, its accepted clips resumed (stage 3; ADR-0099).
 *
 * A decline is asked once more by the gateway, on the same model (ADR-0102). The memo keeps the decline and then the
 * call's outcome, so a step that runs again never buys the declined call again (memo.ts); a step's calls write each
 * decline they meet to the run's events, with what became of the second ask (declines.ts).
 *
 * A step whose pages are drawn with the page renderer's OS sandbox off (the person switched it off in Settings) notes
 * that in the run's events, once per step call (sandbox-note.ts; ADR-0105).
 */
import { CancelledFailure } from '@temporalio/activity';
import type { RunnerActivities } from '../types.ts';
import { assetStep } from './asset.ts';
import type { RunnerDeps } from './deps.ts';
import { logDeclines, stepCallOf } from './declines.ts';
import { guarded } from './failures.ts';
import { finishHumanStep, openCheckpoint, recordResolution } from './human.ts';
import { beginRun, cancelRun, emitEvents, failRun, finishRun, passStep, raiseBudget, rerank, setRunStatus, skipStep } from './lifecycle.ts';
import { guardGateway, guardPages, runHasEnded, settleLateCost, startInvocation, stopSignal, STOPPED_STEP } from './liveness.ts';
import { memoGateway, memoScopeOf } from './memo.ts';
import { modelStep } from './model-step.ts';
import { relayLink, storyboardShots } from './relay.ts';
import { renderView } from './render.ts';
import { watchSandbox } from './sandbox-note.ts';

export type { RunnerDeps } from './deps.ts';

/** An activity input's run, when it names one (`run.runId`, or `runId`). */
function runIdOf(input: unknown): string | undefined {
  const i = input as { run?: { runId?: unknown }; runId?: unknown } | undefined;
  const id = i?.run?.runId ?? i?.runId;
  return typeof id === 'string' ? id : undefined;
}

export function createActivities(deps: RunnerDeps): RunnerActivities {
  const wrap =
    <I, O>(fn: (deps: RunnerDeps, input: I) => Promise<O>) =>
    async (input: I): Promise<O> => {
      const invocation = startInvocation();
      const gateway = guardGateway(deps.gateway, deps.store, invocation.signal);
      const memo = memoScopeOf(input);
      // The run is ending (ADR-0111): set beside `until` and `cancel`, after the request is hashed, so memo keys stay.
      const stop = stopSignal(invocation.signal, () => runHasEnded(deps.store, memo?.runId ?? runIdOf(input)));
      const operation = { until: invocation.done, ...(invocation.signal ? { cancel: invocation.signal } : {}), ...(stop ? { stop } : {}) };
      const memoized = memo ? memoGateway(gateway, deps.store, memo, { operation }) : gateway;
      // Each decline a step's calls meet is written to the run's events (ADR-0102), outside the memo: see declines.ts.
      const step = stepCallOf(input);
      // A step whose pages are drawn with the OS sandbox off says so (ADR-0105): see sandbox-note.ts.
      const watch = deps.pages ? watchSandbox(guardPages(deps.pages, invocation.signal), deps.store, input) : undefined;
      const scoped: RunnerDeps = {
        ...deps,
        gateway: step ? logDeclines(memoized, deps.store, step) : memoized,
        ...(watch ? { pages: watch.pages } : {}),
        ...(invocation.signal ? { signal: invocation.signal } : {}),
      };
      try {
        return await guarded(() => fn(scoped, input));
      } catch (e) {
        // Its run is ending and its calls were stopped: whatever that left the step with, Temporal records a cancel.
        if (stop?.aborted) throw new CancelledFailure(STOPPED_STEP);
        throw e;
      } finally {
        await watch?.settled();
        invocation.stop();
        // Best effort: the step's own outcome stands whether or not the cost could be brought up to date here.
        await settleLateCost(deps.gateway, deps.store, gateway.calledFor).catch(() => undefined);
      }
    };
  return {
    beginRun: wrap(beginRun),
    setRunStatus: wrap(setRunStatus),
    emitEvents: wrap(emitEvents),
    modelStep: wrap(modelStep),
    renderView: wrap(renderView),
    assetStep: wrap(assetStep),
    relayLink: wrap(relayLink),
    storyboardShots: wrap(storyboardShots),
    skipStep: wrap(skipStep),
    passStep: wrap(passStep),
    openCheckpoint: wrap(openCheckpoint),
    recordResolution: wrap(recordResolution),
    finishHumanStep: wrap(finishHumanStep),
    rerank: wrap(rerank),
    raiseBudget: wrap(raiseBudget),
    finishRun: wrap(finishRun),
    failRun: wrap(failRun),
    cancelRun: wrap(cancelRun),
  };
}
