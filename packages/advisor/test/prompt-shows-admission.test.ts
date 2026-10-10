/**
 * ADR-0097 at admission: a step takes in only what its prompt shows. The verifications of ADR-0098 found composed
 * variants that main admits in which a person's answer is silently lost because its only taker's reused prompt never
 * renders it: C3 with the trim's fix replaced by an AI draft on C3's draft prompt, or by an image step on C3's image
 * prompt, both explained "and the AI removes it"; a seed that takes the list in; a relay link whose brief slot holds its
 * shot. The validator refuses the lost answer (the shared semantics read the template), the composed profile refuses a
 * step that takes in a port its prompt never shows (COMPOSED-PROMPT), and the explainers say nothing is removed.
 */
import { c3, c5, CATALOG, PROTOCOL_CONFIGS } from '@byway/catalog';
import { inputsOf, promptShows, steps, type Recipe } from '@byway/recipe';
import { validate } from '@byway/validator';
import { describe, expect, it } from 'vitest';
import { checkAnswer, COMPOSED_EXPLAINERS, presentComposed } from '../src/index.ts';
import { fencedJson, PROMPTS } from './helpers.ts';

type N = Record<string, any>;
const COPY = { code: 'X (composed)', name: 'Your recipe', promise: 'Not tested.', bestFor: ['Your problem'] };
const E = COMPOSED_EXPLAINERS;

const mapNodes = (n: N, f: (n: N) => N): N => {
  const c: N = { ...n };
  if (c.steps) c.steps = c.steps.map((x: N) => mapNodes(x, f));
  if (c.body) c.body = mapNodes(c.body, f);
  if (c.branches) c.branches = c.branches.map((b: N) => ({ ...b, body: mapNodes(b.body, f) }));
  if (c.lenses) c.lenses = c.lenses.map((l: N) => ({ ...l, body: mapNodes(l.body, f) }));
  return f(c);
};
/** The recipe with the node of this id replaced by f(it), as the composer would hand it back (no hash). */
const edited = (r: Recipe, id: string, f: (s: N) => N): N => {
  const { hash: _h, ...rest } = structuredClone(r) as N;
  return { ...rest, stages: rest.stages.map((st: N) => ({ ...st, body: mapNodes(st.body, (n) => (n.id === id ? f(n) : n)) })) };
};
const offered = (raw: N, nearest: Recipe) => checkAnswer(fencedJson(raw), nearest, { prompts: PROMPTS, catalog: PROTOCOL_CONFIGS }, `composed-${nearest.id}`);
const rules = (raw: N, nearest: Recipe) => offered(raw, nearest).violations.map((v) => `${v.ruleId}${v.clause ? `:${v.clause}` : ''}`);
const promptMessages = (raw: N, nearest: Recipe) => offered(raw, nearest).violations.filter((v) => v.ruleId === 'COMPOSED-PROMPT').map((v) => v.message);
const explained = (r: Recipe, id: string) => presentComposed(r, COPY).stages.flatMap((s) => s.steps).find((s) => s.stepIds.includes(id))!.explainer;

/** C3's trim with its fix replaced by an AI draft on C3's draft prompt (problem and brief only). */
const draftFix = edited(c3, 'apply-cut', (n) => ({ ...n, role: 'build', prompt: 'product.c3.ai-draft', consumes: ['intent', 'brief', 'critique', 'artifact'] }));
/** C3's trim with its fix replaced by an image step on C3's image prompt (the work only). */
const imageFix = edited(c3, 'apply-cut', (n) => ({ ...n, role: 'asset', block: 'ASSET', prompt: 'product.c3.asset', consumes: ['critique', 'artifact'], knobs: { slots: 1 } }));

describe("a step takes in only what its prompt shows: a person's answer whose only taker never shows it", () => {
  it.each([
    ['an AI draft on C3’s draft prompt', draftFix],
    ['an image step on C3’s image prompt', imageFix],
  ])("C3 with the trim's fix replaced by %s: your list reaches the work on no path, and is refused", (_name, raw) => {
    const res = offered(raw, c3);
    expect(res.recipe).toBeDefined();
    expect(validate(res.recipe!).violations.map((v) => `${v.ruleId}:${v.clause}`)).toContain('ST12:critique-unapplied');
    expect(rules(raw, c3)).toEqual(expect.arrayContaining(['ST12:critique-unapplied', 'COMPOSED-PROMPT']));
  });

  it('and its explainer never says the AI removes it', () => {
    for (const raw of [draftFix, imageFix]) {
      const r = offered(raw, c3).recipe!;
      expect(explained(r, 'cut')).toBe(E.cutYours);
    }
    // As the catalog has it, the fix's prompt renders the list, and the explainer says so.
    expect(explained(offered(edited(c3, '', (n) => n), c3).recipe!, 'cut')).toBe(E.cutYoursApplies);
  });
});

describe('COMPOSED-PROMPT: a composed step may take in only what its reused prompt shows', () => {
  it('names the step, the port and the prompt', () => {
    expect(promptMessages(draftFix, c3)).toEqual([
      'step "apply-cut" takes in the critique port, but its prompt "product.c3.ai-draft" never shows it to the model on prose: use a prompt that shows it, or leave the port out',
      'step "apply-cut" takes in the artifact port, but its prompt "product.c3.ai-draft" never shows it to the model on prose: use a prompt that shows it, or leave the port out',
    ]);
    expect(promptMessages(imageFix, c3)).toEqual([
      'step "apply-cut" takes in the critique port, but its prompt "product.c3.asset" never shows it to the model on prose: use a prompt that shows it, or leave the port out',
    ]);
  });

  it("a seed that takes in a critique, a brief or a taste: no seed prompt renders them", () => {
    const seedTakes = edited(c3, 'seed-angle', (n) => ({ ...n, consumes: ['intent', 'taste'] }));
    expect(promptMessages(seedTakes, c3)).toEqual([
      'step "seed-angle" takes in the taste port, but its prompt "product.c3.seed-angle" never shows it to the model on prose: use a prompt that shows it, or leave the port out',
    ]);
  });

  it("a relay link that reads the brief: its prompt's brief slot holds the shot it makes (\"Shot N\"), never the brief", () => {
    const clipReads = edited(c5, 'clip', (n) => ({ ...n, reads: ['brief'] }));
    expect(promptMessages(clipReads, c5)).toEqual([
      'step "clip" takes in the brief port, but its prompt "product.c5.clip" never shows it to the model on media: use a prompt that shows it, or leave the port out',
    ]);
  });

  it('every model step of the eight protocol configurations shows every port it takes in, so each recomposed as itself is admitted', () => {
    for (const r of PROTOCOL_CONFIGS) {
      for (const { step } of steps(r)) {
        if (step.actor !== 'model') continue;
        expect(inputsOf(step).filter((p) => !promptShows(step, p, r.medium)), `${r.id} ${step.id}`).toEqual([]);
      }
      expect(rules(edited(r, '', (n) => n), r), r.id).toEqual([]);
    }
  });

  it("the rest of the catalog: only C1-H's seed takes in a port its prompt never shows (the fixed voice; a finding, the catalog unchanged)", () => {
    const unshown = new Set<string>();
    for (const r of CATALOG) {
      for (const { step } of steps(r)) {
        if (step.actor !== 'model') continue;
        for (const p of inputsOf(step)) if (!promptShows(step, p, r.medium)) unshown.add(`${step.id} ${step.prompt} ${p}`);
      }
    }
    // C1-H and its ablations: the seed build takes the fixed voice deck in, and article.SEED renders only the problem and
    // the string. Every other step there names a harness prompt byway's library does not hold, read by its ports.
    expect([...unshown].sort()).toEqual(['seed-build article.SEED voice']);
  });
});
