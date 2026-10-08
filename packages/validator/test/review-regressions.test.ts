/**
 * Regression tests for the Milestone 0 adversarial review (findings verified by independent passes).
 * Each test names the finding it pins.
 */
import { describe, expect, it } from 'vitest';
import { leaveOneOut, loop, optional, pick, replicate, route, seq, step, walk, type Recipe, type Seq, type Step } from '@byway/recipe';
import { validate } from '../src/index.ts';
import { okGate, stepById, studio, baseline } from './fixtures.ts';

const ruleClauses = (r: Recipe) => validate(r).violations.map((v) => `${v.ruleId}${v.clause ? `:${v.clause}` : ''}`);
const d3 = (r: Recipe): Seq => r.stages.find((s) => s.stage === 'D3')!.body as Seq;
const lateFix = (id = 'late-fix'): Step =>
  step({ id, role: 'fix', actor: 'model', tier: 'mid', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true });
const renderStep = (id: string): Step => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const scoringCritic = (id: string): Step =>
  step({ id, role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, consumes: ['view'], produces: ['critique', 'score'], knobs: { mode: 'GREAT' } });

describe('derivations', () => {
  it('the SEED bypass drops the seed port from the plain build (port rule 3 is an invariant)', () => {
    const r = studio();
    r.inputs.push('seed');
    stepById(r, 'seed-build').consumes = ['intent', 'seed'];
    expect(validate(r).ok).toBe(true);
    const ablation = leaveOneOut(r, 'SEED');
    expect(stepById(ablation, 'seed-build').consumes).toEqual(['intent']);
    expect(validate(ablation).violations).toEqual([]);
  });

  it('a leave-one-out claim on a non-ablation is an ST8 violation and suspends nothing', () => {
    const r = studio();
    Object.assign(stepById(r, 'seed-build'), { role: 'build', block: undefined, knobs: undefined, prompt: 'article.B1' });
    r.parent = { hash: `sha256:${'0'.repeat(64)}`, derivation: { transform: 'leave-one-out', version: 1, target: 'SEED' } };
    const v = validate(r);
    expect(v.suspended).toEqual([]);
    expect(ruleClauses(r).sort()).toEqual(['DR1', 'ST8']);
  });
});

describe('C1-DR7 covers only the score-free defect check', () => {
  it('does not hide a scoring critic after VOICE', () => {
    const r = studio();
    d3(r).steps.push(renderStep('late-render'), scoringCritic('late-critic'));
    // Since C2–C7, a critic outside any loop or gate is also reported as an annotation (DR4).
    expect(ruleClauses(r)).toEqual(['DR4:annotation', 'DR7:judge-after']);
  });

  it('does not hide a critic loop after CUT', () => {
    const r = studio();
    const i = d3(r).steps.findIndex((s) => s.op === 'step' && s.id === 'apply-cut');
    d3(r).steps.splice(i + 1, 0, loop('d3-loop', seq(renderStep('d3-loop-render'), scoringCritic('d3-critic'), lateFix('d3-fix')), okGate()));
    expect(ruleClauses(r)).toContain('DR7:judge-after');
  });
});

describe('DR1 counts only human direction', () => {
  it('rejects variety from a brief a model wrote', () => {
    const r = studio();
    r.stages[0]!.body = seq(
      step({ id: 'ai-brief', role: 'build', actor: 'model', tier: 'mid', consumes: ['intent'], produces: ['brief'] }),
      replicate('x2', 2, step({ id: 'plain', role: 'build', actor: 'model', tier: 'mid', prompt: 'article.B1', consumes: ['brief'], produces: ['artifact'], writes: true })),
    );
    expect(ruleClauses(r)).toContain('DR1');
  });

  it('accepts a brief a human supplied', () => {
    const r = studio();
    r.inputs.push('brief');
    r.stages[0]!.body = replicate('x2', 2, step({ id: 'plain', role: 'build', actor: 'model', tier: 'mid', prompt: 'project.build', consumes: ['brief'], produces: ['artifact'], writes: true }));
    expect(ruleClauses(r)).not.toContain('DR1');
  });

  it('requires the seed step to come first in the replica', () => {
    const r = studio();
    r.stages[0]!.body = replicate(
      'x2',
      2,
      seq(
        step({ id: 'plain', role: 'build', actor: 'model', tier: 'mid', prompt: 'article.B1', consumes: ['intent'], produces: ['artifact'], writes: true }),
        step({ id: 'late-seed', role: 'seed', block: 'SEED', actor: 'model', tier: 'mid', consumes: ['intent'], produces: ['artifact'], writes: true }),
      ),
    );
    expect(ruleClauses(r)).toContain('DR1');
  });
});

describe('PR6 checks every path, not only guaranteed ones', () => {
  const voiceStep = (r: Recipe) => {
    const steps = d3(r).steps;
    const i = steps.findIndex((s) => s.op === 'step' && s.id === 'voice');
    return { steps, i, voice: steps[i]! };
  };

  it('after an optional VOICE', () => {
    const r = studio();
    const { steps, i, voice } = voiceStep(r);
    steps[i] = optional('voice-if', 'copy needs it', voice);
    steps.push(lateFix());
    expect(ruleClauses(r)).toContain('PR6:voice-step');
  });

  it('after a VOICE in one route branch', () => {
    const r = studio();
    const { steps, i, voice } = voiceStep(r);
    steps[i] = route('copy', 'copy?', [{ name: 'human', body: voice }, { name: 'none', body: renderStep('no-copy-render') }]);
    steps.push(lateFix());
    expect(ruleClauses(r)).toContain('PR6:voice-step');
  });

  it('across a loop back-edge', () => {
    const r = studio();
    const { steps, i, voice } = voiceStep(r);
    steps[i] = loop('voice-loop', seq(lateFix('loop-fix'), voice), okGate());
    expect(ruleClauses(r)).toContain('PR6:voice-step');
  });

  it('SM-6 covers the fixed deck but not a write over a VOICE step’s copy', () => {
    const r = studio();
    r.kind = 'variant';
    r.channel = 'research-frozen';
    r.inputs.push('voice');
    r.exceptions.push('SM-6');
    d3(r).steps.push(lateFix());
    expect(ruleClauses(r)).toEqual(['PR6:voice-step']);
  });
});

describe('PR4 and DR6 through routes', () => {
  it('an option set left open by one branch still reaches D3', () => {
    const r = baseline();
    r.stages = [
      { stage: 'D1', body: replicate('x2', 2, step({ id: 'build', role: 'build', actor: 'model', tier: 'mid', consumes: ['intent', 'voice'], produces: ['artifact'], writes: true })) },
      {
        stage: 'D2',
        body: route('maybe-pick', 'mode', [
          { name: 'pick', body: pick('pick-one', 'H', 1, 'human') },
          { name: 'skip', body: step({ id: 'noop', role: 'build', actor: 'human', consumes: ['intent'], produces: ['artifact'] }) },
        ]),
      },
      { stage: 'D3', body: step({ id: 'cut', role: 'cut', block: 'CUT', actor: 'human', consumes: ['artifact'], produces: ['critique'] }) },
    ];
    expect(ruleClauses(r)).toContain('PR4:d3-entry');
  });

  it('DR6 does not depend on branch order', () => {
    const make = (order: 'ab' | 'ba') => {
      const r = studio();
      const a = { name: 'a', body: renderStep('render-a') };
      const b = { name: 'b', body: step({ id: 'vision-view', role: 'vision', actor: 'human', consumes: ['artifact'], produces: ['view'] }) };
      walk(r, (n) => {
        if (n.op === 'seq') {
          const i = n.steps.findIndex((s) => s.op === 'step' && s.id === 'render-1');
          if (i >= 0) n.steps[i] = route('which-view', 'mode', order === 'ab' ? [a, b] : [b, a]);
        }
      });
      return ruleClauses(r);
    };
    expect(make('ab')).toContain('DR6');
    expect(make('ba')).toContain('DR6');
  });
});

describe('robustness', () => {
  it.each(['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf'])('exception id "%s" is an ST8 finding, not a crash', (id) => {
    const r = baseline();
    r.exceptions.push(id);
    expect(ruleClauses(r)).toEqual(['ST8']);
  });

  it('a duplicated exception citation is an ST8 violation', () => {
    const r = baseline();
    r.exceptions.push('SM-6');
    const v = validate(r);
    expect(v.violations.map((x) => x.message)).toEqual(['exception "SM-6" is cited more than once']);
    expect(v.exceptionsUsed).toEqual(['SM-6']);
  });

  it('a NaN count is reported, not thrown', () => {
    const r = studio();
    (r.stages[0]!.body as { n: number }).n = Number.NaN;
    const v = validate(r);
    expect(v.recipeHash).toBe('unhashable');
    expect(v.violations.map((x) => x.ruleId)).toEqual(['ST3', 'ST3']);
  });

  it('DR7 treats route branches as alternatives, not a sequence', () => {
    const r = studio();
    const steps = d3(r).steps;
    const cutIdx = steps.findIndex((s) => s.op === 'step' && s.id === 'cut');
    const cut = steps[cutIdx]!;
    steps[cutIdx] = route('polish', 'mode', [
      { name: 'cut', body: cut },
      { name: 'skip', body: renderStep('skip-render') },
    ]);
    expect(ruleClauses(r).filter((x) => x.startsWith('DR7'))).toEqual([]);
  });

  it('orders paths numerically (steps[2] before steps[10])', () => {
    const r = studio();
    r.exceptions = [];
    for (const id of ['render-1', 'render-2']) stepById(r, id).consumes = ['artifact', 'seed'];
    const paths = validate(r).violations.filter((v) => v.ruleId === 'ST5').map((v) => v.path);
    expect(paths).toEqual([...paths].sort(new Intl.Collator('en', { numeric: true }).compare));
  });
});

describe('PR7.1 and DR4 on the shared worker context', () => {
  it('a TELLS sweep in the worker context is flagged', () => {
    const r = studio();
    stepById(r, 'tells-sweep').isolated = false;
    expect(ruleClauses(r)).toEqual(['PR7.1:sweep-not-isolated']);
  });

  it('a self-critique under a worker-held threshold breaches DR4 as well as PR1 and PR2', () => {
    const r = studio();
    Object.assign(stepById(r, 'critic'), { isolated: false });
    expect(ruleClauses(r)).toEqual(expect.arrayContaining(['PR1:not-isolated', 'PR2:shared-context', 'DR3:not-isolated', 'DR4:shared-context']));
  });
});
