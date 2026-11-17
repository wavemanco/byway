/**
 * A one-shot gate hands on the ports it was handed with its body's critique (R-GATE-MARK in the approved P2 design).
 * Before, it kept the entry ports' emptyCritique mark beside that critique, so a fix right after a gate that follows an
 * empty CUT passed over the gate critic's critique ("Nothing to remove") instead of applying it. Now the critique the
 * gate's body wrote replaces the one before it, and clears its mark, as any new critique does. Unreachable in admitted
 * recipes (DR7 refuses a gate after Distill starts; C5's gate has no fix after it), so these recipes are built by hand
 * and driven through the real Interpreter with its activities stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { oneShotGate, seq, step, type Node, type Recipe, type Step } from '@byway/recipe';
import type { Ports, RunInput } from '../src/types.ts';
import { GATE_FAILED_NO_RETRY_PROMPT, GATE_FAILED_PROMPT, NOTHING_TO_REMOVE } from '../src/workflow/wording.ts';
import { UNREAD_BRIEF } from './helpers/briefs.ts';

const state = vi.hoisted(() => ({
  /** What each model step was handed, by step id, in order. */
  given: [] as { stepId: string; critique?: string; emptyCritique?: string }[],
  /** The steps that finished without a call, with their notes. */
  passed: [] as { stepId: string; note: string }[],
  /** The gate critic's scores, in order; a pass once they run out. */
  scores: [] as number[],
  /** The prompts of the confirms the person was asked, in order. */
  prompts: [] as string[],
  n: 0,
}));

vi.mock('../src/workflow/acts.ts', () => {
  type Input = { call?: { stepId: string }; step?: { role: string }; ports?: Ports; note?: string; resolution?: { text?: string } };
  const respond = (name: string, input: Input): unknown => {
    const id = input.call?.stepId ?? '';
    switch (name) {
      case 'modelStep': {
        const p = input.ports ?? {};
        state.given.push({ stepId: id, ...(p.critique !== undefined ? { critique: p.critique } : {}), ...(p.emptyCritique ? { emptyCritique: p.emptyCritique } : {}) });
        if (input.step?.role === 'cut') return { costUsd: 0, text: 'Nothing to remove.', nothingToRemove: true };
        if (input.step?.role === 'critic') return { costUsd: 0, text: '- The opening buries the offer.', score: { kind: 'score', value: state.scores.shift() ?? 9 } };
        return { costUsd: 0, artifactId: `${id}-${++state.n}` };
      }
      case 'passStep':
        state.passed.push({ stepId: id, note: input.note ?? '' });
        return undefined;
      case 'finishHumanStep':
        return { costUsd: 0, text: input.resolution?.text ?? '' };
      case 'renderView':
        return { costUsd: 0, view: { pool: false, items: [{ imageArtifactIds: [] }] } };
      default:
        return undefined;
    }
  };
  const group = () => new Proxy({}, { get: (_t, name: string) => async (input: never) => respond(name, input) });
  return { quick: group(), model: group(), media: group() };
});

const { Interpreter } = await import('../src/workflow/interpreter.ts');

const build = step({ id: 'draft', role: 'build', actor: 'model', tier: 'mid', prompt: 'p.build', consumes: ['intent'], produces: ['artifact'], writes: true });
const cut = step({ id: 'cut', role: 'cut', block: 'CUT', actor: 'model', tier: 'mid', prompt: 'p.cut', consumes: ['artifact'], produces: ['critique'] });
const personCut = step({ id: 'cut', role: 'cut', block: 'CUT', actor: 'human', consumes: ['artifact'], produces: ['critique'] });
const critic = step({ id: 'gate-critic', role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, prompt: 'p.critic', consumes: ['artifact'], produces: ['critique', 'score'] });
const gate = oneShotGate('gate', critic, { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' });
const fix: Step = step({ id: 'fix', role: 'fix', actor: 'model', tier: 'mid', prompt: 'p.fix', consumes: ['artifact', 'critique'], produces: ['artifact'], writes: true });

/** Run one stage of `body` (prose) through the real Interpreter; a person's directive lists nothing, and the gate's "use it anyway?" is yes. */
async function run(body: Node): Promise<Ports> {
  const recipe: Recipe = { schema: 'byway.recipe/1', id: 'gate-mark', title: 'Gate mark', kind: 'experimental', family: 'test', channel: 'workspace', medium: 'prose', inputs: ['intent'], stages: [{ stage: 'D2', body }], sitsOut: [], exceptions: [], bank: false };
  const input: RunInput = { runId: 'run-gate-mark', workspaceId: 'ws', recipe, problemId: UNREAD_BRIEF, profileId: 'demo', budgetUsd: 5, medium: 'prose', routes: {}, inputs: {} };
  const control = { boundary: async () => {}, machine: <T>(fn: () => Promise<T>) => fn(), track: <T>(fn: () => Promise<T>) => fn(), pending: new Map() };
  const engine = new Interpreter(input, control as never);
  Object.assign(engine, {
    ask: async (_call: unknown, cp: { kind: string; prompt?: string }) => {
      if (cp.kind === 'confirm') state.prompts.push(cp.prompt ?? '');
      return cp.kind === 'confirm' ? { checkpointId: 'cp', approved: true } : { checkpointId: 'cp', text: '' };
    },
  });
  return engine.runStages();
}

beforeEach(() => {
  state.given = [];
  state.passed = [];
  state.scores = [];
  state.prompts = [];
});

describe('a one-shot gate after an empty CUT hands on its critic’s critique without the empty mark', () => {
  it('without a gate, the fix after an empty CUT passes with "Nothing to remove", as before', async () => {
    await run(seq(build, cut, fix));
    expect(state.passed).toEqual([{ stepId: 'fix', note: NOTHING_TO_REMOVE }]);
    expect(state.given.map((g) => g.stepId)).toEqual(['draft', 'cut']);
  });

  it('a fix right after the gate applies the gate critic’s critique', async () => {
    const ports = await run(seq(build, cut, gate, fix));
    expect(state.passed).toEqual([]);
    expect(state.given.find((g) => g.stepId === 'fix')).toEqual({ stepId: 'fix', critique: '- The opening buries the offer.' });
    expect(ports.emptyCritique).toBeUndefined();
  });

  it('so does one after a gate that failed and that the person chose to use anyway', async () => {
    state.scores = [3];
    await run(seq(build, cut, gate, fix));
    expect(state.passed).toEqual([]);
    expect(state.given.find((g) => g.stepId === 'fix')).toEqual({ stepId: 'fix', critique: '- The opening buries the offer.' });
  });

  it('and one after a gate that follows a person who listed nothing to remove', async () => {
    await run(seq(build, personCut, gate, fix));
    expect(state.passed).toEqual([]);
    expect(state.given.find((g) => g.stepId === 'fix')).toEqual({ stepId: 'fix', critique: '- The opening buries the offer.' });
  });

  it('a gate with no retry asks without saying another try ran; one with a retry still says so (C5)', async () => {
    state.scores = [3];
    await run(seq(build, gate));
    expect(state.prompts).toEqual([GATE_FAILED_NO_RETRY_PROMPT]);
    state.prompts = [];
    state.scores = [3, 3];
    await run(seq(build, oneShotGate('gate', critic, { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }, { stage: 'D2', times: 1 })));
    expect(state.prompts).toEqual([GATE_FAILED_PROMPT]);
  });

  it('a gate whose body wrote no critique hands on the empty CUT as it was: the fix still passes', async () => {
    // A body that only renders has no score, so the check fails and the person uses the work anyway.
    const render = step({ id: 'look', role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
    await run(seq(build, cut, oneShotGate('gate', render, { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }), fix));
    expect(state.passed).toEqual([{ stepId: 'fix', note: NOTHING_TO_REMOVE }]);
  });
});
