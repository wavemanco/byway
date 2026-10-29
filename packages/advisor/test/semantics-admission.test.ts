/**
 * F01 at admission (ADR-0092): a composed recipe is admitted by what it runs, not by what it declares. Each case is a
 * reproduction from the 2026-10-08 external-review verification (its driver, revise-A-r3-1b/drive.mts), run through
 * the real checkAnswer: the validator plus the composed profile, against the real catalog and templates. Every refused
 * case here was accepted before this change.
 */
import { describe, expect, it } from 'vitest';
import { c1, c2, c3, c4, c5, c6, PROTOCOL_CONFIGS } from '@byway/catalog';
import { composedRecipe } from '@byway/gateway';
import { audit, oneShotGate, pick, steps, type Node, type Recipe, type Step } from '@byway/recipe';
import { checkAnswer } from '../src/index.ts';
import { fencedJson, PROMPTS } from './helpers.ts';

type N = Record<string, any>;
const clone = (r: Recipe): N => {
  const c = structuredClone(r) as N;
  delete c.hash;
  return c;
};
/** Every finding of the real admission, as "RULE" or "RULE:clause". */
function admission(nearest: Recipe, raw: unknown): string[] {
  const out = checkAnswer(fencedJson(raw), nearest, { prompts: PROMPTS, catalog: PROTOCOL_CONFIGS }, 'composed-semantics');
  return out.violations.map((v) => (v.clause ? `${v.ruleId}:${v.clause}` : v.ruleId));
}
const refusedWith = (nearest: Recipe, raw: unknown, ...expected: string[]) => {
  const got = admission(nearest, raw);
  expect(got.length, 'refused').toBeGreaterThan(0);
  expect(got).toEqual(expect.arrayContaining(expected));
};
const admitted = (nearest: Recipe, raw: unknown) => expect(admission(nearest, raw)).toEqual([]);

function mapNodes(n: N, f: (n: N) => N): N {
  const m = f(n);
  if (m !== n) return m;
  const c: N = { ...n };
  if (c.steps) c.steps = c.steps.map((x: N) => mapNodes(x, f));
  if (c.body) c.body = mapNodes(c.body, f);
  if (c.branches) c.branches = c.branches.map((b: N) => ({ ...b, body: mapNodes(b.body, f) }));
  if (c.lenses) c.lenses = c.lenses.map((b: N) => ({ ...b, body: mapNodes(b.body, f) }));
  return c;
}
const edit = (r: N, id: string, f: (s: N) => N): N => ({ ...r, stages: r.stages.map((s: N) => ({ ...s, body: mapNodes(s.body, (n) => (n.op === 'step' && n.id === id ? f(n) : n)) })) });
const findStep = (r: Recipe, id: string): Step => steps(r).find(({ step }) => step.id === id)!.step;
const stageOf = (r: N, stage: string): N => r.stages.find((s: N) => s.stage === stage);
const at = (seq: N, id: string): number => seq.steps.findIndex((s: N) => s.id === id);
const appendLast = (r: N, node: N): N => {
  const last = r.stages.at(-1);
  last.body = last.body.op === 'seq' ? { ...last.body, steps: [...last.body.steps, node] } : { op: 'seq', steps: [last.body, node] };
  return r;
};
const insertAfter = (r: N, stage: string, afterId: string, ...nodes: N[]): N => {
  const s = stageOf(r, stage).body;
  s.steps.splice(at(s, afterId) + 1, 0, ...nodes);
  return r;
};
const without = (s: N, ...keys: string[]): N => Object.fromEntries(Object.entries(s).filter(([k]) => !keys.includes(k)));

const render = (id: string): N => ({ op: 'step', id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const checkGate = (max: number, onCap: string): N => ({ metric: 'check-clean', hidden: false, holder: 'harness', probe: 1, max, onCap, onNoConverge: onCap === 'human' ? 'recalibrate-human' : 'continue' });
const c1check = findStep(c1, 'critic-check');
const c5check = findStep(c5, 'shot-check');
const c3fix = findStep(c3, 'revise');
const c4fix = { ...findStep(c4, 'revise'), id: 'ai-polish' };
const fixAfterC3 = { op: 'step', id: 'ai-polish', role: 'fix', actor: 'model', tier: 'mid', prompt: c3fix.prompt, consumes: ['artifact', 'critique'], produces: ['artifact'], writes: true };
const pickR = { op: 'pick', id: 'final-pick', mode: 'R', k: 1, actor: 'policy' };
const pickH = { op: 'pick', id: 'final-pick', mode: 'H', k: 1, actor: 'human' };
/** C2's own person's-rounds gate (its vision loop's), with a different cap. */
const c2Rounds = (max: number): N => ({ ...(stageOf(c2 as N, 'D1').body.steps.find((n: N) => n.op === 'loop').gate as N), max });

/** A protected step wrapped in a check-clean loop after a defect check: the check can end the round before it (K1). */
function afterCheck(nearest: Recipe, stage: string, id: string, check: N, max: number, onCap: string): N {
  const r = clone(nearest);
  const s = stageOf(r, stage).body;
  const i = at(s, id);
  s.steps[i] = { op: 'loop', id: 'final-pass', body: { op: 'seq', steps: [render('pass-render'), check, s.steps[i]] }, gate: checkGate(max, onCap) };
  return r;
}
/** A C5 writer moved from D2 to right after the D3 VOICE (keepsVoice kept): K2. */
function movedAfterLateVoice(id: string): N {
  const r = clone(c5);
  const d2 = stageOf(r, 'D2').body;
  const [w] = d2.steps.splice(at(d2, id), 1);
  const d3 = stageOf(r, 'D3').body;
  d3.steps.splice(at(d3, 'voice') + 1, 0, w);
  return r;
}

describe('a writer is one by what it runs: the writes flag cannot hide it (S1-S3)', () => {
  it.each([
    ['writes: false, produces nothing', { ...c4fix, writes: false, produces: [] }],
    ['writes left out, produces nothing', { ...without(c4fix, 'writes'), produces: [] }],
    ['writes left out, produces the artifact', without(c4fix, 'writes')],
  ])('C4 + a model fix after VOICE, %s', (_name, polish) => {
    refusedWith(c4, appendLast(clone(c4), polish), 'ST12:writer-undeclared', 'PR6:voice-step', 'COMPOSED-VOICE');
  });
});

describe('VOICE is what writes your words, not the port or the label', () => {
  it('V1: a VOICE without the voice port, then an honest writer', () => {
    const r = appendLast(edit(clone(c3), 'voice', (n) => ({ ...n, produces: ['artifact'] })), fixAfterC3);
    refusedWith(c3, r, 'ST12:voice-undeclared', 'PR6:voice-step', 'COMPOSED-VOICE');
  });

  it('V1b: the same writer declared keepsVoice', () => {
    const r = appendLast(edit(clone(c3), 'voice', (n) => ({ ...n, produces: ['artifact'] })), { ...fixAfterC3, keepsVoice: true });
    refusedWith(c3, r, 'ST12:voice-undeclared', 'COMPOSED-VOICE');
  });

  const modelVoice = { ...c3fix, id: 'voice-pass', produces: ['voice', 'artifact'] };
  it.each([
    ['M1: a model pass in VOICE’s place, declaring the voice port', c3, edit(clone(c3), 'voice', () => modelVoice), ['ST12:voice-not-written']],
    ['M2: the same, with VOICE sitting out', c3, { ...edit(clone(c3), 'voice', () => modelVoice), sitsOut: [{ block: 'VOICE', reason: 'The AI writes the final pass in your voice' }] }, ['ST12:voice-not-written']],
    ['M3: the same, labelled VOICE', c3, edit(clone(c3), 'voice', () => ({ ...modelVoice, block: 'VOICE' })), ['ST12:voice-not-written', 'ST12:block-role']],
    ['W1: a VOICE that produces only the voice port (C3)', c3, edit(clone(c3), 'voice', (n) => ({ ...n, produces: ['voice'] })), ['ST12:voice-not-written']],
    ['W1: the same in C2', c2, edit(clone(c2), 'voice', (n) => ({ ...n, produces: ['voice'] })), ['ST12:voice-not-written']],
    ['W2: VOICE as a vision step', c3, edit(clone(c3), 'voice', (n) => ({ ...n, role: 'vision' })), ['ST12:voice-not-written', 'ST12:block-role']],
    ['W2b: VOICE as a cut step', c3, edit(clone(c3), 'voice', (n) => ({ ...n, role: 'cut' })), ['ST12:voice-not-written', 'ST12:block-role']],
    ['W2d: C4’s VOICE-lite as a vision step', c4, edit(clone(c4), 'voice', (n) => ({ ...n, role: 'vision' })), ['ST12:voice-not-written', 'ST12:block-role']],
    ['Q1+W2: a pick after a VOICE turned into a vision step', c2, edit(insertAfter(clone(c2), 'D1', 'voice', pickR), 'voice', (s) => ({ ...s, role: 'vision' })), ['ST12:voice-not-written', 'ST12:block-role']],
    ['X1: VOICE as a human build', c3, edit(clone(c3), 'voice', (n) => ({ ...n, role: 'build' })), ['ST12:voice-not-written', 'ST12:block-role']],
  ] as [string, Recipe, N, string[]][])('%s', (_name, nearest, r, expected) => refusedWith(nearest, r, ...expected, 'COMPOSED-VOICE'));

  it('X2: a VOICE without its block label is refused by ST12; it still counts as your words (COMP-1 holds)', () => {
    const got = admission(c3, edit(clone(c3), 'voice', (n) => without(n, 'block')));
    expect(got).toEqual(expect.arrayContaining(['ST12:block-role', 'ST12:voice-undeclared']));
    expect(got.filter((v) => v.startsWith('COMPOSED-VOICE'))).toEqual([]);
  });

  it('X3: an extra human vision labelled VOICE does not count as your words', () => {
    const r = edit(clone(c3), 'tells-compare', (n) => ({ op: 'seq', steps: [n, { op: 'step', id: 'fake-voice', role: 'vision', block: 'VOICE', actor: 'human', consumes: ['view'], produces: ['voice', 'artifact'] }] }));
    refusedWith(c3, r, 'ST12:voice-not-written');
  });

  it("X4: C6's author draft declaring the voice port", () => {
    refusedWith(c6, edit(clone(c6), 'write', (n) => ({ ...n, produces: ['voice', 'artifact'] })), 'ST12:voice-not-written');
  });
});

describe('a protected checkpoint counts only where it runs every time (K1)', () => {
  it('K1-C1: C1’s VOICE after a defect check in a check-clean loop (max 1, policy)', () => {
    refusedWith(c1, afterCheck(c1, 'D3', 'voice', c1check, 1, 'policy-best-snapshot'), 'COMPOSED-VOICE');
  });
  it('K1-C1b: the same, max 2, the cap with a person', () => {
    refusedWith(c1, afterCheck(c1, 'D3', 'voice', c1check, 2, 'human'), 'COMPOSED-VOICE');
  });
  it('K1-C2: C2’s VOICE after a check', () => {
    refusedWith(c2, afterCheck(c2, 'D1', 'voice', { ...c1check, id: 'final-check' }, 1, 'policy-best-snapshot'), 'COMPOSED-VOICE');
  });
  it('K1-C5: C5’s VO script after a check', () => {
    refusedWith(c5, afterCheck(c5, 'D1', 'vo-script', { ...c5check, id: 'script-check' }, 1, 'policy-best-snapshot'), 'COMPOSED-VOICE');
  });
  it('K1-relay: VOICE after a relay whose link holds the check', () => {
    const r = clone(c1);
    const d3 = stageOf(r, 'D3').body;
    const i = at(d3, 'voice');
    d3.steps = [...d3.steps.slice(0, i), { op: 'loop', id: 'final-pass', body: { op: 'seq', steps: [{ op: 'relay', id: 'links', maxLinks: 2, body: { op: 'seq', steps: [render('final-render'), c1check] } }, d3.steps[i]] }, gate: checkGate(2, 'human') }];
    refusedWith(c1, r, 'COMPOSED-VOICE');
  });

  const c6With = (body: (write: N) => N[]): N => {
    const r = clone(c6);
    const d2 = stageOf(r, 'D2');
    const [write, rend] = d2.body.body.steps;
    d2.body = { op: 'seq', steps: [...body(write), rend] };
    r.exceptions = [];
    return r;
  };
  it('K1-C6c: C6’s author write after a check; the control with the write first keeps authorship', () => {
    const c3draft = findStep(c3, 'ai-draft');
    const late = c6With((write) => [{ ...c3draft, id: 'starter', consumes: ['intent'] }, { op: 'loop', id: 'author-loop', body: { op: 'seq', steps: [render('pre-render'), { ...c1check, id: 'starter-check' }, write] }, gate: checkGate(2, 'human') }]);
    refusedWith(c6, late, 'COMPOSED-AUTHOR');
    const first = c6With((write) => [{ op: 'loop', id: 'author-loop', body: { op: 'seq', steps: [write, render('pre-render'), { ...c1check, id: 'starter-check' }] }, gate: checkGate(2, 'human') }]);
    expect(admission(c6, first).filter((v) => v.startsWith('COMPOSED-AUTHOR') || v.startsWith('COMPOSED-VOICE'))).toEqual([]);
  });

  it('C6 with its author write as a human fix is admitted: a fix and a build run the same way', () => {
    admitted(c6, edit(clone(c6), 'write', (n) => ({ ...n, role: 'fix' })));
  });
});

describe('writers after each VOICE: no more than the nearest recipe has after its counterpart (K2)', () => {
  it.each([['render-in-scene'], ['vo-audio'], ['matte']])("C5's %s moved after the late VOICE, keepsVoice kept", (id) => {
    refusedWith(c5, movedAfterLateVoice(id), 'COMPOSED-VOICE');
  });

  it('K2g: C5 with VOICE moved before CUT and TELLS, their labels stripped', () => {
    const r = clone(c5);
    const d3 = stageOf(r, 'D3').body;
    const [v] = d3.steps.splice(at(d3, 'voice'), 1);
    d3.steps.unshift(v);
    d3.steps = d3.steps.map((n: N) => (n.op === 'step' && (n.block === 'CUT' || n.block === 'TELLS') ? without(n, 'block', 'knobs') : n));
    refusedWith(c5, r, 'ST12:block-role', 'COMPOSED-VOICE');
  });

  it("C5's own production after the locked script stays legal, and a gate retrying D1 too", () => {
    admitted(c5, clone(c5));
    const r = clone(c5);
    stageOf(r, 'D3').body.steps = stageOf(r, 'D3').body.steps.map((s: N) => (s.op === 'gate' ? { ...s, retry: { stage: 'D1', times: 1 } } : s));
    admitted(c5, r);
  });
});

describe('nothing put back after your words undoes them (set-aside)', () => {
  it('Q1: a random pick after C2’s VOICE', () => refusedWith(c2, insertAfter(clone(c2), 'D1', 'voice', pickR), 'ST5:set-aside'));
  it('QA: your own map, then a random pick, before VOICE', () => {
    const own = { op: 'step', id: 'own-map', role: 'build', actor: 'human', consumes: ['artifact'], produces: ['artifact'], writes: true };
    refusedWith(c2, insertAfter(clone(c2), 'D1', 'option-map', own, pickR), 'ST5:set-aside');
  });
  it('QRh: a keep-or-revert right after VOICE', () => {
    refusedWith(c2, insertAfter(clone(c2), 'D1', 'voice', { op: 'step', id: 'keep-or-revert', role: 'tells-compare', block: 'TELLS', actor: 'human', consumes: ['view'], produces: ['taste'] }), 'ST12:set-aside');
  });
  it('QS: a scored loop holding your words', () => {
    const r = clone(c3);
    const d3 = stageOf(r, 'D3').body;
    const [v] = d3.steps.splice(at(d3, 'voice'), 1);
    stageOf(r, 'D2').body.steps.find((n: N) => n.op === 'loop').body.steps.push(v);
    refusedWith(c3, r, 'ST12:set-aside');
  });
  it('QF: new variants made from your words, then your pick, is not a set-aside', () => {
    const map = findStep(c2, 'option-map');
    const r = insertAfter(clone(c2), 'D1', 'voice', { op: 'replicate', id: 'variants', n: 2, body: { ...map, id: 'map-variant', consumes: ['artifact'], keepsVoice: true } }, { op: 'pick', id: 'final-pick', mode: 'H', k: 1, actor: 'human' });
    expect(admission(c2, r).filter((v) => v.endsWith('set-aside'))).toEqual([]);
  });
  it('Q2: your own pick after C2’s VOICE', () => refusedWith(c2, insertAfter(clone(c2), 'D1', 'voice', pickH), 'ST5:set-aside'));
  it('Q3: a random pick at the very end of C2', () => refusedWith(c2, insertAfter(clone(c2), 'D1', 'mood-boards-if-wanted', pickR), 'ST5:set-aside'));
  it('Q4: an each over the options after C2’s VOICE', () => {
    const map = findStep(c2, 'option-map');
    refusedWith(c2, insertAfter(clone(c2), 'D1', 'voice', { op: 'each', id: 'per-option', body: { ...map, id: 'per-option-map', consumes: ['artifact'], keepsVoice: true } }), 'ST5:set-aside');
  });

  // A pick of one leaves the options held (ports.options = [the chosen one]): on the next round it takes that option back,
  // made before the person's words on the round before, and puts it in place of the work.
  it('A1: C2’s VOICE in a sign-off loop after your pick of one: round 2 picks the option from before your words', () => {
    const r = clone(c2);
    const d1 = stageOf(r, 'D1').body;
    const i = at(d1, 'voice');
    d1.steps[i] = { op: 'loop', id: 'sign-off', body: { op: 'seq', steps: [pickH, d1.steps[i]] }, gate: c2Rounds(2) };
    refusedWith(c2, r, 'ST12:set-aside');
  });
  it('A3: your own map in a loop after a random pick of one, before VOICE', () => {
    const own = { op: 'step', id: 'own-map', role: 'build', actor: 'human', consumes: ['artifact'], produces: ['artifact'], writes: true };
    refusedWith(c2, insertAfter(clone(c2), 'D1', 'option-map', { op: 'loop', id: 'own', body: { op: 'seq', steps: [pickR, own] }, gate: c2Rounds(2) }), 'ST12:set-aside');
  });
  it('a sign-off loop that makes new variants from your words each round before you pick is not a set-aside', () => {
    const map = findStep(c2, 'option-map');
    const r = clone(c2);
    const d1 = stageOf(r, 'D1').body;
    const i = at(d1, 'voice');
    const variants = { op: 'replicate', id: 'variants', n: 2, body: { ...map, id: 'map-variant', consumes: ['artifact'], keepsVoice: true } };
    d1.steps[i] = { op: 'loop', id: 'sign-off', body: { op: 'seq', steps: [variants, pickH, d1.steps[i]] }, gate: c2Rounds(2) };
    expect(admission(c2, r).filter((v) => v.endsWith('set-aside'))).toEqual([]);
  });
  it('R1: C3’s keep-or-revert moved right after the human cut (a passing critic can leave the AI angle as the previous version)', () => {
    const r = clone(c3);
    const d3 = stageOf(r, 'D3').body;
    const [tc] = d3.steps.splice(at(d3, 'tells-compare'), 1);
    d3.steps.splice(2, 0, tc);
    refusedWith(c3, r, 'ST12:set-aside');
  });
});

describe('a person’s write or VOICE in a container does not count (V2) and the scope must cover (V3)', () => {
  it('V2a: VOICE inside an audit lens', () => {
    const r = edit(clone(c3), 'voice', (v) => audit('voice-lens', [{ name: 'own', body: v as Node }]) as N);
    refusedWith(c3, r, 'ST9:human-write', 'COMPOSED-VOICE');
  });
  it('V2b: VOICE inside a one-shot gate body', () => {
    const critic = findStep(c5, 'gate-critic');
    const r = edit(clone(c3), 'voice', (v) => oneShotGate('final', { op: 'seq', steps: [v, render('gate-render'), { ...critic, prompt: findStep(c3, 'critic').prompt }] } as Node, { metric: 'critic-rank', threshold: 3, hidden: true, holder: 'harness' }) as N);
    refusedWith(c3, r, 'ST10:human-write', 'COMPOSED-VOICE');
  });
  it('V2c: C5 without its late VOICE', () => {
    const r = clone(c5);
    const d3 = stageOf(r, 'D3').body;
    d3.steps = d3.steps.filter((s: N) => s.id !== 'voice');
    refusedWith(c5, r, 'COMPOSED-VOICE');
  });
  it('V3: C3’s VOICE narrowed to a claim log', () => refusedWith(c3, edit(clone(c3), 'voice', (n) => ({ ...n, variant: 'claim-log' })), 'COMPOSED-VOICE', 'DR9:claims-only'));
  it('V3c: C5’s VO script without VOICE-early writes the on-screen copy instead', () => refusedWith(c5, edit(clone(c5), 'vo-script', (n) => without(n, 'variant')), 'COMPOSED-VOICE'));
  it("compose.test.ts's mock composer widens C4's key-lines VOICE to every line: still admitted", () => {
    const prompts = { build: 'product.c4.draft', critic: 'product.c4.recipient', fix: 'product.c4.revise', 'cut-apply': 'product.c4.apply-cut', 'tells-sweep': 'product.c4.tells-sweep', 'tells-swap': 'product.c4.apply-swaps' };
    admitted(c4, composedRecipe({ id: 'model-picked-id', title: 'Memo with a recipient read', long: true, prompts }));
  });
});

describe('picks are made as their mode says', () => {
  it("variants4: C1's pick made by a builder as its judge", () => {
    const build = findStep(c1, 'seed-build');
    const r = clone(c1);
    const d2 = stageOf(r, 'D2').body;
    d2.steps[at(d2, 'pick-one')] = pick('pick-one', 'C', 1, 'model', { ...build, id: 'chooser', role: 'build', block: undefined, knobs: undefined } as Step);
    refusedWith(c1, r, 'ST12:pick-judge');
  });
});

describe('a critic inside each, over options made after a render of the work (B-063)', () => {
  // C1 with a first draft rendered before its seeds, and the render inside each candidate's critic loop taken out: each
  // candidate's critic would be handed the first draft's render, so every candidate would be judged by the same view of
  // another page. The validator's typing hands each candidate only its own view, so composed admission refuses it.
  const variant = (keepRender: boolean): N => {
    const r = clone(c1);
    const seeds = stageOf(r, 'D1').body;
    const first = { ...structuredClone(seeds.body), id: 'first-draft' };
    stageOf(r, 'D1').body = { op: 'seq', steps: [first, { op: 'step', id: 'first-look', role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] }, seeds] };
    const loopBody = stageOf(r, 'D2').body.steps[0].body.steps[0].body;
    if (!keepRender) loopBody.steps = loopBody.steps.filter((s: N) => s.role !== 'render');
    return r;
  };

  it('is refused: the critic consumes a view no candidate has (ST5)', () => refusedWith(c1, variant(false), 'ST5'));

  it('with the render inside each kept, the critic judges each candidate by its own render: not refused for that', () => {
    expect(admission(c1, variant(true))).not.toContain('ST5');
  });
});

describe('the catalog copied verbatim is admitted', () => {
  it.each(PROTOCOL_CONFIGS.map((r) => [r.id, r] as const))('%s', (_id, r) => admitted(r, clone(r)));
});

describe('a reused prompt must fit its step: its contract in this medium, and the slots the step fills (COMPOSED-PROMPT)', () => {
  it('C1’s critic fix using C4’s prose revise prompt on a web page', () => {
    refusedWith(c1, edit(clone(c1), 'critic-fix', (n) => ({ ...n, prompt: 'product.c4.revise' })), 'COMPOSED-PROMPT');
  });
  it('C4’s draft using C7’s code-diff implement prompt on prose', () => {
    refusedWith(c4, edit(clone(c4), 'draft', (n) => ({ ...n, prompt: 'product.c7.implement' })), 'COMPOSED-PROMPT');
  });
  it('C3’s revise on a fix that does not read the critique its template needs', () => {
    refusedWith(c3, edit(clone(c3), 'revise', (n) => ({ ...n, consumes: ['artifact'] })), 'COMPOSED-PROMPT');
  });
});

describe('checking an answer never throws for what the answer holds', () => {
  const deepAnswer = (depth: number): string => {
    const r = clone(c4);
    const inner = JSON.stringify(stageOf(r, 'D3').body);
    stageOf(r, 'D3').body = '__BODY__';
    return fencedJson(r).replace('"__BODY__"', '{"op":"seq","steps":['.repeat(depth) + inner + ']}'.repeat(depth));
  };
  const check = (text: string) => checkAnswer(text, c4, { prompts: PROMPTS, catalog: PROTOCOL_CONFIGS }, 'composed-deep').violations;

  it('a pathologically deep recipe is a schema finding with a path, not a crash (2,000 nested sequences; F02 shape bound)', () => {
    let out: { ruleId: string; path?: string; message: string }[] = [];
    expect(() => {
      out = check(deepAnswer(2_000));
    }).not.toThrow();
    expect(out.map((v) => v.ruleId)).toEqual(['SCHEMA']);
    expect(out[0]!.message).toMatch(/nests deeper than 64 levels/);
    expect(out[0]!.path).toMatch(/^stages.2.body.steps.0/);
  });

  it('a 2 MiB answer is a schema finding (F02 shape bound)', () => {
    const r = clone(c4);
    r.title = 'x'.repeat(2 * 1024 * 1024);
    const out = check(fencedJson(r));
    expect(out.map((v) => v.ruleId)).toEqual(['SCHEMA']);
    expect(out[0]!.message).toMatch(/larger than 1 MiB/);
  });

  it('anything the checks themselves cannot handle is COMPOSED-INTERNAL, not a crash', () => {
    const broken = { ...PROMPTS, has: () => { throw new Error('the template store is unreadable'); } } as typeof PROMPTS;
    const out = checkAnswer(fencedJson(clone(c4)), c4, { prompts: broken, catalog: PROTOCOL_CONFIGS }, 'composed-broken').violations;
    expect(out.map((v) => v.ruleId)).toEqual(['COMPOSED-INTERNAL']);
  });
});
