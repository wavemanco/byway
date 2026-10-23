/**
 * Runner.start refuses what the engine cannot run (F02, ADR-0092 stage 2), whoever admitted the recipe: counts past
 * the engine's limits, a C pick nobody can decide and a retrying gate inside a fan-out (G1). It throws RecipeRefused
 * before any run record or workflow exists, and before the brief is stored, so nothing is left "queued" or wedged
 * "running", and nothing is written for it.
 */
import { describe, expect, it, vi } from 'vitest';
import { c1 } from '@byway/catalog';
import { RecipeRefusedError, type Store } from '@byway/contracts';
import { withHash, type Recipe } from '@byway/recipe';
import { createRunnerClient } from '../src/client.ts';

type N = Record<string, any>;

function runner() {
  const createRun = vi.fn(async (r: N) => ({ ...r, createdAt: '2026-10-09T00:00:00.000Z', updatedAt: '2026-10-09T00:00:00.000Z' }));
  const start = vi.fn(async () => undefined);
  // The brief is stored before the run is written (P2): the file's id is all the workflow is handed.
  const putText = vi.fn(async () => ({ id: `sha256:${'b'.repeat(64)}` }));
  const store = { createRun, updateRun: vi.fn(), artifacts: { putText } } as unknown as Store;
  const client = { workflow: { start } } as never;
  return { r: createRunnerClient({ client, store }), createRun, start, putText };
}

const startWith = (recipe: Recipe) => runner().r.start({ workspaceId: 'default', recipe, problem: { text: 'A landing page' }, profileId: 'demo', budgetUsd: 5 });

const variant = (edit: (r: N) => void): Recipe => {
  const r = structuredClone(c1) as N;
  delete r.hash;
  edit(r);
  return withHash(r as Recipe);
};
const d2Candidate = (r: N): N => r.stages[1].body.steps[0].body;

describe('Runner.start refuses what the engine cannot run, before a run exists', () => {
  it.each([
    ['a billion seeded drafts', (r: N) => (r.stages[0].body.n = 1e9), /replicate "seeded-x4"'s count is 1000000000; the engine allows at most 500/],
    ['a C pick with no judge', (r: N) => Object.assign(r.stages[1].body.steps[1], { mode: 'C', actor: 'model' }), /pick "pick-one" chooses by a judge/],
    [
      'G1: a retrying gate inside each-candidate',
      (r: N) =>
        d2Candidate(r).steps.push(
          { op: 'step', id: 'gate-render', role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] },
          { op: 'gate', id: 'g', body: { ...d2Candidate(r).steps[0].body.steps[1], id: 'gate-critic' }, pass: { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }, retry: { stage: 'D1', times: 1 }, onFail: 'human' },
        ),
      /gate "g" retries a stage from inside replicate, each or an audit lens/,
    ],
  ] as [string, (r: N) => void, RegExp][])('%s', async (_name, edit, message) => {
    const { r, createRun, start, putText } = runner();
    const recipe = variant(edit);
    const refused = await r.start({ workspaceId: 'default', recipe, problem: { text: 'A landing page' }, profileId: 'demo', budgetUsd: 5 }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(RecipeRefusedError);
    expect((refused as Error).name).toBe('RecipeRefused');
    expect((refused as RecipeRefusedError).problems).toEqual(expect.arrayContaining([expect.stringMatching(message)]));
    expect(createRun).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    // Nor is anything stored for it: the brief is written only for a start the engine can run (P2).
    expect(putText).not.toHaveBeenCalled();
  });

  it('a catalog recipe starts', async () => {
    await expect(startWith(c1)).resolves.toMatchObject({ recipeId: 'c1', status: 'queued' });
  });
});
