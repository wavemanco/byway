/**
 * Rules for the operators added with C2–C7 (parallel audit, one-shot gate with retry, relay chain) and the rule
 * refinements those configurations need. Each test names the clause it pins.
 */
import { describe, expect, it } from 'vitest';
import { EXCEPTIONS, OPTION_SET } from '@byway/protocol';
import { audit, loop, oneShotGate, pick, relay, replicate, seq, step, walk, type Node, type OneShotGate, type Recipe, type RelayChain, type Seq } from '@byway/recipe';
import { validate } from '../src/index.ts';
import { stepById, studio } from './fixtures.ts';
import { critic, cutByHuman, fix, ideas, leanDiff, mediaRelay, render, rankGate, secondReader, seedStep, voice } from './operator-fixtures.ts';

const ruleClauses = (r: Recipe) => validate(r).violations.map((v) => `${v.ruleId}${v.clause ? `:${v.clause}` : ''}`);
const without = (r: Recipe, ex: string): Recipe => ({ ...r, exceptions: r.exceptions.filter((x) => x !== ex) });

function find<T extends Node['op']>(r: Recipe, op: T, id: string): Extract<Node, { op: T }> {
  let found: Node | undefined;
  walk(r, (n) => {
    if (n.op === op && 'id' in n && n.id === id) found = n;
  });
  if (!found) throw new Error(`no ${op} ${id}`);
  return found as Extract<Node, { op: T }>;
}
const stageSeq = (r: Recipe, stage: 'D1' | 'D2' | 'D3'): Seq => r.stages.find((s) => s.stage === stage)!.body as Seq;

describe('the operator fixtures validate with exactly their 03 exceptions', () => {
  it.each([
    ['C2 ideas', ideas],
    ['C5 media relay', mediaRelay],
    ['C6 second reader', secondReader],
    ['C7 lean diff', leanDiff],
  ] as const)('%s', (_name, make) => {
    const r = make();
    const v = validate(r);
    expect(v.violations).toEqual([]);
    expect(v.exceptionsUsed).toEqual(r.exceptions);
  });

  it.each([
    ['C2-DR4', ideas, ['DR4:annotation']],
    ['C2-DR7', ideas, ['DR7:voice-stage']],
    ['C5-DR7', mediaRelay, ['DR7:voice-stage', 'DR7:gate-after']],
    ['C6-DR4', secondReader, ['DR4:human-stop']],
    ['C6-DR7', secondReader, ['DR7:audit', 'DR7:audit']],
    ['C7-PR1', leanDiff, ['PR1:code-view', 'PR1:code-view']],
    ['C7-DR7', leanDiff, ['DR7:cut-stage', 'DR7:cut-stage']],
  ] as const)('without %s exactly what it relaxes surfaces', (ex, make, expected) => {
    expect(ruleClauses(without(make(), ex))).toEqual(expected);
  });
});

describe('parallel audit', () => {
  it('ST9: a lens step that writes', () => {
    const r = secondReader();
    Object.assign(stepById(r, 'cut-marks'), { writes: true, produces: ['critique', 'artifact'] });
    expect(ruleClauses(r)).toEqual(['ST9:writes']);
  });

  it('ST9: a lens that returns no annotation', () => {
    const r = secondReader();
    find(r, 'audit', 'audit').lenses.push({ name: 'render-only', body: render('lens-render') });
    expect(ruleClauses(r)).toEqual(['ST9:no-annotation']);
  });

  it('ST9: lens names are distinct', () => {
    const r = secondReader();
    find(r, 'audit', 'audit').lenses[1]!.name = 'cut';
    expect(ruleClauses(r)).toEqual(['ST9:duplicate-lens']);
  });

  it('only annotations leave a lens (a view made inside one is not in scope after it)', () => {
    const r = secondReader();
    const body = find(r, 'loop', 'author-loop').body as Seq;
    body.steps[1] = step({ id: 'noop', role: 'build', actor: 'human', consumes: ['intent'], produces: [] });
    find(r, 'audit', 'audit').lenses = find(r, 'audit', 'audit').lenses.map((l) => ({ ...l, body: seq(render(`${l.name}-render`), l.body) }));
    body.steps.push(step({ id: 'after', role: 'vision', block: 'VISION', actor: 'human', consumes: ['view'], produces: ['taste'] }));
    r.sitsOut = r.sitsOut.filter((s) => s.block !== 'VISION');
    expect(ruleClauses(r)).toEqual(['ST5']);
  });

  it('the lenses’ joined critique is in scope after the audit; a score is not (ADR-0092 stage 4: several lenses cannot make one score)', () => {
    const r = secondReader();
    const body = find(r, 'loop', 'author-loop').body as Seq;
    body.steps.push(step({ id: 'read-notes', role: 'vision', block: 'VISION', actor: 'human', consumes: ['critique'], produces: ['taste'] }));
    r.sitsOut = r.sitsOut.filter((s) => s.block !== 'VISION');
    expect(ruleClauses(r)).toEqual([]);
    (body.steps.at(-1) as { consumes: string[] }).consumes = ['critique', 'score'];
    expect(ruleClauses(r)).toEqual(['ST5']);
  });

  it('DR1 does not count the vanilla control runs inside a lens as candidates, but does outside one', () => {
    expect(ruleClauses(ideas())).toEqual([]);
    const r = ideas();
    const d1 = stageSeq(r, 'D1');
    d1.steps.unshift(replicate('plain-x2', 2, step({ id: 'plain', role: 'build', actor: 'model', tier: 'mid', consumes: ['intent'], produces: ['artifact'], writes: true })));
    expect(ruleClauses(r)).toEqual(['DR1']);
  });

  it('C6-DR7 does not hide a CUT that writes in D2 outside a lens', () => {
    const r = secondReader();
    const body = find(r, 'loop', 'author-loop').body as Seq;
    body.steps.push(render('cut-render'), cutByHuman('d2-cut'), fix('apply-cut'));
    expect(ruleClauses(r)).toEqual(['DR7:cut-stage']);
  });

  it('a lens in D3 after VOICE is reported as audit, not order', () => {
    const r = secondReader();
    r.stages[1]!.body = seq(voice('voice'), audit('final-read', [{ name: 'tells', body: seq(render('final-render'), stepById(secondReader(), 'tells-flags')) }]));
    stepById(r, 'tells-flags').id = 'final-flags';
    expect(ruleClauses(without(r, 'C6-DR7'))).toEqual(['DR7:audit', 'DR7:audit', 'DR7:audit']);
  });
});

describe('human-stopped loops', () => {
  it('PR2 does not apply to a human stop decision that holds no threshold', () => {
    expect(ruleClauses(secondReader()).filter((x) => x.startsWith('PR2'))).toEqual([]);
  });

  it('PR2 still applies to a human-held numeric threshold', () => {
    const r = secondReader();
    find(r, 'loop', 'author-loop').gate.threshold = 9;
    expect(ruleClauses(r)).toContain('PR2:holder');
  });

  it('C6-DR4 does not hide a visible critic-score threshold', () => {
    const r = secondReader();
    Object.assign(find(r, 'loop', 'author-loop').gate, { metric: 'critic-score', threshold: 9, holder: 'worker', hidden: false });
    // C6-DR4 relaxes only the human stop, so it is now unused (ST8) and the visible threshold stays a violation. A scored
    // loop around the author's own writing could also end on an earlier scored draft, undoing theirs (ST12, ADR-0092).
    // Its critic sits in a lens, where it never reports to the loop's gate, so the loop has no verdict to stop on (ST2).
    expect(ruleClauses(r)).toEqual(['DR4:metric', 'PR2:not-hidden', 'ST2:feed', 'ST8', 'ST12:set-aside']);
  });

  it('ST2: a critic metric needs a threshold', () => {
    const r = studio();
    delete find(r, 'loop', 'critic-loop').gate.threshold;
    expect(ruleClauses(r)).toEqual(['ST2']);
  });
});

describe('DR4: a critic must stop something', () => {
  it('annotation: a critic outside any loop or gate', () => {
    const r = ideas();
    r.exceptions = ['C2-DR7'];
    expect(ruleClauses(r)).toEqual(['DR4:annotation']);
  });

  it('a critic inside a one-shot gate is not an annotation', () => {
    expect(ruleClauses(without(mediaRelay(), 'C5-DR7')).some((x) => x === 'DR4:annotation')).toBe(false);
  });
});

describe('CH3 is about Distill (D3)', () => {
  it('a model CUT in D2 is a stage matter (DR7), not CH3', () => {
    expect(ruleClauses(without(leanDiff(), 'C7-DR7'))).toEqual(['DR7:cut-stage', 'DR7:cut-stage']);
  });

  it('a model CUT in D3 is still CH3', () => {
    const r = mediaRelay();
    Object.assign(stepById(r, 'cut'), { actor: 'model', tier: 'big', isolated: true });
    expect(ruleClauses(r)).toEqual(['CH3']);
  });
});

describe('one-shot gate', () => {
  const gate = (r: Recipe): OneShotGate => find(r, 'gate', 'launch-gate');

  it('ST10: a gate body that writes (a gate has no fix step)', () => {
    const r = mediaRelay();
    gate(r).body = seq(critic('gate-critic'), fix('gate-fix', true));
    expect(ruleClauses(r)).toEqual(['ST10:writes']);
  });

  it('ST10: a retry that is not a positive bounded count', () => {
    const r = mediaRelay();
    gate(r).retry = { stage: 'D2', times: 0 };
    expect(ruleClauses(r)).toEqual(['ST10:retry-count']);
    gate(r).retry = { stage: 'D2', times: 4 };
    expect(ruleClauses(r)).toEqual(['ST10:retry-count']);
  });

  it('ST10: a retry of a later stage, or of a stage the recipe does not have', () => {
    const r = mediaRelay();
    const g = gate(r);
    stageSeq(r, 'D3').steps.pop();
    stageSeq(r, 'D2').steps.push(render('d2-render'), g);
    g.retry = { stage: 'D3', times: 1 };
    expect(ruleClauses(r)).toContain('ST10:retry-stage');
    const s = secondReader();
    (s.stages[1]!.body as unknown) = seq(voice('voice'), render('feed-render'), oneShotGate('g', critic('g-critic'), { metric: 'critic-rank', threshold: 3, hidden: true, holder: 'harness' }, { stage: 'D1', times: 1 }));
    expect(ruleClauses(s)).toContain('ST10:retry-stage');
  });

  it('ST10: an unknown metric, and PR8 for a detector metric', () => {
    const r = mediaRelay();
    gate(r).pass.metric = 'vibes';
    expect(ruleClauses(r)).toContain('ST10:metric');
    gate(r).pass.metric = 'ai-detector';
    expect(ruleClauses(r)).toContain('PR8');
  });

  it('PR2: the gate threshold is hidden and held by the worker or the harness', () => {
    const r = mediaRelay();
    Object.assign(gate(r).pass, { hidden: false, holder: 'human' });
    expect(ruleClauses(r)).toEqual(['DR4:metric', 'PR2:not-hidden', 'PR2:holder']);
  });

  it('C5-DR7 does not hide a scoring critic loop after CUT', () => {
    const r = mediaRelay();
    const d3 = stageSeq(r, 'D3');
    d3.steps.splice(3, 0, loop('late-loop', seq(render('late-render'), critic('late-critic'), fix('late-fix', true)), rankGate()));
    expect(ruleClauses(r)).toEqual(['DR7:judge-after']);
  });

  it('C5-DR7 does not hide a reordered Distill in D3', () => {
    const r = mediaRelay();
    const d3 = stageSeq(r, 'D3');
    const i = d3.steps.findIndex((s) => s.op === 'step' && s.id === 'voice');
    const [v] = d3.steps.splice(i, 1);
    d3.steps.unshift(v!);
    expect(ruleClauses(r)).toContain('DR7:order');
  });
});

describe('relay chain', () => {
  const chain = (r: Recipe): RelayChain => find(r, 'relay', 'chain');

  it('ST11: a link that does not hand on an anchor', () => {
    const r = mediaRelay();
    stepById(r, 'clip').produces = ['artifact'];
    expect(ruleClauses(r)).toEqual(['ST11:no-anchor-out']);
  });

  it('ST11: a link that does not start from an anchor', () => {
    const r = mediaRelay();
    stepById(r, 'clip').consumes = ['artifact'];
    expect(ruleClauses(r)).toEqual(['ST11:no-anchor-in']);
  });

  it('ST3: maxLinks is a positive integer', () => {
    const r = mediaRelay();
    chain(r).maxLinks = 0;
    expect(ruleClauses(r)).toEqual(['ST3']);
  });

  it('ST5: the first link needs an anchor in scope', () => {
    const r = mediaRelay();
    stepById(r, 'anchor-frames').produces = ['artifact'];
    expect(ruleClauses(r)).toEqual(['ST5']);
  });

  it('PR4: a relay chain only after a pick', () => {
    const r = mediaRelay();
    const d1 = stageSeq(r, 'D1');
    d1.steps = d1.steps.filter((s) => s.op !== 'pick');
    const d2 = stageSeq(r, 'D2');
    d2.steps.unshift(replicate('more', 2, seedStep('more-seed')));
    const v = ruleClauses(r);
    expect(v).toContain('PR4:relay-unpicked');
  });
});

describe('PR6: no later block writes over voice', () => {
  it('a machine write that keeps human copy verbatim after VOICE is allowed', () => {
    expect(ruleClauses(mediaRelay())).toEqual([]);
  });

  it('a machine write that does not keep it is not', () => {
    const r = mediaRelay();
    delete stepById(r, 'apply-cut').keepsVoice;
    expect(ruleClauses(r)).toEqual(['PR6:voice-step']);
  });

  it('the owner editing their own words later is not a write over voice', () => {
    const r = studio();
    const d3 = r.stages[2]!.body as Seq;
    d3.steps.push(step({ id: 'owner-edit', role: 'build', actor: 'human', consumes: ['artifact'], produces: ['artifact'], writes: true }));
    expect(ruleClauses(r)).toEqual([]);
  });
});

describe('PR1 code-view and DR9 key-lines', () => {
  it('a judge that sees a code diff sees code (port rule 1)', () => {
    const r = leanDiff();
    r.exceptions = ['C7-DR7'];
    expect(validate(r).violations.map((v) => [v.ruleId, v.clause, v.path.split('.').at(-1)])).toEqual([
      ['PR1', 'code-view', 'steps[2]'],
      ['PR1', 'code-view', 'steps[1]'],
    ]);
  });

  it('VOICE on key lines only is a relaxation of rule 9', () => {
    const r = studio();
    stepById(r, 'voice').knobs = { scope: 'key-lines' };
    expect(ruleClauses(r)).toEqual(['DR9:key-lines']);
  });

  it('C4-DR9 is limited to the C4 family', () => {
    const r = studio();
    stepById(r, 'voice').knobs = { scope: 'key-lines' };
    r.exceptions.push('C4-DR9');
    expect(ruleClauses(r)).toEqual(['DR9:key-lines', 'ST8']);
    expect(EXCEPTIONS['C4-DR9']?.families).toEqual(['C4']);
  });
});

describe('DR7 stage clauses name the block', () => {
  it('VOICE in D1 is voice-stage, and neither reorders the D3 Distill nor makes later checks "after Distill"', () => {
    const clauses = ruleClauses(without(mediaRelay(), 'C5-DR7'));
    expect(clauses).toContain('DR7:voice-stage');
    expect(clauses).not.toContain('DR7:order');
    expect(clauses).not.toContain('DR7:check-after');
  });

  it('a TELLS knob outside its domain list is ST7', () => {
    const r = studio();
    stepById(r, 'tells-sweep').knobs = { domains: ['memo', 'astrology'] };
    expect(ruleClauses(r)).toEqual(['ST7']);
    stepById(r, 'tells-sweep').knobs = { domains: [] };
    expect(ruleClauses(r)).toEqual(['ST7']);
    stepById(r, 'tells-sweep').knobs = { domains: ['memo', 'memo'] };
    expect(ruleClauses(r)).toEqual(['ST7']);
    stepById(r, 'tells-sweep').knobs = { domains: ['memo', 'fiction'] };
    expect(ruleClauses(r)).toEqual([]);
  });
});

describe('dedupe and overlap glue steps', () => {
  it('a dedupe step keeps the option set open and typed', () => {
    const r = ideas();
    const d1 = stageSeq(r, 'D1');
    expect(d1.steps[1]).toMatchObject({ role: 'dedupe', consumes: [OPTION_SET], produces: [OPTION_SET] });
    expect(ruleClauses(r)).toEqual([]);
  });
});
