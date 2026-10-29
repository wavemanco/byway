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
 * person's answer is lost without a word (the round-3 verification's C3 and C4 cases): refused where it is asked. In a
 * candidate, unless a step of that candidate takes it in and a pick, or an AI writer that takes the options in, takes
 * that candidate up (replicate and each hand on only the candidates' work); in a lens or a gate body, where it reaches
 * the work on no path, or where an empty answer, which is dropped there, always leaves the step after with what came
 * before.
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
    expect(validate(cutIn((cut) => replicate('twice', 2, cut))).violations.find((v) => v.clause === 'critique-per-candidate')!.message).toBe(
      `step "cut" asks a person for a list or a critique once per candidate, and their answer reaches the work on no path: replicate and each hand on only the candidates' work, so only a step of that candidate can take it in, and that candidate reaches the work only where a pick or an AI writer that takes the options in takes it up, or an AI step that reads the candidates makes text that reaches the work`,
    );
    const r = studio();
    const d2 = r.stages[1]!.body as Seq;
    const each = d2.steps[0] as Extract<Node, { op: 'each' }>;
    (each.body as Seq).steps.unshift(render('cand-render'), personCritique('cand-taste'));
    expect(answers(r)).toEqual(['ST12:critique-per-candidate']);
    // Elsewhere it is asked as before: at stage level, or under an optional, whose body hands on what it made.
    expect(answers(studio())).toEqual([]);
    expect(answers(cutIn((cut) => optional('maybe', 'a person wants to trim', cut)))).toEqual([]);
  });

  it('inside replicate or each with the fix that applies it: each candidate takes its own list to its work (the round-7 verification)', () => {
    // The trim (its render, your CUT and its fix) on two candidates, one of which you then pick: the list you give for a
    // candidate is applied to it.
    const r = studio();
    const d = d3(r);
    const i = indexOf(d, 'render-2');
    const trim = d.steps.splice(i, 3);
    expect(trim.map((n) => (n.op === 'step' ? n.id : n.op))).toEqual(['render-2', 'cut', 'apply-cut']);
    d.steps.splice(i, 0, replicate('two-trims', 2, seq(...trim)), pick('pick-trim', 'H', 1, 'human'));
    expect(answers(r)).toEqual([]);
    expect(only(r, 'ST12')).toEqual([]);
    // The same with a critic between your CUT and its fix: the critic's critique takes its place in every candidate.
    const replaced = studio();
    const e = d3(replaced);
    const j = indexOf(e, 'render-2');
    const [render2, cut, applyCut] = e.steps.splice(j, 3);
    e.steps.splice(j, 0, replicate('two-trims', 2, seq(render2!, cut!, critic('cand-critic'), applyCut!)), pick('pick-trim', 'H', 1, 'human'));
    expect(answers(replaced)).toEqual(['ST12:critique-per-candidate']);
  });

  it('only where a pick, or an AI writer that takes the options in, takes a candidate up: candidates no step takes up are never the work (the round-8 verification)', () => {
    // The trim on two candidates, and no pick: the run delivers the version from before them, and every list you give
    // is lost (u1, 64 of 64 runs).
    const r = studio();
    const d = d3(r);
    const i = indexOf(d, 'render-2');
    d.steps.splice(i, 0, replicate('two-trims', 2, seq(...d.steps.splice(i, 3))));
    expect(answers(r)).toEqual(['ST12:critique-per-candidate']);
    expect(validate(r).violations.find((v) => v.clause === 'critique-per-candidate')!.message).toBe(
      `step "cut" asks a person for a list or a critique once per candidate, and their answer reaches the work on no path: replicate and each hand on only the candidates' work, so only a step of that candidate can take it in, and that candidate reaches the work only where a pick or an AI writer that takes the options in takes it up, or an AI step that reads the candidates makes text that reaches the work`,
    );
    // An AI writer that drafts the work from the options takes them up, as a pick does (C2's option map).
    const map = step({ id: 'option-map', role: 'build', actor: 'model', tier: 'mid', consumes: [OPTION_SET], produces: ['artifact'], writes: true });
    const mapped = studio();
    const m = d3(mapped);
    const k = indexOf(m, 'render-2');
    m.steps.splice(k, 0, replicate('two-trims', 2, seq(...m.steps.splice(k, 3))), map);
    expect(answers(mapped)).toEqual([]);
    expect(only(mapped, 'ST12')).toEqual([]);
    // Your CUT outside, and its fix only in two candidates that no step takes up (32 more of the verification's).
    const outside = studio();
    const o = d3(outside);
    o.steps[indexOf(o, 'apply-cut')] = replicate('two-fixes', 2, o.steps[indexOf(o, 'apply-cut')]!);
    expect(validate(outside).violations.filter((v) => /critique/.test(v.clause ?? '')).map((v) => `${v.ruleId}:${v.clause} ${v.message}`)).toEqual([
      `ST12:critique-unapplied step "cut" asks a person for a list or a critique, and their answer reaches the work on no path: nothing that writes the work or picks which version it is takes it in, directly or in what an AI step makes from it; before one does, another takes its place, or none comes after it, or the one that does works on candidates that nothing takes up`,
    ]);
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

  it('refused for what is lost: an answer that reaches the work on no path, or an empty one the operator replaces with the critique from before it', () => {
    const messages = (r: Recipe) => validate(r).violations.filter((v) => v.clause === 'human-critique').map((v) => v.message);
    const pass = { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' } as const;
    // Your CUT alone in its audit: listed, the fix after the audit removes it; left empty, it is dropped with the lens,
    // and the fix never passes over it: it acts on the critique from before the audit, or on none.
    expect(messages(cutIn((cut) => audit('trim', [{ name: 'trim', body: cut }])))).toEqual([
      'lens "trim" step "cut" asks a person for a list or a critique, and no other lens notes one: a lens drops an empty answer, so the step after the audit acts on what came before it instead',
    ]);
    // Beside a lens whose critic always notes: an empty answer leaves the critic's critique to the fix, and a list joins
    // it (the differential's C2 variants). Admitted.
    expect(answers(cutIn((cut) => audit('trim', [{ name: 'trim', body: cut }, { name: 'critic', body: critic('lens-critic') }])))).toEqual([]);
    // In a final check's body: last there, an empty answer is dropped for what came before the gate; with a critic after
    // it there, the critic's critique always takes its place, and the answer reaches nothing.
    expect(messages(cutIn((cut) => oneShotGate('final', seq(critic('gate-critic'), cut), pass)))).toEqual([
      'gate "final" step "cut" asks a person for a list or a critique, and nothing after it in the gate notes one: a gate drops an empty answer and keeps what came before it, which the step after it then acts on',
    ]);
    expect(messages(cutIn((cut) => oneShotGate('final', seq(cut, critic('gate-critic')), pass)))).toEqual([
      'gate "final" step "cut" asks a person for a list or a critique, and their answer reaches the work on no path: before anything that writes the work or picks which version it is takes it in, another takes its place, or none comes after it',
    ]);
    // A lens whose answer the cliché sweep's finds replace before any fix takes it in: refused as reaching nothing.
    const late = studio();
    insertAfter(d3(late), 'apply-cut', audit('late', [{ name: 'yours', body: personCritique('late-critique') }, { name: 'critic', body: critic('late-critic') }]));
    expect(messages(late)).toEqual([
      'lens "yours" step "late-critique" asks a person for a list or a critique, and their answer reaches the work on no path: before anything that writes the work or picks which version it is takes it in, in its lens or after the audit, another takes its place, or none comes after it',
    ]);
    // Your CUT, then another answer of yours in its lens, beside a lens of yours: listed, the later answer takes the
    // list's place; left empty, its lens is dropped, and the audit hands on the other lens's answer or what came before
    // it, never the list (the round-8 verification's st9c, lost on 64 of 64 runs).
    const yourCheck = step({ id: 'lens-check', role: 'check', actor: 'human', consumes: ['view'], produces: ['critique'] });
    const st9c = cutIn((cut) => audit('trim', [{ name: 'trim', body: seq(cut, yourCheck) }, { name: 'other', body: personCritique('lens-other') }]));
    expect(messages(st9c)).toEqual([
      'lens "trim" step "cut" asks a person for a list or a critique, and their answer reaches the work on no path: before anything that writes the work or picks which version it is takes it in, in its lens or after the audit, another takes its place, or none comes after it',
    ]);
  });
});

/**
 * A person's list of what to remove ("What should go? List what to remove") or a reaction of theirs given as a critique
 * says it will be acted on. Where the answer reaches the work on no path (nothing that writes the work or picks which
 * version it is takes it in, by any port it fills, directly or in what an AI step makes from it), it is refused where it
 * is asked (ADR-0098). Some path is enough: which path a run takes is decided as it runs, by the person's answers (an optional, a
 * route, the end of their loop) and by what everything else in the run returns (for example an AI list or sweep that
 * finds nothing, so the fix after it asks no model; a gate that ends the round at its critic or check before the writer;
 * a judge in a relay link with no clip to see; a storyboard of one shot), and an admitted answer may go unapplied on a
 * run the person did not choose.
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
    expect(v[0]!.message).toBe('step "cut" asks a person for a list or a critique, and their answer reaches the work on no path: nothing that writes the work or picks which version it is takes it in, directly or in what an AI step makes from it; before one does, another takes its place, or none comes after it, or the one that does works on candidates that nothing takes up');
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
    // A critique that a person may run first puts another in its place when it runs, and declined it leaves the critique
    // empty, so the fix after it makes no change (R-DECLINED): the list is applied on no path.
    const review = studio();
    insertAfter(d3(review), 'cut', optional('review', 'a person wants a review first', critic('extra-critic')));
    expect(unapplied(review).map((x) => x.path)).toEqual(['stages[2].body.steps[1]']);
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

  it('a seed whose prompt asks for the block alone may leave a note made from your critique beside your draft; C1’s seed, which writes its direction first, does not', () => {
    // The round-9 verification's s119 on this fixture: your critique, an AI direction that reads it, a seed from the
    // intent alone, then your own draft. Main admits it. With C3's seed angle, whose prompt asks for the card alone, the
    // AI direction is beside your draft on a run whose seed writes no direction. C1's seed build is asked for the
    // direction first, one line per axis, and that direction, made from the problem and the string, is beside it instead.
    const shape = (between: Node) => {
      const r = studio();
      const carrier = step({ id: 'carrier', role: 'vision', block: 'VISION', actor: 'model', tier: 'mid', prompt: 'project.vision', consumes: ['intent'], reads: ['critique'], produces: ['taste'] });
      (r.stages[1]!.body as Seq).steps.push(render('crit-render'), yourCritique('your-critique'), carrier, between, humanDraft('own-draft'));
      return r;
    };
    const seedOn = (prompt: string): Step => step({ id: 'late-seed', role: 'seed', block: 'SEED', actor: 'model', tier: 'mid', prompt, consumes: ['intent'], produces: ['artifact'], writes: true, knobs: { source: 'shell-string' } });
    expect(unapplied(shape(seedOn('product.c3.seed-angle')))).toEqual([]);
    expect(unapplied(shape(seedOn('article.SEED'))).map((x) => x.path)).toEqual(['stages[1].body.steps[3]']);
    // A critic in its place always notes, and its note, not the direction, is beside your draft.
    expect(unapplied(shape(seq(render('late-render'), critic('late-critic')))).map((x) => x.path)).toEqual(['stages[1].body.steps[3]']);
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
      'step "direction" asks a person for a list or a critique, and their answer reaches the work on no path: nothing that writes the work or picks which version it is takes it in, directly or in what an AI step makes from it; before one does, another takes its place, or none comes after it, or the one that does works on candidates that nothing takes up',
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
