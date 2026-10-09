/**
 * @byway/recipe's loop exit points (ADR-0092) agree with the interpreter: the real Interpreter runs small loops with its
 * activities stubbed, and every way out of a loop (a passed threshold, a clean check, a plateau, a stopped probe, the
 * cap) leaves the body right after a step `exitPoints` names, so the steps after it in that round do not run. A loop
 * whose critic sits where the gate cannot see it (inside replicate, each, an audit, a gate or an inner loop) runs its
 * body to the end, and `exitPoints` names nothing there. COMP-1 and the flow walk rely on exactly this.
 */
import { describe, expect, it, vi } from 'vitest';
import { audit, exitPoints, loop, oneShotGate, optional, relay, replicate, route, seq, step, type Gate, type Loop, type Node, type Recipe, type Step } from '@byway/recipe';
import type { RunInput } from '../src/types.ts';

const state = vi.hoisted(() => ({
  ran: [] as string[],
  scores: [] as number[],
  checks: [] as string[],
  n: 0,
}));

/** Every activity proxy is a recorder: the steps that run, with canned answers for what the loop's gate reads. */
vi.mock('../src/workflow/acts.ts', () => {
  const respond = (name: string, input: { call?: { stepId: string }; step?: { role: string } }): unknown => {
    const id = input.call?.stepId ?? '';
    switch (name) {
      case 'modelStep': {
        state.ran.push(id);
        const role = input.step?.role;
        if (role === 'critic') return { costUsd: 0, text: '- the same gap', score: { kind: 'score', value: state.scores.shift() ?? 10 } };
        if (role === 'check') {
          const text = state.checks.shift() ?? 'No defects.';
          return { costUsd: 0, text, clean: text === 'No defects.' };
        }
        return { costUsd: 0, artifactId: `${id}-${++state.n}` };
      }
      case 'renderView':
        state.ran.push(id);
        return { costUsd: 0, view: { pool: false, items: [{ imageArtifactIds: [] }] } };
      case 'storyboardShots':
        return [1, 2, 3];
      case 'rerank':
        return { costUsd: 0, index: 0 };
      default:
        return undefined;
    }
  };
  const group = () => new Proxy({}, { get: (_t, name: string) => async (input: never) => respond(name, input) });
  return { quick: group(), model: group(), media: group() };
});

const { Interpreter } = await import('../src/workflow/interpreter.ts');

const gateOf = (metric: string, extra: Partial<Gate> = {}): Gate => ({
  metric,
  ...(metric === 'critic-score' ? { threshold: 9 } : {}),
  hidden: metric !== 'human',
  holder: metric === 'human' ? 'human' : 'harness',
  probe: 1,
  max: 3,
  onCap: 'human',
  onNoConverge: 'continue',
  ...extra,
});
const render = (id: string): Step => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const critic = (id: string): Step => step({ id, role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'p.critic', consumes: ['view'], produces: ['critique', 'score'] });
const check = (id: string): Step => step({ id, role: 'check', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'p.check', consumes: ['view'], produces: ['critique'] });
const fix = (id: string): Step => step({ id, role: 'fix', actor: 'model', tier: 'mid', prompt: 'p.fix', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true });
const draft = step({ id: 'draft', role: 'build', actor: 'model', tier: 'mid', prompt: 'p.build', consumes: ['intent'], produces: ['artifact'], writes: true });

interface Scenario {
  loop: Loop;
  scores?: number[];
  checks?: string[];
  /** The person's answer to every confirm question (Run this step? Keep going? Use the best so far? Is this ready?). */
  approve?: boolean;
  routes?: Record<string, string>;
}

async function run(s: Scenario): Promise<string[]> {
  state.ran = [];
  state.scores = [...(s.scores ?? [])];
  state.checks = [...(s.checks ?? [])];
  const recipe: Recipe = { schema: 'byway.recipe/1', id: 'exits', title: 'Exits', kind: 'experimental', family: 'test', channel: 'workspace', medium: 'prose', inputs: ['intent'], stages: [{ stage: 'D2', body: seq(draft, s.loop) }], sitsOut: [], exceptions: [], bank: false };
  const input: RunInput = { runId: 'run-exits', workspaceId: 'ws', recipe, problem: { text: 'A memo' }, profileId: 'demo', budgetUsd: 5, medium: 'prose', routes: s.routes ?? {}, inputs: {} };
  const control = { boundary: async () => {}, machine: <T>(fn: () => Promise<T>) => fn(), track: <T>(fn: () => Promise<T>) => fn(), pending: new Map() };
  const engine = new Interpreter(input, control as never);
  Object.assign(engine, { ask: async (_call: unknown, spec: { kind: string }) => (spec.kind === 'confirm' ? { checkpointId: 'cp', approved: s.approve ?? true } : { checkpointId: 'cp', choice: [] }) });
  await engine.runStages();
  return state.ran.slice(1);
}

const exits = (l: Loop) => exitPoints(l).map((x) => x.id);
const body = (...steps: Node[]) => seq(...steps);

describe('every way out of a loop leaves right after an exit point', () => {
  it.each([
    ['a passed threshold', { loop: loop('l', body(render('r'), critic('c'), fix('f')), gateOf('critic-score')), scores: [10] }, ['r', 'c']],
    ['a plateau', { loop: loop('l', body(render('r'), critic('c'), fix('f')), gateOf('critic-score', { max: 5, plateau: { minGain: 1, window: 2 } })), scores: [5, 5] }, ['r', 'c', 'f', 'r', 'c']],
    ['a stopped probe', { loop: loop('l', body(render('r'), critic('c'), fix('f')), gateOf('critic-score', { max: 5, onNoConverge: 'recalibrate-human' })), scores: [5, 5], approve: false }, ['r', 'c', 'f', 'r', 'c']],
    ['the cap, by policy', { loop: loop('l', body(render('r'), critic('c'), fix('f')), gateOf('critic-score', { max: 2, onCap: 'policy-best-snapshot' })), scores: [5, 7] }, ['r', 'c', 'f', 'r', 'c']],
    ['the cap, by a person', { loop: loop('l', body(render('r'), critic('c'), fix('f')), gateOf('critic-score', { max: 1 })), scores: [5] }, ['r', 'c']],
    ['a clean check', { loop: loop('l', body(render('r'), check('k'), fix('f')), gateOf('check-clean')), checks: ['- a defect', 'No defects.'] }, ['r', 'k', 'f', 'r', 'k']],
    ['a check-clean cap', { loop: loop('l', body(render('r'), check('k'), fix('f')), gateOf('check-clean', { max: 2, onCap: 'policy-best-snapshot' })), checks: ['- a defect', '- a defect'] }, ['r', 'k', 'f', 'r', 'k']],
    ['a critic in a relay link: later links do not run', { loop: loop('l', body(relay('links', 3, seq(render('r'), critic('c'))), fix('f')), gateOf('critic-score')), scores: [10] }, ['r', 'c']],
    ['a critic in an optional', { loop: loop('l', body(render('r'), optional('o', 'needed', critic('c')), fix('f')), gateOf('critic-score')), scores: [10] }, ['r', 'c']],
    ['a critic in a route branch', { loop: loop('l', body(render('r'), route('which', 'mode', [{ name: 'a', body: critic('c') }, { name: 'b', body: render('r2') }]), fix('f')), gateOf('critic-score')), scores: [10], routes: { which: 'a' } }, ['r', 'c']],
  ] as [string, Scenario, string[]][])('%s', async (_name, scenario, expected) => {
    const ran = await run(scenario);
    expect(ran).toEqual(expected);
    // The loop ended right after a step exitPoints names, and nothing after it in that round ran.
    expect(exits(scenario.loop)).toContain(ran.at(-1));
  });
});

describe('a loop whose gate cannot see its critic runs its body to the end', () => {
  it.each([
    ['inside replicate (candidates run side by side)', loop('l', body(replicate('x', 2, seq(render('r'), critic('c'))), fix('f')), gateOf('critic-score', { max: 2 })), ['r', 'r', 'c', 'c', 'f', 'r', 'r', 'c', 'c', 'f']],
    ['inside an audit lens', loop('l', body(render('r'), audit('a', [{ name: 'critic', body: critic('c') }]), fix('f')), gateOf('critic-score', { max: 2 })), ['r', 'c', 'f', 'r', 'c', 'f']],
    ['inside a one-shot gate', loop('l', body(render('r'), oneShotGate('g', critic('c'), { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }), fix('f')), gateOf('critic-score', { max: 2 })), ['r', 'c', 'f', 'r', 'c', 'f']],
    ['inside an inner loop', loop('l', body(loop('inner', seq(render('r'), critic('c'), fix('f')), gateOf('critic-score')), fix('outer-fix')), gateOf('critic-score', { max: 2 })), ['r', 'c', 'outer-fix', 'r', 'c', 'outer-fix']],
    ["a person's loop", loop('l', body(render('r'), critic('c'), fix('f')), gateOf('human', { max: 2 })), ['r', 'c', 'f', 'r', 'c', 'f']],
  ] as [string, Loop, string[]][])('%s', async (_name, l, expected) => {
    const ran = await run({ loop: l, scores: Array(8).fill(10), approve: false });
    expect(ran).toEqual(expected);
    expect(exits(l)).toEqual([]);
  });
});
