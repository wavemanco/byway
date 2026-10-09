/**
 * Advisor.admit (ADR-0092): a stored composed recipe is checked again before it runs, with the composer's checks as
 * they are now, under its own id, and what the screen says about it is computed afresh. No model call.
 */
import { describe, expect, it } from 'vitest';
import { c4 } from '@byway/catalog';
import { steps, withHash, type Recipe, type Seq } from '@byway/recipe';
import { AdvisorError } from '../src/index.ts';
import { demoAdvisor, WS } from './helpers.ts';

const MEMO = { text: 'Tighten my quarterly memo: it runs to about 900 words and buries the ask.' };

describe('Advisor.admit', () => {
  it('admits an unchanged composed recipe as compose offered it: same hash, same explanation, no model call', async () => {
    const { advisor, gateway } = demoAdvisor();
    const offered = await advisor.compose(MEMO, WS);
    expect(offered.ok).toBe(true);
    const calls = gateway.calls.length;
    const again = advisor.admit(offered, { problem: MEMO, profileId: 'demo' });
    expect(gateway.calls.length).toBe(calls);
    expect(again.ok).toBe(true);
    expect(again.recipe.hash).toBe(offered.recipe.hash);
    expect(again.recipe.id).toBe(offered.recipe.id);
    expect(again.diff).toEqual(offered.diff);
    expect(again.presentation).toEqual(offered.presentation);
    expect(again.estimate).toEqual(offered.estimate);
  });

  it('refuses a stored recipe the checks refuse now, saying why', async () => {
    const { advisor } = demoAdvisor();
    const offered = await advisor.compose(MEMO, WS);
    const recipe = structuredClone(offered.recipe) as Recipe;
    const revise = steps(c4).find(({ step }) => step.id === 'revise')!.step;
    (recipe.stages.find((s) => s.stage === 'D3')!.body as Seq).steps.push({ ...revise, id: 'ai-polish', writes: false, produces: [] });
    delete recipe.hash;
    const again = advisor.admit({ ...offered, recipe: withHash(recipe) }, { problem: MEMO, profileId: 'demo' });
    expect(again.ok).toBe(false);
    expect(again.violations.map((v) => v.ruleId)).toEqual(expect.arrayContaining(['ST12', 'PR6', 'COMPOSED-VOICE']));
  });

  it('refuses a recipe that no longer hashes to the one offered', async () => {
    const { advisor } = demoAdvisor();
    const offered = await advisor.compose(MEMO, WS);
    const again = advisor.admit({ ...offered, recipe: { ...offered.recipe, hash: `sha256:${'0'.repeat(64)}` } }, { problem: MEMO, profileId: 'demo' });
    expect(again.ok).toBe(false);
    expect(again.violations.map((v) => v.ruleId)).toEqual(['ADMIT-HASH']);
  });

  it('refuses a nearest recipe that is not in the catalog', async () => {
    const { advisor } = demoAdvisor();
    const offered = await advisor.compose(MEMO, WS);
    expect(() => advisor.admit({ ...offered, nearestRecipeId: 'c99' }, { problem: MEMO, profileId: 'demo' })).toThrow(AdvisorError);
  });
});
