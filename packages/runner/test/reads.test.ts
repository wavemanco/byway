/**
 * Optional reads in the runner (ADR-0089): a step's `reads` reach its activities, and its prompt gets each read port's
 * slot as it gets a consumed port's: the port's value when an earlier step made it, else empty, so the template's
 * {{#if}} section leaves it out.
 */
import { describe, expect, it } from 'vitest';
import { step } from '@byway/recipe';
import { ArtifactReader, buildPrompt } from '../src/activities/prompting.ts';
import { briefFile } from '../src/stored-inputs.ts';
import { toStepSpec } from '../src/types.ts';

const implement = step({ id: 'implement', role: 'build', actor: 'model', tier: 'mid', prompt: 'product.c7.implement', consumes: ['intent'], reads: ['brief'], produces: ['artifact'], writes: true });
/** The run's brief, as Runner.start stores it (stored-inputs.ts), in a store that holds only it. */
const problemId = `sha256:${'a'.repeat(64)}`;
const reader = new ArtifactReader({ store: { artifacts: { getText: async (id: string) => (id === problemId ? briefFile({ text: 'Trim the formatter' }) : '') } } as never });

describe('a step that reads a port when it is there', () => {
  it('hands its reads to the activities', () => {
    expect(toStepSpec(implement).reads).toEqual(['brief']);
    expect('reads' in toStepSpec({ ...implement, reads: undefined })).toBe(false);
  });

  it('fills the read port’s slot with its value when an earlier step made it, and empty when none did', async () => {
    const spec = toStepSpec(implement);
    const brief = '1. What must not change? Default: the CSV header.';
    const made = await buildPrompt(reader, { medium: 'code-diff', problemId, step: spec, ports: { brief } });
    expect(made.slots.brief).toBe(brief);
    expect(made.slots.problem).toContain('Trim the formatter');
    const absent = await buildPrompt(reader, { medium: 'code-diff', problemId, step: spec, ports: {} });
    expect(absent.slots.brief).toBe('');
  });
});
