/**
 * The runner's activities: every bit of I/O a run does (spec §3: "activities do all I/O"), built from injected
 * dependencies. Errors are translated for the workflow (failures.ts).
 */
import type { RunnerActivities } from '../types.ts';
import { assetStep } from './asset.ts';
import type { RunnerDeps } from './deps.ts';
import { guarded } from './failures.ts';
import { finishHumanStep, openCheckpoint, recordResolution } from './human.ts';
import { beginRun, cancelRun, emitEvents, failRun, finishRun, raiseBudget, rerank, setRunStatus, skipStep } from './lifecycle.ts';
import { modelStep } from './model-step.ts';
import { relayLink, storyboardShots } from './relay.ts';
import { renderView } from './render.ts';

export type { RunnerDeps } from './deps.ts';

export function createActivities(deps: RunnerDeps): RunnerActivities {
  const wrap =
    <I, O>(fn: (deps: RunnerDeps, input: I) => Promise<O>) =>
    (input: I): Promise<O> =>
      guarded(() => fn(deps, input));
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
