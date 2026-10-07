import { describe, expect, it } from 'vitest';
import { step, walk, type Recipe, type Seq } from '@byway/recipe';
import { validate, type Verdict } from '../src/index.ts';
import { baseline, firstGate, stepById, studio } from './fixtures.ts';

const ids = (v: Verdict) => [...new Set(v.violations.map((x) => x.ruleId))].sort();

function d3(recipe: Recipe): Seq {
  const body = recipe.stages.find((s) => s.stage === 'D3')?.body;
  if (!body || body.op !== 'seq') throw new Error('fixture D3 is not a seq');
  return body;
}

describe('valid recipes', () => {
  it('the studio fixture validates with exactly its two exceptions', () => {
    const v = validate(studio());
    expect(v.violations).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.exceptionsUsed).toEqual(['C1-DR2', 'C1-DR7']);
    expect(v.warnings).toEqual([]);
    expect(v.recipeHash).toMatch(/^sha256:/);
  });

  it('the baseline fixture validates with SM-6', () => {
    const v = validate(baseline());
    expect(v.violations).toEqual([]);
    expect(v.exceptionsUsed).toEqual(['SM-6']);
  });
});

describe('structural rules (invariant)', () => {
  it('ST1 duplicate ids', () => {
    const r = studio();
    stepById(r, 'fix').id = 'critic';
    expect(ids(validate(r))).toContain('ST1');
  });

  it('ST2 probe greater than max', () => {
    const r = studio();
    firstGate(r).probe = 6;
    expect(ids(validate(r))).toEqual(['ST2']);
  });

  it('ST2 unknown gate metric', () => {
    const r = studio();
    firstGate(r).metric = 'vibes';
    expect(ids(validate(r))).toContain('ST2');
  });

  it('ST3 replicate with n = 0', () => {
    const r = studio();
    const body = r.stages[0]!.body;
    if (body.op !== 'replicate') throw new Error('fixture');
    body.n = 0;
    expect(ids(validate(r))).toEqual(['ST3']);
  });

  it('ST4 stages out of order', () => {
    const r = studio();
    r.stages = [r.stages[1]!, r.stages[0]!, r.stages[2]!];
    expect(ids(validate(r))).toContain('ST4');
  });

  it('ST5 a consumed port that is not in scope', () => {
    const r = studio();
    walk(r, (node) => {
      if (node.op === 'seq') node.steps = node.steps.filter((s) => !(s.op === 'step' && s.id === 'render-1'));
    });
    const v = validate(r);
    expect(ids(v)).toContain('ST5');
    expect(v.violations.find((x) => x.ruleId === 'ST5')?.path).toContain('steps[0]');
  });

  it('ST6 sit-out without a reason, and a sat-out block that is used', () => {
    const r = studio();
    r.sitsOut = [
      { block: 'RELAY', reason: '  ' },
      { block: 'CUT', reason: 'not needed' },
    ];
    const v = validate(r);
    expect(v.violations.filter((x) => x.ruleId === 'ST6')).toHaveLength(2);
  });

  it('ST7 knob value out of range and unknown knob', () => {
    const r = studio();
    stepById(r, 'critic').knobs = { mode: 'AMAZING', colour: 'red' };
    expect(validate(r).violations.filter((x) => x.ruleId === 'ST7')).toHaveLength(2);
  });

  it('ST7 int knob outside its range', () => {
    const r = studio();
    stepById(r, 'asset').knobs = { slots: 4 };
    expect(ids(validate(r))).toEqual(['ST7']);
  });

  it('ST8 unknown exception', () => {
    const r = studio();
    r.exceptions.push('X-1');
    expect(ids(validate(r))).toEqual(['ST8']);
  });

  it('ST8 study manipulation on the protocol channel', () => {
    const r = studio();
    r.exceptions.push('SM-1');
    expect(ids(validate(r))).toEqual(['ST8']);
  });

  it('ST8 family-limited exception cited by another family', () => {
    const r = studio();
    r.family = 'C2';
    const v = validate(r);
    expect(ids(v)).toEqual(['DR2', 'DR7', 'ST8']);
  });

  it('ST8 an allowed but unused exception', () => {
    const r = baseline();
    r.exceptions.push('SM-1');
    const v = validate(r);
    expect(ids(v)).toEqual(['ST8']);
    expect(v.violations[0]?.message).toMatch(/unused/);
  });
});

describe('port rules', () => {
  it('PR1 a critic that sees the artifact', () => {
    const r = studio();
    stepById(r, 'critic').consumes = ['view', 'artifact'];
    expect(ids(validate(r))).toEqual(['PR1']);
  });

  it('PR1 a critic that is not isolated', () => {
    const r = studio();
    stepById(r, 'critic').isolated = false;
    expect(ids(validate(r))).toContain('PR1');
  });

  it('PR2 a visible threshold', () => {
    const r = studio();
    firstGate(r).hidden = false;
    expect(ids(validate(r))).toContain('PR2');
  });

  it('PR3 a build that reads the seed', () => {
    const r = studio();
    r.inputs.push('seed');
    stepById(r, 'fix').consumes.push('seed');
    expect(ids(validate(r))).toEqual(['PR3']);
  });

  it('PR4 an option set flowing into D3', () => {
    const r = studio();
    const d2 = r.stages[1]!.body as Seq;
    d2.steps = d2.steps.filter((s) => s.op !== 'pick');
    expect(ids(validate(r))).toContain('PR4');
  });

  it('PR5 a critic that reads the brief', () => {
    const r = studio();
    r.inputs.push('brief');
    stepById(r, 'critic').consumes.push('brief');
    expect(ids(validate(r))).toEqual(['PR1', 'PR5']);
  });

  it('PR6 a writing step after the human voice', () => {
    const r = studio();
    d3(r).steps.push(
      step({ id: 'late-fix', role: 'fix', actor: 'model', tier: 'mid', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true }),
    );
    expect(ids(validate(r))).toEqual(['PR6']);
  });

  it('PR7.1 a fix step that reads the tell catalog', () => {
    const r = studio();
    stepById(r, 'apply-cut').consumes.push('tells');
    expect(ids(validate(r))).toEqual(['PR7.1']);
  });

  it('PR7.2 a model comparing the TELLS alternatives', () => {
    const r = studio();
    Object.assign(stepById(r, 'tells-compare'), { actor: 'model', tier: 'big', isolated: true, frozenPrompt: true });
    expect(ids(validate(r))).toEqual(['PR7.2']);
  });

  it('PR8 an AI-detector gate cannot be excepted', () => {
    const r = studio();
    firstGate(r).metric = 'ai-detector';
    const v = validate(r);
    expect(ids(v)).toContain('PR8');
    expect(v.violations.find((x) => x.ruleId === 'PR8')?.class).toBe('invariant');
  });

  it('PR8 a detector knob', () => {
    const r = studio();
    stepById(r, 'critic').knobs = { mode: 'OK', gptzeroCheck: true };
    expect(ids(validate(r))).toContain('PR8');
  });

  it('CH3 a model doing CUT', () => {
    const r = studio();
    Object.assign(stepById(r, 'cut'), { actor: 'model', tier: 'big', isolated: true });
    expect(ids(validate(r))).toEqual(['CH3']);
  });

  it('LS1 a policy handling the cap', () => {
    const r = studio();
    firstGate(r).onCap = 'policy-best-snapshot';
    expect(ids(validate(r))).toEqual(['LS1']);
  });
});

describe('default rules', () => {
  it('DR1 replicas without a seed or human taste', () => {
    const r = studio();
    Object.assign(stepById(r, 'seed-build'), { role: 'build', block: undefined, knobs: undefined, prompt: 'article.B1' });
    expect(ids(validate(r))).toEqual(['DR1']);
  });

  it('DR2 without its C1 exception', () => {
    const r = studio();
    r.exceptions = ['C1-DR7'];
    expect(ids(validate(r))).toEqual(['DR2']);
  });

  it('DR3 a critic without a frozen prompt', () => {
    const r = studio();
    stepById(r, 'critic').frozenPrompt = false;
    expect(ids(validate(r))).toEqual(['DR3']);
  });

  it('DR4 a critic loop stopped by a human', () => {
    const r = studio();
    Object.assign(firstGate(r), { metric: 'human', holder: 'human' });
    expect(ids(validate(r))).toContain('DR4');
  });

  it('DR5 a mid-tier critic', () => {
    const r = studio();
    stepById(r, 'critic').tier = 'mid';
    expect(ids(validate(r))).toEqual(['DR5']);
  });

  it('DR6 a critic view that does not come from a render', () => {
    const r = studio();
    r.inputs.push('view');
    walk(r, (node) => {
      if (node.op === 'seq') node.steps = node.steps.filter((s) => !(s.op === 'step' && s.id === 'render-1'));
    });
    expect(ids(validate(r))).toEqual(['DR6']);
  });

  it('DR7 without its C1 exception', () => {
    const r = studio();
    r.exceptions = ['C1-DR2'];
    expect(ids(validate(r))).toEqual(['DR7']);
  });

  it('DR7 VOICE before CUT', () => {
    const r = studio();
    const steps = d3(r).steps;
    const voice = steps.findIndex((s) => s.op === 'step' && s.id === 'voice');
    const [v] = steps.splice(voice, 1);
    steps.splice(1, 0, v!);
    expect(ids(validate(r))).toContain('DR7');
  });

  it('DR8 a ban list on a fix step', () => {
    const r = studio();
    stepById(r, 'apply-cut').knobs = { avoid: ['eyebrow labels'] };
    expect(ids(validate(r))).toEqual(['DR8']);
  });

  it('DR9 a model writing the voice', () => {
    const r = studio();
    Object.assign(stepById(r, 'voice'), { actor: 'model', tier: 'mid' });
    expect(ids(validate(r))).toEqual(['DR9']);
  });

  it('DR10 is a warning, not a violation', () => {
    const r = studio();
    r.bank = false;
    const v = validate(r);
    expect(v.ok).toBe(true);
    expect(v.warnings.map((w) => w.ruleId)).toEqual(['DR10']);
  });

  it('default rules are not checked for baselines', () => {
    const r = baseline();
    Object.assign(r.stages[0]!.body, { tier: 'big' });
    expect(validate(r).violations).toEqual([]);
  });
});

describe('clause-scoped exceptions', () => {
  it('C1-DR7 allows the defect check after Distill but not a reordered Distill', () => {
    const r = studio();
    const steps = d3(r).steps;
    const [render2, ...rest] = steps;
    const voiceIdx = rest.findIndex((s) => s.op === 'step' && s.id === 'voice');
    const [voice] = rest.splice(voiceIdx, 1);
    d3(r).steps = [render2!, voice!, ...rest];
    const dr7 = validate(r).violations.filter((x) => x.ruleId === 'DR7');
    // CUT, the TELLS sweep and the TELLS compare all come after VOICE.
    expect(dr7.map((x) => x.clause)).toEqual(['order', 'order', 'order']);
  });

  it('SM-6 covers a fixed copy deck but not a model writing the voice', () => {
    const r = studio();
    r.kind = 'variant';
    r.channel = 'research-frozen';
    r.exceptions.push('SM-6');
    r.inputs.push('voice');
    Object.assign(stepById(r, 'voice'), { actor: 'model', tier: 'mid' });
    const v = validate(r);
    expect(v.violations.map((x) => `${x.ruleId}:${x.clause}`)).toEqual(['DR9:model-voice']);
  });
});

describe('derivations', () => {
  it('a SEED leave-one-out ablation suspends DR1 and records it', () => {
    const r = studio();
    r.kind = 'variant';
    Object.assign(stepById(r, 'seed-build'), { role: 'build', block: undefined, knobs: undefined, prompt: 'article.B1' });
    r.kind = 'ablation';
    r.parent = { hash: `sha256:${'0'.repeat(64)}`, derivation: { transform: 'leave-one-out', version: 1, target: 'SEED' } };
    const v = validate(r);
    expect(v.violations).toEqual([]);
    expect(v.suspended).toEqual(['DR1']);
  });
});

describe('determinism', () => {
  it('reports violations in a stable order', () => {
    const r = studio();
    r.exceptions = [];
    stepById(r, 'critic').tier = 'mid';
    const a = validate(r).violations.map((x) => `${x.ruleId}@${x.path}`);
    const b = validate(structuredClone(r)).violations.map((x) => `${x.ruleId}@${x.path}`);
    expect(a).toEqual(b);
    expect(a.length).toBe(3);
  });

  it('does not mutate its input', () => {
    const r = studio();
    const before = JSON.stringify(r);
    validate(r);
    expect(JSON.stringify(r)).toBe(before);
  });
});
