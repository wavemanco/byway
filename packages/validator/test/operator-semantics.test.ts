/**
 * The operators as the interpreter runs them (ADR-0092 stage 4, ADR-0093):
 * - a loop's gate reads only the critic or check that reports to it on every round (gateFeed): one inside replicate,
 *   each, an audit, a gate or an inner loop never reports, and one under an optional may not run, so the loop would
 *   reach its cap without a verdict (ST2 'feed', the verification's variants3 and variants3b);
 * - a one-shot gate reads its body's fresh score the same way (ST10 'feed', variants7), and takes a critic's metric
 *   only: a check or a person's gate gives it no score to pass (ST10 'metric');
 * - what comes out of an audit is its joined critique (several lenses cannot make one score), out of a one-shot gate
 *   its body's critique and nothing else, and inside each one option, never the set (ST5);
 * - a loop a person holds hands its last round to them, never to a fixed rule (LS1).
 */
import { describe, expect, it } from 'vitest';
import { OPTION_SET } from '@byway/protocol';
import { audit, each, loop, oneShotGate, optional, replicate, route, seq, step, walk, type Loop, type Node, type OneShotGate, type Recipe, type Seq } from '@byway/recipe';
import { validate } from '../src/index.ts';
import { studio } from './fixtures.ts';
import { critic, mediaRelay, render, secondReader } from './operator-fixtures.ts';

const clauses = (r: Recipe) => validate(r).violations.map((v) => `${v.ruleId}${v.clause ? `:${v.clause}` : ''}`);

function find<T extends Node['op']>(r: Recipe, op: T, id: string): Extract<Node, { op: T }> {
  let found: Node | undefined;
  walk(r, (n) => {
    if (n.op === op && 'id' in n && n.id === id) found = n;
  });
  if (!found) throw new Error(`no ${op} ${id}`);
  return found as Extract<Node, { op: T }>;
}
const criticLoop = (r: Recipe): Loop => find(r, 'loop', 'critic-loop');
const loopSeq = (r: Recipe): Seq => criticLoop(r).body as Seq;
const launch = (r: Recipe): OneShotGate => find(r, 'gate', 'launch-gate');

describe("ST2 feed: a loop's gate sees its critic or check on every round", () => {
  it('the studio fixture: its critic reports to the loop', () => {
    expect(clauses(studio())).toEqual([]);
  });

  it.each([
    ['inside an audit lens (variants3)', (c: Node) => audit('reads', [{ name: 'critic', body: c }])],
    ['inside a replicate', (c: Node) => replicate('x2', 2, c)],
    ['inside a one-shot gate', (c: Node) => oneShotGate('inner-gate', c, { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' })],
    ['under an optional (variants3b): it may not run', (c: Node) => optional('maybe', 'when it applies', c)],
    ['in one branch of a route only', (c: Node) => route('which', 'which way', [{ name: 'a', body: c }, { name: 'b', body: render('other-render') }])],
  ] as [string, (c: Node) => Node][])('a critic %s', (_name, wrap) => {
    const r = studio();
    const body = loopSeq(r);
    body.steps[1] = wrap(body.steps[1]!);
    expect(clauses(r)).toContain('ST2:feed');
  });

  it('a critic in every branch of a route reports on every round', () => {
    const r = studio();
    const body = loopSeq(r);
    const c = body.steps[1]!;
    body.steps[1] = route('which', 'which way', [
      { name: 'a', body: c },
      { name: 'b', body: { ...(c as object), id: 'critic-b' } as Node },
    ]);
    expect(clauses(r).filter((x) => x.endsWith(':feed'))).toEqual([]);
  });

  it("a check-clean loop's check inside an audit", () => {
    const r = mediaRelay();
    const repair = find(r, 'loop', 'shot-repair').body as Seq;
    repair.steps[1] = audit('reads', [{ name: 'check', body: repair.steps[1]! }]);
    expect(clauses(r)).toContain('ST2:feed');
  });

  it('a loop a person holds needs no feed', () => {
    expect(clauses(secondReader()).filter((x) => x.endsWith(':feed'))).toEqual([]);
  });
});

describe('ST10 feed and metric: a one-shot gate reads a fresh score from its own critic', () => {
  it('the media fixture: its gate critic reports', () => {
    expect(clauses(mediaRelay())).toEqual([]);
  });

  it('a gate critic inside an audit lens (variants7): the gate would read no score of its own', () => {
    const r = mediaRelay();
    launch(r).body = audit('reads', [{ name: 'critic', body: critic('gate-critic') }]);
    expect(clauses(r)).toContain('ST10:feed');
  });

  it('a gate critic under an optional', () => {
    const r = mediaRelay();
    launch(r).body = optional('maybe', 'when it applies', critic('gate-critic'));
    expect(clauses(r)).toContain('ST10:feed');
  });

  it.each(['check-clean', 'human'])('a one-shot %s gate: no score to pass on', (metric) => {
    const r = mediaRelay();
    launch(r).pass = { metric, hidden: false, holder: metric === 'human' ? 'human' : 'harness' };
    expect(clauses(r)).toContain('ST10:metric');
  });
});

describe('ST5: the ports each operator hands on, as the interpreter runs it', () => {
  it("a score after an audit: lenses' critiques are joined, their scores are not kept", () => {
    const r = secondReader();
    const body = find(r, 'loop', 'author-loop').body as Seq;
    body.steps.push(step({ id: 'read-score', role: 'vision', block: 'VISION', actor: 'human', consumes: ['score'], produces: ['taste'] }));
    r.sitsOut = r.sitsOut.filter((s) => s.block !== 'VISION');
    expect(clauses(r)).toEqual(['ST5']);
  });

  it("a score after a one-shot gate: only its body's critique comes out", () => {
    for (const port of ['score'] as const) {
      const r = mediaRelay();
      const d3 = r.stages[2]!.body as Seq;
      d3.steps.push(step({ id: `after-${port}`, role: 'vision', block: 'VISION', actor: 'human', consumes: [port], produces: ['taste'] }));
      r.sitsOut = [];
      expect(clauses(r), port).toEqual(['ST5']);
    }
  });

  it("the option set inside each: each candidate runs on its own option", () => {
    const r = studio();
    const candidate = (r.stages[1]!.body as Seq).steps[0] as Extract<Node, { op: 'each' }>;
    (candidate.body as Seq).steps.push(step({ id: 'pool', role: 'render', glue: 'RENDER', actor: 'tool', consumes: [OPTION_SET], produces: ['view'] }));
    expect(clauses(r)).toEqual(['ST5']);
    expect(each).toBeDefined();
  });
});

describe('LS1: a loop a person holds ends on their answer', () => {
  it('a person’s loop whose last round goes to a fixed rule, with no critic in it', () => {
    const r = secondReader();
    const reads = find(r, 'audit', 'audit');
    reads.lenses = reads.lenses.filter((l) => l.name !== 'critic');
    // With no critic in the loop, C6's exception for a critic under a person's stop is not needed.
    r.exceptions = r.exceptions.filter((e) => e !== 'C6-DR4');
    expect(clauses(r)).toEqual([]);
    find(r, 'loop', 'author-loop').gate.onCap = 'policy-best-snapshot';
    expect(clauses(r)).toEqual(['LS1']);
  });

  it('a person’s loop as the catalog writes it', () => {
    expect(clauses(secondReader())).toEqual([]);
    expect(loop).toBeDefined();
  });
});
