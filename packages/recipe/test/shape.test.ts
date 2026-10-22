/**
 * The shape bound (F02, ADR-0092 stage 2): a recipe too deep, too large or with too many nodes is refused by
 * parseRecipe as a schema error with a path, before anything walks it. Before this, about a thousand nested steps made
 * the reserved-key walk overflow the stack, and the RangeError escaped every caller's ZodError handling.
 */
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { parseRecipe, SHAPE_LIMITS, shapeProblem, type Node, type Recipe } from '../src/index.ts';
import { minimalRecipe } from './fixtures.ts';

function parseError(input: unknown): ZodError {
  try {
    parseRecipe(input);
  } catch (e) {
    if (e instanceof ZodError) return e;
    throw e;
  }
  throw new Error('expected a ZodError');
}

const build = (id: string): Node => ({ op: 'step', id, role: 'build', actor: 'model', tier: 'mid', prompt: 'article.B1', consumes: ['intent'], produces: ['artifact'], writes: true });

/** A recipe whose D1 is `depth` seqs, one inside the other, around one build. */
function nested(depth: number): Recipe {
  let body: Node = build('build');
  for (let i = 0; i < depth; i++) body = { op: 'seq', steps: [body] };
  return { ...minimalRecipe(), stages: [{ stage: 'D1', body }] };
}

describe('the shape bound', () => {
  it('refuses 2,000 nested seqs as a schema error with a path, not a RangeError', () => {
    const e = parseError(nested(2000));
    expect(e.issues[0]!.message).toMatch(/nests deeper than 64 levels/);
    expect(e.issues[0]!.path.slice(0, 4)).toEqual(['stages', 0, 'body', 'steps']);
  });

  it('refuses knobs nested 5,000 deep, which no node count would see', () => {
    let knob: unknown = 1;
    for (let i = 0; i < 5000; i++) knob = { k: knob };
    const r = minimalRecipe();
    (r.stages[0]!.body as { knobs?: unknown }).knobs = { deep: knob };
    expect(parseError(r).issues[0]!.message).toMatch(/nests deeper/);
  });

  it('names where it went over by a well-formed path: a lone surrogate in a name written as backslash-u text', () => {
    let knob: unknown = 1;
    for (let i = 0; i < 100; i++) knob = { k: knob };
    const r = minimalRecipe();
    (r.stages[0]!.body as { knobs?: unknown }).knobs = { [JSON.parse('"b\\udc00"') as string]: knob };
    const path = parseError(r).issues[0]!.path;
    expect(path.slice(0, 6)).toEqual(['stages', 0, 'body', 'knobs', 'b\\udc00', 'k']);
    expect(path.every((p) => typeof p !== 'string' || p.isWellFormed())).toBe(true);
  });

  it('refuses a cyclic object as too deep instead of walking it forever', () => {
    const r = minimalRecipe() as unknown as Record<string, unknown>;
    const loopy: Record<string, unknown> = {};
    loopy.self = loopy;
    (r.stages as { body: Record<string, unknown> }[])[0]!.body.knobs = loopy;
    expect(parseError(r).issues[0]!.message).toMatch(/nests deeper/);
  });

  it('refuses more than 10,000 nodes', () => {
    // Small nodes, so the count is met before the size: the bound is checked before the schema.
    const steps = Array.from({ length: SHAPE_LIMITS.nodes + 1 }, () => ({ op: 'seq' }) as unknown as Node);
    const r: Recipe = { ...minimalRecipe(), stages: [{ stage: 'D1', body: { op: 'seq', steps } }] };
    expect(parseError(r).issues[0]!.message).toMatch(/more than 10000 steps and operators/);
  });

  it('refuses a recipe over 1 MiB, however flat', () => {
    const r = minimalRecipe();
    r.title = 'x'.repeat(2 * 1024 * 1024);
    expect(parseError(r).issues[0]!.message).toMatch(/larger than 1 MiB/);
    expect(parseError(r).issues[0]!.path).toEqual([]);
  });

  it('counts UTF-8 bytes, so a title of 400,000 three-byte characters is over', () => {
    const r = minimalRecipe();
    r.title = '€'.repeat(400_000);
    expect(shapeProblem(r)?.message).toMatch(/larger than 1 MiB/);
  });

  it('leaves recipes inside the bound to the schema: 25 nested seqs (about 55 levels of JSON) parse', () => {
    expect(parseRecipe(nested(25)).id).toBe('minimal');
    expect(shapeProblem(nested(25))).toBeUndefined();
  });
});
