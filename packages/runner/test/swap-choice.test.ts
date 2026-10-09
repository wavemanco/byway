/**
 * A TELLS sweep's swap choice reads its siblings (F08 fix round, ADR-0098): the interpreter asks the person which of
 * the sweep's finds to swap only when the swap step follows it in its own seq (`asksSwaps`, @byway/recipe/semantics).
 * The same steps with the rest of the seq wrapped in a seq of their own never ask, and the swap step then applies every
 * find. That is why the semantic projection keeps a seq's nesting: a composed recipe that re-nests C1's Finish must not
 * read "The same steps as C1". Driven through the real Interpreter with its activities stubbed (the verifier's probe).
 */
import { describe, expect, it, vi } from 'vitest';
import { c1, c7 } from '@byway/catalog';
import { asksSwaps, type Node, type Recipe, type Seq, type Step } from '@byway/recipe';
import type { RunInput } from '../src/types.ts';

const state = vi.hoisted(() => ({ asked: [] as string[], swapped: [] as string[], n: 0 }));

vi.mock('../src/workflow/acts.ts', () => {
  const respond = (name: string, input: { call?: { stepId: string }; step?: { role: string }; ports?: { critique?: string } }): unknown => {
    const id = input.call?.stepId ?? '';
    switch (name) {
      case 'modelStep': {
        const role = input.step?.role;
        if (role === 'tells-sweep') return { costUsd: 0, text: '1. "delve" -> "dig"\n2. "tapestry" -> "mix"', hits: [{ pattern: 'delve', alternative: 'dig' }, { pattern: 'tapestry', alternative: 'mix' }] };
        if (role === 'critic') return { costUsd: 0, text: '- a gap', score: { kind: 'score', value: 10 } };
        if (role === 'check' || role === 'cut') return { costUsd: 0, text: 'Nothing to change.' };
        if (role === 'tells-compare') return { costUsd: 0, keep: 'B' };
        if (id === 'apply-swaps') state.swapped.push(input.ports?.critique ?? '');
        return { costUsd: 0, artifactId: `${id}-${++state.n}` };
      }
      case 'finishHumanStep':
        return { costUsd: 0, text: 'words', artifactId: `${id}-${++state.n}`, keep: 'B' };
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

/** The recipe's stage that holds its cliché sweep, alone, with a draft in front of it. */
function sweepStage(r: Recipe): Recipe {
  const stage = structuredClone(r.stages.find((s) => s.body.op === 'seq' && s.body.steps.some((x) => x.op === 'step' && x.role === 'tells-sweep'))!);
  const draft: Step = { op: 'step', id: 'pre-draft', role: 'build', actor: 'model', tier: 'mid', prompt: 'p.x', consumes: ['intent'], produces: ['artifact'], writes: true };
  (stage.body as Seq).steps.unshift(draft);
  return { ...structuredClone(r), stages: [stage] };
}

/** The same steps, with everything after the sweep wrapped in a seq of its own. */
function nested(r: Recipe): Recipe {
  const c = structuredClone(r);
  const body = c.stages[0]!.body as Seq;
  const i = body.steps.findIndex((s) => s.op === 'step' && s.role === 'tells-sweep');
  body.steps = [...body.steps.slice(0, i + 1), { op: 'seq', steps: body.steps.slice(i + 1) }];
  return c;
}

async function run(recipe: Recipe): Promise<void> {
  state.asked = [];
  state.swapped = [];
  const input: RunInput = { runId: 'run-swaps', workspaceId: 'ws', recipe, problem: { text: 'A landing page' }, profileId: 'demo', budgetUsd: 5, medium: recipe.medium ?? 'web-page', routes: {}, inputs: {} };
  const control = { boundary: async () => {}, machine: <T>(fn: () => Promise<T>) => fn(), track: <T>(fn: () => Promise<T>) => fn(), pending: new Map() };
  const engine = new Interpreter(input, control as never);
  Object.assign(engine, {
    ask: async (call: { stepId: string }, spec: { kind: string; options?: { id: string }[] }) => {
      state.asked.push(`${spec.kind}:${call.stepId}`);
      if (spec.kind === 'select') return { checkpointId: 'cp', choice: ['hit-1'] };
      if (spec.kind === 'confirm') return { checkpointId: 'cp', approved: true };
      if (spec.kind === 'write') return { checkpointId: 'cp', text: 'x' };
      return { checkpointId: 'cp', choice: [spec.options?.[0]?.id ?? 'B'], text: 'x' };
    },
  });
  await engine.runStages();
}

/** What asksSwaps says of the sweep in the recipe's one stage. */
function predicted(r: Recipe): boolean {
  const body = r.stages[0]!.body as Seq;
  const i = body.steps.findIndex((s) => s.op === 'step' && s.role === 'tells-sweep');
  return asksSwaps(body.steps[i] as Node, body.steps.slice(i + 1));
}

describe("a TELLS sweep's swap choice reads its own seq", () => {
  it.each([
    ['C1', c1],
    ['C7', c7],
  ] as const)('%s: the flat Finish asks which finds to swap, the nested one never does, and asksSwaps says the same', async (_id, recipe) => {
    const flat = sweepStage(recipe);
    await run(flat);
    expect(state.asked).toContain('select:tells-sweep');
    expect(state.swapped[0]).toContain('delve');
    expect(state.swapped[0]).not.toContain('tapestry');
    expect(predicted(flat)).toBe(true);

    const deep = nested(flat);
    await run(deep);
    expect(state.asked).not.toContain('select:tells-sweep');
    // Without the person's choice the swap step reads the sweep's whole critique: every find.
    expect(state.swapped[0]).toContain('delve');
    expect(state.swapped[0]).toContain('tapestry');
    expect(predicted(deep)).toBe(false);
  });

  /**
   * A step between the sweep and its swap step that puts another critique in place of the finds (here a critic): the
   * swap step applies that critique, so a choice among the sweep's finds would decide nothing. The run does not ask,
   * and asksSwaps (the explainers, the estimate and the diff) says the same (F08 round 4).
   */
  it.each([
    ['C1', c1],
    ['C7', c7],
  ] as const)('%s: a critic between the sweep and its swap step replaces the finds, so no one is asked to choose among them', async (_id, recipe) => {
    const flat = sweepStage(recipe);
    const body = flat.stages[0]!.body as Seq;
    const i = body.steps.findIndex((s) => s.op === 'step' && s.role === 'tells-sweep');
    const critic: Step = { op: 'step', id: 'between', role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'p.c', consumes: ['view'], produces: ['critique', 'score'] };
    body.steps.splice(i + 1, 0, critic);
    await run(flat);
    expect(state.asked).not.toContain('select:tells-sweep');
    expect(state.swapped).toEqual(['- a gap']);
    expect(predicted(flat)).toBe(false);
  });

  /** The admitted form of the same (the advisor's present.test admits it): a direction of yours, given as a critique. */
  it.each([
    ['C1', c1],
    ['C7', c7],
  ] as const)('%s: your direction between the sweep and its swap step replaces the finds, so you are asked for it, not for swaps', async (_id, recipe) => {
    const flat = sweepStage(recipe);
    const body = flat.stages[0]!.body as Seq;
    const i = body.steps.findIndex((s) => s.op === 'step' && s.role === 'tells-sweep');
    body.steps.splice(i + 1, 0, { op: 'step', id: 'between', role: 'vision', block: 'VISION', actor: 'human', consumes: ['view'], produces: ['critique'] });
    await run(flat);
    expect(state.asked).not.toContain('select:tells-sweep');
    expect(state.asked).toContain('react:between');
    expect(state.swapped).toEqual(['words']);
    expect(predicted(flat)).toBe(false);
  });
});
