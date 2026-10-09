/**
 * The semantic projection (F08, ADR-0092 stage 3) and the field roles it is built from. FIELD_ROLES must classify
 * exactly the schema's fields, so a field added to the schema cannot be left out of "what runs": the mapped type makes
 * a missing one a type error, and this test holds the table to the zod schema itself, object by object.
 */
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { FIELD_ROLES, NodeSchema, projectRecipe, RecipeSchema, sameNode, sameRun, seq, step, type Node, type Recipe } from '../src/index.ts';
import { minimalRecipe } from './fixtures.ts';

type Shape = Record<string, z.ZodType>;
const shapeOf = (s: unknown): Shape => {
  let t = s as { shape?: Shape; unwrap?: () => unknown; def?: { innerType?: unknown; element?: unknown } };
  // Unwrap optional and array wrappers down to the object.
  for (let i = 0; i < 4 && !t.shape; i++) t = (t.def?.innerType ?? t.def?.element ?? t) as typeof t;
  if (!t.shape) throw new Error('not an object schema');
  return t.shape;
};
const keys = (s: unknown) => Object.keys(shapeOf(s)).sort();
const roles = (k: keyof typeof FIELD_ROLES) => Object.keys(FIELD_ROLES[k]).sort();

describe('FIELD_ROLES classifies exactly the schema’s fields', () => {
  const nodes = new Map((NodeSchema as unknown as { options: { shape: Shape }[] }).options.map((o) => [(o.shape.op as unknown as { def: { values: string[] } }).def.values[0]!, o]));

  it.each([
    ['step', 'step'],
    ['seq', 'seq'],
    ['replicate', 'replicate'],
    ['each', 'each'],
    ['pick', 'pick'],
    ['loop', 'loop'],
    ['route', 'route'],
    ['optional', 'optional'],
    ['audit', 'audit'],
    ['gate', 'oneShotGate'],
    ['relay', 'relay'],
  ] as const)('the %s node', (op, kind) => {
    expect(roles(kind)).toEqual(keys(nodes.get(op)));
  });

  it('the objects inside nodes, a stage and the recipe', () => {
    expect(roles('gate')).toEqual(keys(shapeOf(nodes.get('loop')).gate));
    expect(roles('pass')).toEqual(keys(shapeOf(nodes.get('gate')).pass));
    expect(roles('retry')).toEqual(keys(shapeOf(nodes.get('gate')).retry));
    expect(roles('lens')).toEqual(keys(shapeOf(nodes.get('audit')).lenses));
    expect(roles('branch')).toEqual(keys(shapeOf(nodes.get('route')).branches));
    expect(roles('stage')).toEqual(keys(shapeOf(RecipeSchema).stages));
    expect(roles('recipe')).toEqual(keys(RecipeSchema));
  });
});

const build = (id: string, extra: Partial<Node> = {}): Node => step({ id, role: 'build', actor: 'model', tier: 'mid', consumes: ['intent', 'brief'], produces: ['artifact'], writes: true, ...extra } as never);
const recipeWith = (body: Node, extra: Partial<Recipe> = {}): Recipe => ({ ...minimalRecipe(), stages: [{ stage: 'D1', body }], ...extra });

describe('the projection', () => {
  it('drops names: ids, the title and the hash', () => {
    expect(sameRun(recipeWith(build('a'), { id: 'one', title: 'One' }), recipeWith(build('b'), { id: 'two', title: 'Two' }))).toBe(true);
  });

  it('reads port lists and inputs as sets', () => {
    expect(sameNode(build('a'), build('a', { consumes: ['brief', 'intent'] } as never))).toBe(true);
    expect(sameRun(recipeWith(build('a'), { inputs: ['intent', 'tells'] }), recipeWith(build('a'), { inputs: ['tells', 'intent'] }))).toBe(true);
  });

  it('reads a seq as order only: nested seqs flatten, and a seq of one is its step', () => {
    expect(sameNode(seq(seq(build('a'), build('b')), build('c')), seq(build('a'), seq(build('b'), build('c'))))).toBe(true);
    expect(sameNode(seq(build('a')), build('a'))).toBe(true);
    const big = build('b', { tier: 'big' } as never);
    expect(sameNode(seq(build('a'), big), seq(big, build('a')))).toBe(false);
  });

  it('keeps every semantic value: a changed tier, a knob or the medium', () => {
    expect(sameNode(build('a'), build('a', { tier: 'big' } as never))).toBe(false);
    expect(sameNode(build('a'), build('a', { knobs: { avoid: [] } } as never))).toBe(false);
    expect(sameRun(recipeWith(build('a')), recipeWith(build('a'), { medium: 'prose' }))).toBe(false);
  });

  it("leaves out the fields a composer forces (kind, channel, family) and a sit-out's reason", () => {
    expect(sameRun(recipeWith(build('a')), recipeWith(build('a'), { kind: 'composed', channel: 'workspace', family: 'C4' }))).toBe(true);
    const sitting = (reason: string) => recipeWith(build('a'), { sitsOut: [{ block: 'ASSET', reason }] });
    expect(sameRun(sitting('none here'), sitting('not for memos'))).toBe(true);
    expect(projectRecipe(sitting('x'))).toMatchObject({ sitsOut: ['ASSET'] });
  });
});
