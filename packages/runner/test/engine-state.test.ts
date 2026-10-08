/**
 * Runs the engine can no longer move on end plainly instead of waiting forever, with their questions withdrawn:
 * - OPS-1: the run's workflow is gone (an engine that was not byway's own, a workflow closed from outside);
 * - C7 (ENG-11, RUN-1): the run was started by another workflow bundle, whose history the new code cannot replay.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ResolutionRejectedError } from '../src/client.ts';
import { LOST_RUN_MESSAGE, reconcileLostRuns } from '../src/lost-runs.ts';
import { workflowIdFor } from '../src/types.ts';
import { OLDER_VERSION_MESSAGE, retireStaleRuns } from '../src/versioning.ts';
import { WORKFLOW_HASH_MEMO } from '../src/workflow/version.ts';
import { createHarness, type Harness } from './helpers/harness.ts';
import { tiny } from './helpers/recipes.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
}, 120_000);
afterAll(async () => {
  await h?.close();
}, 60_000);

const openCheckpoint = (runId: string) => h.waitFor('an open checkpoint', async () => (await h.store.checkpointsForRun(runId)).find((c) => c.status === 'open'));
const statusIs = (runId: string, status: string) => h.waitFor(`status ${status}`, async () => (await h.store.getRun(runId))?.status === status);
const handle = (runId: string) => h.env.client.workflow.getHandle(workflowIdFor(runId));

/** A run waiting for a person whose workflow is then closed outside byway (a lost engine, a stray terminate). */
async function waitingThenLost(): Promise<{ runId: string; cpId: string }> {
  const run = await h.start(tiny);
  const cp = await openCheckpoint(run.id);
  await statusIs(run.id, 'waiting');
  await handle(run.id).terminate('closed outside byway');
  return { runId: run.id, cpId: cp.id };
}

async function expectClosed(runId: string, cpId: string, status: 'failed' | 'cancelled', error?: string): Promise<void> {
  const view = await h.runner.view(runId);
  expect(view.run.status).toBe(status);
  if (error) expect(view.run.error).toBe(error);
  expect(view.checkpoints.find((c) => c.id === cpId)?.status).toBe('withdrawn');
  expect(view.events.at(-1)).toMatchObject(status === 'failed' ? { type: 'run-failed', data: { error } } : { type: 'run-cancelled' });
  expect((await h.store.openCheckpoints(h.workspaceId)).some((c) => c.runId === runId)).toBe(false);
}

describe('a run whose workflow is gone (OPS-1)', () => {
  it('an answer is refused with a plain reason, and the run ends as failed', async () => {
    const { runId, cpId } = await waitingThenLost();
    const err = await h.runner.resolve({ checkpointId: cpId, text: 'Good.' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ResolutionRejectedError);
    expect((err as Error).message).toBe(LOST_RUN_MESSAGE);
    await expectClosed(runId, cpId, 'failed', LOST_RUN_MESSAGE);
  }, 60_000);

  it('Cancel always ends it', async () => {
    const { runId, cpId } = await waitingThenLost();
    await h.runner.cancel(runId);
    await expectClosed(runId, cpId, 'cancelled');
  }, 60_000);

  it('Pause on it ends it as failed: it cannot continue', async () => {
    const { runId, cpId } = await waitingThenLost();
    await h.runner.pause(runId);
    await expectClosed(runId, cpId, 'failed', LOST_RUN_MESSAGE);
  }, 60_000);

  it('at engine start, runs the store shows as going but Temporal does not run are failed; live runs are left alone', async () => {
    const ghost = await h.store.createRun({ id: `ghost-${Date.now()}`, workspaceId: h.workspaceId, recipeId: 'tiny', recipeHash: tiny.hash ?? 'sha256:x', profileId: 'demo', title: 'Ghost', problem: 'p', medium: 'prose', budgetUsd: 5, status: 'waiting' });
    const ghostCp = await h.store.openCheckpoint({ id: `${ghost.id}/cp1`, runId: ghost.id, stepId: 'react', kind: 'react', prompt: 'What do you think?' });
    const lost = await waitingThenLost();
    const live = await h.start(tiny);
    await openCheckpoint(live.id);

    const closed = await reconcileLostRuns(h.env.client, h.store, [h.workspaceId]);
    expect(closed).toEqual(expect.arrayContaining([ghost.id, lost.runId]));
    expect(closed).not.toContain(live.id);
    await expectClosed(ghost.id, ghostCp.id, 'failed', LOST_RUN_MESSAGE);
    await expectClosed(lost.runId, lost.cpId, 'failed', LOST_RUN_MESSAGE);
    expect((await h.store.getRun(live.id))?.status).toBe('waiting');

    await h.runner.cancel(live.id);
    await statusIs(live.id, 'cancelled');
  }, 60_000);
});

describe('runs started by another workflow bundle (C7)', () => {
  it('a run records the hash of the workflow bundle it started under', async () => {
    const run = await h.start(tiny);
    await openCheckpoint(run.id);
    expect(h.worker.workflowHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await handle(run.id).describe()).memo?.[WORKFLOW_HASH_MEMO]).toBe(h.worker.workflowHash);
    await h.runner.cancel(run.id);
    await statusIs(run.id, 'cancelled');
  }, 60_000);

  it('a worker on other code ends those waiting runs as failed, plainly, and withdraws their questions', async () => {
    const run = await h.start(tiny);
    const cp = await openCheckpoint(run.id);
    await statusIs(run.id, 'waiting');
    const retire = (hash: string) => retireStaleRuns({ client: h.env.client, store: h.store, taskQueue: h.taskQueue, hash });

    // The same code: nothing to retire.
    expect(await retire(h.worker.workflowHash!)).not.toContain(run.id);
    expect((await h.store.getRun(run.id))?.status).toBe('waiting');

    // Another bundle (byway was updated while the run waited).
    expect(await retire('f'.repeat(64))).toContain(run.id);
    await expectClosed(run.id, cp.id, 'failed', OLDER_VERSION_MESSAGE);
    expect((await handle(run.id).describe()).status.name).toBe('TERMINATED');
    await expect(h.runner.resolve({ checkpointId: cp.id, text: 'Late.' })).rejects.toThrow(/withdrawn/);
    // Cancel on it now does nothing (it has ended).
    await h.runner.cancel(run.id);
    expect((await h.store.getRun(run.id))?.status).toBe('failed');
  }, 60_000);
});
