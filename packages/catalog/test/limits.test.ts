/**
 * The catalog inside the limits (F02, ADR-0092 stage 2): every CATALOG recipe, research-frozen ones included, passes
 * the engine's limits and the composed ones (a copy of C1–C7 composed against itself gains no finding), and its work
 * bound is pinned, so a change to a recipe or to the bound's walk is seen here. B-BoN's N is a planning value until
 * Study 1 fixes it; every N up to 64 runs on the engine.
 */
import { describe, expect, it } from 'vitest';
import { composedLimitProblems, engineProblems, recipeSize, workBound, type Node, type Recipe, type Replicate, type Seq } from '@byway/recipe';
import { bBon, CATALOG } from '../src/index.ts';

/** stepRuns, peak: each recipe's worst case, as the bound walks it. (The seeds it once counted no longer travel, P2.) */
const PINNED: Record<string, [number, number]> = {
  c1: [147, 4],
  c2: [34, 12],
  c3: [42, 6],
  c4: [26, 1],
  c5: [201, 8],
  c6: [103, 3],
  c6a: [122, 6],
  c7: [37, 1],
  c1h: [108, 4],
  'c1h-no-seed': [108, 4],
  'c1h-no-critic': [44, 4],
  'c1h-no-asset': [104, 4],
  'c1h-no-d3': [76, 4],
  'c1h-critic-self': [108, 4],
  'b-plain': [4, 4],
  'b-random': [4, 4],
  'b-skill': [4, 4],
  'b-bon': [24, 20],
};

describe('every CATALOG recipe is inside the limits', () => {
  it.each(CATALOG.map((r) => [r.id, r] as const))('%s', (id, r) => {
    expect(engineProblems(r)).toEqual([]);
    expect(composedLimitProblems(r)).toEqual([]);
    const b = workBound(r);
    expect([b.stepRuns, b.peak]).toEqual(PINNED[id]);
  });

  it('pins every recipe', () => {
    expect(Object.keys(PINNED).sort()).toEqual(CATALOG.map((r) => r.id).sort());
  });

  it("the catalog's largest shapes, as the design measured them: depth 6, 42 nodes, under 6.5 KB", () => {
    const sizes = CATALOG.map(recipeSize);
    expect(Math.max(...sizes.map((s) => s.depth))).toBe(6);
    expect(Math.max(...sizes.map((s) => s.nodes))).toBe(42);
    expect(Math.max(...sizes.map((s) => s.bytes))).toBeLessThan(6.5 * 1024);
  });
});

/** B-BoN with N builds per slot. */
function bonWith(n: number): Recipe {
  const r = structuredClone(bBon);
  const slot = (r.stages[0]!.body as Replicate).body as Seq;
  (slot.steps[0] as Replicate).n = n;
  return r;
}

describe("B-BoN's N", () => {
  it.each(Array.from({ length: 64 }, (_, i) => i + 1))('N = %i runs on the engine', (n) => {
    expect(engineProblems(bonWith(n))).toEqual([]);
  });

  it('peak is 4N: N = 125 is the most that runs at once within 500, and N = 126 is over', () => {
    expect(workBound(bonWith(125)).peak).toBe(500);
    expect(engineProblems(bonWith(126)).map((p) => p.message)).toEqual(expect.arrayContaining([expect.stringMatching(/up to 504 steps can run at once/)]));
  });

  it('carries no option list into its builds: its first stage opens with the fan-out', () => {
    const first: Node = bBon.stages[0]!.body;
    expect(first.op).toBe('replicate');
  });
});
