import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { parseRecipe, recipeHash, walk, withHash, type Recipe } from '../src/index.ts';
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

describe('parseRecipe', () => {
  it('accepts a minimal valid recipe', () => {
    expect(parseRecipe(minimalRecipe()).id).toBe('minimal');
  });

  it('rejects an unknown operator with a path', () => {
    const bad = minimalRecipe() as unknown as { stages: { body: unknown }[] };
    bad.stages[0]!.body = { op: 'lanes', id: 'x', lanes: [] };
    expect(parseError(bad).issues[0]?.path).toEqual(['stages', 0, 'body', 'op']);
  });

  it('rejects an unknown block code', () => {
    const bad = minimalRecipe() as unknown as { stages: { body: Record<string, unknown> }[] };
    bad.stages[0]!.body.block = 'MAGIC';
    expect(parseError(bad).issues[0]?.path).toEqual(['stages', 0, 'body', 'block']);
  });

  it('rejects an unknown port type', () => {
    const bad = minimalRecipe() as unknown as { stages: { body: Record<string, unknown> }[] };
    bad.stages[0]!.body.consumes = ['vibes'];
    expect(parseError(bad).issues[0]?.path).toEqual(['stages', 0, 'body', 'consumes', 0]);
  });

  it('rejects a stage without its name', () => {
    const bad = minimalRecipe() as unknown as { stages: Record<string, unknown>[] };
    delete bad.stages[0]!.stage;
    expect(parseError(bad).issues[0]?.path).toEqual(['stages', 0, 'stage']);
  });

  it('rejects unknown fields so typos cannot hide', () => {
    const bad = { ...minimalRecipe(), exeptions: [] };
    expect(parseError(bad).issues[0]?.code).toBe('unrecognized_keys');
  });

  it('parses nested operators', () => {
    const r = minimalRecipe();
    r.stages[0]!.body = {
      op: 'replicate',
      id: 'x4',
      n: 4,
      body: { op: 'seq', steps: [r.stages[0]!.body] },
    };
    expect(parseRecipe(r).stages[0]?.body.op).toBe('replicate');
  });
});

describe('recipeHash', () => {
  it('ignores the hash field', () => {
    const r = minimalRecipe();
    expect(recipeHash({ ...r, hash: 'sha256:00' })).toBe(recipeHash(r));
  });

  it('changes when any step changes', () => {
    const a = minimalRecipe();
    const b = minimalRecipe();
    (b.stages[0]!.body as { prompt?: string }).prompt = 'article.B2';
    expect(recipeHash(a)).not.toBe(recipeHash(b));
  });

  it('withHash stores the hash', () => {
    const r = withHash(minimalRecipe());
    expect(r.hash).toBe(recipeHash(r));
    expect(r.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('treats an absent optional field and an undefined one alike', () => {
    const a = minimalRecipe();
    const b = minimalRecipe() as Recipe & { parent?: undefined };
    b.parent = undefined;
    expect(recipeHash(b)).toBe(recipeHash(a));
  });
});

describe('walk', () => {
  it('visits every node with its path and stage', () => {
    const r = minimalRecipe();
    r.stages[0]!.body = {
      op: 'replicate',
      id: 'x4',
      n: 4,
      body: { op: 'seq', steps: [r.stages[0]!.body] },
    };
    const seen: string[] = [];
    walk(r, (node, path, stage) => seen.push(`${stage}:${path}:${node.op}`));
    expect(seen).toEqual([
      'D1:stages[0].body:replicate',
      'D1:stages[0].body.body:seq',
      'D1:stages[0].body.body.steps[0]:step',
    ]);
  });
});
