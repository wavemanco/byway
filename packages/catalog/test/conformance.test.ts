import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXCEPTIONS } from '@byway/protocol';
import { parseRecipe, recipeHash, steps, walk, type Recipe } from '@byway/recipe';
import { validate } from '@byway/validator';
import { CATALOG, bBon, bPlain, bRandom, bSkill, c1, c1h, c1hAblations } from '../src/index.ts';
import { RECIPES_DIR, manifestText, recipeFileText } from '../src/emit.ts';

const byId = (id: string): Recipe => {
  const r = CATALOG.find((x) => x.id === id);
  if (!r) throw new Error(`no recipe ${id}`);
  return r;
};

describe('catalog conformance', () => {
  it('has the Milestone 0 recipe ids', () => {
    expect(CATALOG.map((r) => r.id)).toEqual([
      'c1', 'c1h', 'c1h-no-seed', 'c1h-no-critic', 'c1h-no-asset', 'c1h-no-d3', 'c1h-critic-self',
      'b-plain', 'b-random', 'b-skill', 'b-bon',
    ]);
  });

  it.each(CATALOG.map((r) => [r.id, r] as const))('%s parses, is hashed, and validates with exactly its cited exceptions', (_id, r) => {
    expect(parseRecipe(structuredClone(r))).toEqual(r);
    expect(r.hash).toBe(recipeHash(r));
    const v = validate(r);
    expect(v.violations).toEqual([]);
    expect(v.exceptionsUsed).toEqual(r.exceptions);
  });

  it.each(CATALOG.flatMap((r) => r.exceptions.map((ex) => [r.id, ex] as const)))(
    '%s needs %s: removing it surfaces what it relaxes',
    (id, ex) => {
      const r = structuredClone(byId(id));
      r.exceptions = r.exceptions.filter((x) => x !== ex);
      const ruleIds = validate(r).violations.map((v) => v.ruleId);
      expect(ruleIds.some((rule) => EXCEPTIONS[ex]!.relaxes.includes(rule))).toBe(true);
    },
  );
});

describe('lineage', () => {
  it('C1-H derives from C1 through the Study 1 binding map', () => {
    expect(c1h.parent).toEqual({ hash: c1.hash, derivation: { transform: 'binding', version: 1, map: 'S1-BIND' } });
  });

  it('every ablation derives from C1-H on the research-frozen channel', () => {
    for (const a of c1hAblations) {
      expect(a.kind).toBe('ablation');
      expect(a.channel).toBe('research-frozen');
      expect(a.parent?.hash).toBe(c1h.hash);
    }
  });

  it('-SEED replaces the seeded build with the plain prompt and suspends DR1', () => {
    const r = byId('c1h-no-seed');
    expect(steps(r).some(({ step }) => step.role === 'seed')).toBe(false);
    expect(steps(r).find(({ step }) => step.id === 'seed-build')?.step.prompt).toBe('article.B1');
    expect(validate(r).suspended).toEqual(['DR1']);
  });

  it('-CRITIC has no critic loop and no longer needs SM-2', () => {
    const r = byId('c1h-no-critic');
    let loops = 0;
    walk(r, (n) => {
      if (n.op === 'loop') loops += 1;
    });
    expect(loops).toBe(0);
    expect(r.exceptions).not.toContain('SM-2');
  });

  it('-ASSET has no ASSET step', () => {
    expect(steps(byId('c1h-no-asset')).some(({ step }) => step.block === 'ASSET')).toBe(false);
  });

  it('-D3 has no D3 stage and drops the D3 exceptions', () => {
    const r = byId('c1h-no-d3');
    expect(r.stages.map((s) => s.stage)).toEqual(['D1', 'D2']);
    expect(r.exceptions).toEqual(['C1-DR2', 'SM-2', 'SM-6']);
  });

  it('CRITIC-self turns the critic into a non-isolated mid-tier self-critique under SM-5', () => {
    const r = byId('c1h-critic-self');
    const critic = steps(r).find(({ step }) => step.role === 'critic')?.step;
    expect(critic).toMatchObject({ isolated: false, tier: 'mid', prompt: 'project.critic-ok' });
    expect(r.exceptions.at(-1)).toBe('SM-5');
    expect(r.parent?.derivation.transform).toBe('critique-self');
  });
});

describe('baselines', () => {
  it('use the article baseline prompts and four fresh sessions', () => {
    for (const [r, prompt] of [[bPlain, 'article.B1'], [bRandom, 'article.B2'], [bSkill, 'article.B1']] as const) {
      const body = r.stages[0]!.body;
      expect(body.op === 'replicate' && body.n).toBe(4);
      expect(steps(r)[0]?.step.prompt).toBe(prompt);
    }
    expect(steps(bSkill)[0]?.step.knobs).toEqual({ skill: 'anthropic/frontend-design@registered-pin' });
  });

  it('B-BoN picks four candidates with the same critic prompt as C1-H', () => {
    const judge = steps(bBon).find(({ step }) => step.role === 'judge')?.step;
    const c1hCritic = steps(c1h).find(({ step }) => step.role === 'critic')?.step;
    expect(judge?.prompt).toBe(c1hCritic?.prompt);
    let k = 0;
    walk(bBon, (n) => {
      if (n.op === 'pick') k = n.k;
    });
    expect(k).toBe(4);
  });
});

describe('committed recipe files', () => {
  it('match the catalog exactly (no drift, no hand edits)', () => {
    for (const r of CATALOG) {
      expect(readFileSync(join(RECIPES_DIR, `${r.id}.json`), 'utf8')).toBe(recipeFileText(r));
    }
    expect(readFileSync(join(RECIPES_DIR, 'manifest.json'), 'utf8')).toBe(manifestText());
  });

  it('contain no stray files', () => {
    const expected = new Set([...CATALOG.map((r) => `${r.id}.json`), 'manifest.json']);
    expect(readdirSync(RECIPES_DIR).filter((f) => !expected.has(f))).toEqual([]);
  });
});
