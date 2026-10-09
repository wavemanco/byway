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
  if (field === 'inputs' || field === 'consumes' || field === 'produces') return (v as string[]).includes('brief') ? (v as string[]).filter((x) => x !== 'brief') : [...(v as string[]), 'brief'];
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

  it.each(SEVEN.map((r) => [r.id, r] as const))('%s: every port list reordered reads "The same steps"', (_id, nearest) => {
    const r = clone(nearest);
    walk(r as Recipe, (n: Node) => {
      if (n.op === 'step') Object.assign(n, { consumes: [...n.consumes].reverse(), produces: [...n.produces].reverse() });
    });
    r.inputs = [...r.inputs].reverse();
    expect(diff(r, nearest)).toEqual(same(nearest));
  });

  it('a seq wrapped around a seq changes nothing', () => {
    const r = clone(c4);
    r.stages[2].body = { op: 'seq', steps: [{ op: 'seq', steps: r.stages[2].body.steps.slice(0, 3) }, ...r.stages[2].body.steps.slice(3)] };
    expect(diff(r, c4)).toEqual(same(c4));
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
