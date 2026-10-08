/**
 * The product's plain-language view of the eight configurations (product spec §5). The presentation is hand-written
 * copy, so these tests tie it to the recipes it describes: every step and pick of a recipe is shown exactly once,
 * in its stage, and "who does it" is computed from the recipe's actors rather than typed.
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_CODES } from '@byway/protocol';
import { walk, type Recipe } from '@byway/recipe';
import { BLOCK_NAMES, PRESENTATIONS, PROTOCOL_CONFIGS, STAGE_NAMES, presentationOf, stepPresentation } from '../src/index.ts';

/** Step and pick ids of a recipe in walk order, with their stage and whether a human does them. */
function nodesOf(r: Recipe): { id: string; stage: 'D1' | 'D2' | 'D3'; human: boolean; model: boolean }[] {
  const out: { id: string; stage: 'D1' | 'D2' | 'D3'; human: boolean; model: boolean }[] = [];
  walk(r, (n, _path, stage) => {
    if (n.op === 'step' || n.op === 'pick') out.push({ id: n.id, stage, human: n.actor === 'human', model: n.actor === 'model' });
  });
  return out;
}

const all = PRESENTATIONS.map((p) => [p.recipeId, p] as const);
const recipeOf = (id: string): Recipe => {
  const r = PROTOCOL_CONFIGS.find((x) => x.id === id);
  if (!r) throw new Error(`no protocol recipe ${id}`);
  return r;
};
const copyOf = (p: (typeof PRESENTATIONS)[number]): string[] => [
  p.name,
  p.promise,
  ...p.bestFor,
  ...p.stages.flatMap((s) => s.steps.flatMap((st) => [st.label, st.explainer])),
];

describe('recipe presentations', () => {
  it('present every protocol recipe, in catalog order, under the product names of spec §5', () => {
    expect(PRESENTATIONS.map((p) => [p.recipeId, p.code, p.name])).toEqual([
      ['c1', 'C1', 'Landing Page Studio'],
      ['c2', 'C2', 'Idea Generator'],
      ['c3', 'C3', 'Series Writer'],
      ['c4', 'C4', 'Memo Polish'],
      ['c5', 'C5', 'Ad Video Chain'],
      ['c6', 'C6', 'Second Reader'],
      ['c6a', 'C6a', 'Fiction Second Reader'],
      ['c7', 'C7', 'Lean Code Review'],
    ]);
    expect(PRESENTATIONS.map((p) => p.recipeId)).toEqual(PROTOCOL_CONFIGS.map((r) => r.id));
  });

  it.each(all)('%s carries its recipe family as the code and its medium', (id, p) => {
    const r = recipeOf(id);
    expect(p.code).toBe(r.family);
    expect(p.medium).toBe(r.medium);
    expect(presentationOf(id)).toBe(p);
  });

  it.each(all)('%s has a promise, what it is good for, and at least one step per recipe stage', (id, p) => {
    const r = recipeOf(id);
    expect(p.promise.length).toBeGreaterThan(20);
    expect(p.bestFor.length).toBeGreaterThanOrEqual(2);
    expect(p.stages.map((s) => s.stage)).toEqual(r.stages.map((s) => STAGE_NAMES[s.stage]));
    for (const s of p.stages) {
      expect(s.steps.length, `${id} ${s.stage}`).toBeGreaterThan(0);
      for (const st of s.steps) {
        expect(st.label.length, `${id} ${st.label}`).toBeGreaterThan(2);
        expect(st.explainer, `${id} ${st.label}`).toMatch(/^[A-Z].*\.$/s);
      }
    }
    const labels = p.stages.flatMap((s) => s.steps.map((st) => st.label));
    expect(new Set(labels).size, `${id} labels are distinct`).toBe(labels.length);
  });

  it.each(all)('%s shows every step and pick of its recipe exactly once, in its stage and in recipe order', (id, p) => {
    const r = recipeOf(id);
    const order: string[] = [];
    for (const n of nodesOf(r)) {
      const shown = stepPresentation(id, n.id);
      expect(shown, `${id} ${n.id}`).toBeDefined();
      expect(shown?.stage, `${id} ${n.id}`).toBe(STAGE_NAMES[n.stage]);
      if (shown && order.at(-1) !== shown.label) order.push(shown.label);
    }
    // Walk order visits each shown step as one run, so the presentation reads in the recipe's order.
    expect(order).toEqual(p.stages.flatMap((s) => s.steps.map((st) => st.label)));
    expect(stepPresentation(id, 'no-such-step')).toBeUndefined();
  });

  it.each(all)('%s computes who does each step from the recipe: any human part makes it your turn', (id) => {
    const r = recipeOf(id);
    for (const n of nodesOf(r)) {
      const who = stepPresentation(id, n.id)?.who;
      if (n.human) expect(who, `${id} ${n.id}`).toBe('you');
      if (who === 'tool') expect(n.model || n.human, `${id} ${n.id}`).toBe(false);
    }
  });

  it('marks the human checkpoints the configurations hinge on as your turn', () => {
    const whoOf = (id: string, node: string) => stepPresentation(id, node)?.who;
    expect(whoOf('c1', 'pick-one')).toBe('you');
    expect(whoOf('c1', 'seed-build')).toBe('ai');
    expect(whoOf('c2', 'react')).toBe('you');
    expect(whoOf('c5', 'vo-script')).toBe('you');
    // Inverted authorship: in C6 and C6a you write; the AI readers only point.
    for (const id of ['c6', 'c6a']) {
      expect(whoOf(id, 'write')).toBe('you');
      for (const lens of ['cut-marks', 'tells-flags', 'critic']) expect(whoOf(id, lens)).toBe('ai');
    }
    expect(whoOf('c7', 'voice')).toBe('you');
  });

  it.each(all)('%s names every block it uses by its plain name (spec §5 vocabulary)', (id, p) => {
    const r = recipeOf(id);
    const labels = p.stages.flatMap((s) => s.steps.map((st) => st.label)).join(' | ');
    const used = new Set<string>();
    walk(r, (n) => {
      if (n.op === 'step' && n.block) used.add(n.block);
    });
    for (const block of used) expect(labels, `${id} ${block}`).toContain(BLOCK_NAMES[block as keyof typeof BLOCK_NAMES]);
  });

  it('has a plain name for every block', () => {
    expect(Object.keys(BLOCK_NAMES).sort()).toEqual([...BLOCK_CODES].sort());
    expect(BLOCK_NAMES).toMatchObject({ SEED: 'Random spark', VISION: 'Your direction', CRITIC: 'Outside critique', VOICE: 'Your words' });
    expect(STAGE_NAMES).toEqual({ D1: 'Explore', D2: 'Refine', D3: 'Finish' });
  });

  it.each(all)('%s uses no protocol jargon by default', (id, p) => {
    for (const text of copyOf(p)) {
      expect(text, id).not.toMatch(/\b(SEED|VISION|CRITIC|ASSET|RELAY|CUT|TELLS|VOICE|RENDER|BRIEF|D[123]|C[1-7]a?)\b/);
      expect(text, id).not.toMatch(/\b(threshold|port|rule|exception|block|operator|chassis|Diverge|Deepen|Distill|tells?)\b/i);
    }
  });

  it.each(all)('%s makes no efficacy claim (every recipe is untested, CR11)', (id, p) => {
    for (const text of copyOf(p)) {
      expect(text, id).not.toMatch(/research[- ]backed|proven|studies show|outperform|scientifically|guarantee|best[- ]in[- ]class/i);
    }
  });
});
