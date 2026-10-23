/**
 * A composed recipe is admitted again when it starts (F01, ADR-0092): the `ok` stored at compose time is never taken on
 * trust. Start re-runs the composer's checks, as they are now, on the stored recipe under its own id, and recomputes
 * what the screen told the person about it. It refuses (400) a recipe that no longer passes or no longer hashes the
 * same, or was built from one the catalog no longer has; it does not start (409) one whose explanation changed, and
 * stores the new one for the screen to show; an unchanged one starts with the very recipe that was offered, its
 * estimate refreshed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { RecipeRefusedError, type ComposeResult } from '@byway/contracts';
import { c4 } from '@byway/catalog';
import { steps, withHash, type Recipe, type Seq } from '@byway/recipe';
import type { Services } from '../src/services/index.ts';
import { composeIntake, createIntake, HttpError, startRun, type Deps } from '../src/server/api.ts';
import { COMPOSED_CHANGED, COMPOSED_REFUSED } from '../src/view/refusals.ts';
import { testHost, type TestHost } from './fixtures/services.ts';

let current: TestHost | undefined;
afterEach(async () => {
  await current?.dispose();
  current = undefined;
});

async function deps(): Promise<Deps> {
  current = testHost();
  const { host } = current;
  const services: Services = host.services(true);
  const ws = await services.store.ensureDefaultWorkspace();
  return { services, workspaceId: ws.id, profileId: 'demo', heldKeyIn: host.heldKeyIn, questionEstimates: host.questionEstimates, pricesCheckedOn: host.pricesCheckedOn };
}

/** An intake with a composed recipe the demo composer made (ok: true), and that stored result. */
async function composed(d: Deps): Promise<{ intakeId: string; stored: ComposeResult }> {
  const { intakeId } = await createIntake(d, { text: 'Tighten my quarterly memo' });
  await composeIntake(d, intakeId);
  const stored = (await d.services.store.getIntake(intakeId))!.composed!;
  expect(stored.ok).toBe(true);
  return { intakeId, stored };
}

const PRODUCT_PATH = { timeout: 30_000 };

describe('starting a composed recipe admits it again', PRODUCT_PATH, () => {
  it('an unchanged recipe starts with the hash that was offered', async () => {
    const d = await deps();
    const { intakeId, stored } = await composed(d);
    const { runId } = await startRun(d, { intakeId, budgetUsd: 2 });
    expect((await d.services.store.getRun(runId))?.recipeHash).toBe(stored.recipe.hash);
  });

  it('a stored ok recipe that fails the checks as they are now is refused (400), and the intake says so', async () => {
    const d = await deps();
    const { intakeId, stored } = await composed(d);
    // What admission accepted before ADR-0092: a model pass after your words that says it does not write.
    const recipe = structuredClone(stored.recipe) as Recipe;
    const d3 = recipe.stages.find((s) => s.stage === 'D3')!.body as Seq;
    const revise = steps(c4).find(({ step }) => step.id === 'revise')!.step;
    d3.steps.push({ ...revise, id: 'ai-polish', writes: false, produces: [] });
    delete recipe.hash;
    await d.services.store.updateIntake(intakeId, { composed: { ...stored, recipe: withHash(recipe) } });
    await expect(startRun(d, { intakeId, budgetUsd: 2 })).rejects.toMatchObject({ status: 400, code: COMPOSED_REFUSED });
    const after = (await d.services.store.getIntake(intakeId))!.composed!;
    expect(after.ok).toBe(false);
    expect(after.violations.map((v) => v.ruleId)).toEqual(expect.arrayContaining(['ST12', 'PR6', 'COMPOSED-VOICE']));
  });

  it('a recipe that no longer hashes to what was offered is refused (400)', async () => {
    const d = await deps();
    const { intakeId, stored } = await composed(d);
    await d.services.store.updateIntake(intakeId, { composed: { ...stored, recipe: { ...stored.recipe, hash: `sha256:${'0'.repeat(64)}` } } });
    await expect(startRun(d, { intakeId, budgetUsd: 2 })).rejects.toMatchObject({ status: 400, code: COMPOSED_REFUSED });
  });

  it('a recipe built from one byway no longer has is refused (400), asking for a new one; the intake says so', async () => {
    const d = await deps();
    const { intakeId, stored } = await composed(d);
    await d.services.store.updateIntake(intakeId, { composed: { ...stored, nearestRecipeId: 'c0-retired' } });
    const refused = await startRun(d, { intakeId, budgetUsd: 2 }).catch((e: unknown) => e);
    expect(refused).toMatchObject({ status: 400, code: COMPOSED_REFUSED });
    expect((refused as Error).message).toMatch(/Build your own again/);
    const shown = (refused as { body?: { composed?: { ok: boolean; violations: { ruleId: string }[] } } }).body?.composed;
    expect(shown?.ok).toBe(false);
    expect(shown).not.toHaveProperty('recipe');
    // An HttpError is what the route handler (server/deps.ts handle) sends with its status and body; anything else is a 500.
    expect(refused).toBeInstanceOf(HttpError);
    const after = (await d.services.store.getIntake(intakeId))!.composed!;
    expect(after.ok).toBe(false);
    expect(after.violations.map((v) => v.ruleId)).toEqual(['ADMIT-NEAREST']);
    expect(await d.services.store.listRuns(d.workspaceId)).toEqual([]);
  });

  it('a recipe whose explanation changed does not start (409); the intake holds the new one, and the next start runs', async () => {
    const d = await deps();
    const { intakeId, stored } = await composed(d);
    await d.services.store.updateIntake(intakeId, { composed: { ...stored, diff: ['The same steps as Memo Polish.'] } });
    const refused = await startRun(d, { intakeId, budgetUsd: 2 }).catch((e: unknown) => e);
    expect(refused).toMatchObject({ status: 409, code: COMPOSED_CHANGED });
    const shown = (refused as { body?: { composed?: { diff: string[]; ok: boolean } } }).body?.composed;
    expect(shown?.diff).toEqual(stored.diff);
    expect(shown).not.toHaveProperty('recipe');
    expect((await d.services.store.getIntake(intakeId))!.composed!.diff).toEqual(stored.diff);
    const { runId } = await startRun(d, { intakeId, budgetUsd: 2 });
    expect((await d.services.store.getRun(runId))?.recipeHash).toBe(stored.recipe.hash);
  });
});

describe("the engine's own refusal at start (F02, ADR-0092 stage 2)", PRODUCT_PATH, () => {
  it('a recipe the runner refuses (RecipeRefused) is a 400 that says why, and no run exists', async () => {
    const d = await deps();
    const { intakeId } = await composed(d);
    const refusing: Deps = {
      ...d,
      services: {
        ...d.services,
        runner: {
          ...d.services.runner,
          start: async () => {
            throw new RecipeRefusedError('composed-x', ['up to 600 steps can run at once; the engine allows 500']);
          },
        },
      },
    };
    const refused = await startRun(refusing, { intakeId, budgetUsd: 2 }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(HttpError);
    expect(refused).toMatchObject({ status: 400 });
    expect((refused as Error).message).toBe('byway cannot run this recipe: up to 600 steps can run at once; the engine allows 500. Build your own again.');
    expect(await d.services.store.listRuns(d.workspaceId)).toEqual([]);
  });
});
