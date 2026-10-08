import { describe, expect, it } from 'vitest';
import type { ChooserAnswer, RecipePresentation } from '@byway/contracts';
import { walk, type Recipe } from '@byway/recipe';
import { createDemoAdvisor } from '../src/services/demo/advisor.ts';
import { demoRecipes } from '../src/services/demo/recipes.ts';
import { findClaims } from '../src/view/claims.ts';

const advisor = createDemoAdvisor();
const opts = { workspaceId: 'w', profileId: 'balanced' };
const STAGE = { D1: 'Explore', D2: 'Refine', D3: 'Finish' } as const;

/** Every step of the recipe, with its stage and actor (picks too, as the catalog covers them). */
function recipeSteps(recipe: Recipe): Map<string, { stage: string; actor: string }> {
  const out = new Map<string, { stage: string; actor: string }>();
  walk(recipe, (node, _path, stage) => {
    if (node.op === 'step' || node.op === 'pick') out.set(node.id, { stage: STAGE[stage], actor: node.actor });
  });
  return out;
}

function expectCovers(presentation: RecipePresentation, recipe: Recipe): void {
  const steps = recipeSteps(recipe);
  const seen = new Map<string, string>();
  for (const stage of presentation.stages) {
    for (const shown of stage.steps) {
      expect(shown.stepIds.length, `${recipe.id} "${shown.label}" covers no step`).toBeGreaterThan(0);
      const actors = shown.stepIds.map((id) => {
        const step = steps.get(id);
        expect(step, `${recipe.id} "${shown.label}" names unknown step ${id}`).toBeDefined();
        expect(step?.stage, `${recipe.id} ${id} is shown under ${stage.stage}`).toBe(stage.stage);
        expect(seen.has(id), `${recipe.id} ${id} is shown twice`).toBe(false);
        seen.set(id, shown.label);
        return step?.actor;
      });
      const who = actors.includes('human') ? 'you' : actors.includes('model') ? 'ai' : 'tool';
      expect(shown.who, `${recipe.id} "${shown.label}"`).toBe(who);
    }
  }
  expect([...steps.keys()].filter((id) => !seen.has(id)), `${recipe.id} steps not shown`).toEqual([]);
}

describe('demo advisor: chooser', () => {
  it('asks the seven questions of 03, routing in protocol order', () => {
    expect(advisor.questions().map((q) => q.routesTo)).toEqual(['c2', 'c7', 'c5', 'c1', 'c6a', 'c3', 'c6']);
  });

  it.each([
    ['A landing page for my pottery studio in Lisbon', 'c1'],
    ['Twenty names for a budgeting app, so we can choose a direction', 'c2'],
    ['A weekly newsletter series on product management', 'c3'],
    ['A 30-second video ad for our running shoes', 'c5'],
    ['My cover letter for a design job at a museum', 'c6'],
    ['A short story about a lighthouse keeper', 'c6a'],
    ['Review this agent-written pull request; the diff is too big', 'c7'],
  ])('recommends from keywords: %s', async (text, recipeId) => {
    const rec = await advisor.recommend({ text }, opts);
    expect(rec.recipeId).toBe(recipeId);
    expect(rec.fit).not.toBe('none');
    expect(rec.composeSuggested).toBe(false);
  });

  it("falls back to Memo Polish as a partial fit, suggesting a composed recipe, when no question is answered yes (03's fallback)", async () => {
    const rec = await advisor.recommend({ text: 'Tidy up my notes for the team' }, opts);
    expect(rec).toMatchObject({ recipeId: 'c4', fit: 'partial', composeSuggested: true });
    expect(rec.answers.every((a) => !a.answer)).toBe(true);
  });

  it('re-routes deterministically when you flip an answer', async () => {
    const first = await advisor.recommend({ text: 'A landing page and a launch video ad' }, opts);
    expect(first.recipeId).toBe('c5');
    expect(first.alternatives.map((a) => a.recipeId)).toEqual(['c1']);
    const flipped: ChooserAnswer[] = first.answers.map((a) =>
      a.questionId === 'media' ? { ...a, answer: false, confidence: 1, setBy: 'user' } : a,
    );
    const second = await advisor.recommend({ text: 'A landing page and a launch video ad' }, { ...opts, answers: flipped });
    expect(second.recipeId).toBe('c1');
    expect(second.answers.find((a) => a.questionId === 'media')).toMatchObject({ answer: false, setBy: 'user', confidence: 1 });
  });

  it('labels every recommendation honestly and says routing is untested', async () => {
    const rec = await advisor.recommend({ text: 'A landing page' }, opts);
    expect(rec.label).toMatchObject({ verdict: 'Untested', studies: [] });
    expect(rec.routing).toBe('untested');
    expect(rec.estimate.lowUsd).toBeLessThanOrEqual(rec.estimate.highUsd);
    expect(rec.answers).toHaveLength(7);
    expect(rec.why.length).toBeGreaterThan(0);
    expect(rec.recipeHash).toBe(advisor.recipe('c1')?.hash);
  });

  it('prices estimates by profile', () => {
    const recipe = advisor.recipe('c1');
    if (!recipe) throw new Error('missing c1');
    const balanced = advisor.estimate(recipe, 'balanced');
    const best = advisor.estimate(recipe, 'best');
    expect(best.highUsd).toBeGreaterThan(balanced.highUsd);
    expect(advisor.estimate(recipe, 'demo')).toMatchObject({ lowUsd: 0, highUsd: 0 });
  });
});

describe('demo advisor: recipes and presentations', () => {
  it('returns the recipe for each id in its catalog, and nothing for others', () => {
    for (const p of advisor.catalog()) {
      const recipe = advisor.recipe(p.recipeId);
      expect(recipe?.id, p.recipeId).toBe(p.recipeId);
      expect(recipe?.medium).toBe(p.medium);
      expect(recipe?.hash).toMatch(/^sha256:/);
    }
    expect(advisor.recipe('c99')).toBeUndefined();
    // Callers get their own copy.
    const a = advisor.recipe('c4');
    if (a) a.title = 'changed';
    expect(advisor.recipe('c4')?.title).not.toBe('changed');
  });

  it('presents all eight recipes in plain words, without efficacy claims', () => {
    const catalog = advisor.catalog();
    expect(catalog.map((p) => p.code)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C6a', 'C7']);
    for (const p of catalog) {
      expect(p.stages.length).toBeGreaterThan(0);
      expect(p.stages.flatMap((s) => s.steps).some((s) => s.who === 'you')).toBe(true);
    }
    expect(findClaims(JSON.stringify(catalog))).toEqual([]);
  });

  it.each(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c6a', 'c7'])('shows every step of %s exactly once, in its stage, with who does it', (id) => {
    const presentation = advisor.catalog().find((p) => p.recipeId === id);
    const recipe = advisor.recipe(id);
    if (!presentation || !recipe) throw new Error(`missing ${id}`);
    expectCovers(presentation, recipe);
  });

  it('asks for your examples where the canonical recipe takes them', () => {
    const takesRefs = advisor.catalog().filter((p) => advisor.recipe(p.recipeId)?.inputs.includes('refs')).map((p) => p.recipeId);
    expect(takesRefs).toEqual(['c2', 'c3', 'c4', 'c5', 'c6', 'c6a', 'c7']);
  });
});

describe('demo advisor: composing', () => {
  it('composes a validated recipe labelled "Composed" whose presentation still covers every step', async () => {
    const result = await advisor.compose({ text: 'Tidy up my notes for the team' }, opts);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.recipe).toMatchObject({ kind: 'composed', channel: 'workspace' });
    expect(result.recipe.hash).toMatch(/^sha256:/);
    expect(result.label.scope).toBe('Composed');
    expect(advisor.label(result.recipe).scope).toBe('Composed');
    expect(result.nearestRecipeId).toBe('c4');
    expect(result.diff.length).toBeGreaterThan(0);
    expect(result.presentation.recipeId).toBe(result.recipe.id);
    expectCovers(result.presentation, result.recipe);
    // The composed recipe is not in the catalog: only its intake knows it.
    expect(advisor.recipe(result.recipe.id)).toBeUndefined();
  });

  it('labels canonical recipes as untested', () => {
    const recipe = demoRecipes.get('c6a');
    if (!recipe) throw new Error('missing c6a');
    expect(advisor.label(recipe)).toMatchObject({ verdict: 'Untested', scope: 'None' });
  });
});
