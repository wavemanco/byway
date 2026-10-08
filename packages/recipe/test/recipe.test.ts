import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { parseRecipe, recipeHash, walk, withHash, type Recipe } from '../src/index.ts';
import { minimalRecipe } from './fixtures.ts';

const RECIPES = join(import.meta.dirname, '../../../recipes');

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

  it('rejects reserved key names in knobs, which would escape hashing and checks', () => {
    const text = JSON.stringify(minimalRecipe()).replace('"writes":true', '"writes":true,"knobs":{"__proto__":{"aiDetector":true}}');
    const parsed = JSON.parse(text);
    expect(Object.hasOwn(parsed.stages[0].body.knobs, '__proto__')).toBe(true);
    expect(() => parseRecipe(parsed)).toThrow(ZodError);
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

/**
 * The minimal recipe read back from JSON text, with `edit` applied to that text first. A lone surrogate reaches a
 * recipe only this way: as a JSON \u escape written by a model or into a file.
 */
const fromText = (edit: (text: string) => string): unknown => JSON.parse(edit(JSON.stringify(minimalRecipe())));
const withKnobs = (knobsJson: string) => fromText((t) => t.replace('"writes":true', `"writes":true,"knobs":${knobsJson}`));

describe('parseRecipe: every recipe it returns can be hashed (F19)', () => {
  it.each([
    ['a knob name', withKnobs('{"\\ud800":"x"}'), '$.stages[0].body.knobs: property name "\\ud800"'],
    ['a knob value', withKnobs('{"k":"v\\ud800"}'), '$.stages[0].body.knobs.k: string'],
    ['the title', fromText((t) => t.replace('"title":"Minimal"', '"title":"x\\ud800"')), '$.title: string'],
    ['a knob name under a bad knob name', withKnobs('{"\\ud800":{"x\\udc00":"y"}}'), '$.stages[0].body.knobs: property name "\\ud800"'],
  ])('refuses a lone surrogate in %s with one well-formed issue naming where it is', (_label, input, where) => {
    let error: unknown;
    try {
      parseRecipe(input);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ZodError);
    const issues = (error as ZodError).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'custom', path: [], message: `the recipe cannot be hashed: ${where} contains a lone surrogate` });
    expect(issues[0]!.message.isWellFormed()).toBe(true);
  });

  it('either refuses an adversarial input with a ZodError or returns a recipe that hashes', () => {
    const inputs: Record<string, unknown> = {
      'well-formed': minimalRecipe(),
      'astral knob name and value': withKnobs('{"\\ud83d\\ude00":"\\ud83d\\ude00"}'),
      'lone surrogate in the title': fromText((t) => t.replace('"title":"Minimal"', '"title":"\\udc00"')),
      'lone surrogate in a knob name': withKnobs('{"a\\udbff":1}'),
      'lone surrogate in a nested knob name': withKnobs('{"k":{"ok":[{"\\ud800":1}]}}'),
      'lone surrogate in a knob value': withKnobs('{"k":["\\udfff"]}'),
      'lone surrogate in a sits-out reason': fromText((t) => t.replace('"sitsOut":[]', '"sitsOut":[{"block":"SEED","reason":"r\\ud800"}]')),
      'lone surrogate in an exception': fromText((t) => t.replace('"exceptions":[]', '"exceptions":["e\\ud800"]')),
      'a number too large for JSON': withKnobs('{"k":1e400}'),
      'a reserved key': withKnobs('{"__proto__":{"a":1}}'),
    };
    const returned: string[] = [];
    for (const [label, input] of Object.entries(inputs)) {
      let recipe: Recipe;
      try {
        recipe = parseRecipe(input);
      } catch (e) {
        expect(e, label).toBeInstanceOf(ZodError);
        continue;
      }
      expect(() => recipeHash(recipe), label).not.toThrow();
      returned.push(label);
    }
    expect(returned).toEqual(['well-formed', 'astral knob name and value']);
  });

  it('hashes every stored catalog recipe exactly as before once read back through parseRecipe', () => {
    const files = readdirSync(RECIPES).filter((f) => f.endsWith('.json') && f !== 'manifest.json');
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const stored = JSON.parse(readFileSync(join(RECIPES, file), 'utf8')) as Recipe;
      expect(recipeHash(parseRecipe(stored)), file).toBe(stored.hash);
    }
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
