/**
 * @byway/recipe's hasNoExecutor (ADR-0069) is the interpreter's own dispatch, written down: a tool step other than a
 * render and every policy step finish skipped with a plain note, whatever their role, and nothing else does. The
 * composed explainers read it to say "Not available in this version" (F08 round 4), so it must be what runs. The audio
 * ASSET's skip is the asset activity's, held in semantics-effects.test.ts. Driven through the real Interpreter with its
 * activities stubbed.
 */
import { describe, expect, it, vi } from 'vitest';
import { hasNoExecutor, ROLES, type Recipe, type Step } from '@byway/recipe';
import type { RunInput } from '../src/types.ts';

const state = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock('../src/workflow/acts.ts', () => {
  const respond = (name: string, input: { call?: { stepId: string } }): unknown => {
    const id = input.call?.stepId ?? '';
    state.calls.push(`${name}:${id}`);
    switch (name) {
      case 'modelStep':
        return { costUsd: 0, artifactId: `${id}-made` };
      case 'renderView':
        return { costUsd: 0, view: { pool: false, items: [{ imageArtifactIds: [] }] } };
      case 'storyboardShots':
        return [1];
      default:
        return { costUsd: 0 };
    }
  };
  const group = () => new Proxy({}, { get: (_t, name: string) => async (input: never) => respond(name, input) });
  return { quick: group(), model: group(), media: group() };
});

const { Interpreter } = await import('../src/workflow/interpreter.ts');

/** Run a draft and then the step; what the interpreter did with the step. */
async function ran(step: Step): Promise<string[]> {
  state.calls = [];
  const draft: Step = { op: 'step', id: 'draft', role: 'build', actor: 'model', tier: 'mid', prompt: 'p.d', consumes: ['intent'], produces: ['artifact'], writes: true };
  const recipe = { schema: 'byway.recipe/1', id: 'one-step', title: 't', kind: 'experimental', family: 'baseline', channel: 'protocol', medium: 'media', inputs: ['intent'], stages: [{ stage: 'D2', body: { op: 'seq', steps: [draft, step] } }], sitsOut: [], exceptions: [] } as unknown as Recipe;
  const input: RunInput = { runId: 'run-skip', workspaceId: 'ws', recipe, problem: { text: 'p' }, profileId: 'demo', budgetUsd: 5, medium: 'media', routes: {}, inputs: {} };
  const control = { boundary: async () => {}, machine: <T>(fn: () => Promise<T>) => fn(), track: <T>(fn: () => Promise<T>) => fn(), pending: new Map() };
  await new Interpreter(input, control as never).runStages();
  return state.calls.filter((c) => c.endsWith(`:${step.id}`)).map((c) => c.split(':')[0]!);
}

describe('a step finishes skipped exactly where hasNoExecutor says (ADR-0069)', () => {
  it.each((['tool', 'policy'] as const).flatMap((actor) => ROLES.map((role) => [actor, role] as const)))('a %s %s step', async (actor, role) => {
    const step: Step = { op: 'step', id: 's', role, actor, consumes: ['artifact'], produces: ['artifact'] };
    const calls = await ran(step);
    expect(calls.includes('skipStep'), calls.join(',')).toBe(hasNoExecutor(step));
    if (hasNoExecutor(step)) expect(calls).toEqual(['skipStep']);
  });
});
