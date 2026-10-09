/**
 * A Runner fake over the real store, for route-handler tests: the real runner needs a Temporal server, and these tests
 * check what the app does with the contract, not how a recipe executes (packages/runner tests that, and the Playwright
 * suite runs the real one end to end). It writes the RunRecord as the Runner client does, opens one route question,
 * validates answers through the store, and applies pause, resume and cancel to the record. A start that names its run
 * (StartRunInput.runId) is kept once, as the Runner client keeps it: the same run back for the same problem, a
 * RunStartConflictError for another.
 */
import { randomUUID } from 'node:crypto';
import type { CheckpointResolution, Runner, RunRecord, RunStatus, RunView, StartRunInput, Store } from '@byway/contracts';
import { recipeHash } from '@byway/recipe';

export interface FakeRunner extends Runner {
  readonly started: StartRunInput[];
}

/** The first question every fixture run asks: a route choice. */
export const FIRST_QUESTION = { kind: 'choose' as const, options: ['seed', 'vision'] };

const ENDED: readonly RunStatus[] = ['done', 'failed', 'cancelled'];

export function fakeRunner(store: Store): FakeRunner {
  const started: StartRunInput[] = [];
  const status = async (runId: string, next: RunStatus, event: 'run-paused' | 'run-resumed' | 'run-cancelled') => {
    const run = await store.getRun(runId);
    if (!run) throw new Error(`There is no run "${runId}".`);
    if (ENDED.includes(run.status)) return;
    await store.updateRun(runId, { status: next });
    await store.appendEvent({ runId, type: event, data: {} });
  };

  return {
    started,
    async start(input: StartRunInput): Promise<RunRecord> {
      const medium = input.recipe.medium;
      if (!medium) throw new Error('The recipe names no medium.');
      const before = input.runId === undefined ? undefined : await store.getRun(input.runId);
      if (before) {
        if (before.workspaceId !== input.workspaceId || before.intakeId !== input.intakeId) throw Object.assign(new Error('another problem'), { name: 'RunStartConflictError' });
        return before;
      }
      started.push(input);
      const run = await store.createRun({
        id: input.runId ?? randomUUID(),
        workspaceId: input.workspaceId,
        recipeId: input.recipe.id,
        recipeHash: recipeHash(input.recipe),
        profileId: input.profileId,
        ...(input.intakeId ? { intakeId: input.intakeId } : {}),
        title: input.problem.text.slice(0, 72),
        problem: input.problem.text,
        medium,
        budgetUsd: input.budgetUsd,
        status: 'waiting',
      });
      await store.appendEvent({ runId: run.id, type: 'run-started', data: { recipeId: run.recipeId, profileId: run.profileId, budgetUsd: run.budgetUsd } });
      await store.openCheckpoint({
        id: randomUUID(),
        runId: run.id,
        stepId: 'entry',
        kind: FIRST_QUESTION.kind,
        prompt: 'Where should this start?',
        options: FIRST_QUESTION.options.map((id) => ({ id, label: id })),
      });
      return run;
    },
    async resolve(resolution: CheckpointResolution): Promise<void> {
      await store.resolveCheckpoint(resolution);
    },
    cancel: (runId) => status(runId, 'cancelled', 'run-cancelled'),
    pause: (runId) => status(runId, 'paused', 'run-paused'),
    resume: (runId) => status(runId, 'running', 'run-resumed'),
    async view(runId: string, afterSeq?: number): Promise<RunView> {
      const run = await store.getRun(runId);
      if (!run) throw new Error(`There is no run "${runId}".`);
      return { run, events: await store.events(runId, afterSeq ?? 0), checkpoints: await store.checkpointsForRun(runId) };
    },
  };
}
