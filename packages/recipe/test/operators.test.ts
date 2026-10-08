import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  audit,
  leaveOneOut,
  nodesInside,
  oneShotGate,
  parseRecipe,
  recipeHash,
  relay,
  seq,
  step,
  walk,
  type Node,
  type Recipe,
  type Step,
} from '../src/index.ts';
import { minimalRecipe } from './fixtures.ts';

const critic = (id: string): Step =>
  step({ id, role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, consumes: ['view'], produces: ['critique', 'score'] });
const render = (id: string): Step => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const clip = (id: string): Step =>
  step({ id, role: 'relay', block: 'RELAY', actor: 'model', tier: 'mid', consumes: ['anchor', 'artifact'], produces: ['artifact', 'anchor'], writes: true, keepsVoice: true });

function withBody(body: Node): Recipe {
  const r = minimalRecipe();
  r.stages[0]!.body = seq(r.stages[0]!.body, render('render'), body);
  return r;
}

function parseError(input: unknown): ZodError {
  try {
    parseRecipe(input);
  } catch (e) {
    if (e instanceof ZodError) return e;
    throw e;
  }
  throw new Error('expected a ZodError');
}

describe('parallel audit {{ A ‖ B }}', () => {
  const node = audit('annotate', [
    { name: 'critic', body: critic('critic') },
    { name: 'cut', body: step({ id: 'cut-marks', role: 'cut', block: 'CUT', actor: 'model', tier: 'big', isolated: true, consumes: ['view'], produces: ['critique'] }) },
  ]);

  it('builds, parses and round-trips', () => {
    expect(node).toEqual({ op: 'audit', id: 'annotate', lenses: [
      { name: 'critic', body: critic('critic') },
      { name: 'cut', body: expect.objectContaining({ id: 'cut-marks' }) },
    ] });
    const r = withBody(node);
    expect(parseRecipe(structuredClone(r))).toEqual(r);
  });

  it('needs at least one lens', () => {
    const r = withBody({ op: 'audit', id: 'empty', lenses: [] } as unknown as Node);
    expect(parseError(r).issues[0]?.path).toEqual(['stages', 0, 'body', 'steps', 2, 'lenses']);
  });

  it('walks every lens with a path', () => {
    const seen: string[] = [];
    walk(withBody(node), (n, path) => {
      if (n.op === 'step' && n.role !== 'build' && n.role !== 'render') seen.push(`${path}:${n.id}`);
    });
    expect(seen).toEqual(['stages[0].body.steps[2].lenses[0].body:critic', 'stages[0].body.steps[2].lenses[1].body:cut-marks']);
  });
});

describe('one-shot gate with bounded retry', () => {
  const node = oneShotGate(
    'launch-gate',
    critic('gate-critic'),
    { metric: 'critic-rank', threshold: 3, hidden: true, holder: 'harness' },
    { stage: 'D2', times: 1 },
  );

  it('builds with onFail: human and parses', () => {
    expect(node).toMatchObject({ op: 'gate', id: 'launch-gate', onFail: 'human', retry: { stage: 'D2', times: 1 } });
    const r = withBody(node);
    expect(parseRecipe(structuredClone(r))).toEqual(r);
  });

  it('omits retry when none is given', () => {
    expect('retry' in oneShotGate('g', critic('c'), { metric: 'critic-score', threshold: 9, hidden: true, holder: 'worker' })).toBe(false);
  });

  it('rejects an unknown retry stage', () => {
    const bad = withBody({ ...node, retry: { stage: 'D4', times: 1 } } as unknown as Node);
    expect(parseError(bad).issues[0]?.path).toEqual(['stages', 0, 'body', 'steps', 2, 'retry', 'stage']);
  });

  it('walks the gate body', () => {
    const seen: string[] = [];
    walk(withBody(node), (n, path) => {
      if (n.op === 'step' && n.role === 'critic') seen.push(path);
    });
    expect(seen).toEqual(['stages[0].body.steps[2].body']);
  });
});

describe('relay chain A ~> B', () => {
  const node = relay('shot-chain', 4, clip('clip'));

  it('builds, parses and walks', () => {
    expect(node).toEqual({ op: 'relay', id: 'shot-chain', maxLinks: 4, body: clip('clip') });
    const r = withBody(node);
    expect(parseRecipe(structuredClone(r))).toEqual(r);
    const seen: string[] = [];
    walk(r, (n, path) => {
      if (n.op === 'step' && n.role === 'relay') seen.push(path);
    });
    expect(seen).toEqual(['stages[0].body.steps[2].body']);
  });
});

describe('nodesInside', () => {
  it('collects every node strictly inside nodes of one operator', () => {
    const lensCritic = critic('lens-critic');
    const r = withBody(seq(audit('a', [{ name: 'c', body: seq(render('lens-render'), lensCritic) }]), critic('outside')));
    const inside = [...nodesInside(r, 'audit')].map((n) => (n.op === 'step' ? n.id : n.op));
    expect(inside).toEqual(['seq', 'lens-render', 'lens-critic']);
  });
});

describe('keepsVoice', () => {
  it('is an optional step flag that parses and changes the hash', () => {
    const a = minimalRecipe();
    const b = minimalRecipe();
    (b.stages[0]!.body as Step).keepsVoice = true;
    expect(parseRecipe(structuredClone(b))).toEqual(b);
    expect(recipeHash(a)).not.toBe(recipeHash(b));
  });
});

describe('derivations over the new operators', () => {
  it('the CRITIC bypass removes a one-shot critic gate', () => {
    const r = withBody(oneShotGate('gate', critic('gate-critic'), { metric: 'critic-score', threshold: 9, hidden: true, holder: 'harness' }));
    const a = leaveOneOut(r, 'CRITIC');
    let gates = 0;
    walk(a, (n) => {
      if (n.op === 'gate') gates += 1;
    });
    expect(gates).toBe(0);
  });

  it('the ASSET bypass recurses into lenses and relay links', () => {
    const asset = step({ id: 'asset', role: 'asset', block: 'ASSET', actor: 'model', tier: 'mid', consumes: ['artifact'], produces: ['artifact'], writes: true });
    const r = withBody(seq(relay('chain', 3, seq(clip('clip'), asset)), audit('a', [{ name: 'c', body: critic('critic') }])));
    const a = leaveOneOut(r, 'ASSET');
    const ids: string[] = [];
    walk(a, (n) => {
      if (n.op === 'step') ids.push(n.id);
    });
    expect(ids).toEqual(['build', 'render', 'clip', 'critic']);
  });
});
