/**
 * The work bound and the engine's limits (F02, ADR-0092 stage 2) on small shapes. The catalog's bounds are pinned in
 * @byway/catalog's tests, the batch-bytes constants against the real interpreter in @byway/runner's.
 */
import { describe, expect, it } from 'vitest';
import {
  audit,
  COMPOSED_LIMITS,
  composedLimitProblems,
  each,
  ENGINE_LIMITS,
  engineProblems,
  loop,
  loopRounds,
  oneShotGate,
  pick,
  relay,
  replicate,
  seq,
  step,
  workBound,
  type Gate,
  type Node,
  type Recipe,
  type Stage,
  type Step,
} from '../src/index.ts';

const build = (id: string): Step => step({ id, role: 'build', actor: 'model', tier: 'mid', consumes: ['intent'], produces: ['artifact'], writes: true });
const seedStep = (id: string): Step => step({ id, role: 'seed', block: 'SEED', actor: 'model', tier: 'mid', consumes: ['intent', 'seed'], produces: ['artifact'], writes: true });
const render = (id: string): Step => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const critic = (id: string): Step => step({ id, role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, consumes: ['view'], produces: ['critique', 'score'] });
const fix = (id: string): Step => step({ id, role: 'fix', actor: 'model', tier: 'mid', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true });
const judge = (id: string): Step => step({ id, role: 'judge', actor: 'model', tier: 'big', isolated: true, consumes: ['view'], produces: [] });
const scoreGate = (max: number, onCap: Gate['onCap'] = 'human'): Gate => ({ metric: 'critic-score', threshold: 9, hidden: true, holder: 'harness', probe: 1, max, onCap, onNoConverge: 'recalibrate-human' });

const recipe = (...stages: [Stage['stage'], Node][]): Recipe => ({
  schema: 'byway.recipe/1',
  id: 'limits',
  title: 'Limits',
  kind: 'experimental',
  family: 'test',
  channel: 'workspace',
  medium: 'web-page',
  inputs: ['intent'],
  stages: stages.map(([stage, body]) => ({ stage, body })),
  sitsOut: [],
  exceptions: [],
  bank: false,
});
const clauses = (r: Recipe) => engineProblems(r).map((p) => `${p.ruleId}:${p.clause}`);

describe('workBound', () => {
  it('replicate multiplies its body, and each multiplies by the options in front of it', () => {
    const b = workBound(recipe(['D1', seq(replicate('x', 4, seq(build('b'), render('r'))), each('e', seq(render('r2'), critic('c'))))]));
    expect(b).toMatchObject({ stepRuns: 4 * 2 + 4 * 2, peak: 4 });
  });

  it('an audit sums its lenses, side by side', () => {
    const b = workBound(recipe(['D1', seq(build('b'), audit('a', [{ name: 'one', body: replicate('v', 3, build('v1')) }, { name: 'two', body: critic('c') }]))]));
    expect(b).toMatchObject({ stepRuns: 1 + 3 + 1, peak: 4 });
  });

  it('a C pick asks its judge once per choice; H and R picks run no step', () => {
    const body = (mode: 'H' | 'C' | 'R') => seq(replicate('x', 5, build('b')), pick('p', mode, 2, mode === 'H' ? 'human' : mode === 'C' ? 'model' : 'policy', mode === 'C' ? judge('j') : undefined));
    expect(workBound(recipe(['D1', body('C')])).stepRuns).toBe(5 + 2);
    expect(workBound(recipe(['D1', body('H')])).stepRuns).toBe(5);
    expect(workBound(recipe(['D1', body('R')])).stepRuns).toBe(5);
  });

  it('a loop runs to its raised cap when a person decides there, plus one re-rank for a scored loop; a relay runs every link', () => {
    expect(loopRounds({ max: 3, onCap: 'human' })).toEqual({ planned: 3, withRaise: 6 });
    expect(loopRounds({ max: 3, onCap: 'policy-best-snapshot' })).toEqual({ planned: 3, withRaise: 3 });
    expect(workBound(recipe(['D2', loop('l', seq(render('r'), critic('c'), fix('f')), scoreGate(3))])).stepRuns).toBe(6 * 3 + 1);
    expect(workBound(recipe(['D2', loop('l', seq(render('r'), critic('c'), fix('f')), scoreGate(3, 'policy-best-snapshot'))])).stepRuns).toBe(3 * 3 + 1);
    expect(workBound(recipe(['D2', seq(build('b'), relay('chain', 4, seq(build('link'), render('r'))))])).stepRuns).toBe(1 + 4 * 2);
  });

  it("a gate's retry re-runs the stages from its target through its own, up to its count", () => {
    const g = oneShotGate('g', critic('gc'), { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }, { stage: 'D1', times: 2 });
    const r = recipe(['D1', seq(build('b'), render('r'))], ['D2', seq(render('r2'), g)]);
    // D1 is 2 runs, D2 is 2 (the render and the gate's critic): 4, and each retry runs both again.
    expect(workBound(r).stepRuns).toBe(4 + 2 * 4);
  });

  it('weighs no seed: a seeded fan-out carries what the same fan-out of builds carries, now that seeds do not travel (P2)', () => {
    const fanOut = (first: Step) => recipe(['D1', seq(replicate('x', 6, first), each('e', seq(render('r'), critic('c'))))]);
    expect(workBound(fanOut(seedStep('s'))).batchBytes).toBe(workBound(fanOut(build('s'))).batchBytes);
  });

  // By what it would cost, not by the clock: walked whole, each level doubles the walk, and 2^40 walks never end, so a
  // walk that lost its memo would hold this test until vitest's hang guard stopped it (backlog row B-120).
  it('walks a nest of 40 loops in linear time (memoized by place and ports)', () => {
    let body: Node = seq(render('r'), critic('c'), fix('f'));
    for (let i = 0; i < 40; i++) body = loop(`l${i}`, body, scoreGate(1, 'policy-best-snapshot'));
    expect(workBound(recipe(['D2', seq(build('b'), body)])).stepRuns).toBeGreaterThan(0);
  });
});

describe('engineProblems', () => {
  it('nothing for a small recipe', () => {
    expect(engineProblems(recipe(['D1', seq(replicate('x', 4, build('b')), pick('p', 'H', 1, 'human'))]))).toEqual([]);
  });

  it.each([
    ['1e9', 1e9],
    ['the largest safe integer', Number.MAX_SAFE_INTEGER],
    ['600', 600],
  ])('replicate %s is over the limit', (_name, n) => {
    expect(clauses(recipe(['D1', replicate('x', n, build('b'))]))).toContain('ST3:limit');
  });

  it('a count that is not a positive whole number is a count problem, and no bound is computed from it', () => {
    expect(clauses(recipe(['D1', replicate('x', 1e20, build('b'))]))).toEqual(['ST3:count']);
    expect(clauses(recipe(['D1', replicate('x', 0, build('b'))]))).toEqual(['ST3:count']);
    expect(clauses(recipe(['D1', replicate('x', 2.5, build('b'))]))).toEqual(['ST3:count']);
  });

  it('more steps than the engine allows, from loops that each look small', () => {
    // Loops of 12 rounds (24 once a person raises the cap) and 2, nested three deep around 3 steps: past 2,000.
    const inner = loop('inner', seq(render('r'), critic('c'), fix('f')), scoreGate(12));
    const mid = loop('mid', seq(inner, build('m')), scoreGate(12));
    const outer = loop('outer', seq(mid, build('o')), scoreGate(2, 'policy-best-snapshot'));
    expect(engineProblems(recipe(['D2', seq(build('b'), outer)])).map((p) => p.message)).toEqual([expect.stringMatching(/up to \d+ steps; the engine allows 2000/)]);
  });

  it('peak: 30 × 20 side by side is 600 at once', () => {
    expect(engineProblems(recipe(['D1', replicate('outer', 30, seq(replicate('inner', 20, build('b')), pick('p', 'H', 1, 'human')))])).map((p) => p.message)).toEqual([
      expect.stringMatching(/up to 600 steps can run at once; the engine allows 500/),
    ]);
  });

  it('batch bytes: 300 seeds, then each over them, runs: no seed rides in a later input (P2), and 300 at once and 900 steps are within the limits', () => {
    const r = recipe(['D1', seq(replicate('seeds', 300, seedStep('s')), each('e', seq(render('r'), critic('c'))))]);
    expect(workBound(r)).toMatchObject({ peak: 300, stepRuns: 900 });
    expect(engineProblems(r)).toEqual([]);
  });

  it("batch bytes: replicate(n, seq(seed, X)) runs too, since no sibling's seed rides into the later steps (P2)", () => {
    expect(engineProblems(recipe(['D1', replicate('x', 300, seq(seedStep('s'), build('after')))]))).toEqual([]);
  });

  it('batch bytes: a fan-out after 30 options is over, every branch carrying the option list and their views, though 30 at once and 90 steps are not', () => {
    const r = recipe(['D1', seq(replicate('first', 30, seq(build('b'), render('r'))), replicate('second', 30, build('b2')))]);
    expect(workBound(r)).toMatchObject({ peak: 30, stepRuns: 90 });
    const problems = engineProblems(r);
    expect(problems.map((p) => `${p.ruleId}:${p.clause}:${p.path}`)).toEqual(['ST3:limit:stages[0].body.steps[1]']);
    expect(problems[0]!.message).toMatch(/^the steps that can run at once here carry up to \d+ KB between them \(the options and their views in every one\); the engine allows 2048 KB$/);
    expect(engineProblems(recipe(['D1', seq(replicate('first', 24, seq(build('b'), render('r'))), replicate('second', 24, build('b2')))]))).toEqual([]);
  });

  it("an ASSET step's slots knob that is not a whole number of at least 1 cannot run: the step would pay for briefs and make no image, or a fraction of one", () => {
    const asset = (knobs?: Record<string, unknown>) =>
      step({ id: 'images', role: 'asset', block: 'ASSET', actor: 'model', tier: 'mid', consumes: ['artifact'], produces: ['artifact'], writes: true, ...(knobs ? { knobs: knobs as Step['knobs'] } : {}) });
    const at = (knobs?: Record<string, unknown>) => engineProblems(recipe(['D2', seq(build('b'), asset(knobs))]));
    for (const slots of [0, 0.5, 1.5, -1, '3', null]) {
      expect(at({ slots }).map((p) => `${p.ruleId}:${p.clause}:${p.path}`), String(slots)).toEqual(['ST7:slots:stages[0].body.steps[1]']);
    }
    expect(at({ slots: 0.5 })[0]!.message).toBe('ASSET step "images"\'s slots knob is 0.5; it must be a whole number of at least 1');
    expect(at({ slots: '3' })[0]!.message).toBe('ASSET step "images"\'s slots knob is "3"; it must be a whole number of at least 1');
    for (const knobs of [{ slots: 1 }, { slots: 3, triesPerSlot: 3 }, undefined]) expect(at(knobs)).toEqual([]);
    // Not a count the work bound reads, so the bound is still computed: 30 × 20 side by side beside it is still over.
    const wide = replicate('outer', 30, seq(replicate('inner', 20, build('b')), pick('p', 'H', 1, 'human')));
    expect(engineProblems(recipe(['D1', wide], ['D2', seq(build('b2'), asset({ slots: 0 }))])).map((p) => `${p.ruleId}:${p.clause}:${p.path}`)).toEqual(['ST7:slots:stages[1].body.steps[1]', 'ST3:limit:(recipe)']);
  });

  it('a C pick with no model judge cannot be decided', () => {
    expect(clauses(recipe(['D1', seq(replicate('x', 3, build('b')), pick('p', 'C', 1, 'model'))]))).toEqual(['ST12:pick-judge']);
    const humanJudge = step({ id: 'j', role: 'judge', actor: 'human', consumes: ['view'], produces: [] });
    expect(clauses(recipe(['D1', seq(replicate('x', 3, build('b')), pick('p', 'C', 1, 'model', humanJudge))]))).toEqual(['ST12:pick-judge']);
    expect(clauses(recipe(['D1', seq(replicate('x', 3, build('b')), pick('p', 'C', 1, 'model', judge('j')))]))).toEqual([]);
  });

  it('a retrying gate inside replicate, each or an audit lens (G1): a retry would orphan the branches beside it', () => {
    const g = (id: string) => oneShotGate(id, critic(`${id}-c`), { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }, { stage: 'D1', times: 1 });
    const inEach = recipe(['D1', seq(replicate('x', 3, build('b')), each('e', seq(render('r'), g('g'))))]);
    expect(engineProblems(inEach).map((p) => `${p.ruleId}:${p.clause}:${p.path}`)).toEqual(['ST10:retry-scope:stages[0].body.steps[1].body.steps[1]']);
    expect(clauses(recipe(['D1', replicate('x', 3, seq(build('b'), render('r'), g('g')))]))).toEqual(['ST10:retry-scope']);
    expect(clauses(recipe(['D1', seq(build('b'), render('r'), audit('a', [{ name: 'gated', body: g('g') }]))]))).toEqual(['ST10:retry-scope']);
    // At stage level, and in a loop (which runs one round at a time), a retry is fine.
    expect(clauses(recipe(['D1', seq(build('b'), render('r'), g('g'))]))).toEqual([]);
    // A gate with no retry may sit anywhere.
    const noRetry = oneShotGate('n', critic('n-c'), { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' });
    expect(clauses(recipe(['D1', replicate('x', 3, seq(build('b'), render('r'), noRetry))]))).toEqual([]);
  });

  it('retries over three', () => {
    const g = oneShotGate('g', critic('c'), { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }, { stage: 'D1', times: 4 });
    expect(clauses(recipe(['D1', seq(build('b'), render('r'), g)]))).toEqual(['ST10:retry-count']);
    expect(ENGINE_LIMITS.gateRetries).toBe(3);
  });
});

describe('composedLimitProblems', () => {
  const messages = (r: Recipe) => composedLimitProblems(r).map((p) => p.message);
  it('counts past the composed limits, each named', () => {
    expect(messages(recipe(['D1', seq(replicate('x', 17, build('b')), pick('p', 'H', 1, 'human'))]))).toEqual([expect.stringMatching(/replicate "x"'s count is 17; a composed recipe may have at most 16/)]);
    expect(messages(recipe(['D2', seq(build('b'), loop('l', seq(render('r'), critic('c'), fix('f')), scoreGate(13)))]))).toEqual([expect.stringMatching(/rounds is 13/)]);
    expect(messages(recipe(['D2', seq(build('b'), relay('chain', 9, build('link')))]))).toEqual([expect.stringMatching(/links is 9/)]);
    const five = audit('a', ['a', 'b', 'c', 'd', 'e'].map((name) => ({ name, body: critic(`c-${name}`) })));
    expect(messages(recipe(['D1', seq(build('b'), render('r'), five)]))).toEqual([expect.stringMatching(/lenses is 5/)]);
  });

  it('peak 33 and 401 step runs, from counts that are each within their limits', () => {
    expect(messages(recipe(['D1', replicate('outer', 3, seq(replicate('inner', 11, build('b')), pick('p', 'H', 1, 'human')))]))).toEqual(['the steps that can run at once is 33; a composed recipe may have at most 32']);
    // 4 nested loops of 2 rounds raised to 4, around 2 steps: past 400.
    let body: Node = seq(build('x'), build('y'));
    for (let i = 0; i < 4; i++) body = loop(`l${i}`, seq(body, render(`r${i}`)), { metric: 'human', hidden: false, holder: 'human', probe: 1, max: 2, onCap: 'human', onNoConverge: 'recalibrate-human' });
    expect(messages(recipe(['D2', body]))).toEqual([expect.stringMatching(/the steps a run can take is \d+; a composed recipe may have at most 400/)]);
  });

  it('nesting, node count and size', () => {
    let deep: Node = build('b');
    for (let i = 0; i < COMPOSED_LIMITS.depth; i++) deep = seq(deep);
    expect(messages(recipe(['D1', deep]))).toEqual([expect.stringMatching(/nesting of its operators is 13/)]);
    const many = seq(...Array.from({ length: 100 }, (_, i) => build(`b${i}`)));
    expect(messages(recipe(['D1', many]))).toEqual([expect.stringMatching(/steps and operators is 101/)]);
    const big = recipe(['D1', build('b')]);
    big.title = 'x'.repeat(33 * 1024);
    expect(messages(big)).toEqual([expect.stringMatching(/KB as JSON; a composed recipe may be at most 32 KB/)]);
  });

  it('nested 50 × 50 is over in count and at once', () => {
    expect(messages(recipe(['D1', replicate('outer', 50, seq(replicate('inner', 50, build('b')), pick('p', 'H', 1, 'human')))])).length).toBeGreaterThanOrEqual(2);
  });
});
