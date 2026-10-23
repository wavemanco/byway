/**
 * The run says a script is locked only where it is (F08 round 4, ADR-0098): C5's early VOICE asks "It is locked after
 * this, and used exactly as you write it" because nothing the person writes later reaches the voice-over (the late
 * VOICE writes only the on-screen words). A composed C5 with a second script VOICE before the on-screen words lets
 * the person write the script again, so its first script VOICE says nothing about a lock. The second says it only
 * where nothing asks for it again: C5's launch check re-runs Refine and Finish on a fail, and the person is asked for
 * the script again; without that retry it is the last word on the script. A launch check that re-runs Explore asks
 * again for C5's own script. (The advisor's present.test admits each of these recipes.) The interpreter decides it from
 * the recipe at the step (@byway/recipe/semantics lockedScripts), as the composed explainers do. Driven through the
 * real Interpreter with its activities stubbed.
 */
import { describe, expect, it, vi } from 'vitest';
import { c5 } from '@byway/catalog';
import { lockedScripts, type Node, type OneShotGate, type Recipe, type Step } from '@byway/recipe';
import type { RunInput } from '../src/types.ts';
import { SCRIPT_LOCKED_PROMPT, SCRIPT_PROMPT } from '../src/workflow/wording.ts';
import { UNREAD_BRIEF } from './helpers/briefs.ts';

const state = vi.hoisted(() => ({ n: 0 }));

vi.mock('../src/workflow/acts.ts', () => {
  const respond = (name: string, input: { call?: { stepId: string }; step?: { role: string } }): unknown => {
    const id = input.call?.stepId ?? '';
    switch (name) {
      case 'modelStep': {
        const role = input.step?.role;
        if (role === 'dedupe') return { costUsd: 0, keepLabels: ['A', 'B', 'C', 'D'] };
        if (role === 'overlap') return { costUsd: 0, text: 'No overlap.' };
        if (role === 'check') return { costUsd: 0, text: 'No defects.' };
        if (role === 'critic') return { costUsd: 0, text: '- a gap', score: { kind: 'rank', rank: 1, of: 5 } };
        if (role === 'tells-sweep') return { costUsd: 0, text: '1. "delve" -> "dig"', hits: [{ pattern: 'delve', alternative: 'dig' }] };
        return { costUsd: 0, artifactId: `${id}-${++state.n}` };
      }
      case 'finishHumanStep':
        // A VOICE's answer comes back by the id of the file it was kept in (P2), as from the activity.
        return { costUsd: 0, text: 'words', artifactId: `${id}-${++state.n}`, voiceId: `words-${state.n}`, keep: 'B' };
      case 'renderView':
        return { costUsd: 0, view: { pool: false, items: [{ imageArtifactIds: [] }] } };
      case 'storyboardShots':
        return [1];
      case 'assetStep':
      case 'relayLink':
        return { costUsd: 0 };
      default:
        return undefined;
    }
  };
  const group = () => new Proxy({}, { get: (_t, name: string) => async (input: never) => respond(name, input) });
  return { quick: group(), model: group(), media: group() };
});

const { Interpreter } = await import('../src/workflow/interpreter.ts');

/** What the run asked at each write checkpoint, by step id, in order. */
async function writePrompts(recipe: Recipe): Promise<[string, string][]> {
  const asked: [string, string][] = [];
  const input: RunInput = { runId: 'run-lock', workspaceId: 'ws', recipe, problemId: UNREAD_BRIEF, profileId: 'demo', budgetUsd: 5, medium: recipe.medium ?? 'media', routes: {}, inputs: {} };
  const control = { boundary: async () => {}, machine: <T>(fn: () => Promise<T>) => fn(), track: <T>(fn: () => Promise<T>) => fn(), pending: new Map() };
  const engine = new Interpreter(input, control as never);
  Object.assign(engine, {
    ask: async (call: { stepId: string }, spec: { kind: string; prompt: string; options?: { id: string }[] }) => {
      if (spec.kind === 'write') asked.push([call.stepId, spec.prompt]);
      if (spec.kind === 'select') return { checkpointId: 'cp', choice: ['hit-1'] };
      if (spec.kind === 'confirm') return { checkpointId: 'cp', approved: true };
      return { checkpointId: 'cp', choice: [spec.options?.at(-1)?.id ?? 'A'], text: 'x' };
    },
  });
  await engine.runStages();
  return asked;
}

/** The recipe with its launch check re-running this stage on a fail, or never. */
function retrying(r: Recipe, stage: 'D1' | 'D2' | undefined): Recipe {
  const d3 = r.stages.find((x) => x.stage === 'D3')!.body as Extract<Node, { op: 'seq' }>;
  const gate = d3.steps.find((x): x is OneShotGate => x.op === 'gate')!;
  if (stage) gate.retry = { stage, times: 1 };
  else delete gate.retry;
  return r;
}

/** C5 with a second script VOICE right before its on-screen words (the round-2 verifier's composed recipe). */
function secondScript(): Recipe {
  const r = structuredClone(c5) as Recipe;
  const d3 = r.stages.find((x) => x.stage === 'D3')!.body as Extract<Node, { op: 'seq' }>;
  const i = d3.steps.findIndex((x) => x.op === 'step' && x.id === 'voice');
  const script = (r.stages[0]!.body as Extract<Node, { op: 'seq' }>).steps.find((x): x is Step => x.op === 'step' && x.id === 'vo-script')!;
  d3.steps[i] = { op: 'seq', steps: [{ ...script, id: 'script-again' }, d3.steps[i]!] };
  return r;
}

describe('the early VOICE says the script is locked only where nothing you write later can change it', () => {
  it('C5: the script is locked after it, and the late VOICE asks for the on-screen words', async () => {
    const asked = await writePrompts(structuredClone(c5) as Recipe);
    expect(asked.map(([id]) => id)).toEqual(['vo-script', 'voice']);
    expect(asked[0]![1]).toBe(SCRIPT_LOCKED_PROMPT);
    expect(asked[1]![1]).not.toMatch(/script|locked/);
  });

  it('a composed C5 that asks for the script again in Finish: neither script VOICE claims a lock, since the launch check can re-run Finish', async () => {
    const recipe = secondScript();
    const asked = await writePrompts(recipe);
    expect(asked.map(([id]) => id)).toEqual(['vo-script', 'script-again', 'voice']);
    expect(asked.slice(0, 2).map(([, p]) => p)).toEqual([SCRIPT_PROMPT, SCRIPT_PROMPT]);
    expect(SCRIPT_PROMPT).not.toMatch(/locked/);
    expect(lockedScripts(recipe).size).toBe(0);
  });

  it('… and without the launch check’s retry, the second is the last word on the script and says it is locked', async () => {
    const recipe = retrying(secondScript(), undefined);
    const asked = await writePrompts(recipe);
    expect(asked.map(([id]) => id)).toEqual(['vo-script', 'script-again', 'voice']);
    expect(asked[0]![1]).toBe(SCRIPT_PROMPT);
    expect(asked[1]![1]).toBe(SCRIPT_LOCKED_PROMPT);
    // The interpreter reads the shared semantics, so the explainers and the run say the same.
    expect([...lockedScripts(recipe)].map((x) => x.id)).toEqual(['script-again']);
  });

  it('a composed C5 whose launch check re-runs Explore asks for its one script again, so it claims no lock', async () => {
    const recipe = retrying(structuredClone(c5) as Recipe, 'D1');
    const asked = await writePrompts(recipe);
    expect(asked).toEqual([
      ['vo-script', SCRIPT_PROMPT],
      ['voice', expect.not.stringMatching(/locked/)],
    ]);
    expect(lockedScripts(recipe).size).toBe(0);
  });
});
