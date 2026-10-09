/**
 * F01 at the validator (ADR-0092): protections come from what a recipe executes, never from what a step declares.
 * ST12 refuses declarations that say less than execution (an undeclared writer) or anything else (VOICE, block labels,
 * who picks); PR6 arms on an executed VOICE and flags every writer that runs after it; a lens or a gate body holds no
 * person's write (ST9/ST10 'human-write'); nothing a pick, a keep-or-revert or a scored loop puts back may undo a
 * person's write (ST5/ST12 'set-aside'), read on the exit-aware flow walk; and DR9 counts executed VOICE writes.
 */
import { describe, expect, it } from 'vitest';
import { OPTION_SET } from '@byway/protocol';
import { audit, loop, oneShotGate, optional, pick, relay, replicate, seq, step, type Gate, type Node, type Recipe, type Seq, type Step } from '@byway/recipe';
import { flowRecipe, validate } from '../src/index.ts';
import { okGate, stepById, studio } from './fixtures.ts';

const clauses = (r: Recipe) => validate(r).violations.map((v) => `${v.ruleId}${v.clause ? `:${v.clause}` : ''}`);
const only = (r: Recipe, prefix: string) => clauses(r).filter((c) => c.startsWith(prefix)).sort();
const d3 = (r: Recipe): Seq => r.stages.find((s) => s.stage === 'D3')!.body as Seq;
const d1 = (r: Recipe): Node => r.stages.find((s) => s.stage === 'D1')!.body;
const indexOf = (s: Seq, id: string) => s.steps.findIndex((n) => n.op !== 'seq' && n.id === id);
const insertAfter = (s: Seq, id: string, ...nodes: Node[]) => s.steps.splice(indexOf(s, id) + 1, 0, ...nodes);

const modelFix = (id: string, extra: Partial<Step> = {}): Step =>
  step({ id, role: 'fix', actor: 'model', tier: 'mid', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true, ...extra });
const render = (id: string): Step => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const critic = (id: string): Step =>
  step({ id, role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, consumes: ['view'], produces: ['critique', 'score'], knobs: { mode: 'OK' } });
const humanDraft = (id: string, consumes: Step['consumes'] = ['artifact']): Step => step({ id, role: 'build', actor: 'human', consumes, produces: ['artifact'], writes: true });
const checkCleanGate = (max = 2): Gate => ({ metric: 'check-clean', hidden: false, holder: 'harness', probe: 1, max, onCap: 'human', onNoConverge: 'recalibrate-human' });

describe('ST12 writer-undeclared: a writer is one by what it runs, and must say so', () => {
  it.each([
    ['writes: false', { writes: false }],
    ['writes left out', { writes: undefined }],
  ])('a model fix after VOICE with %s is refused, and PR6 sees it', (_name, extra) => {
    const r = studio();
    d3(r).steps.push(modelFix('ai-polish', extra));
    expect(clauses(r)).toEqual(expect.arrayContaining(['ST12:writer-undeclared', 'PR6:voice-step']));
  });

  it('a writer contained in a lens need not declare (it changes nothing); declaring more than it does stays legal', () => {
    const r = studio();
    insertAfter(d3(r), 'render-5', audit('vanilla', [{ name: 'vanilla-overlap', body: seq(replicate('vx', 2, step({ id: 'vanilla-build', role: 'build', actor: 'model', tier: 'mid', consumes: ['intent'], produces: ['artifact'] })), step({ id: 'flag', role: 'overlap', actor: 'model', tier: 'mid', isolated: true, consumes: ['view', OPTION_SET], produces: ['critique'] })) }]));
    expect(only(r, 'ST12')).toEqual([]);
    expect(only(r, 'PR6')).toEqual([]);
    const matte = studio();
    insertAfter(d3(matte), 'render-5', step({ id: 'matte', role: 'relay', block: 'RELAY', actor: 'tool', consumes: ['artifact'], produces: ['artifact'], writes: true, keepsVoice: true }));
    expect(only(matte, 'ST12')).toEqual([]);
  });
});

describe('ST12 VOICE and block labels must agree with execution, both ways', () => {
  it("a VOICE without the 'voice' port still writes your words: refused as undeclared, and PR6 still arms (V1)", () => {
    const r = studio();
    stepById(r, 'voice').produces = ['artifact'];
    d3(r).steps.push(modelFix('ai-polish'));
    expect(clauses(r)).toEqual(expect.arrayContaining(['ST12:voice-undeclared', 'PR6:voice-step']));
  });

  it('a VOICE without its block label is undeclared and mislabelled', () => {
    const r = studio();
    delete stepById(r, 'voice').block;
    expect(only(r, 'ST12')).toEqual(['ST12:block-role', 'ST12:voice-undeclared']);
  });

  it('a step declaring VOICE that writes no words of yours is refused (a model pass, a human vision)', () => {
    const r = studio();
    Object.assign(stepById(r, 'voice'), { actor: 'model', tier: 'mid', role: 'fix', block: undefined });
    expect(only(r, 'ST12')).toEqual(['ST12:voice-not-written']);
    const vision = studio();
    insertAfter(d3(vision), 'voice', step({ id: 'fake-voice', role: 'vision', block: 'VOICE', actor: 'human', consumes: ['view'], produces: ['voice', 'artifact'] }));
    expect(only(vision, 'ST12')).toEqual(['ST12:block-role', 'ST12:voice-not-written']);
  });

  it('a block label must be its role’s block; a check may carry CRITIC', () => {
    const r = studio();
    stepById(r, 'apply-cut').block = 'CUT';
    expect(only(r, 'ST12')).toEqual(['ST12:block-role']);
    expect(only(studio(), 'ST12')).toEqual([]);
  });
});

describe('ST12 on operators', () => {
  it('no VOICE per candidate', () => {
    const r = studio();
    (r.stages[0]!.body as { body: Node }).body = seq(stepById(r, 'seed-build'), step({ id: 'cand-voice', role: 'voice', block: 'VOICE', actor: 'human', consumes: ['artifact'], produces: ['voice', 'artifact'], writes: true }));
    expect(only(r, 'ST12')).toEqual(['ST12:voice-per-candidate']);
  });

  it("a C pick needs a model judge of role judge or select; a pick's actor is its mode's", () => {
    const withPick = (p: Node) => {
      const r = studio();
      const d2 = r.stages[1]!.body as Seq;
      d2.steps[1] = p;
      return only(r, 'ST12');
    };
    const judge = step({ id: 'judge', role: 'judge', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, consumes: ['view'], produces: [] });
    expect(withPick(pick('pick-final', 'C', 1, 'model', judge))).toEqual([]);
    expect(withPick(pick('pick-final', 'C', 1, 'model'))).toEqual(['ST12:pick-judge']);
    expect(withPick(pick('pick-final', 'C', 1, 'model', { ...judge, role: 'build' }))).toEqual(['ST12:pick-judge']);
    expect(withPick(pick('pick-final', 'H', 1, 'model'))).toEqual(['ST12:pick-actor']);
    expect(withPick(pick('pick-final', 'R', 1, 'human'))).toEqual(['ST12:pick-actor']);
  });
});

describe("ST9/ST10 human-write: a lens or a gate body holds no person's write", () => {
  it('a person writing inside an audit lens (V2a)', () => {
    const r = studio();
    insertAfter(d3(r), 'render-5', audit('notes', [{ name: 'own', body: seq(humanDraft('lens-draft'), critic('lens-critic')) }]));
    expect(only(r, 'ST9')).toEqual(['ST9:human-write', 'ST9:writes']);
  });

  it('a VOICE inside a one-shot gate body (V2b)', () => {
    const r = studio();
    const i = indexOf(d3(r), 'voice');
    const v = d3(r).steps[i]!;
    d3(r).steps[i] = oneShotGate('final', seq(v, render('gate-render'), critic('gate-critic')), { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' });
    expect(only(r, 'ST10')).toEqual(['ST10:human-write', 'ST10:writes']);
  });
});

/**
 * A person's list of what to remove, or a reaction of theirs given as a critique, is an answer the step after it acts
 * on. Where the operator around it drops that answer, the step after it acts on an earlier critique instead, and the
 * person's answer is lost without a word (the round-3 verification's C3 and C4 cases): refused where it is asked.
 */
describe("ST9/ST10 'human-critique' and ST12 'critique-per-candidate': no person's answer that an operator drops", () => {
  const personCut = (id: string): Step => step({ id, role: 'cut', block: 'CUT', actor: 'human', consumes: ['view'], produces: ['critique'] });
  const personCritique = (id: string): Step => step({ id, role: 'vision', block: 'VISION', actor: 'human', consumes: ['view'], produces: ['critique'] });
  /** The studio with its person's CUT replaced by f(it). */
  const cutIn = (f: (cut: Step) => Node): Recipe => {
    const r = studio();
    const i = indexOf(d3(r), 'cut');
    d3(r).steps[i] = f(d3(r).steps[i] as Step);
    return r;
  };
  const answers = (r: Recipe) => clauses(r).filter((c) => /human-critique|critique-per-candidate/.test(c)).sort();

  it('inside replicate or each: a candidate hands on only its work, so the list never reaches the step after it', () => {
    expect(answers(cutIn((cut) => replicate('twice', 2, cut)))).toEqual(['ST12:critique-per-candidate']);
    expect(answers(cutIn((cut) => replicate('once', 1, cut)))).toEqual(['ST12:critique-per-candidate']);
    const r = studio();
    const d2 = r.stages[1]!.body as Seq;
    const each = d2.steps[0] as Extract<Node, { op: 'each' }>;
    (each.body as Seq).steps.unshift(render('cand-render'), personCritique('cand-taste'));
    expect(answers(r)).toEqual(['ST12:critique-per-candidate']);
    // Elsewhere it is asked as before: at stage level, or under an optional, whose body hands on what it made.
    expect(answers(studio())).toEqual([]);
    expect(answers(cutIn((cut) => optional('maybe', 'a person wants to trim', cut)))).toEqual([]);
  });

  it('in an audit lens or a one-shot gate body: an empty answer is dropped there, and the next fix applies an earlier critique', () => {
    expect(answers(cutIn((cut) => audit('trim', [{ name: 'trim', body: cut }])))).toEqual(['ST9:human-critique']);
    expect(answers(cutIn((cut) => oneShotGate('final', seq(cut, critic('gate-critic')), { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' })))).toEqual(['ST10:human-critique']);
    const r = studio();
    insertAfter(d3(r), 'render-5', audit('notes', [{ name: 'yours', body: personCritique('lens-critique') }]));
    expect(answers(r)).toEqual(['ST9:human-critique']);
    // A person's taste is not a critique: the fix never applies it, so a lens may hold it.
    const taste = step({ id: 'lens-taste', role: 'vision', block: 'VISION', actor: 'human', consumes: ['view'], produces: ['taste'] });
    const t = studio();
    insertAfter(d3(t), 'render-5', audit('notes', [{ name: 'yours', body: taste }]));
    expect(answers(t)).toEqual([]);
  });
});

/**
 * A person's list of what to remove ("What should go? List what to remove") or a reaction of theirs given as a critique
 * says it will be acted on. Where no AI writer takes the answer in on any path, by any port it fills (the critique, or
 * the brief or taste a reaction also gives), no AI writer acts on it: refused where it is asked (ADR-0098). Some path is
 * enough: a path on which it goes unapplied while another applies it is one the person's later answer selects (an
 * optional, a route, the end of their loop), or whether a judge in a relay link has a clip to see, or how many shots a
 * storyboard has (an answer at the end of a relay link that only the next link takes in).
 */
describe("ST12 'critique-unapplied': no person's list or critique that no writer applies on any path", () => {
  const personCut = (id: string): Step => step({ id, role: 'cut', block: 'CUT', actor: 'human', consumes: ['view'], produces: ['critique'] });
  const yourCritique = (id: string): Step => step({ id, role: 'vision', block: 'VISION', actor: 'human', consumes: ['view'], produces: ['critique'] });
  const unapplied = (r: Recipe) => validate(r).violations.filter((v) => v.clause === 'critique-unapplied');

  it('a CUT with no fix after it is refused, at its place, in plain words', () => {
    expect(unapplied(studio())).toEqual([]);
    const r = studio();
    d3(r).steps.splice(indexOf(d3(r), 'apply-cut'), 1);
    const v = unapplied(r);
    expect(v.map((x) => `${x.ruleId} ${x.path}`)).toEqual(['ST12 stages[2].body.steps[1]']);
    expect(v[0]!.message).toBe('step "cut" asks a person for a list or a critique, and no AI writer takes their answer in on any path, as the critique or as the brief or taste it also gives: before one does, another takes its place, or none comes after it');
  });

  it("a direction of the person's given as a critique between the CUT and its fix: the later answer replaces the list", () => {
    const r = studio();
    insertAfter(d3(r), 'cut', yourCritique('direction'));
    expect(unapplied(r).map((x) => x.path)).toEqual(['stages[2].body.steps[1]']);
    // The direction itself is applied by the fix.
    expect(clauses(r).filter((c) => c.startsWith('ST12'))).toEqual(['ST12:critique-unapplied']);
  });

  it('a CUT that the next round, an optional fix or a route branch applies is admitted (some path)', () => {
    const optionalFix = studio();
    const i = indexOf(d3(optionalFix), 'apply-cut');
    d3(optionalFix).steps[i] = optional('apply-if-wanted', 'a person wants the cuts made', d3(optionalFix).steps[i]!);
    expect(unapplied(optionalFix)).toEqual([]);
    // A critique that a person may run first puts another in its place on that path only.
    const review = studio();
    insertAfter(d3(review), 'cut', optional('review', 'a person wants a review first', critic('extra-critic')));
    expect(unapplied(review)).toEqual([]);
  });

  it('only once per step: where a candidate, a lens or a gate body drops it, those clauses say so', () => {
    const cutIn = (f: (cut: Step) => Node): Recipe => {
      const r = studio();
      const i = indexOf(d3(r), 'cut');
      d3(r).steps[i] = f(d3(r).steps[i] as Step);
      return r;
    };
    expect(clauses(cutIn((cut) => replicate('twice', 2, cut))).filter((c) => /critique/.test(c))).toEqual(['ST12:critique-per-candidate']);
    expect(clauses(cutIn((cut) => audit('trim', [{ name: 'trim', body: cut }]))).filter((c) => /critique/.test(c))).toEqual(['ST9:human-critique']);
    // A list no writer applies, asked per candidate, is refused once, as asked per candidate.
    const r = studio();
    d3(r).steps.splice(indexOf(d3(r), 'apply-cut'), 1);
    const i = indexOf(d3(r), 'cut');
    d3(r).steps[i] = replicate('twice', 2, d3(r).steps[i]!);
    expect(clauses(r).filter((c) => /critique/.test(c))).toEqual(['ST12:critique-per-candidate']);
  });

  it('read on the paths a run can take: a critic loop leaves at its critic, never from the end of a round', () => {
    // A direction of the person's at the end of each critic round, and a fix after the loop: the next round's critic
    // puts its critique in place of the direction, and the loop leaves only at the critic.
    const r = studio();
    const d2 = r.stages[1]!.body as Seq;
    d2.steps.push(loop('final-pass', seq(render('pass-render'), critic('pass-critic'), modelFix('pass-fix'), render('round-render'), yourCritique('round-direction')), okGate()), modelFix('after-loop'));
    expect(unapplied(r).map((x) => x.path)).toEqual(['stages[1].body.steps[2].body.steps[4]']);
    // A loop the person holds leaves at the end of a round, with their direction for the fix after it.
    const held = studio();
    (held.stages[1]!.body as Seq).steps.push(loop('final-pass', seq(render('pass-render'), modelFix('pass-fix'), render('round-render'), yourCritique('round-direction')), { metric: 'human', hidden: false, holder: 'human', probe: 1, max: 3, onCap: 'human', onNoConverge: 'recalibrate-human' }), modelFix('after-loop'));
    expect(unapplied(held)).toEqual([]);
  });

  it('a person’s own draft is not a writer that applies it: the run shows a person no critique', () => {
    const own = studio();
    const i = indexOf(d3(own), 'apply-cut');
    d3(own).steps[i] = humanDraft('own-trim', ['critique', 'artifact']);
    expect(unapplied(own).map((x) => x.path)).toEqual(['stages[2].body.steps[1]']);
  });

  it('a reaction of yours that also gives the brief an AI writer takes in is admitted, though the CUT replaces its critique', () => {
    const reaction = (produces: Step['produces']): Step => step({ id: 'direction', role: 'vision', block: 'VISION', actor: 'human', consumes: ['view'], produces });
    const redraft = modelFix('redraft', { role: 'build', consumes: ['artifact', 'brief'] });
    const withBrief = studio();
    insertAfter(d3(withBrief), 'cut-render', reaction(['brief', 'critique']));
    insertAfter(d3(withBrief), 'apply-cut', render('redraft-render'), redraft);
    expect(unapplied(withBrief)).toEqual([]);
    // Given as a critique alone, the CUT's list takes its place before the fix, and the redraft has no brief from it.
    const alone = studio();
    insertAfter(d3(alone), 'cut-render', reaction(['critique']));
    insertAfter(d3(alone), 'apply-cut', render('redraft-render'), redraft);
    expect(unapplied(alone).map((x) => x.message)).toEqual([
      'step "direction" asks a person for a list or a critique, and no AI writer takes their answer in on any path, as the critique or as the brief or taste it also gives: before one does, another takes its place, or none comes after it',
    ]);
  });
});

describe('set-aside: nothing put back undoes a person’s write', () => {
  it('ST5: a pick after a person’s write picks from options made before it (Q1, QA)', () => {
    const r = studio();
    const d2 = r.stages[1]!.body as Seq;
    d2.steps.splice(1, 0, humanDraft('own-draft', ['intent']));
    const v = validate(r).violations.filter((x) => x.ruleId === 'ST5');
    expect(v.map((x) => x.clause)).toEqual(['set-aside']);
    expect(v[0]!.message).toMatch(/own-draft/);
  });

  it('ST12: a keep-or-revert right after VOICE could restore the version from before your words (QRh)', () => {
    const r = studio();
    insertAfter(d3(r), 'voice', render('compare-again-render'), step({ id: 'keep-or-revert', role: 'tells-compare', block: 'TELLS', actor: 'human', consumes: ['view'], produces: ['taste'] }));
    expect(only(r, 'ST12')).toEqual(['ST12:set-aside']);
  });

  it('ST12: a model write in between makes your version the previous one (the canonical order is fine)', () => {
    const r = studio();
    insertAfter(d3(r), 'voice', modelFix('later-fix', { keepsVoice: true }), render('again'), step({ id: 'keep-or-revert', role: 'tells-compare', block: 'TELLS', actor: 'human', consumes: ['view'], produces: ['taste'] }));
    expect(only(r, 'ST12')).toEqual([]);
  });

  it('ST12 on the exit-aware flow: a gate that passes before the revise leaves your draft as the previous version (R1)', () => {
    const r = studio();
    const steps = d3(r).steps;
    const i = indexOf(d3(r), 'cut');
    steps.splice(i, 0, humanDraft('own-draft'), loop('polish', seq(render('polish-render'), critic('polish-critic'), modelFix('revise')), okGate()));
    insertAfter(d3(r), 'polish', render('early-compare-render'), step({ id: 'early-compare', role: 'tells-compare', block: 'TELLS', actor: 'human', consumes: ['view'], produces: ['taste'] }));
    expect(only(r, 'ST12')).toEqual(expect.arrayContaining(['ST12:set-aside']));
  });

  it('ST12: a scored loop holding a person’s write could put an earlier scored version back (QS)', () => {
    const r = studio();
    const d2 = r.stages[1]!.body as Seq;
    d2.steps.push(loop('own-loop', seq(humanDraft('own-draft'), render('own-render'), critic('own-critic')), okGate()));
    expect(only(r, 'ST12')).toEqual(['ST12:set-aside']);
  });

  it('ST12: an option consumer reached again through a loop’s back-edge after your write', () => {
    const r = studio();
    // A person's round over the options: they react to the options, then write their own draft; the next round reacts to
    // options made before that draft.
    const d2 = r.stages[1]!.body as Seq;
    d2.steps.splice(1, 1, loop('rounds', seq(step({ id: 'react', role: 'vision', block: 'VISION', actor: 'human', consumes: [OPTION_SET], produces: ['taste'] }), humanDraft('own-draft', ['intent'])), { ...okGate(), metric: 'human', threshold: undefined, hidden: false, holder: 'human', plateau: undefined }));
    expect(only(r, 'ST12')).toEqual(['ST12:set-aside']);
    expect(validate(r).violations.filter((v) => v.ruleId === 'ST5')).toEqual([]);
  });

  // A pick of one leaves the options held: the runner keeps ports.options = [the chosen one], and a pick or an option
  // consumer reached again takes that option back, made before the person's write in between.
  const personsRounds: Gate = { ...okGate(), metric: 'human', threshold: undefined, hidden: false, holder: 'human', plateau: undefined };
  it('ST12: a pick of one, then your write, in a loop: the next round picks the option from before your write (A1)', () => {
    const r = studio();
    const d2 = r.stages[1]!.body as Seq;
    d2.steps[indexOf(d2, 'pick-final')] = loop('final-rounds', seq(pick('pick-final', 'H', 1, 'human'), humanDraft('own-draft')), personsRounds);
    expect(only(r, 'ST12')).toEqual(['ST12:set-aside']);
    expect(validate(r).violations.find((v) => v.clause === 'set-aside')!.message).toMatch(/own-draft.*later round of loop "final-rounds"/);
  });

  it('ST12: the same through a relay’s next link', () => {
    const r = studio();
    const d2 = r.stages[1]!.body as Seq;
    const frame = step({ id: 'first-frame', role: 'asset', block: 'ASSET', actor: 'model', tier: 'mid', consumes: ['intent'], produces: ['anchor'], writes: true, knobs: { slots: 1 } });
    const ownLink = step({ id: 'own-link', role: 'build', actor: 'human', consumes: ['anchor', 'artifact'], produces: ['artifact', 'anchor'], writes: true });
    d2.steps[indexOf(d2, 'pick-final')] = seq(frame, relay('links', 2, seq(pick('pick-final', 'R', 1, 'policy'), ownLink)));
    expect(clauses(r)).toContain('ST12:set-aside');
    expect(validate(r).violations.find((v) => v.clause === 'set-aside')!.message).toMatch(/own-link.*later round of relay "links"/);
  });

  it('ST12 through nesting: an inner loop’s pick reached again by the outer loop’s next round, after your write', () => {
    const r = studio();
    const d2 = r.stages[1]!.body as Seq;
    const inner = loop('inner-rounds', seq(pick('pick-final', 'H', 1, 'human'), render('inner-render')), personsRounds);
    d2.steps[indexOf(d2, 'pick-final')] = loop('outer-rounds', seq(inner, humanDraft('own-draft')), personsRounds);
    expect(only(r, 'ST12')).toEqual(['ST12:set-aside']);
    expect(validate(r).violations.find((v) => v.clause === 'set-aside')!.message).toMatch(/own-draft.*later round of loop "outer-rounds"/);
  });

  it('a pick of one with no write of yours after it, round after round, is not a set-aside', () => {
    const r = studio();
    const d2 = r.stages[1]!.body as Seq;
    d2.steps[indexOf(d2, 'pick-final')] = loop('final-rounds', seq(pick('pick-final', 'H', 1, 'human'), render('final-render'), step({ id: 'react', role: 'vision', block: 'VISION', actor: 'human', consumes: ['view'], produces: ['taste'] })), personsRounds);
    expect(clauses(r).filter((c) => c.endsWith('set-aside'))).toEqual([]);
  });
});

describe('DR9 counts executed VOICE writes', () => {
  it('a recipe whose only VOICE is a model pass declaring it has no VOICE at all (missing)', () => {
    const r = studio();
    Object.assign(stepById(r, 'voice'), { actor: 'model', tier: 'mid' });
    expect(only(r, 'DR9')).toEqual(['DR9:missing', 'DR9:model-voice']);
  });

  it('a claim log alone is not VOICE for every line (claims-only)', () => {
    const r = studio();
    stepById(r, 'voice').variant = 'claim-log';
    expect(only(r, 'DR9')).toEqual(['DR9:claims-only']);
  });
});

describe('the flow walk is exit-aware and knows containment', () => {
  it('the state right after a loop’s exit point reaches the loop’s exit; contained steps are marked', () => {
    const r = studio();
    const seen: string[] = [];
    const contained: string[] = [];
    flowRecipe<boolean>(r, false, {
      step(s, _path, _stage, state, isContained) {
        if (isContained) contained.push(s.id);
        if (s.id === 'apply-cut' && state) seen.push('after-critic-only');
        // True only on the path where the critic just ran and the fix did not.
        if (s.id === 'critic') return true;
        if (s.id === 'fix') return false;
        return state;
      },
      join: (xs) => xs.some(Boolean),
    });
    expect(seen).toEqual(['after-critic-only']);
    expect(contained).toEqual([]);
    const lens = studio();
    insertAfter(d3(lens), 'render-5', audit('notes', [{ name: 'c', body: critic('lens-critic') }]));
    const inLens: string[] = [];
    flowRecipe<null>(lens, null, { step: (s, _p, _st, state, c) => (c && inLens.push(s.id), state), join: () => null });
    expect(inLens).toEqual(['lens-critic']);
  });

  it('a check-clean loop exits after its check (K1): steps after it in the body may not run', () => {
    const r = studio();
    const i = indexOf(d3(r), 'voice');
    const v = d3(r).steps[i]!;
    d3(r).steps[i] = loop('final-pass', seq(render('pass-render'), step({ ...stepById(r, 'check'), id: 'pass-check', block: undefined, variant: undefined, knobs: undefined }), v), checkCleanGate(1));
    let reachedEndWithoutVoice = false;
    flowRecipe<boolean>(r, false, {
      step(s, _p, _st, state) {
        if (s.id === 'render-5' && !state) reachedEndWithoutVoice = true;
        return state || s.id === 'voice';
      },
      join: (xs) => xs.every(Boolean),
    });
    expect(reachedEndWithoutVoice).toBe(true);
  });
});
