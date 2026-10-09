/**
 * A person's reaction that consumes and produces the same text port revises it in place (ADR-0090): C7's spec answers
 * the interview's questions in the brief they came in, so the questions, the answers and the defaults left alone reach
 * implement together. Keyed on the step's shape; the e2e (text-media.ts) runs it through the workflow.
 */
import { describe, expect, it } from 'vitest';
import { PROTOCOL_CONFIGS } from '@byway/catalog';
import { step, steps } from '@byway/recipe';
import { humanPrompt, revisesInPlace, SPEC_IN_PLACE_PROMPT } from '../src/workflow/wording.ts';

describe('which person’s steps revise a port in place', () => {
  it('in the catalog only C7’s spec does: C4’s brief and C6’s reaction write a port they did not read', () => {
    const revising = PROTOCOL_CONFIGS.flatMap((r) => steps(r).filter(({ step: s }) => s.actor === 'human' && revisesInPlace(s)).map(({ step: s }) => `${r.id}/${s.id}`));
    expect(revising).toEqual(['c7/spec']);
  });

  it('asks C7’s spec to answer the questions in place, and a composed step of the same shape to revise its text', () => {
    const spec = step({ id: 'spec', role: 'vision', block: 'VISION', actor: 'human', consumes: ['brief'], produces: ['brief'], variant: 'VISION-lite' });
    expect(humanPrompt(spec, undefined, true)).toBe(SPEC_IN_PLACE_PROMPT);
    expect(SPEC_IN_PLACE_PROMPT).toMatch(/^Answer the questions below in place, or change their defaults/);
    const plain = { ...spec, variant: undefined };
    expect(humanPrompt(plain, undefined, true)).toMatch(/^Revise this brief in place/);
    const taste = step({ id: 'react', role: 'vision', actor: 'human', consumes: ['taste'], produces: ['taste'] });
    expect(humanPrompt(taste, undefined, true)).toMatch(/^Revise this direction in place/);
  });

  it('with no text to revise, asks as it always did', () => {
    const spec = step({ id: 'spec', role: 'vision', block: 'VISION', actor: 'human', consumes: ['brief'], produces: ['brief'], variant: 'VISION-lite' });
    expect(humanPrompt(spec)).toBe('In a few lines, in your own words: what is this for, and what is the one point it must land?');
  });
});
