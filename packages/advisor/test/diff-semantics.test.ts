/**
 * F08 (ADR-0092 stage 3): a composed recipe's "How it differs" says "The same steps as …" only when the two recipes
 * run the same: their semantic projections (@byway/recipe projection.ts, built from FIELD_ROLES) are equal. Before,
 * the diff compared a hand-picked subset of fields and called everything else "the same": a human pick made random,
 * a hidden bar lowered from 9 to 1, a VOICE narrowed to a claim log, a step moved behind a check that can end its
 * round all read "The same steps as Landing Page Studio." Every single-field change of a semantic field, on every
 * node of C1–C7, now gets a line, and no line quotes a hidden threshold.
 */
import { describe, expect, it } from 'vitest';
import { c1, c2, c3, c4, c5, c6, c6a, c7, presentationOf } from '@byway/catalog';
import { FIELD_ROLES, walk, withHash, type FieldRole, type Node, type Recipe } from '@byway/recipe';
import { diffFromNearest } from '../src/index.ts';
import { OTHER_CHANGES } from '../src/diff.ts';

type N = Record<string, any>;
const SEVEN = [c1, c2, c3, c4, c5, c6, c6a, c7];
const nameOf = (r: Recipe) => presentationOf(r.id)!.name;
const diff = (composed: N, nearest: Recipe) => diffFromNearest(withHash({ ...(composed as Recipe), id: `composed-${nearest.id}`, kind: 'composed', channel: 'workspace' }), nearest, nameOf(nearest), presentationOf(nearest.id));
const same = (nearest: Recipe) => [`The same steps as ${nameOf(nearest)}.`];
const clone = (r: Recipe): N => {
  const c = structuredClone(r) as N;
  delete c.hash;
  return c;
};

// ---- Single-field mutations over FIELD_ROLES --------------------------------------------------------------------

/** Every schema object in a recipe, with its FIELD_ROLES kind and a path to it. */
function objects(r: N): { kind: keyof typeof FIELD_ROLES; at: (string | number)[]; value: N }[] {
  const out: { kind: keyof typeof FIELD_ROLES; at: (string | number)[]; value: N }[] = [{ kind: 'recipe', at: [], value: r }];
  const node = (n: N, at: (string | number)[]): void => {
    const kind = (n.op === 'gate' ? 'oneShotGate' : n.op) as keyof typeof FIELD_ROLES;
    out.push({ kind, at, value: n });
    if (n.op === 'seq') n.steps.forEach((c: N, i: number) => node(c, [...at, 'steps', i]));
    if (n.op === 'loop') out.push({ kind: 'gate', at: [...at, 'gate'], value: n.gate });
    if (n.op === 'gate') {
      out.push({ kind: 'pass', at: [...at, 'pass'], value: n.pass });
      if (n.retry) out.push({ kind: 'retry', at: [...at, 'retry'], value: n.retry });
    }
    if (n.op === 'route') n.branches.forEach((b: N, i: number) => (out.push({ kind: 'branch', at: [...at, 'branches', i], value: b }), node(b.body, [...at, 'branches', i, 'body'])));
    if (n.op === 'audit') n.lenses.forEach((l: N, i: number) => (out.push({ kind: 'lens', at: [...at, 'lenses', i], value: l }), node(l.body, [...at, 'lenses', i, 'body'])));
    if (n.op === 'pick' && n.judge) node(n.judge, [...at, 'judge']);
    if ('body' in n && n.op !== 'route' && n.op !== 'audit') node(n.body, [...at, 'body']);
  };
  r.stages.forEach((s: N, i: number) => {
    out.push({ kind: 'stage', at: ['stages', i], value: s });
    node(s.body, ['stages', i, 'body']);
  });
  return out;
}

/**
 * Recipe fields the composer forces (compose.ts forceComposed): every composed recipe differs from its nearest in them,
 * so they say nothing about how it runs. `op` is the node's kind: changing it is a different node, which the diff
 * reports as removed and added.
 */
const FORCED = new Set(['recipe.schema', 'recipe.kind', 'recipe.family', 'recipe.channel', 'recipe.parent']);

/** A different value of the same shape. */
function mutated(kind: string, field: string, v: unknown): unknown {
  const another = <T>(xs: readonly T[], x: unknown): T => xs.find((y) => y !== x) ?? xs[0]!;
  if (field === 'metric') return another(['critic-score', 'critic-rank', 'check-clean', 'human'], v);
  if (field === 'actor') return another(['model', 'human', 'policy', 'tool'], v);
  if (field === 'role') return another(['build', 'fix', 'critic', 'judge', 'vision'], v);
  if (field === 'mode') return another(['H', 'C', 'R'], v);
  if (field === 'stage') return another(['D1', 'D2', 'D3'], v);
  if (field === 'medium') return another(['web-page', 'prose', 'media'], v);
  if (field === 'block') return v === undefined ? 'ASSET' : undefined;
  if (field === 'glue') return v === undefined ? 'RENDER' : undefined;
  if (field === 'tier') return v === 'big' ? 'mid' : 'big';
  if (field === 'holder') return another(['worker', 'harness', 'human'], v);
  if (field === 'onCap') return v === 'human' ? 'policy-best-snapshot' : 'human';
  if (field === 'onNoConverge') return v === 'continue' ? 'recalibrate-human' : 'continue';
  if (field === 'onFail') return 'robot';
  if (field === 'proxyFor') return v === undefined ? 'human' : undefined;
  if (field === 'plateau') return v === undefined ? { minGain: 1, window: 2 } : undefined;
  if (field === 'knobs') return { ...(v as object), extra: 1 };
  if (field === 'variant') return v === undefined ? 'claim-log' : `${String(v)}-other`;
  if (field === 'inputs' || field === 'consumes' || field === 'produces' || field === 'reads') {
    const ports = (v as string[] | undefined) ?? [];
    return ports.includes('brief') ? ports.filter((x) => x !== 'brief') : [...ports, 'brief'];
  }
  if (field === 'sitsOut') return [...(v as N[]), { block: 'ASSET', reason: 'none here' }];
  if (field === 'exceptions') return [...(v as string[]), 'C1-DR2'];
  if (typeof v === 'boolean' || v === undefined) return !v;
  if (typeof v === 'number') return v + 1;
  if (typeof v === 'string') return `${v}-changed`;
  throw new Error(`no mutation for ${kind}.${field}`);
}

function setAt(r: N, at: (string | number)[], field: string, value: unknown): N {
  const c = structuredClone(r);
  const obj = at.reduce((o: N, k) => o[k as string], c);
  if (value === undefined) delete obj[field];
  else obj[field] = value;
  return c;
}

const mutations = (nearest: Recipe): { what: string; recipe: N; threshold?: number[] }[] => {
  const base = clone(nearest);
  const out: { what: string; recipe: N; threshold?: number[] }[] = [];
  for (const { kind, at, value } of objects(base)) {
    const roles = FIELD_ROLES[kind] as Record<string, FieldRole>;
    for (const [field, role] of Object.entries(roles)) {
      if ((role !== 'semantic' && role !== 'semantic-set') || field === 'op' || FORCED.has(`${kind}.${field}`)) continue;
      // A schema object kind's optional fields are mutated too: set when absent.
      const next = mutated(kind, field, value[field]);
      const what = `${kind}${at.length ? ` at ${at.join('.')}` : ''}: ${field}`;
      out.push({ what, recipe: setAt(base, at, field, next), ...(field === 'threshold' ? { threshold: [value[field], next as number].filter((x) => typeof x === 'number') } : {}) });
    }
  }
  return out;
};

describe('every single-field change of a semantic field gets a line (FIELD_ROLES, C1–C7)', () => {
  for (const nearest of SEVEN) {
    it(`${nearest.id}: never "The same steps", and a changed quality bar is never quoted`, () => {
      const all = mutations(nearest);
      expect(all.length).toBeGreaterThan(50);
      for (const m of all) {
        const lines = diff(m.recipe, nearest);
        expect(lines, m.what).not.toEqual(same(nearest));
        expect(lines.length, m.what).toBeGreaterThan(0);
        for (const t of m.threshold ?? []) expect(lines.join('\n'), `${m.what} quotes ${t}`).not.toMatch(new RegExp(`(^|[^\\d.])${String(t).replace('.', '\\.')}([^\\d]|$)`));
      }
    });
  }

  it('the recipe fields left out are exactly the ones the composer forces', () => {
    const semanticRecipeFields = Object.entries(FIELD_ROLES.recipe).filter(([, r]) => r === 'semantic' || r === 'semantic-set').map(([f]) => `recipe.${f}`);
    expect(semanticRecipeFields.filter((f) => FORCED.has(f)).sort()).toEqual([...FORCED].sort());
  });
});

describe('what changes that are not semantic read', () => {
  it.each(SEVEN.map((r) => [r.id, r] as const))('%s: every id renamed reads "The same steps"', (_id, nearest) => {
    const r = clone(nearest);
    const used = new Set<string>();
    walk(r as Recipe, (n: Node) => {
      if ('id' in n && n.id && n.op !== 'route') used.add(n.id);
    });
    let i = 0;
    const renamed = new Map([...used].map((id) => [id, `renamed-${++i}`]));
    walk(r as Recipe, (n: Node) => {
      if ('id' in n && n.id && n.op !== 'route') (n as N).id = renamed.get(n.id);
    });
    expect(diff(r, nearest)).toEqual(same(nearest));
  });

  it.each(SEVEN.map((r) => [r.id, r] as const))('%s: every produces list and the inputs reordered read "The same steps"', (_id, nearest) => {
    const r = clone(nearest);
    walk(r as Recipe, (n: Node) => {
      if (n.op === 'step') Object.assign(n, { produces: [...n.produces].reverse() });
    });
    r.inputs = [...r.inputs].reverse();
    expect(diff(r, nearest)).toEqual(same(nearest));
  });

  it('a consumes list reordered is a technical change: the runner lays out the images a step sees in that order', () => {
    const r = edit(clone(c2), 'vanilla-flag', (n) => ({ ...n, consumes: [...n.consumes].reverse() }));
    expect(diff(r, c2)).toEqual([OTHER_CHANGES]);
  });

  it("a seq wrapped around steps is a technical change: the interpreter reads a step's siblings in its own seq", () => {
    const r = clone(c4);
    r.stages[2].body = { op: 'seq', steps: [{ op: 'seq', steps: r.stages[2].body.steps.slice(0, 3) }, ...r.stages[2].body.steps.slice(3)] };
    expect(diff(r, c4)).toEqual([OTHER_CHANGES]);
  });
});

/**
 * ADR-0089's optional reads change what a step's prompt receives: a port read when it is there fills its slot (and its
 * images, after the consumed ports'), so a read gained or dropped is named in plain words. A reorder, or a port moved
 * between consumed and read, is another technical change.
 */
describe("a step's optional reads (ADR-0089)", () => {
  const withReads = (r: Recipe, id: string, reads: string[] | undefined, consumes?: (c: string[]) => string[]) =>
    edit(clone(r), id, (n) => {
      const { reads: _r, ...rest } = n;
      return { ...rest, ...(reads ? { reads } : {}), ...(consumes ? { consumes: consumes(n.consumes) } : {}) };
    });

  it("C7's implementer no longer reading your spec interview's brief is named", () => {
    expect(diff(withReads(c7, 'implement', undefined), c7)).toEqual(['Changed: Implement (Refine): no longer reads the brief']);
  });

  it('a read added to a step is named, with the port in plain words', () => {
    expect(diff(withReads(c7, 'review-fix', ['brief']), c7)).toEqual(['Changed: the AI’s fixes in Outside critique (Refine): now also reads the brief when there is one']);
  });

  it('reads reordered, or a read made a consumed port, are other technical changes', () => {
    const two = withReads(c7, 'implement', ['brief', 'taste']) as Recipe;
    expect(diff(withReads(two, 'implement', ['taste', 'brief']), two)).toEqual([OTHER_CHANGES]);
    expect(diff(withReads(c7, 'implement', undefined, (c) => [...c, 'brief']), c7)).toEqual([OTHER_CHANGES]);
  });
});

// ---- A TELLS sweep's swap choice reads its siblings ------------------------------------------------------------

/** The steps after the cliché sweep wrapped in a seq of their own: the same steps, but the sweep no longer asks. */
function sweepRestNested(r: N): N {
  const c = clone(r as Recipe);
  let done = false;
  const visit = (n: N): void => {
    if (done || !n || typeof n !== 'object') return;
    if (n.op === 'seq') {
      const i = n.steps.findIndex((s: N) => s.op === 'step' && s.role === 'tells-sweep');
      if (i >= 0 && i < n.steps.length - 1) {
        n.steps = [...n.steps.slice(0, i + 1), { op: 'seq', steps: n.steps.slice(i + 1) }];
        done = true;
        return;
      }
      n.steps.forEach(visit);
    }
    if (n.body) visit(n.body);
    (n.branches ?? []).forEach((b: N) => visit(b.body));
    (n.lenses ?? []).forEach((l: N) => visit(l.body));
  };
  c.stages.forEach((s: N) => visit(s.body));
  if (!done) throw new Error('no TELLS sweep with steps after it');
  return c;
}

describe("a TELLS sweep's swap choice (the verifier's nested-seq case)", () => {
  it.each([
    ['c1', c1, 'Cliché sweep (Finish)'],
    ['c7', c7, 'Cliché sweep (Finish)'],
  ] as const)('%s: the rest of the sweep’s seq wrapped in a seq of its own says you no longer choose the swaps', (_id, nearest, label) => {
    const lines = diff(sweepRestNested(nearest), nearest);
    expect(lines).not.toEqual(same(nearest));
    expect(lines).toEqual([`Changed: ${label}: no longer asks you which of its finds to swap`]);
  });

  it('a sweep that never asks (its keep-or-revert by a machine, as in a headless arm) reads only the technical change', () => {
    const headless = edit(clone(c1), 'tells-compare', (n) => ({ ...n, actor: 'model', tier: 'mid', prompt: 'study1.A13' })) as Recipe;
    expect(diff(sweepRestNested(headless), headless)).toEqual([OTHER_CHANGES]);
  });
});

// ---- The verification's cases -----------------------------------------------------------------------------------

const stageOf = (r: N, s: string): N => r.stages.find((x: N) => x.stage === s);
const at = (seq: N, id: string): number => seq.steps.findIndex((s: N) => s.id === id);
function mapNodes(n: N, f: (n: N) => N): N {
  const m = f(n);
  if (m !== n) return m;
  const c: N = { ...n };
  if (c.steps) c.steps = c.steps.map((x: N) => mapNodes(x, f));
  if (c.body) c.body = mapNodes(c.body, f);
  if (c.branches) c.branches = c.branches.map((b: N) => ({ ...b, body: mapNodes(b.body, f) }));
  if (c.lenses) c.lenses = c.lenses.map((b: N) => ({ ...b, body: mapNodes(b.body, f) }));
  return c;
}
const edit = (r: N, id: string, f: (s: N) => N): N => ({ ...r, stages: r.stages.map((s: N) => ({ ...s, body: mapNodes(s.body, (n) => (n.id === id ? f(n) : n)) })) });
const text = (lines: string[]) => lines.join('\n');

describe("the verification's cases each read what changed", () => {
  it("C1's human pick made random: who picks, in plain words", () => {
    const lines = diff(edit(clone(c1), 'pick-one', (n) => ({ ...n, mode: 'R', actor: 'policy' })), c1);
    expect(lines).toEqual(['Changed: Pick one (Refine): chosen at random, no one compares them, where you chose before']);
  });

  it("C1's pick made by the AI", () => {
    const judge = { op: 'step', id: 'chooser', role: 'judge', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'study1.A14', consumes: ['view'], produces: [] };
    const lines = diff(edit(clone(c1), 'pick-one', (n) => ({ ...n, mode: 'C', actor: 'model', judge })), c1);
    expect(lines).toContain('Changed: Pick one (Refine): the AI chooses, where you chose before');
  });

  it("C1's hidden bar lowered from 9 to 1: described, never quoted", () => {
    const lines = diff(edit(clone(c1), 'critic-loop', (n) => ({ ...n, gate: { ...n.gate, threshold: 1 } })), c1);
    expect(lines).toEqual(['Changed: Outside critique repeats: stops at a lower quality bar']);
  });

  it("C1's plateau removed and its probe moved", () => {
    expect(diff(edit(clone(c1), 'critic-loop', (n) => ({ ...n, gate: { ...n.gate, plateau: undefined } })), c1)).toEqual(['Changed: Outside critique repeats: no longer stops early when its scores stop improving']);
    const probe = (edit(clone(c1), 'critic-loop', (n) => n) as N).stages[1].body.steps[0].body.steps[0].gate.probe as number;
    expect(diff(edit(clone(c1), 'critic-loop', (n) => ({ ...n, gate: { ...n.gate, probe: probe + 1 } })), c1)).toEqual([`Changed: Outside critique repeats: asks whether it is improving after ${probe + 1} rounds instead of ${probe}`]);
  });

  it('Q1: a random pick added after C2’s VOICE', () => {
    const r = clone(c2);
    const d1 = stageOf(r, 'D1').body;
    d1.steps.splice(at(d1, 'voice') + 1, 0, { op: 'pick', id: 'final-pick', mode: 'R', k: 1, actor: 'policy' });
    expect(diff(r, c2)).toEqual(['Added: Random pick (Explore): chosen at random, no one compares them']);
  });

  it('V3: C3’s VOICE narrowed to a claim log', () => {
    expect(diff(edit(clone(c3), 'voice', (n) => ({ ...n, variant: 'claim-log' })), c3)).toEqual(['Changed: Your words (Finish): you write only the claims instead of the reader-facing words']);
  });

  it('V3c: C5’s VO script without VOICE-early writes the on-screen copy instead', () => {
    const lines = diff(edit(clone(c5), 'vo-script', (n) => {
      const { variant: _v, ...rest } = n;
      return rest;
    }), c5);
    expect(lines).toEqual(['Changed: Your words: the script (Explore): you write the on-screen copy instead of the voice-over script']);
  });

  it("C3's route question reworded: what you are asked to choose at run time", () => {
    expect(diff(edit(clone(c3), 'draft', (n) => ({ ...n, on: 'whether you want the AI to replace your words' })), c3)).toEqual(['Changed: First draft (Refine): asks you to choose whether you want the AI to replace your words, instead of who writes the first draft']);
  });

  it("C1's optional trigger reworded", () => {
    expect(diff(edit(clone(c1), 'asset-if-plain', (n) => ({ ...n, trigger: 'you want images' })), c1)).toEqual(['Changed: Custom imagery (Refine): asks to run it when you want images, instead of when a human calls the design plain']);
  });

  it("C3's loop critic moved into an audit: it no longer ends its repeat", () => {
    const lines = diff(edit(clone(c3), 'critic', (n) => ({ op: 'audit', id: 'side-reads', lenses: [{ name: 'critic', body: n }] })), c3);
    expect(text(lines)).toMatch(/Outside critique \(Refine\): .*side by side.*its repeat no longer stops on its verdict/);
  });

  it('K1-C1: C1’s VOICE moved behind a check that can end its round', () => {
    const r = clone(c1);
    const d3 = stageOf(r, 'D3').body;
    const i = at(d3, 'voice');
    const check = structuredClone(d3.steps[at(d3, 'critic-check')]);
    d3.steps[i] = { op: 'loop', id: 'final-pass', body: { op: 'seq', steps: [{ op: 'step', id: 'pass-render', role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] }, { ...check, id: 'pass-check' }, d3.steps[i]] }, gate: { metric: 'check-clean', hidden: false, holder: 'harness', probe: 1, max: 1, onCap: 'policy-best-snapshot', onNoConverge: 'continue' } };
    const lines = diff(r, c1);
    expect(lines).toContain('Changed: Your words (Finish): now runs only when the check finds problems');
  });

  it('K2b: C5’s render-in-scene moved after the late VOICE', () => {
    const r = clone(c5);
    const d2 = stageOf(r, 'D2').body;
    const [moved] = d2.steps.splice(at(d2, 'render-in-scene'), 1);
    const d3 = stageOf(r, 'D3').body;
    d3.steps.splice(at(d3, 'voice') + 1, 0, moved);
    expect(text(diff(r, c5))).toMatch(/Changed: Composite \(Finish\): runs in Finish instead of Refine; now runs after your words/);
  });

  it("C5's retry moved from D2 to D1", () => {
    expect(diff(edit(clone(c5), 'launch-gate', (n) => ({ ...n, retry: { stage: 'D1', times: 1 } })), c5)).toEqual(['Changed: Outside critique: launch check (Finish): on a fail, re-runs Explore instead of Refine']);
  });

  it('a changed loop cap still reads as before', () => {
    expect(diff(edit(clone(c4), 'critic-loop', (n) => ({ ...n, gate: { ...n.gate, max: 1 } })), c4)).toEqual(['Changed: Outside critique repeats up to 1 round instead of 2']);
  });

  it('a change the describers do not name reads "Other technical changes that affect how it runs"', () => {
    expect(diff(edit(clone(c1), 'critic', (n) => ({ ...n, isolated: false })), c1)).toEqual(['Other technical changes that affect how it runs.']);
  });
});

// ---- Steps shown together ---------------------------------------------------------------------------------------

/** The recipe without the nodes of these ids, wherever they sit. */
function without(r: N, ids: string[]): N {
  const keep = (n: N): N => {
    const c: N = { ...n };
    if (c.steps) c.steps = c.steps.filter((x: N) => !ids.includes(x.id)).map(keep);
    if (c.body) c.body = keep(c.body);
    if (c.branches) c.branches = c.branches.map((b: N) => ({ ...b, body: keep(b.body) }));
    if (c.lenses) c.lenses = c.lenses.map((l: N) => ({ ...l, body: keep(l.body) }));
    return c;
  };
  return { ...r, stages: r.stages.map((s: N) => ({ ...s, body: keep(s.body) })) };
}

/**
 * A step the nearest recipe's presentation shows with another as its lead (a writer with the step whose findings it
 * applies, say) is named by its part in that shown step, so that a line about it does not read as if it were about the
 * whole. A part removed with its lead is said once, by the lead, and lines that come out the same are said once.
 */
describe('steps shown together are named by their part', () => {
  it('C1 without only its swap step: the swaps go, and the sweep stays and no longer asks', () => {
    expect(diff(without(clone(c1), ['apply-swaps']), c1)).toEqual(['Removed: the AI’s swaps in Cliché sweep (Finish)', 'Changed: Cliché sweep (Finish): no longer asks you which of its finds to swap']);
  });

  it('a writer is named by what it does with the findings it applies; another step by its own label, or as part of the shown step', () => {
    expect(diff(without(clone(c1), ['critic-fix']), c1)).toEqual(['Removed: the AI’s fixes in Outside critique (Refine)']);
    expect(diff(without(clone(c4), ['apply-cut']), c4)).toEqual(['Removed: the AI’s removals in Trim (Finish)']);
    expect(diff(without(clone(c5), ['regenerate']), c5)).toEqual(['Removed: the AI’s fixes in Motion (Refine)']);
    expect(diff(without(clone(c2), ['sharpen']), c2)).toEqual(['Removed: Directions to react to in Your direction (Explore)']);
    expect(diff(without(clone(c5), ['matte']), c5)).toEqual(['Removed: part of Composite (Refine)']);
    expect(diff(edit(clone(c1), 'critic-fix', (n) => ({ ...n, tier: 'big' })), c1)).toEqual(['Changed: the AI’s fixes in Outside critique (Refine): uses the bigger model']);
  });

  it('a part removed with its lead is said once, by the lead', () => {
    expect(diff(without(clone(c1), ['cut', 'apply-cut', 'tells-sweep', 'apply-swaps']), c1)).toEqual(['Removed: Trim (Finish)', 'Removed: Cliché sweep (Finish)']);
  });

  it('lines that come out the same are said once', () => {
    const r = clone(c1);
    const d3 = stageOf(r, 'D3').body;
    const swaps = d3.steps[at(d3, 'apply-swaps')];
    d3.steps.push({ ...swaps, id: 'polish-1' }, { ...swaps, id: 'polish-2' });
    expect(diff(r, c1)).toEqual(['Added: Revise (Finish)']);
  });
});
