import { c1, c4, c5, c6a, PROTOCOL_CONFIGS, presentationOf, presentedStepFor } from '@byway/catalog';
import { walk, withHash, type Node, type Recipe } from '@byway/recipe';
import { describe, expect, it } from 'vitest';
import { COMPOSED_EXPLAINERS, diffFromNearest, nodeIds, presentComposed, stepLabel } from '../src/index.ts';

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
    expect(diff).toContain('Removed: Defect check (Finish)');
    expect(diff).toContain('Changed: Random spark: 2 separate drafts instead of 4');
    expect(diff.join('\n')).not.toMatch(/Render/);
  });
});

describe('diffFromNearest: plain words by default (spec §5, UX-13)', () => {
  it('names steps, repeats and drafts by their plain labels, from the nearest presentation where it has one', () => {
    const edited = asComposed({
      ...c1,
      medium: 'prose',
      stages: c1.stages.map((s) => {
        if (s.stage === 'D1' && s.body.op === 'replicate') return { ...s, body: { ...s.body, n: 2 } };
        if (s.stage === 'D3' && s.body.op === 'seq') return { ...s, body: { ...s.body, steps: s.body.steps.filter((n) => !('id' in n) || n.id !== 'critic-check') } };
        return s;
      }),
    });
    const diff = diffFromNearest(edited, c1, 'Landing Page Studio', presentationOf('c1'));
    expect(diff).toContain('Makes a written document instead of a web page.');
    expect(diff).toContain('Removed: Outside critique: defect check (Finish)');
    expect(diff).toContain('Changed: Random spark: 2 separate drafts instead of 4');
    const text = diff.join('\n');
    for (const id of new Set(nodeIds(c1))) expect(text, id).not.toContain(`(${id})`);
    expect(text).not.toMatch(/\b(?:web-page|code-diff)\b/);
  });

  it('describes a loop by the step it repeats, never by its id', () => {
    const shorter = JSON.parse(JSON.stringify(c6a)) as Recipe;
    let was = 0;
    walk(shorter, (n) => {
      if (n.op === 'loop' && n.id === 'author-loop') {
        was = n.gate.max;
        n.gate.max = 2;
      }
    });
    const diff = diffFromNearest(asComposed(shorter), c6a, 'Fiction Second Reader', presentationOf('c6a'));
    expect(diff).toEqual([`Changed: Your draft repeats up to 2 rounds instead of ${was}`]);
  });
});

/**
 * CRED-1: the composed explainers are product copy like the catalog's, so they say what a step does, never what it
 * achieves. They are listed in one place (COMPOSED_EXPLAINERS), which the web app's claims guard scans as well.
 */
describe('composed explainers: what steps do, not what they achieve (CRED-1)', () => {
  const OUTCOMES = [/\bso(?: that)? (?:they|it|the|you|your)\b/i, /\bgenuinely\b/i, /\bdistinct\b/i, /\bdo(?:es)? not settle\b/i, /\bstays? wide\b/i, /\bthe work needs\b/i];

  it('every explainer presentComposed writes is one of COMPOSED_EXPLAINERS', () => {
    const known = new Set<string>(Object.values(COMPOSED_EXPLAINERS));
    for (const r of PROTOCOL_CONFIGS) {
      for (const s of presentComposed(asComposed(r), COPY).stages.flatMap((x) => x.steps)) expect(known.has(s.explainer), `${r.id} ${s.label}: ${s.explainer}`).toBe(true);
    }
  });

  it('no composed explainer states an outcome as fact', () => {
    for (const text of Object.values(COMPOSED_EXPLAINERS)) for (const re of OUTCOMES) expect(text, String(re)).not.toMatch(re);
  });

  it('the swapping cliché sweep says you choose which finds are swapped (TELLS-1, C2)', () => {
    const steps = presentComposed(asComposed(c1), COPY).stages.flatMap((s) => s.steps);
    expect(steps.find((s) => s.stepIds.includes('tells-sweep'))?.explainer).toMatch(/you choose which/);
  });
});

/**
 * F08 (ADR-0092 stage 3): the explainers read what runs, not what a step declares. A random pick is not the AI's
 * choice; a claim log is not "the words readers will take as yours"; a step labelled VOICE that writes no person's
 * words is not "your words"; and a fix applies its critique by what it is, whatever its `writes` flag says.
 */
describe('presentComposed explains what runs (F08)', () => {
  type N = Record<string, any>;
  /** The recipe with the node of this id replaced by f(it); the replacement is not walked again. */
  const edited = (r: Recipe, id: string, f: (s: N) => N): Recipe => {
    const map = (n: N): N => {
      if (n.id === id) return f({ ...n });
      const c: N = { ...n };
      if (c.steps) c.steps = c.steps.map(map);
      if (c.body) c.body = map(c.body);
      if (c.branches) c.branches = c.branches.map((x: N) => ({ ...x, body: map(x.body) }));
      if (c.lenses) c.lenses = c.lenses.map((x: N) => ({ ...x, body: map(x.body) }));
      return c;
    };
    return asComposed({ ...r, stages: r.stages.map((st) => ({ ...st, body: map(st.body as N) as Node })) });
  };
  const shownFor = (r: Recipe, id: string) => presentComposed(r, COPY).stages.flatMap((s) => s.steps).find((s) => s.stepIds.includes(id))!;

  it('a random pick: chosen at random, no one compares them', () => {
    const r = edited(c1, 'pick-one', (n) => ({ ...n, mode: 'R', actor: 'policy' }));
    expect(shownFor(r, 'pick-one')).toMatchObject({ label: 'Random pick', explainer: COMPOSED_EXPLAINERS.pickRandom });
    expect(COMPOSED_EXPLAINERS.pickRandom).not.toBe(COMPOSED_EXPLAINERS.pickAi);
    expect(COMPOSED_EXPLAINERS.pickRandom).toMatch(/at random/);
  });

  it('a claim log is your sign-off on the claims, not the words readers take as yours', () => {
    const r = edited(c4, 'voice', (n) => ({ ...n, variant: 'claim-log', knobs: undefined }));
    expect(shownFor(r, 'voice').explainer).toBe(COMPOSED_EXPLAINERS.voiceClaims);
    expect(COMPOSED_EXPLAINERS.voiceClaims).not.toMatch(/take as yours/);
  });

  it('each VOICE is worded by what it covers', () => {
    expect(shownFor(asComposed(c1), 'voice').explainer).toBe(COMPOSED_EXPLAINERS.voice);
    expect(shownFor(asComposed(c4), 'voice').explainer).toBe(COMPOSED_EXPLAINERS.voiceKeyLines);
    expect(shownFor(asComposed(c5), 'vo-script').explainer).toBe(COMPOSED_EXPLAINERS.voiceScript);
    expect(shownFor(asComposed(c5), 'voice').explainer).toBe(COMPOSED_EXPLAINERS.voiceOnScreen);
  });

  it('a step labelled VOICE that writes no person’s words is neither labelled nor explained as your words', () => {
    const r = edited(c1, 'tells-compare', (n) => ({ op: 'seq', steps: [n, { op: 'step', id: 'fake-voice', role: 'vision', block: 'VOICE', actor: 'human', consumes: ['view'], produces: ['voice', 'artifact'] }] }));
    const fake = shownFor(r, 'fake-voice');
    expect(fake.label).not.toBe('Your words');
    expect(fake.explainer).not.toBe(COMPOSED_EXPLAINERS.voice);
  });

  it("a fix applies the critique by what it is, whatever its writes flag says", () => {
    const r = edited(c1, 'critic-fix', (n) => {
      const { writes: _w, ...rest } = n;
      return rest;
    });
    const critique = shownFor(r, 'critic');
    expect(critique.stepIds).toContain('critic-fix');
    expect(critique.explainer).toBe(COMPOSED_EXPLAINERS.criticApplies);
  });
});
