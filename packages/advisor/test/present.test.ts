import { c1, c4, c5, c6a, PROTOCOL_CONFIGS, presentationOf, presentedStepFor } from '@byway/catalog';
import { withHash, type Recipe } from '@byway/recipe';
import { describe, expect, it } from 'vitest';
import { diffFromNearest, nodeIds, presentComposed, stepLabel } from '../src/index.ts';

const COPY = { code: 'X (composed)', name: 'Your recipe', promise: 'Not tested.', bestFor: ['Your problem'] };
const asComposed = (r: Recipe): Recipe => withHash({ ...r, id: `composed-${r.id}`, kind: 'composed', channel: 'workspace' });
const shownIds = (r: Recipe) => presentComposed(r, COPY).stages.flatMap((s) => s.steps.flatMap((x) => x.stepIds));

describe('presentComposed: any recipe in plain words', () => {
  it.each(PROTOCOL_CONFIGS.map((r) => [r.id, r]))('%s: every step, pick and operator id is shown exactly once', (_id, recipe) => {
    const ids = shownIds(asComposed(recipe));
    expect([...ids].sort()).toEqual([...new Set(nodeIds(recipe))].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(PROTOCOL_CONFIGS.map((r) => [r.id, r]))('%s: stages run Explore, Refine, Finish in recipe order, each with who does it', (_id, recipe) => {
    const p = presentComposed(asComposed(recipe), COPY);
    const order = ['Explore', 'Refine', 'Finish'];
    const stages = p.stages.map((s) => s.stage);
    expect(stages).toEqual([...stages].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    expect(new Set(stages).size).toBe(stages.length);
    for (const s of p.stages.flatMap((x) => x.steps)) {
      expect(['you', 'ai', 'tool']).toContain(s.who);
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.explainer).toMatch(/\.$/);
    }
  });

  it('groups like the catalog: a render with its reader, a fix with the critique it applies', () => {
    const p = presentComposed(asComposed(c1), COPY);
    const steps = p.stages.flatMap((s) => s.steps);
    const critique = steps.find((s) => s.stepIds.includes('critic'))!;
    expect(critique).toMatchObject({ label: 'Outside critique', who: 'ai' });
    expect(critique.stepIds).toEqual(expect.arrayContaining(['render', 'critic', 'critic-fix']));
    const trim = steps.find((s) => s.stepIds.includes('cut'))!;
    expect(trim).toMatchObject({ label: 'Trim', who: 'you' });
    expect(trim.stepIds).toEqual(['cut-render', 'cut', 'apply-cut']);
    expect(steps.find((s) => s.stepIds.includes('voice'))).toMatchObject({ label: 'Your words', who: 'you' });
    expect(steps.find((s) => s.stepIds.includes('pick-one'))).toMatchObject({ label: 'Pick one', who: 'you' });
  });

  it("labels a loop's events with the step its rounds begin with", () => {
    const p = presentComposed(asComposed(c6a), COPY);
    expect(presentedStepFor(p, 'author-loop')).toMatchObject({ label: 'Your draft', who: 'you', stage: 'Refine' });
    expect(presentedStepFor(p, 'cut-marks')).toMatchObject({ label: 'Trim marks', who: 'ai' });
  });

  it('labels C5 motion and defect checks plainly', () => {
    const steps = presentComposed(asComposed(c5), COPY).stages.flatMap((s) => s.steps);
    expect(steps.find((s) => s.stepIds.includes('clip'))?.label).toBe('Motion');
    expect(steps.find((s) => s.stepIds.includes('shot-check'))?.label).toBe('Defect check');
    expect(steps.find((s) => s.stepIds.includes('regenerate'))?.stepIds).toContain('shot-check');
  });

  it('uses the copy it is given, never the model-written title', () => {
    const p = presentComposed(withHash({ ...asComposed(c4), title: 'The proven memo recipe' }), COPY);
    expect(p).toMatchObject({ recipeId: 'composed-c4', code: 'X (composed)', name: 'Your recipe', promise: 'Not tested.', medium: 'prose', bestFor: ['Your problem'] });
  });

  it('names steps from block names and roles', () => {
    expect(stepLabel({ op: 'pick', id: 'p', mode: 'H', k: 3, actor: 'human' })).toBe('Pick 3');
    expect(stepLabel({ op: 'step', id: 's', role: 'seed', block: 'SEED', actor: 'model', consumes: [], produces: [] })).toBe('Random spark');
    expect(stepLabel({ op: 'step', id: 'b', role: 'build', actor: 'human', consumes: [], produces: [] })).toBe('Your draft');
  });
});

describe('diffFromNearest: the composed recipe against its nearest canonical one', () => {
  it.each(PROTOCOL_CONFIGS.map((r) => [r.id, r]))('%s against itself: the same steps', (id, recipe) => {
    const name = presentationOf(id)!.name;
    expect(diffFromNearest(asComposed(recipe), recipe, name)).toEqual([`The same steps as ${name}.`]);
  });

  it('reports removed, added and changed steps, and changed loop caps and branch counts, without renders', () => {
    const edited = asComposed({
      ...c1,
      stages: c1.stages.map((s) => {
        if (s.stage === 'D1' && s.body.op === 'replicate') return { ...s, body: { ...s.body, n: 2 } };
        if (s.stage === 'D3' && s.body.op === 'seq') return { ...s, body: { ...s.body, steps: s.body.steps.filter((n) => !('id' in n) || n.id !== 'critic-check') } };
        return s;
      }),
    });
    const diff = diffFromNearest(edited, c1, 'Landing Page Studio');
    expect(diff).toContain('Removed: Defect check (critic-check)');
    expect(diff).toContain('Changed: 2 separate drafts instead of 4 (seeded-x4)');
    expect(diff.join('\n')).not.toMatch(/Render/);
  });
});
