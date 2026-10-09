/**
 * Optional reads (ADR-0089): a model step may read a port when an earlier optional branch made it (`reads`), as C7's
 * implement reads the spec interview's brief. The field is an additive part of byway.recipe/1: a recipe without it
 * parses and hashes exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { inputsOf, parseRecipe, recipeHash, type Recipe, type Step } from '../src/index.ts';
import { minimalRecipe } from './fixtures.ts';

const withReads = (reads: unknown): unknown => {
  const r = minimalRecipe() as unknown as { stages: { body: Record<string, unknown> }[] };
  r.stages[0]!.body.reads = reads;
  return r;
};

describe('a step’s optional reads', () => {
  it('parse as a list of ports, and an unknown port is refused with its path', () => {
    const r = parseRecipe(withReads(['brief']));
    expect((r.stages[0]!.body as Step).reads).toEqual(['brief']);
    let err: unknown;
    try {
      parseRecipe(withReads(['vibes']));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ZodError);
    expect((err as ZodError).issues[0]?.path).toEqual(['stages', 0, 'body', 'reads', 0]);
  });

  it('come after the consumed ports in what a step takes in (inputsOf)', () => {
    const s = parseRecipe(withReads(['brief'])).stages[0]!.body as Step;
    expect(inputsOf(s)).toEqual(['intent', 'brief']);
    expect(inputsOf(minimalRecipe().stages[0]!.body as Step)).toEqual(['intent']);
  });

  it('leave the hash of a recipe that does not use them as it was', () => {
    const plain: Recipe = minimalRecipe();
    const undefinedReads = { ...plain, stages: [{ ...plain.stages[0]!, body: { ...(plain.stages[0]!.body as Step), reads: undefined } }] } as Recipe;
    expect(recipeHash(undefinedReads)).toBe(recipeHash(plain));
    expect(recipeHash(parseRecipe(withReads(['brief'])))).not.toBe(recipeHash(plain));
  });
});
