import { describe, expect, it } from 'vitest';
import type { ChooserAnswer } from '@byway/contracts';
import { createDemoAdvisor } from '../src/services/demo/advisor.ts';
import { demoRecipes } from '../src/services/demo/recipes.ts';
import { findClaims } from '../src/view/claims.ts';

const advisor = createDemoAdvisor();
const opts = { workspaceId: 'w', profileId: 'balanced' };

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

  it('falls back to Memo Polish with no clear fit when no question is answered yes', async () => {
    const rec = await advisor.recommend({ text: 'Tidy up my notes for the team' }, opts);
    expect(rec).toMatchObject({ recipeId: 'c4', fit: 'none', composeSuggested: true });
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
  });

  it('prices estimates by profile', async () => {
    const recipe = demoRecipes.get('c1');
    if (!recipe) throw new Error('missing c1');
    const balanced = advisor.estimate(recipe, 'balanced');
    const best = advisor.estimate(recipe, 'best');
    expect(best.highUsd).toBeGreaterThan(balanced.highUsd);
    expect(advisor.estimate(recipe, 'demo')).toMatchObject({ lowUsd: 0, highUsd: 0 });
  });
});

describe('demo advisor: catalog and composing', () => {
  it('presents all eight recipes in plain words, without efficacy claims', () => {
    const catalog = advisor.catalog();
    expect(catalog.map((p) => p.code)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C6a', 'C7']);
    for (const p of catalog) {
      expect(p.stages.length).toBeGreaterThan(0);
      expect(p.stages.flatMap((s) => s.steps).some((s) => s.who === 'you')).toBe(true);
    }
    expect(findClaims(JSON.stringify(catalog))).toEqual([]);
  });

  it('composes a validated recipe labelled "Composed"', async () => {
    const result = await advisor.compose({ text: 'Tidy up my notes for the team' }, opts);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.recipe).toMatchObject({ kind: 'composed', channel: 'workspace' });
    expect(result.recipe.hash).toMatch(/^sha256:/);
    expect(result.label.scope).toBe('Composed');
    expect(advisor.label(result.recipe).scope).toBe('Composed');
    expect(result.nearestRecipeId).toBe('c4');
    expect(result.diff.length).toBeGreaterThan(0);
  });

  it('labels canonical recipes as untested', () => {
    const recipe = demoRecipes.get('c6a');
    if (!recipe) throw new Error('missing c6a');
    expect(advisor.label(recipe)).toMatchObject({ verdict: 'Untested', scope: 'None' });
  });
});
