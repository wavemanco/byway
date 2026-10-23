/**
 * A declined optional step that would have put its critique in place clears the critique (R-DECLINED in the approved P2
 * design; the backlog row "A writer acts on an older critique when an optional critique step is declined"). Before, the
 * writer after it acted on whatever critique was there from earlier: C7 with its scope cut made optional applied the
 * defect check's findings a second time, and C5 with the person's cut made optional applied the shot check's. Now the
 * critique is left empty and marked, so the writer after it makes no change and its step says why, by the same path as
 * an empty CUT ("Nothing to remove"). The owner chose this on 2026-10-21 23:05: "Clear the critique (Recommended): a
 * declined step that would have written the critique leaves it empty and marked, so the writer after it makes no change
 * and its step says why, by the same path as an empty CUT ("Nothing to remove")".
 *
 * The catalog's own stages are driven through the real Interpreter with its activities stubbed; @byway/recipe's
 * semantics read the same rule (unappliedCritiques, below).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { c5, c7 } from '@byway/catalog';
import { optional, seq, step, unappliedCritiques, type Node, type Recipe, type Step } from '@byway/recipe';
import type { Ports, RunInput } from '../src/types.ts';
import { DECLINED_CRITIQUE_NOTE, NOTHING_TO_REMOVE } from '../src/workflow/wording.ts';
import { UNREAD_BRIEF } from './helpers/briefs.ts';

const state = vi.hoisted(() => ({
  /** What each model step was handed, by step id, in order. */
  given: [] as { stepId: string; critique?: string }[],
  /** The steps that finished without a call, with their notes. */
  passed: [] as { stepId: string; note: string }[],
  /** The optionals the person says yes to; every other optional is declined. */
  yes: new Set<string>(),
  /** A critic's ranks, in order; first of five once they run out. */
  ranks: [] as number[],
  n: 0,
}));

vi.mock('../src/workflow/acts.ts', () => {
  type Input = { call?: { stepId: string }; step?: { role: string; actor: string }; ports?: Ports; note?: string; resolution?: { text?: string } };
  const respond = (name: string, input: Input): unknown => {
    const id = input.call?.stepId ?? '';
    switch (name) {
      case 'modelStep': {
        state.given.push({ stepId: id, ...(input.ports?.critique !== undefined ? { critique: input.ports.critique } : {}) });
        switch (input.step?.role) {
          case 'check':
            return { costUsd: 0, text: `- ${id}: the build fails on an empty list.` };
          case 'cut':
            return { costUsd: 0, text: `- ${id}: drop the unused flag.` };
          case 'critic':
            return { costUsd: 0, text: `- ${id}: the summary repeats the title.`, score: { kind: 'rank', rank: state.ranks.shift() ?? 1, of: 5 } };
          case 'tells-sweep':
            return { costUsd: 0, text: 'No clichés found.', hits: [] };
          default:
            return { costUsd: 0, artifactId: `${id}-${++state.n}` };
        }
      }
      case 'passStep':
        state.passed.push({ stepId: id, note: input.note ?? '' });
        return undefined;
      case 'finishHumanStep':
        if (input.step?.role === 'voice') return { costUsd: 0, artifactId: `${id}-${++state.n}`, voiceId: `voice-${state.n}` };
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

/** `body` with the step `id` (a child of its seq) made optional, under the optional `wrap`. */
function optionalAt(body: Node, id: string, wrap: string): Node {
  if (body.op !== 'seq') throw new Error('a stage of seq was expected');
  return seq(...body.steps.map((n) => (n.op === 'step' && n.id === id ? optional(wrap, 'you want it', n) : n)));
}

/** The stage `stage` of `recipe`, with the step `id` made optional. */
const stageWith = (recipe: Recipe, stage: string, id: string): Node => optionalAt(recipe.stages.find((s) => s.stage === stage)!.body, id, `${id}-if-wanted`);

/**
 * Run one stage body through the real Interpreter from `ports`. Each optional in `state.yes` is run and every other one
 * declined; a person's answer to anything else is an empty text, and a confirm is yes.
 */
async function run(recipe: Recipe, stage: string, body: Node, ports: Ports): Promise<Ports> {
  const input: RunInput = { runId: 'run-declined', workspaceId: 'ws', recipe, problemId: UNREAD_BRIEF, profileId: 'demo', budgetUsd: 5, medium: recipe.medium ?? 'prose', routes: {}, inputs: {} };
  const control = { boundary: async () => {}, machine: <T>(fn: () => Promise<T>) => fn(), track: <T>(fn: () => Promise<T>) => fn(), pending: new Map() };
  const engine = new Interpreter(input, control as never);
  Object.assign(engine, {
    ask: async (call: { stepId: string }, cp: { kind: string; prompt: string }) =>
      cp.kind === 'confirm' ? { checkpointId: 'cp', approved: !cp.prompt.startsWith('Run this step') || state.yes.has(call.stepId) } : { checkpointId: 'cp', text: '', choice: [] },
  });
  return engine.node(body, ports, { stage: stage as never, path: [] });
}

beforeEach(() => {
  state.given = [];
  state.passed = [];
  state.yes = new Set();
  state.ranks = [];
});

describe('C7 with its scope cut made optional', () => {
  const d2 = stageWith(c7, 'D2', 'scope-cut');

  it('declined: the scope cut’s fix makes no change and says why, instead of applying the defect check’s findings again', async () => {
    await run(c7, 'D2', d2, {});
    expect(state.passed).toEqual([{ stepId: 'apply-scope-cut', note: DECLINED_CRITIQUE_NOTE }]);
    expect(state.given.map((g) => g.stepId)).not.toContain('apply-scope-cut');
    // The defect check's findings were applied once, by their own fix.
    expect(state.given.find((g) => g.stepId === 'fix-defects')?.critique).toContain('defect-check');
  });

  it('run: the fix applies the scope cut’s list, as before', async () => {
    state.yes.add('scope-cut-if-wanted');
    await run(c7, 'D2', d2, {});
    expect(state.passed).toEqual([]);
    expect(state.given.find((g) => g.stepId === 'apply-scope-cut')?.critique).toContain('scope-cut');
  });

  it('the critique stays empty and marked only until a step puts another in place: the review loop’s critic', async () => {
    // Last of five, so the round goes on to its fix; then first.
    state.ranks = [5];
    await run(c7, 'D2', d2, {});
    expect(state.given.find((g) => g.stepId === 'review-fix')?.critique).toContain('reviewer');
  });
});

describe('C5 with your cut made optional', () => {
  const d3 = stageWith(c5, 'D3', 'cut');
  /** D2's last shot check left its findings in the critique. */
  const fromD2: Ports = { artifact: 'storyboard', critique: '- shot-check: the second shot flickers.' };

  it('declined: the cut’s fix makes no change and says why, instead of applying the shot check’s findings', async () => {
    await run(c5, 'D3', d3, fromD2);
    expect(state.passed[0]).toEqual({ stepId: 'apply-cut', note: DECLINED_CRITIQUE_NOTE });
    expect(state.given.map((g) => g.stepId)).not.toContain('apply-cut');
  });

  it('run, and you list nothing to remove: the fix passes with "Nothing to remove", as before', async () => {
    state.yes.add('cut-if-wanted');
    await run(c5, 'D3', d3, fromD2);
    expect(state.passed[0]).toEqual({ stepId: 'apply-cut', note: NOTHING_TO_REMOVE });
  });
});

describe('an optional that would put no critique in place', () => {
  const critic = step({ id: 'critic', role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, prompt: 'p.critic', consumes: ['view'], produces: ['critique', 'score'] });
  const render = step({ id: 'look', role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
  const asset = step({ id: 'asset', role: 'asset', block: 'ASSET', actor: 'model', tier: 'mid', prompt: 'p.asset', consumes: ['artifact'], produces: ['asset'] });
  const fix: Step = step({ id: 'fix', role: 'fix', actor: 'model', tier: 'mid', prompt: 'p.fix', consumes: ['artifact', 'critique'], produces: ['artifact'], writes: true });

  it('declined leaves the critique as it was: the fix after it applies the critic’s findings', async () => {
    const body = seq(render, critic, optional('asset-if-wanted', 'you want images', asset), fix);
    await run({ ...c7, medium: 'prose' }, 'D2', body, { artifact: 'draft' });
    expect(state.passed).toEqual([]);
    expect(state.given.find((g) => g.stepId === 'fix')?.critique).toContain('critic');
  });
});

describe('@byway/recipe reads the same rule', () => {
  const personCut = step({ id: 'cut', role: 'cut', block: 'CUT', actor: 'human', consumes: ['view'], produces: ['critique'] });
  const critic = step({ id: 'critic', role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, prompt: 'p.critic', consumes: ['view'], produces: ['critique', 'score'] });
  const render = step({ id: 'look', role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
  const fix: Step = step({ id: 'fix', role: 'fix', actor: 'model', tier: 'mid', prompt: 'p.fix', consumes: ['artifact', 'critique'], produces: ['artifact'], writes: true });
  const body = seq(render, personCut, optional('review-if-wanted', 'you want a review', critic), fix);
  const recipe: Recipe = { ...c7, medium: 'prose', stages: [{ stage: 'D2', body }] };

  it('your list before an optional review reaches the fix on no path, and the run shows it: declined, the fix passes; run, it applies the review', async () => {
    expect(unappliedCritiques(recipe).map((p) => p.step.id)).toEqual(['cut']);
    await run(recipe, 'D2', body, { artifact: 'draft' });
    expect(state.passed).toEqual([{ stepId: 'fix', note: DECLINED_CRITIQUE_NOTE }]);
    state.passed = [];
    state.yes.add('review-if-wanted');
    await run(recipe, 'D2', body, { artifact: 'draft' });
    expect(state.passed).toEqual([]);
    expect(state.given.find((g) => g.stepId === 'fix')?.critique).toContain('critic');
  });
});
