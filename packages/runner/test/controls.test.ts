/**
 * The run's controls through the real workflow: human checkpoints and their validation, pause and resume, cancel
 * (also while paused), budget refusals, routes, SEED and GREAT-mode critics.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RunEvent } from '@byway/contracts';
import { RESOLVE_UPDATE } from '@byway/contracts';
import { OK_FALLBACK_NOTE } from '../src/activities/critic.ts';
import { ResolutionRejectedError } from '../src/client.ts';
import { workflowIdFor } from '../src/types.ts';
import { png } from './helpers/fake-pages.ts';
import { createHarness, type Harness } from './helpers/harness.ts';
import { judged, routed, seeded, threePages, tiny } from './helpers/recipes.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
}, 120_000);
afterAll(async () => {
  await h?.close();
}, 60_000);

const types = (events: RunEvent[]) => events.map((e) => e.type);
const openCheckpoint = (runId: string) => h.waitFor('an open checkpoint', async () => (await h.store.checkpointsForRun(runId)).find((c) => c.status === 'open'));

describe('a run from start to finish', () => {
  it('starts with a queued RunRecord, then runs the steps, waits for a person and ends with the output', async () => {
    const run = await h.start(tiny, { budgetUsd: 12 });
    expect(run).toMatchObject({ recipeId: 'tiny', recipeHash: tiny.hash, medium: 'prose', budgetUsd: 12, status: 'queued' });
    expect(run.title).toMatch(/^A landing page for a neighborhood bakery/);
    const cp = await openCheckpoint(run.id);
    expect(cp).toMatchObject({ kind: 'react', stepId: 'react' });
    await h.waitFor('waiting status', async () => (await h.store.getRun(run.id))?.status === 'waiting');
    const view = await h.drive(run.id);
    expect(view.run.status).toBe('done');
    expect(view.run.outputArtifactId).toMatch(/^sha256:/);
    const ev = types(view.events);
    expect(ev[0]).toBe('run-started');
    expect(ev.at(-1)).toBe('run-finished');
    expect(ev).toContain('checkpoint-opened');
    expect(ev).toContain('checkpoint-resolved');
    expect(view.events.filter((e) => e.type === 'step-started').map((e) => e.stepId)).toEqual(['draft', 'react', 'revise']);
    const finished = view.events.find((e) => e.type === 'run-finished')!;
    expect(finished.data.outputArtifactId).toBe(view.run.outputArtifactId);
    // The fix saw the person's reaction.
    expect(h.prompts.calls.find((c) => c.id === 'product.test.revise')?.slots.taste).toBe('Warmer and plainer, please; avoid jargon.');
    expect(view.run.costUsd).toBeGreaterThan(0);
  }, 60_000);
});
