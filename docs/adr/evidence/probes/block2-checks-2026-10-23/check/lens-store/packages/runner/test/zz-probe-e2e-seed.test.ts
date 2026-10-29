import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { reconcileWhilePolling } from '../src/dev-engine.ts';
import { LOST_RUN_MESSAGE } from '../src/lost-runs.ts';
import { createHarness, type Harness } from './helpers/harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
}, 120_000);
afterAll(async () => {
  await h?.close();
}, 60_000);

describe('probe: a run seeded the way apps/web/e2e/seed.ts seeds one, met by the pass the engine repeats', () => {
  it('is failed and its question withdrawn', async () => {
    // seed.ts newRun + question: a run written as running, with run-started, a step and an open question, no workflow.
    const store = h.store;
    const runId = randomUUID();
    await store.createRun({ id: runId, workspaceId: h.workspaceId, recipeId: 'c1', recipeHash: 'e2e-seeded', profileId: 'demo', title: 'Seeded: pick (F05)', problem: 'Seeded: pick (F05)', medium: 'web-page', budgetUsd: 2, status: 'running' });
    await store.appendEvent({ runId, type: 'run-started', data: { budgetUsd: 2 } });
    const checkpointId = randomUUID();
    await store.appendEvent({ runId, type: 'step-started', stepId: 'e2e-pick', data: { label: 'Your choice', stage: 'D2', actor: 'human' } });
    await store.openCheckpoint({ id: checkpointId, runId, stepId: 'e2e-pick', kind: 'pick', prompt: 'Seeded pick question (do not answer)', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] });
    const settled = await reconcileWhilePolling(h.env.client, h.worker, store);
    const run = await store.getRun(runId);
    const cp = (await store.checkpointsForRun(runId)).find((c) => c.id === checkpointId);
    console.log('PROBE', JSON.stringify({ lost: settled.lost.includes(runId), status: run?.status, error: run?.error, checkpoint: cp?.status }));
    expect(run).toMatchObject({ status: 'failed', error: LOST_RUN_MESSAGE });
    expect(cp?.status).toBe('withdrawn');
  }, 60_000);
});
