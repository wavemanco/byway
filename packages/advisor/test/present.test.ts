import { c1, c2, c3, c4, c5, c6, c6a, c7, PROTOCOL_CONFIGS, presentationOf, presentedStepFor } from '@byway/catalog';
import { lockedScripts, walk, withHash, type Node, type Recipe, type Step } from '@byway/recipe';
import { describe, expect, it } from 'vitest';
import { checkAnswer, COMPOSED_EXPLAINERS, diffFromNearest, nodeIds, presentComposed, stepLabel } from '../src/index.ts';
import { fencedJson, PROMPTS } from './helpers.ts';

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

  it('says you choose only where the interpreter asks (asksSwaps): not with its swap step in a seq of its own, nor behind a machine keep-or-revert', () => {
    const tellsOf = (r: Recipe) => presentComposed(asComposed(r), COPY).stages.flatMap((s) => s.steps).find((s) => s.stepIds.includes('tells-sweep'))?.explainer;
    const nested = structuredClone(c1) as Recipe;
    const d3 = nested.stages.find((s) => s.stage === 'D3')!.body as Extract<Node, { op: 'seq' }>;
    const i = d3.steps.findIndex((s) => s.op === 'step' && s.role === 'tells-sweep');
    d3.steps = [...d3.steps.slice(0, i + 1), { op: 'seq', steps: d3.steps.slice(i + 1) }];
    expect(tellsOf(nested)).toBe(COMPOSED_EXPLAINERS.tellsAppliesAll);
    const headless = structuredClone(c1) as Recipe;
    walk(headless, (n) => {
      if (n.op === 'step' && n.role === 'tells-compare') Object.assign(n, { actor: 'model', tier: 'mid', prompt: 'study1.A13' });
    });
    expect(tellsOf(headless)).toBe(COMPOSED_EXPLAINERS.tellsAppliesAll);
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
    expect(shownFor(r, 'voice').explainer).toBe(COMPOSED_EXPLAINERS.voiceClaimsAiRest);
    expect(COMPOSED_EXPLAINERS.voiceClaimsAiRest).not.toMatch(/take as yours/);
  });

  it('each VOICE is worded by what it covers', () => {
    expect(shownFor(asComposed(c1), 'voice').explainer).toBe(COMPOSED_EXPLAINERS.voice);
    expect(shownFor(asComposed(c4), 'voice').explainer).toBe(COMPOSED_EXPLAINERS.voiceKeyLinesAiRest);
    expect(shownFor(asComposed(c5), 'vo-script').explainer).toBe(COMPOSED_EXPLAINERS.voiceScriptLocked);
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

/**
 * Explainers say what the recipe establishes about the steps around them, and nothing more (the round-2 verification):
 * "the AI wrote the rest" only on a VOICE no person's write can come before; "It is locked after this" only on a script
 * no later write of yours can change; "Nothing is deleted for you" and "It flags only" only where no AI writer can take
 * the notes in after them; "for you to react to" only where a step of yours that reacts can follow. Each case below is
 * an admitted composed recipe (checkAnswer finds nothing), so the person can be shown it.
 */
describe('explainers claim only what the recipe establishes about the steps around them', () => {
  type N = Record<string, any>;
  const mapNodes = (n: N, f: (n: N) => N): N => {
    const c: N = { ...n };
    if (c.steps) c.steps = c.steps.map((x: N) => mapNodes(x, f));
    if (c.body) c.body = mapNodes(c.body, f);
    if (c.branches) c.branches = c.branches.map((b: N) => ({ ...b, body: mapNodes(b.body, f) }));
    if (c.lenses) c.lenses = c.lenses.map((l: N) => ({ ...l, body: mapNodes(l.body, f) }));
    return f(c);
  };
  /** The recipe with the node of this id replaced by f(it), and `next` placed right after it in its seq. */
  const edited = (r: Recipe | N, id: string, f: (s: N) => N, next?: N): N => {
    const { hash: _h, ...rest } = structuredClone(r) as N;
    const place = (n: N): N => (next && n.steps ? { ...n, steps: n.steps.flatMap((x: N) => (x.id === id ? [x, next] : [x])) } : n);
    return { ...rest, stages: rest.stages.map((st: N) => ({ ...st, body: mapNodes(st.body, (n) => place(n.id === id ? f(n) : n)) })) };
  };
  /** The recipe without the node of this id. */
  const removed = (r: Recipe, id: string): N => {
    const { hash: _h, ...rest } = structuredClone(r) as N;
    return { ...rest, stages: rest.stages.map((st: N) => ({ ...st, body: mapNodes(st.body, (n) => (n.steps ? { ...n, steps: n.steps.filter((x: N) => x.id !== id) } : n)) })) };
  };
  /** The composed recipe as admission keeps it; fails the test when admission refuses it. */
  const admitted = (raw: N, nearest: Recipe): Recipe => {
    const res = checkAnswer(fencedJson(raw), nearest, { prompts: PROMPTS, catalog: PROTOCOL_CONFIGS }, `composed-${nearest.id}`);
    expect(res.violations.map((v) => `${v.ruleId}:${v.clause ?? ''} ${v.message}`)).toEqual([]);
    return res.recipe!;
  };
  /** A catalog recipe as the composer would hand it back: no hash. */
  const copy = (r: Recipe): N => edited(r, '', (n) => n);
  const explained = (r: Recipe, id: string) => presentComposed(r, COPY).stages.flatMap((s) => s.steps).find((s) => s.stepIds.includes(id))!.explainer;
  const E = COMPOSED_EXPLAINERS;

  it('the catalog: C4 says the AI wrote the rest at its key lines, not at the claim sign-off after your own key lines', () => {
    const c4c = admitted(copy(c4), c4);
    expect(explained(c4c, 'voice')).toBe(E.voiceKeyLinesAiRest);
    expect(explained(c4c, 'claim-sign-off')).toBe(E.voiceClaims);
    // Every other claim the catalog's recipes make about the steps around them holds, so they keep it.
    expect(explained(admitted(copy(c5), c5), 'vo-script')).toBe(E.voiceScriptLocked);
    expect(explained(admitted(copy(c6), c6), 'cut-marks')).toBe(E.cutNothingDeleted);
    expect(explained(admitted(copy(c6a), c6a), 'tells-flags')).toBe(E.tellsFlagsOnly);
    for (const [r, id] of [[c2, 'sharpen'], [c4, 'framings'], [c6, 'angles'], [c6a, 'sharpen'], [c7, 'interview']] as const) {
      expect(explained(admitted(copy(r), r), id), `${r.id} ${id}`).toBe(E.visionAiToReact);
    }
  });

  it('a C4 whose draft you write yourself: neither VOICE says the AI wrote the rest', () => {
    const own = admitted(
      edited(c4, 'draft', (n) => {
        const { tier: _t, prompt: _p, ...rest } = n;
        return { ...rest, actor: 'human', consumes: ['brief'] };
      }),
      c4,
    );
    expect(explained(own, 'draft')).toBe(E.buildYours);
    expect(explained(own, 'voice')).toBe(E.voiceKeyLines);
    expect(explained(own, 'claim-sign-off')).toBe(E.voiceClaims);
    const text = presentComposed(own, COPY).stages.flatMap((s) => s.steps.map((x) => x.explainer)).join('\n');
    expect(text).not.toMatch(/the AI wrote the rest/);
  });

  it('a script you may write again later is not called locked', () => {
    const again = admitted(edited(c5, 'voice', (n) => ({ op: 'seq', steps: [{ ...n, id: 'script-again', variant: 'VOICE-early' }, n] })), c5);
    expect(explained(again, 'vo-script')).not.toMatch(/locked/);
    expect(explained(again, 'vo-script')).toBe(E.voiceScript);
    expect(explained(again, 'voice')).toBe(E.voiceOnScreen);
    // Nor the second: C5's launch check re-runs Refine and Finish on a fail, and the person is asked for it again.
    expect(explained(again, 'script-again')).toBe(E.voiceScript);
  });

  it('a script is locked exactly where the run says so (lockedScripts): the last word on it, which nothing asks for again', () => {
    const script = (n: N) => ({ ...n, id: 'script-again', variant: 'VOICE-early' });
    const noRetry = (n: N) => {
      const { retry: _r, ...rest } = n;
      return rest;
    };
    const again = admitted(edited(c5, 'voice', (n) => ({ op: 'seq', steps: [script(n), n] })), c5);
    const last = admitted(edited(edited(c5, 'voice', (n) => ({ op: 'seq', steps: [script(n), n] })), 'launch-gate', noRetry), c5);
    expect(explained(last, 'vo-script')).toBe(E.voiceScript);
    expect(explained(last, 'script-again')).toBe(E.voiceScriptLocked);
    // A launch check that re-runs Explore asks for C5's own script again.
    const rerun = admitted(edited(c5, 'launch-gate', (n) => ({ ...n, retry: { stage: 'D1', times: 1 } })), c5);
    expect(explained(rerun, 'vo-script')).toBe(E.voiceScript);
    // A claim log's corrections replace claims wherever they stand, the voice-over included.
    const claims = admitted(edited(c5, 'voice', (n) => ({ op: 'seq', steps: [n, { ...n, id: 'claims', variant: 'claim-log' }] })), c5);
    expect(explained(claims, 'vo-script')).toBe(E.voiceScript);
    // The explainer and the run read one rule.
    for (const r of [asComposed(c5), again, last, rerun, claims]) {
      for (const id of ['vo-script', 'script-again']) {
        if (!nodeIds(r).includes(id)) continue;
        const locked = [...lockedScripts(r)].some((x) => x.id === id);
        expect(explained(r, id) === E.voiceScriptLocked, `${r.id} ${id}`).toBe(locked);
      }
    }
  });

  it('a trim whose marks an AI writer takes in, beside it or a step later, never says nothing is deleted', () => {
    // The fix reads the critique when there is one (ADR-0089): it applies the marks, as one that consumes them does.
    const reads = admitted(edited(c7, 'apply-scope-cut', (n) => ({ ...n, consumes: ['artifact'], reads: ['critique'] })), c7);
    expect(explained(reads, 'scope-cut')).toBe(E.cutApplies);
    const render = { op: 'step', id: 'extra-render', role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] };
    const later = admitted(edited(c7, 'apply-scope-cut', (n) => ({ op: 'seq', steps: [render, n] })), c7);
    expect(explained(later, 'scope-cut')).toBe(E.cut);
  });

  it('a model VISION with no step of yours after it is labelled and explained without "to react to", and the diff names only what changed', () => {
    for (const [r, drop, id] of [[c7, 'spec', 'interview'], [c6, 'react', 'angles']] as const) {
      const without = admitted(removed(r, drop), r);
      const step = presentComposed(without, COPY).stages.flatMap((s) => s.steps).find((s) => s.stepIds.includes(id))!;
      expect(step).toMatchObject({ label: 'Directions', explainer: E.visionAi });
      // The label moved with the context, which is never by itself a change: only the removed step is reported.
      expect(diffFromNearest(without, r, 'x', presentationOf(r.id))).toEqual(['Removed: Your direction (Explore)']);
      expect(presentComposed(asComposed(r), COPY).stages.flatMap((s) => s.steps).find((s) => s.stepIds.includes(id))!.label).toBe('Directions to react to');
    }
    // Without the recipe around it, the label claims nothing about the steps after it.
    const vision: Step = { op: 'step', id: 'v', role: 'vision', block: 'VISION', actor: 'model', consumes: [], produces: ['taste'] };
    expect(stepLabel(vision)).toBe('Directions');
  });

  it('"to react to" only where your next VISION is shown those directions on every path: by what reaches it, not by order', () => {
    /** C6's AI angles, under another id. */
    const angles = (id: string): N => {
      let found: N | undefined;
      walk(c6, (n) => {
        if (n.op === 'step' && n.id === 'angles') found = { ...structuredClone(n), id };
      });
      return found!;
    };
    const shown = (r: Recipe, id: string) => presentComposed(r, COPY).stages.flatMap((s) => s.steps).find((s) => s.stepIds.includes(id))!;
    // C2 with a second AI direction right after the sharpened brief: the next round's VISION of yours is shown the
    // second one's note (the latest beside the work), never the sharpened brief's.
    const twice = admitted(edited(c2, 'sharpen', (n) => n, angles('angles2')), c2);
    expect(shown(twice, 'sharpen')).toMatchObject({ label: 'Directions', explainer: E.visionAi });
    expect(shown(twice, 'angles2')).toMatchObject({ label: 'Directions to react to', explainer: E.visionAiToReact });
    // C5 with AI directions before the obvious-answer check: the check's flags are beside the options when you give
    // your direction, in place of them.
    const flagged = admitted(edited(c5, 'territories-render', (n) => n, angles('angles2')), c5);
    expect(shown(flagged, 'angles2')).toMatchObject({ label: 'Directions', explainer: E.visionAi });
    // The diff names the added step as the composed recipe has it.
    expect(diffFromNearest(flagged, c5, 'x', presentationOf('c5'))).toContain('Added: Directions (Explore)');
  });

  it('a CUT of yours where the operator around it drops your list is refused, never explained as removed (round 3: C3, C4)', () => {
    const refusals = (raw: N, nearest: Recipe) =>
      checkAnswer(fencedJson(raw), nearest, { prompts: PROMPTS, catalog: PROTOCOL_CONFIGS }, `composed-${nearest.id}`).violations.map((v) => `${v.ruleId}:${v.clause ?? ''}`);
    // C3 with your CUT in a replicate of two: the replicate hands on only the candidates' work.
    expect(refusals(edited(c3, 'cut', (n) => ({ op: 'replicate', id: 'rep', n: 2, body: n })), c3)).toEqual(['ST12:critique-per-candidate']);
    // C4 with your CUT in an audit lens: a list left empty is dropped with the lens.
    expect(refusals(edited(c4, 'cut', (n) => ({ op: 'audit', id: 'aud', lenses: [{ name: 'trim', body: n }] })), c4)).toEqual(['ST9:human-critique']);
    // As the catalog has it, your CUT is admitted and explained as the list the AI removes.
    expect(explained(admitted(copy(c3), c3), 'cut')).toBe(E.cutYoursApplies);
  });

  it('the diff names an added step as the composed recipe has it where it sits', () => {
    /** C7's AI spec interview, under another id. */
    const extra = (id: string): N => {
      let found: N | undefined;
      walk(c7, (n) => {
        if (n.op === 'step' && n.id === 'interview') found = { ...structuredClone(n), id };
      });
      return found!;
    };
    const before = asComposed(edited(c7, 'spec', (n) => ({ op: 'seq', steps: [extra('second-interview'), n] })) as Recipe);
    expect(diffFromNearest(before, c7, 'x', presentationOf('c7'))).toContain('Added: Directions to react to (Explore), when it applies');
    const late = asComposed(edited(c7, 'voice', (n) => ({ op: 'seq', steps: [n, extra('late-interview')] })) as Recipe);
    expect(diffFromNearest(late, c7, 'x', presentationOf('c7'))).toContain('Added: Directions (Finish)');
  });

  it('a step with no executor in this version says it is skipped, and a writer after it is not said to apply its findings', () => {
    const tool = (n: N): N => {
      const { tier: _t, prompt: _p, isolated: _i, frozenPrompt: _f, ...rest } = n;
      return { ...rest, actor: 'tool' };
    };
    const r = admitted(edited(c7, 'defect-check', tool), c7);
    const steps = presentComposed(r, COPY).stages.flatMap((s) => s.steps);
    expect(steps.find((s) => s.stepIds.includes('defect-check'))).toMatchObject({ label: 'Defect check', who: 'tool', explainer: E.skipped, stepIds: ['defect-render', 'defect-check'] });
    expect(steps.find((s) => s.stepIds.includes('fix-defects'))).toMatchObject({ label: 'Revise', who: 'ai', explainer: E.fix });
  });

  it('a seed outside a fan-out is one session, not separate ones', () => {
    const one = admitted(edited(c1, 'seeded-x4', (n) => ({ ...n, n: 1 })), c1);
    expect(explained(one, 'seed-build')).toBe(E.seedOne);
    expect(E.seedOne).not.toMatch(/[Ss]eparate|sessions/);
    expect(explained(admitted(copy(c1), c1), 'seed-build')).toBe(E.seed);
  });

  it('a step of yours that puts another critique in place of the sweep’s finds: no one is asked which to swap, and nothing says so', () => {
    const between = { op: 'step', id: 'between', role: 'vision', block: 'VISION', actor: 'human', consumes: ['view'], produces: ['critique'] };
    for (const r of [c1, c7]) {
      const replaced = admitted(edited(r, 'tells-sweep', (n) => n, between), r);
      const steps = presentComposed(replaced, COPY).stages.flatMap((s) => s.steps);
      expect(steps.find((s) => s.stepIds.includes('tells-sweep'))!.explainer).toBe(E.tells);
      expect(steps.find((s) => s.stepIds.includes('apply-swaps'))!.explainer).toBe(E.fix);
      expect(diffFromNearest(replaced, r, 'x', presentationOf(r.id))).toContain('Changed: Cliché sweep (Finish): no longer asks you which of its finds to swap');
    }
  });

  it('a cliché sweep whose finds an AI writer reads swaps every one, never "flags only"', () => {
    const reads = admitted(edited(c7, 'apply-swaps', (n) => ({ ...n, consumes: ['artifact'], reads: ['critique'] })), c7);
    expect(explained(reads, 'tells-sweep')).toBe(E.tellsAppliesAll);
  });

  it('a step you take is your turn, never the AI’s or a reviewer’s', () => {
    const human = (n: N): N => {
      const { tier: _t, prompt: _p, isolated: _i, frozenPrompt: _f, ...rest } = n;
      return { ...rest, actor: 'human' };
    };
    const fix = admitted(edited(c7, 'fix-defects', human), c7);
    expect(explained(fix, 'fix-defects')).toBe(E.buildYours);
    expect(explained(admitted(edited(c1, 'asset', human), c1), 'asset')).toBe(E.otherYours);
    expect(explained(admitted(edited(c2, 'dedupe', human), c2), 'dedupe')).toBe(E.otherYours);
    expect(explained(admitted(edited(c7, 'tells-sweep', (n) => ({ ...human(n), consumes: ['view'] })), c7), 'tells-sweep')).toBe(E.otherYours);
    // Nothing a person does is said to be done by the AI or a reviewer.
    for (const r of [fix, admitted(edited(c1, 'asset', human), c1)]) {
      for (const s of presentComposed(r, COPY).stages.flatMap((x) => x.steps).filter((x) => x.who === 'you')) {
        expect(s.explainer, s.label).not.toMatch(/^(The AI|A fresh reviewer|A separate reviewer)/);
      }
    }
  });

  it('a step object used twice makes a claim only where both places establish it', () => {
    const c4c = structuredClone(c4) as Recipe;
    const d3 = c4c.stages.find((s) => s.stage === 'D3')!.body as Extract<Node, { op: 'seq' }>;
    const voice = d3.steps.find((s) => s.op === 'step' && s.id === 'voice')!;
    d3.steps = [...d3.steps, voice];
    expect(explained(asComposed(c4c), 'voice')).toBe(E.voiceKeyLines);
  });

  it('the plain sentences make none of those claims', () => {
    for (const text of [E.voiceKeyLines, E.voiceClaims, E.voiceScript, E.cut, E.tells, E.visionAi]) expect(text).toMatch(/\.$/);
    expect(E.voiceKeyLines).not.toMatch(/the rest/);
    expect(E.voiceClaims).not.toMatch(/the rest/);
    expect(E.voiceScript).not.toMatch(/locked/);
    expect(E.cut).not.toMatch(/deleted/);
    expect(E.tells).not.toMatch(/only/);
    expect(E.visionAi).not.toMatch(/react/);
  });
});

/**
 * F08 round 4: every catalog recipe as composed, step by step, with what it is said to do. Each line was checked
 * against what the runner runs: the obvious-answer check's plain drafts never become the work; C5's motion outside the
 * chain is one clip from the latest start frame; its compositing and voice-over audio have no executor in this version
 * and finish skipped (ADR-0069); a seed in a fan-out is separate sessions; a script is locked only where nothing asks
 * for it again. A change to any of them is a change to what a person is told, made here on purpose.
 */
describe('every catalog recipe as composed, as it is presented (F08 round 4)', () => {
  type Key = keyof typeof COMPOSED_EXPLAINERS;
  const PRESENTED: Record<string, [string, string, string, string, Key][]> = {
    c1: [
      ['Explore', 'Random spark', 'ai', 'seeded-x4,seed-build', 'seed'],
      ['Refine', 'Outside critique', 'ai', 'each-candidate,critic-loop,render,critic,critic-fix', 'criticApplies'],
      ['Refine', 'Custom imagery', 'ai', 'asset-if-plain,asset', 'asset'],
      ['Refine', 'Pick one', 'you', 'asset-verify,pick-one', 'pickYours'],
      ['Finish', 'Trim', 'you', 'cut-render,cut,apply-cut', 'cutYoursApplies'],
      ['Finish', 'Cliché sweep', 'ai', 'tells-render,tells-sweep,apply-swaps', 'tellsApplies'],
      ['Finish', 'Keep or revert', 'you', 'compare-render,tells-compare', 'tellsCompare'],
      ['Finish', 'Your words', 'you', 'voice', 'voice'],
      ['Finish', 'Defect check', 'ai', 'final-render,critic-check', 'criticCheck'],
    ],
    c2: [
      ['Explore', 'Random spark', 'ai', 'seeded-options,seed-option', 'seed'],
      ['Explore', 'Merge near-duplicates', 'ai', 'dedupe', 'dedupe'],
      ['Explore', 'Draft', 'ai', 'pool-render,annotate,vanilla-x3,vanilla-build', 'aside'],
      ['Explore', 'Obvious-answer check', 'ai', 'vanilla-flag', 'overlap'],
      ['Explore', 'Outside critique', 'ai', 'critic', 'critic'],
      ['Explore', 'Your direction', 'you', 'vision,react', 'visionYours'],
      ['Explore', 'Directions to react to', 'ai', 'sharpen', 'visionAiToReact'],
      ['Explore', 'Draft', 'ai', 'option-map', 'build'],
      ['Explore', 'Your words', 'you', 'voice', 'voice'],
      ['Explore', 'Custom imagery', 'ai', 'mood-boards-if-wanted,mood-boards', 'asset'],
    ],
    c3: [
      ['Explore', 'Random spark', 'ai', 'seeded-angles,seed-angle', 'seed'],
      ['Explore', 'Draft', 'ai', 'cards-render,vanilla-check,vanilla-x3,vanilla-build', 'aside'],
      ['Explore', 'Obvious-answer check', 'ai', 'vanilla-flag', 'overlap'],
      ['Explore', 'Pick one', 'you', 'pick-angle', 'pickYours'],
      ['Explore', 'Your direction', 'you', 'thesis', 'visionYours'],
      ['Refine', 'Draft', 'ai', 'draft,ai-draft', 'build'],
      ['Refine', 'Your draft', 'you', 'own-draft', 'buildYours'],
      ['Refine', 'Outside critique', 'ai', 'critic-loop,render,critic,revise', 'criticApplies'],
      ['Refine', 'Custom imagery', 'ai', 'asset-if-wanted,asset', 'asset'],
      ['Finish', 'Trim', 'you', 'cut-render,cut,apply-cut', 'cutYoursApplies'],
      ['Finish', 'Cliché sweep', 'ai', 'tells-render,tells-sweep,apply-swaps', 'tellsApplies'],
      ['Finish', 'Keep or revert', 'you', 'compare-render,tells-compare', 'tellsCompare'],
      ['Finish', 'Your words', 'you', 'voice', 'voice'],
    ],
    c4: [
      ['Explore', 'Directions to react to', 'ai', 'framings-if-wanted,framings', 'visionAiToReact'],
      ['Explore', 'Your direction', 'you', 'vision-lite', 'visionYours'],
      ['Refine', 'Draft', 'ai', 'draft', 'build'],
      ['Refine', 'Outside critique', 'ai', 'recipient-critic,critic-loop,render,recipient,revise', 'criticApplies'],
      ['Finish', 'Trim', 'you', 'cut-render,cut,apply-cut', 'cutYoursApplies'],
      ['Finish', 'Cliché sweep', 'ai', 'tells-render,tells-sweep,apply-swaps', 'tellsApplies'],
      ['Finish', 'Keep or revert', 'you', 'compare-render,tells-compare', 'tellsCompare'],
      ['Finish', 'Your words', 'you', 'voice', 'voiceKeyLinesAiRest'],
      ['Finish', 'Your words', 'you', 'claim-log,claim-sign-off', 'voiceClaims'],
    ],
    c5: [
      ['Explore', 'Random spark', 'ai', 'seeded-territories,seed-territory', 'seed'],
      ['Explore', 'Merge near-duplicates', 'ai', 'dedupe', 'dedupe'],
      ['Explore', 'Draft', 'ai', 'territories-render,vanilla-check,vanilla-x3,vanilla-build', 'aside'],
      ['Explore', 'Obvious-answer check', 'ai', 'vanilla-flag', 'overlap'],
      ['Explore', 'Pick 3', 'you', 'shortlist', 'pickYours'],
      ['Explore', 'Your direction', 'you', 'direction', 'visionYours'],
      ['Explore', 'Draft', 'ai', 'concepts,concept', 'build'],
      ['Explore', 'Pick one', 'you', 'pick-concept', 'pickYours'],
      ['Explore', 'Your words', 'you', 'vo-script', 'voiceScriptLocked'],
      ['Refine', 'Custom imagery', 'ai', 'anchor-frames', 'asset'],
      ['Refine', 'Motion', 'ai', 'shot-chain,clip', 'relay'],
      ['Refine', 'Defect check', 'ai', 'shot-repair,shot-render,shot-check,regenerate', 'checkApplies'],
      ['Refine', 'Motion', 'ai', 'render-in-scene', 'relayOne'],
      ['Refine', 'Composite', 'tool', 'matte', 'compositingSkipped'],
      ['Refine', 'Voice-over audio', 'ai', 'vo-audio', 'audioSkipped'],
      ['Finish', 'Trim', 'you', 'cut-render,cut,apply-cut', 'cutYoursApplies'],
      ['Finish', 'Cliché sweep', 'ai', 'tells-render,tells-sweep,apply-swaps', 'tellsApplies'],
      ['Finish', 'Keep or revert', 'you', 'compare-render,tells-compare', 'tellsCompare'],
      ['Finish', 'Your words', 'you', 'voice', 'voiceOnScreen'],
      ['Finish', 'Outside critique', 'ai', 'feed-render,launch-gate,gate-critic', 'critic'],
    ],
    c6: [
      ['Explore', 'Directions to react to', 'ai', 'angles-if-wanted,angles', 'visionAiToReact'],
      ['Explore', 'Your direction', 'you', 'react', 'visionYours'],
      ['Refine', 'Your draft', 'you', 'author-loop,write', 'buildYours'],
      ['Refine', 'Trim marks', 'ai', 'render,audit,cut-marks', 'cutNothingDeleted'],
      ['Refine', 'Cliché sweep', 'ai', 'tells-flags', 'tellsFlagsOnly'],
      ['Refine', 'Outside critique', 'ai', 'critic', 'critic'],
      ['Finish', 'Your words', 'you', 'voice', 'voice'],
    ],
    c6a: [
      ['Explore', 'Random spark', 'ai', 'seeded-cards,seed-card', 'seed'],
      ['Explore', 'Draft', 'ai', 'cards-render,vanilla-check,vanilla-x3,vanilla-build', 'aside'],
      ['Explore', 'Obvious-answer check', 'ai', 'vanilla-flag', 'overlap'],
      ['Explore', 'Pick one', 'you', 'pick-card', 'pickYours'],
      ['Explore', 'Your direction', 'you', 'vision,react', 'visionYours'],
      ['Explore', 'Directions to react to', 'ai', 'sharpen', 'visionAiToReact'],
      ['Refine', 'Your draft', 'you', 'author-loop,write', 'buildYours'],
      ['Refine', 'Trim marks', 'ai', 'render,audit,cut-marks', 'cutNothingDeleted'],
      ['Refine', 'Cliché sweep', 'ai', 'tells-flags', 'tellsFlagsOnly'],
      ['Refine', 'Outside critique', 'ai', 'critic', 'critic'],
      ['Finish', 'Your words', 'you', 'voice', 'voice'],
      ['Finish', 'Cliché sweep', 'ai', 'final-tells-read,final-read,final-render,final-tells-flags', 'tellsFlagsOnly'],
    ],
    c7: [
      ['Explore', 'Directions to react to', 'ai', 'spec-interview,interview', 'visionAiToReact'],
      ['Explore', 'Your direction', 'you', 'spec', 'visionYours'],
      ['Refine', 'Draft', 'ai', 'implement', 'build'],
      ['Refine', 'Defect check', 'ai', 'defect-render,defect-check,fix-defects', 'checkApplies'],
      ['Refine', 'Trim marks', 'ai', 'scope-render,scope-cut,apply-scope-cut', 'cutApplies'],
      ['Refine', 'Outside critique', 'ai', 'review-loop,review-render,reviewer,review-fix', 'criticApplies'],
      ['Refine', 'Trim marks', 'ai', 'bloat-render,bloat-cut,apply-bloat-cut', 'cutApplies'],
      ['Finish', 'Cliché sweep', 'ai', 'tells-render,tells-sweep,apply-swaps', 'tellsApplies'],
      ['Finish', 'Keep or revert', 'you', 'compare-render,tells-compare', 'tellsCompare'],
      ['Finish', 'Your words', 'you', 'voice', 'voice'],
    ],
  };

  it('C1 to C7, every shown step: its label, who does it, what it covers and what it is said to do', () => {
    expect(Object.keys(PRESENTED)).toEqual(PROTOCOL_CONFIGS.map((r) => r.id));
    for (const recipe of PROTOCOL_CONFIGS) {
      const shown = presentComposed(asComposed(recipe), COPY).stages.flatMap((s) => s.steps.map((x) => [s.stage, x.label, x.who, x.stepIds.join(','), x.explainer]));
      expect(shown, recipe.id).toEqual(PRESENTED[recipe.id]!.map(([stage, label, who, ids, key]) => [stage, label, who, ids, COMPOSED_EXPLAINERS[key]]));
    }
  });
});
