/**
 * A person's reaction that consumes and produces the same text port revises it in place (ADR-0090): C7's spec answers
 * the interview's questions in the brief they came in, so the questions, the answers and the defaults left alone reach
 * implement together. Keyed on the step's shape; the e2e (text-media.ts) runs it through the workflow.
 *
 * What the person is asked is keyed on the brief, not on the step (R-C7 in the approved P2 design): "Answer the
 * questions below in place…" shows only when the brief being revised came from the interview prompt, and any other brief
 * revised in place gets the general question. Driven through the real Interpreter with its activities stubbed.
 */
import { describe, expect, it, vi } from 'vitest';
import { c7, PROTOCOL_CONFIGS } from '@byway/catalog';
import { seq, step, steps, type Node, type Recipe, type Step } from '@byway/recipe';
import type { RunInput } from '../src/types.ts';
import { humanPrompt, QUESTION_BRIEF_PROMPTS, revisesInPlace, SPEC_IN_PLACE_PROMPT } from '../src/workflow/wording.ts';
import { UNREAD_BRIEF } from './helpers/briefs.ts';

vi.mock('../src/workflow/acts.ts', () => {
  const respond = (name: string, input: { call?: { stepId: string }; resolution?: { text?: string } }): unknown => {
    switch (name) {
      case 'modelStep':
        return { costUsd: 0, text: `1. Must the header stay? Default: yes. (by ${input.call?.stepId})` };
      case 'finishHumanStep':
        return { costUsd: 0, text: input.resolution?.text ?? '' };
      default:
        return undefined;
    }
  };
  const group = () => new Proxy({}, { get: (_t, name: string) => async (input: never) => respond(name, input) });
  return { quick: group(), model: group(), media: group() };
});

const { Interpreter } = await import('../src/workflow/interpreter.ts');

const GENERAL = 'Revise this brief in place: change what you want and leave the rest. What you send is the brief the next step works from.';
const spec = step({ id: 'spec', role: 'vision', block: 'VISION', actor: 'human', consumes: ['brief'], produces: ['brief'], variant: 'VISION-lite' });
const interview = (prompt = 'product.c7.interview', id = 'interview'): Step => step({ id, role: 'vision', block: 'VISION', actor: 'model', tier: 'mid', prompt, consumes: ['intent'], produces: ['brief'] });

/** What the run asked at each reaction, by step id, in order: the person answers by sending the box back with a line added. */
async function reactPrompts(body: Node): Promise<[string, string][]> {
  const asked: [string, string][] = [];
  const recipe: Recipe = { schema: 'byway.recipe/1', id: 'in-place', title: 'In place', kind: 'experimental', family: 'test', channel: 'workspace', medium: 'code-diff', inputs: ['intent'], stages: [{ stage: 'D1', body }], sitsOut: [], exceptions: [], bank: false };
  const input: RunInput = { runId: 'run-in-place', workspaceId: 'ws', recipe, problemId: UNREAD_BRIEF, profileId: 'demo', budgetUsd: 5, medium: 'code-diff', routes: {}, inputs: {} };
  const control = { boundary: async () => {}, machine: <T>(fn: () => Promise<T>) => fn(), track: <T>(fn: () => Promise<T>) => fn(), pending: new Map() };
  const engine = new Interpreter(input, control as never);
  Object.assign(engine, {
    ask: async (call: { stepId: string }, cp: { kind: string; prompt: string; initialText?: string }) => {
      if (cp.kind === 'confirm') return { checkpointId: 'cp', approved: true };
      asked.push([call.stepId, cp.prompt]);
      return { checkpointId: 'cp', text: `${cp.initialText ?? ''}\nMy answer.` };
    },
  });
  await engine.runStages();
  return asked;
}

describe('which person’s steps revise a port in place', () => {
  it('in the catalog only C7’s spec does: C4’s brief and C6’s reaction write a port they did not read', () => {
    const revising = PROTOCOL_CONFIGS.flatMap((r) => steps(r).filter(({ step: s }) => s.actor === 'human' && revisesInPlace(s)).map(({ step: s }) => `${r.id}/${s.id}`));
    expect(revising).toEqual(['c7/spec']);
  });

  it('asks to answer the questions in place when the brief is a list of them, and to revise any other brief or direction', () => {
    expect(humanPrompt(spec, undefined, 'questions')).toBe(SPEC_IN_PLACE_PROMPT);
    expect(SPEC_IN_PLACE_PROMPT).toMatch(/^Answer the questions below in place, or change their defaults/);
    // Keyed on the brief, not on the step: the VISION-lite variant alone no longer makes it a question list.
    expect(humanPrompt(spec, undefined, true)).toBe(GENERAL);
    expect(humanPrompt({ ...spec, variant: undefined }, undefined, 'questions')).toBe(SPEC_IN_PLACE_PROMPT);
    const taste = step({ id: 'react', role: 'vision', actor: 'human', consumes: ['taste'], produces: ['taste'] });
    expect(humanPrompt(taste, undefined, true)).toMatch(/^Revise this direction in place/);
    expect(humanPrompt(taste, undefined, 'questions')).toMatch(/^Revise this direction in place/);
  });

  it('with no text to revise, asks as it always did', () => {
    expect(humanPrompt(spec)).toBe('In a few lines, in your own words: what is this for, and what is the one point it must land?');
  });
});

describe('the brief revised in place is asked about by where it came from (the interpreter)', () => {
  it('C7’s spec after its interview answers the questions in place, as the catalog runs it', async () => {
    expect(QUESTION_BRIEF_PROMPTS).toEqual(new Set(['product.c7.interview']));
    expect(await reactPrompts(c7.stages.find((s) => s.stage === 'D1')!.body)).toEqual([['spec', SPEC_IN_PLACE_PROMPT]]);
  });

  it('a composed VISION-lite reaction after a brief that is not the interview’s gets the general question', async () => {
    expect(await reactPrompts(seq(interview('product.c7.sharpen', 'sharpen'), spec))).toEqual([['spec', GENERAL]]);
  });

  it('the person’s answers are a brief, not the interview’s list: a second reaction in place gets the general question', async () => {
    expect(await reactPrompts(seq(interview(), spec, { ...spec, id: 'spec-again' }))).toEqual([
      ['spec', SPEC_IN_PLACE_PROMPT],
      ['spec-again', GENERAL],
    ]);
  });

  it('a brief the interview wrote and another step wrote over is asked about as a brief', async () => {
    expect(await reactPrompts(seq(interview(), interview('product.c7.sharpen', 'sharpen'), spec))).toEqual([['spec', GENERAL]]);
  });
});
