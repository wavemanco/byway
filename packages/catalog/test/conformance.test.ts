import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXCEPTIONS } from '@byway/protocol';
import { parseRecipe, recipeHash, steps, walk, type Recipe } from '@byway/recipe';
import { validate } from '@byway/validator';
import { BON_N_PLANNING } from '../src/baselines.ts';
import { CATALOG, bBon, bPlain, bRandom, bSkill, c1, c1h, c1hAblations } from '../src/index.ts';
import { RECIPES_DIR, manifestText, recipeFileText } from '../src/emit.ts';

const byId = (id: string): Recipe => {
  const r = CATALOG.find((x) => x.id === id);
  if (!r) throw new Error(`no recipe ${id}`);
  return r;
};

describe('catalog conformance', () => {
  it('has the eight protocol configurations, then the Study 1 arms', () => {
    expect(CATALOG.map((r) => r.id)).toEqual([
      'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c6a', 'c7',
      'c1h', 'c1h-no-seed', 'c1h-no-critic', 'c1h-no-asset', 'c1h-no-d3', 'c1h-critic-self',
      'b-plain', 'b-random', 'b-skill', 'b-bon',
    ]);
  });

  it('keeps the Milestone 0 recipe hashes (the IR extension is backward compatible)', () => {
    expect(Object.fromEntries(CATALOG.filter((r) => !/^c[2-7]a?$/.test(r.id)).map((r) => [r.id, r.hash]))).toEqual({
      c1: 'sha256:686bd9726a32f7d655653fb751ab574a53fb12fd9d733f7c358c67a27d08c577',
      c1h: 'sha256:d2cf85ec155280772a12f4efa17e3db0dc3bee3835a7dd5a7840e35592b35e1a',
      'c1h-no-seed': 'sha256:7f85f2140b637e28e9c457c3aac227c8be5687a7a1d67c9361ee47569c8485a6',
      'c1h-no-critic': 'sha256:bf5b4e6cdbf196c10b4a00d80a422dc04482b4fd9aa405118984ba297b09eb52',
      'c1h-no-asset': 'sha256:999023ea342f7b0cde107d4cdf39de68c2d30f55b37af45648c7fe1cd45bb69d',
      'c1h-no-d3': 'sha256:ca9d62d4a264f2e32cd9f1780b72006182bdd3a26bdae4cb857bafad0d8a6ea5',
      'c1h-critic-self': 'sha256:116871b9e8563e353072e2addd1b31b7fbacad09ca38549e6da1fdb8f7c84cc2',
      'b-plain': 'sha256:715cfe230315eb9255e306084d644e0edb42430151cfb7a9e9ca9c94846154ba',
      'b-random': 'sha256:63b413291ebf8d9168109c8043dd582086b1c958696c702ee758a165eda97306',
      'b-skill': 'sha256:c2ef1ad6f413e9fe1909bd4c2ac051c64d752eb9c6b6f3c36892c38a75464b7a',
      'b-bon': 'sha256:df007ffa06720c9c542e6624a99f31f4d2a9755d419a69e4b406d2138b9e1f62',
    });
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

  it('no research-frozen recipe uses optional reads (ADR-0089), so the Study 1 arms run as they were written', () => {
    const frozen = CATALOG.filter((r) => r.channel === 'research-frozen');
    expect(frozen.length).toBeGreaterThan(0);
    for (const r of frozen) expect(steps(r).filter(({ step }) => step.reads !== undefined).map(({ step }) => step.id), r.id).toEqual([]);
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
    expect(r.sitsOut.map((s) => s.block)).toEqual(['VISION', 'RELAY', 'VOICE', 'CUT', 'TELLS']);
  });

  it('CRITIC-self turns the critic into a non-isolated mid-tier self-critique under SM-5', () => {
    const r = byId('c1h-critic-self');
    const critic = steps(r).find(({ step }) => step.role === 'critic')?.step;
    expect(critic).toMatchObject({ isolated: false, tier: 'mid', prompt: 'study1.A.CRIT-C' });
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

  it('B-BoN is per-slot best-of-N with the A.14 selector (Study 1 §5.3)', () => {
    const body = bBon.stages[0]!.body;
    expect(body.op === 'replicate' && body.n).toBe(4);
    const shape: string[] = [];
    walk(bBon, (n) => {
      if (n.op === 'replicate') shape.push(`replicate:${n.n}`);
      if (n.op === 'pick') shape.push(`pick:${n.mode}:${n.k}`);
    });
    expect(shape).toEqual(['replicate:4', `replicate:${BON_N_PLANNING}`, 'pick:C:1']);
    const selector = steps(bBon).find(({ step }) => step.role === 'judge')?.step;
    expect(selector).toMatchObject({ prompt: 'study1.A14', isolated: true, tier: 'big', produces: [] });
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

describe('Study 1 fidelity (review findings)', () => {
  const c1hFamily = [c1h, ...c1hAblations];

  it('no C1-H arm runs the CRITIC-check or cites C1-DR7 (S1-BIND: it sits out)', () => {
    for (const r of c1hFamily) {
      expect(steps(r).some(({ step }) => step.role === 'check'), r.id).toBe(false);
      expect(r.exceptions, r.id).not.toContain('C1-DR7');
    }
  });

  it('the C1-H critic sees one desktop render and runs the worker-written prompt', () => {
    for (const r of c1hFamily) {
      const critic = steps(r).find(({ step }) => step.role === 'critic')?.step;
      if (!critic) continue;
      expect(critic.knobs, r.id).toMatchObject({ renders: ['desktop'], calibration: false });
      expect(critic.prompt, r.id).toBe('study1.A.CRIT-C');
    }
  });

  it('the C1-H TELLS sweep is a fresh-context big-tier call and D3-auto uses the Appendix A prompts', () => {
    const d3 = steps(c1h).filter(({ stage }) => stage === 'D3').map(({ step }) => [step.id, step.prompt ?? null]);
    expect(d3).toEqual([
      ['cut-render', null], ['cut', 'study1.A9'], ['apply-cut', 'study1.A10'], ['tells-render', null],
      ['tells-sweep', 'study1.A11'], ['apply-swaps', 'study1.A12'], ['compare-render', null], ['tells-compare', 'study1.A13'],
    ]);
    expect(steps(c1h).find(({ step }) => step.id === 'tells-sweep')?.step).toMatchObject({ isolated: true, tier: 'big' });
  });

  it('C1-H ASSET carries no protocol slot policy; C1 keeps it', () => {
    expect(steps(c1h).find(({ step }) => step.block === 'ASSET')?.step.knobs).toBeUndefined();
    expect(steps(c1).find(({ step }) => step.block === 'ASSET')?.step.knobs).toEqual({ slots: 3, triesPerSlot: 3 });
  });

  it('C1 keeps the protocol amendments the study removes (three views, calibration, CRITIC-check)', () => {
    const critic = steps(c1).find(({ step }) => step.role === 'critic')?.step;
    expect(critic?.knobs).toMatchObject({ renders: ['desktop', 'mobile', 'fold'], calibration: true });
    expect(steps(c1).some(({ step }) => step.role === 'check')).toBe(true);
  });
});
