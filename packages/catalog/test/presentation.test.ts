/**
 * The product's plain-language view of the eight configurations (product spec §5). The presentation is hand-written
 * copy, so these tests tie it to the recipes it describes: every step and pick of a recipe is shown exactly once,
 * in its stage, and "who does it" is computed from the recipe's actors rather than typed.
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_CODES } from '@byway/protocol';
import { walk, walkNode, type Recipe } from '@byway/recipe';
import { BLOCK_NAMES, CHOOSER, PRESENTATIONS, PROTOCOL_CONFIGS, STAGE_NAMES, presentationOf, presentedStepFor, routeChoice, stepPresentation } from '../src/index.ts';

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

  it.each(all)('%s maps every step and every pick, optional, route, loop, gate and relay id to exactly one shown step', (id, p) => {
    const r = recipeOf(id);
    const shown = p.stages.flatMap((s) => s.steps);
    const owners = (nodeId: string) => shown.filter((st) => st.stepIds.includes(nodeId));
    const ids = new Set<string>();
    walk(r, (n) => {
      if ('id' in n && n.id) ids.add(n.id);
      // Run events carry the step's id, or the operator's id for operator checkpoints and loop iterations.
      if (n.op === 'step' || ['pick', 'optional', 'route', 'loop', 'gate', 'relay'].includes(n.op)) {
        expect(owners(n.id as string).map((st) => st.label), `${id} ${n.op} ${n.id}`).toHaveLength(1);
      }
      // Replicate, each and audit map where one shown step covers their whole body, and never twice.
      if (['replicate', 'each', 'audit'].includes(n.op)) expect(owners(n.id as string).length, `${id} ${n.op} ${n.id}`).toBeLessThanOrEqual(1);
    });
    for (const st of shown) {
      expect(st.stepIds.length, `${id} ${st.label}`).toBeGreaterThan(0);
      for (const stepId of st.stepIds) expect(ids.has(stepId), `${id} ${st.label}: ${stepId}`).toBe(true);
      expect(new Set(st.stepIds).size, `${id} ${st.label} lists an id twice`).toBe(st.stepIds.length);
    }
  });

  it.each(all)('%s labels an operator with the shown step that covers its body, so a loop or optional reads as its step', (id, p) => {
    const r = recipeOf(id);
    walk(r, (n) => {
      if (n.op === 'step' || n.op === 'pick' || n.op === 'seq') return;
      const shown = presentedStepFor(p, n.id);
      if (!shown) return;
      // The operator's shown step covers at least one step or pick inside it.
      const inside: string[] = [];
      walkNode(n, '', 'D1', (c) => {
        if (c.op === 'step' || c.op === 'pick') inside.push(c.id);
      });
      expect(inside.some((x) => shown.stepIds.includes(x)), `${id} ${n.id} → ${shown.label}`).toBe(true);
      expect(stepPresentation(id, n.id)).toEqual(shown);
    });
  });

  it('labels the operator events a run emits in plain words', () => {
    const label = (recipeId: string, nodeId: string) => presentedStepFor(presentationOf(recipeId)!, nodeId)?.label;
    expect(label('c1', 'critic-loop')).toBe('Outside critique');
    expect(label('c1', 'asset-if-plain')).toBe('Custom imagery');
    expect(label('c1', 'seeded-x4')).toBe('Random spark');
    expect(label('c3', 'draft')).toBe('First draft');
    expect(label('c4', 'recipient-critic')).toBe('Outside critique');
    expect(label('c5', 'shot-chain')).toBe('Motion');
    expect(label('c5', 'shot-repair')).toBe('Motion');
    expect(label('c5', 'launch-gate')).toBe('Outside critique: launch check');
    expect(label('c6', 'author-loop')).toBe('Your draft');
    expect(label('c6', 'angles-if-wanted')).toBe('Angles from your material');
    expect(label('c6a', 'final-tells-read')).toBe('Last cliché read');
    expect(label('c7', 'spec-interview')).toBe('Spec interview');
    // A body that spans several shown steps has no single label.
    expect(label('c1', 'each-candidate')).toBeUndefined();
    expect(label('c2', 'annotate')).toBeUndefined();
  });

  it('finds the shown step for a step id in any presentation, with its stage', () => {
    const p = presentationOf('c1')!;
    expect(presentedStepFor(p, 'pick-one')).toMatchObject({ label: 'Pick one', who: 'you', stage: 'Refine' });
    expect(presentedStepFor(p, 'seed-build')?.stage).toBe('Explore');
    expect(presentedStepFor(p, 'no-such-step')).toBeUndefined();
    const composed: typeof p = { ...p, recipeId: 'composed-x', stages: [{ stage: 'Finish', steps: [{ label: 'Mine', explainer: 'E.', who: 'you', stepIds: ['a', 'b'] }] }] };
    expect(presentedStepFor(composed, 'b')).toEqual({ label: 'Mine', explainer: 'E.', who: 'you', stepIds: ['a', 'b'], stage: 'Finish' });
  });

  it.each(all)('%s makes no efficacy claim (every recipe is untested, CR11)', (id, p) => {
    for (const text of copyOf(p)) {
      expect(text, id).not.toMatch(/research[- ]backed|proven|studies show|outperform|scientifically|guarantee|best[- ]in[- ]class/i);
    }
  });
});

/**
 * Honest copy (CR11, convention C9): product text describes what the steps do, never what they achieve, and never
 * describes a step this version does not perform. The outcome shapes below are the ones the review found: the
 * protocol's own untested success criteria stated as fact.
 */
const OUTCOME_SHAPES: readonly RegExp[] = [
  /\bso(?: that)? (?:they|it|the|you|your)\b/i,
  /\bgenuinely\b/i,
  /\bdistinct\b/i,
  /\bmakes? (?:\w+ ){0,4}(?:smaller|easier|better|clearer|stronger|shorter|sharper)\b/i,
  /\b(?:smaller|easier|clearer|better)\b[^.]*\bto (?:review|read|act on)\b/i,
  /\bnothing the reader would miss\b/i,
  /\bin minutes\b/i,
  /\bstays? wide\b/i,
  /\bdo(?:es)? not settle\b/i,
  /\bcleanly\b/i,
  /\bunexpected\b/i,
];
const outcomes = (text: string) => OUTCOME_SHAPES.filter((re) => re.test(text)).map(String);
const explainerOf = (id: string, label: string) => presentationOf(id)!.stages.flatMap((s) => s.steps).find((s) => s.label === label)?.explainer ?? '';

describe('honest copy (CRED-1, PRES-1, FID-1, FID-2, TELLS-1, VOICE-1)', () => {
  it.each(all)('%s states no outcome as fact', (id, p) => {
    for (const text of copyOf(p)) expect(outcomes(text), `${id}: ${text}`).toEqual([]);
  });

  it('the chooser help states no outcome as fact', () => {
    for (const q of CHOOSER) expect(outcomes(`${q.text} ${q.help}`), q.id).toEqual([]);
  });

  it('says C1 starts every draft from a random spark, with no direction or reference of your own up front (FID-2)', () => {
    expect(explainerOf('c1', 'Random spark')).toMatch(/cannot give your own (visual )?direction/);
    expect(CHOOSER.find((q) => q.routesTo === 'c1')?.help).toMatch(/random spark/);
  });

  it('describes C1 imagery and its last check as what they do: nothing checks the images for you, and the check changes nothing (PRES-1)', () => {
    const imagery = explainerOf('c1', 'Custom imagery');
    expect(imagery).not.toMatch(/checks that they fit/);
    expect(imagery).toMatch(/you see/);
    const check = explainerOf('c1', 'Outside critique: defect check');
    expect(check).not.toMatch(/you decide what to fix/);
    expect(check).toMatch(/changes nothing/);
  });

  it('says C5 compositing and voice-over audio are not available in this version (PRES-1)', () => {
    expect(explainerOf('c5', 'Composite')).toMatch(/not available in this version/i);
    expect(explainerOf('c5', 'Voice-over audio')).toMatch(/not available in this version/i);
    expect(explainerOf('c5', 'Voice-over audio')).not.toMatch(/word for word/);
  });

  it('says C3 makes no charts from data in this version (C9)', () => {
    expect(explainerOf('c3', 'Custom imagery')).toMatch(/not made in this version/);
  });

  it('every explainer that names a reviewer from another AI family says what happens when none is set up (FID-1, C3)', () => {
    let named = 0;
    for (const p of PRESENTATIONS) {
      for (const s of p.stages.flatMap((x) => x.steps)) {
        if (!/AI family/.test(s.explainer)) continue;
        named++;
        expect(s.explainer, `${p.recipeId} ${s.label}`).toMatch(/fresh session of the same/);
      }
    }
    // C3, C6, C6a and C7 have a different-family reviewer.
    expect(named).toBe(4);
  });

  it('every cliché sweep that swaps says you choose which of its finds are swapped, and the swap step never claims more (TELLS-1, C2)', () => {
    for (const id of ['c1', 'c3', 'c4', 'c5', 'c7']) {
      expect(explainerOf(id, 'Cliché sweep'), id).toMatch(/you choose which/);
      expect(explainerOf(id, 'Keep or revert'), id).not.toMatch(/go through the swaps/);
    }
  });

  it("C5's late Your words is the on-screen copy: headline, tagline and captions, with the voice-over left as locked (VOICE-1, C4)", () => {
    const words = explainerOf('c5', 'Your words');
    expect(words).toMatch(/headline/);
    expect(words).toMatch(/tagline/);
    expect(words).toMatch(/caption/);
    expect(words).not.toMatch(/any on-screen text/);
    expect(words).toMatch(/voice-over/);
  });

  it("C7's Your words offers the change's why, not strings or names it does not offer (VOICE-1, C9)", () => {
    const words = explainerOf('c7', 'Your words');
    expect(words).toMatch(/why/);
    expect(words).not.toMatch(/user-facing strings|public names/);
  });

  it('every route has a plain question and a plain "Name: detail" label for each branch, in branch order (UX-3)', () => {
    let routes = 0;
    for (const r of PROTOCOL_CONFIGS) {
      walk(r, (n) => {
        if (n.op !== 'route') return;
        routes++;
        const choice = routeChoice(r.id, n.id);
        expect(choice, `${r.id} ${n.id}`).toBeDefined();
        expect(choice!.question).toMatch(/^[A-Z].*\?$/);
        expect(choice!.options.map((o) => o.id)).toEqual(n.branches.map((b) => b.name));
        for (const o of choice!.options) expect(o.label, `${r.id} ${n.id} ${o.id}`).toMatch(/^[A-Z][^:]+: \S.*[^.]$/);
      });
    }
    expect(routes).toBe(1);
    expect(routeChoice('c3', 'draft')?.options.find((o) => o.id === 'own')?.label).toMatch(/whole first draft/);
    expect(routeChoice('c3', 'nope')).toBeUndefined();
    expect(routeChoice('nope', 'draft')).toBeUndefined();
  });
});
