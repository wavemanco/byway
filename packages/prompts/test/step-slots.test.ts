/**
 * slotsForStep (ADR-0092): the composed profile renders a step's template with exactly the slots the runner fills for
 * it, so a template that needs a slot the step will not fill is refused before a paid run. Every catalog model step's
 * template renders with its own slots and answers its role's output contract.
 */
import { describe, expect, it } from 'vitest';
import type { PromptSlot } from '@byway/contracts';
import { outputForStep, slotsForStep } from '../src/index.ts';
import { library, PROMPT_STEPS } from './library.ts';

const filled = (slots: Set<PromptSlot>, medium: string): Partial<Record<PromptSlot, string>> =>
  Object.fromEntries([...slots].map((s) => [s, s === 'medium' ? medium : `SLOT_${s.toUpperCase()}`]));

describe('slotsForStep', () => {
  it.each(PROMPT_STEPS.map((p) => [`${p.recipe.id} ${p.step.id}`, p] as const))('%s: its template renders with exactly its slots and answers its contract', (_name, p) => {
    const prompt = p.step.prompt as string;
    expect(() => library.render(prompt, filled(slotsForStep(p.step, p.medium), p.medium))).not.toThrow();
    expect(library.info(prompt, p.medium).output).toBe(outputForStep(p.step, p.medium));
  });

  it('fills a consumed port, never the artifact for a judging step, and the role conventions', () => {
    expect([...slotsForStep({ role: 'fix', consumes: ['critique', 'artifact'] }, 'prose')].sort()).toEqual(['artifact', 'critique', 'medium']);
    expect(slotsForStep({ role: 'critic', consumes: ['view', 'artifact'] }, 'prose').has('artifact')).toBe(false);
    expect(slotsForStep({ role: 'critic', consumes: ['view', 'refs'] }, 'prose').has('labels')).toBe(true);
    expect(slotsForStep({ role: 'critic', consumes: ['view'] }, 'prose').has('refs')).toBe(false);
    expect(slotsForStep({ role: 'seed', consumes: ['intent'] }, 'prose').has('seed')).toBe(true);
    expect(slotsForStep({ role: 'asset', consumes: ['artifact'] }, 'options').has('options')).toBe(true);
    expect(slotsForStep({ role: 'build', consumes: ['intent'] }, 'prose').has('round')).toBe(false);
  });

  it('fills a port the step reads when it is there, as the runner does (ADR-0089)', () => {
    expect([...slotsForStep({ role: 'build', consumes: ['intent'], reads: ['brief'] }, 'code-diff')].sort()).toEqual(['brief', 'medium', 'problem']);
    expect(slotsForStep({ role: 'critic', consumes: ['view'], reads: ['artifact'] }, 'prose').has('artifact')).toBe(false);
  });

  it('a fix that does not read the critique cannot run a template that needs it', () => {
    expect(() => library.render('product.c3.revise', filled(slotsForStep({ role: 'fix', consumes: ['artifact'] }, 'prose'), 'prose'))).toThrow(/critique/);
  });
});
