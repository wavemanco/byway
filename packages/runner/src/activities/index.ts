/**
 * The runner's activities: every bit of I/O a run does (spec §3: "activities do all I/O"), built from injected
 * dependencies. Errors are translated for the workflow (failures.ts).
 *
 * Each invocation runs with liveness (liveness.ts; ENG-4, ENG-10): it heartbeats while it runs, sees a gateway that
 * makes no new provider call once it is cancelled or its run has ended, renders pages that stop when it is cancelled,
 * and afterwards brings an ended run's cost up to the ledger if it spent anything for it.
 *
 * A step call's provider calls are memoized under its key (memo.ts; ENG-3, ENG-12, convention C5): Temporal's retry
 * of a step whose local work failed, or the same step run again after a budget raise, reuses what it already bought.
 */
import type { RunnerActivities } from '../types.ts';
import { assetStep } from './asset.ts';
import type { RunnerDeps } from './deps.ts';
import { guarded } from './failures.ts';
import { finishHumanStep, openCheckpoint, recordResolution } from './human.ts';
import { beginRun, cancelRun, emitEvents, failRun, finishRun, passStep, raiseBudget, rerank, setRunStatus, skipStep } from './lifecycle.ts';
import { guardGateway, guardPages, settleLateCost, startInvocation } from './liveness.ts';
import { memoGateway, memoScopeOf } from './memo.ts';
import { modelStep } from './model-step.ts';
import { relayLink, storyboardShots } from './relay.ts';
import { renderView } from './render.ts';

export type { RunnerDeps } from './deps.ts';

export function createActivities(deps: RunnerDeps): RunnerActivities {
  const wrap =
    <I, O>(fn: (deps: RunnerDeps, input: I) => Promise<O>) =>
    async (input: I): Promise<O> => {
      const invocation = startInvocation();
      const gateway = guardGateway(deps.gateway, deps.store, invocation.signal);
      const memo = memoScopeOf(input);
      const scoped: RunnerDeps = {
        ...deps,
        gateway: memo ? memoGateway(gateway, deps.store, memo) : gateway,
        ...(deps.pages ? { pages: guardPages(deps.pages, invocation.signal) } : {}),
        ...(invocation.signal ? { signal: invocation.signal } : {}),
      };
      try {
        return await guarded(() => fn(scoped, input));
      } finally {
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
