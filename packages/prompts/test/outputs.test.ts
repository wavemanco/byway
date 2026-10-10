import { describe, expect, it } from 'vitest';
import { MEDIA } from '@byway/contracts';
import { OUTPUT_CONTRACTS, OUTPUT_IDS, outputForPurpose, outputForStep } from '../src/outputs.ts';

describe('output contracts (spec §3.3)', () => {
  it('names one contract per row of the §3.3 table, plus catalog text and v1-skipped steps', () => {
    expect([...OUTPUT_IDS].sort()).toEqual(
      [
        ...MEDIA.map((m) => `artifact:${m}`),
        'catalog',
        'choice',
        'critique',
        'cut',
        'dedupe',
        'defects',
        'image-briefs',
        'intake',
        'keep',
        'none',
        'overlap',
        'plain-text',
        'recipe',
        'relay',
        'tells-hits',
      ].sort(),
    );
    for (const id of OUTPUT_IDS) expect(OUTPUT_CONTRACTS[id].length).toBeGreaterThan(5);
  });

  it.each([
    ['build:web-page', 'artifact:web-page'],
    ['seed:options', 'artifact:options'],
    ['fix:code-diff', 'artifact:code-diff'],
    ['asset.integrate:prose', 'artifact:prose'],
    ['voice.apply:media', 'artifact:media'],
    ['critic:prose', 'critique'],
    ['judge:web-page', 'choice'],
    ['select:prose', 'choice'],
    ['rerank:web-page', 'choice'],
    ['check:media', 'defects'],
    ['cut:prose', 'cut'],
    ['tells-sweep:code-diff', 'tells-hits'],
    ['tells-compare:web-page', 'keep'],
    ['vision:options', 'plain-text'],
    ['asset.briefs:media', 'image-briefs'],
    ['asset:web-page', 'image-briefs'],
    ['dedupe:options', 'dedupe'],
    ['overlap:prose', 'overlap'],
    ['relay:media', 'relay'],
    ['advisor.intake', 'intake'],
    ['advisor.compose', 'recipe'],
    ['advisor.compose.repair', 'recipe'],
  ])('%s answers as %s', (purpose, output) => {
    expect(outputForPurpose(purpose)).toBe(output);
  });

  it('rejects purposes it does not know', () => {
    expect(() => outputForPurpose('dance:prose')).toThrow(/purpose/);
    expect(() => outputForPurpose('build')).toThrow(/medium/);
    expect(() => outputForPurpose('build:poster')).toThrow(/medium/);
  });

  it('maps recipe steps by role and medium; an ASSET step that turns the voice into audio has no v1 call', () => {
    expect(outputForStep({ role: 'build', consumes: ['intent'] }, 'prose')).toBe('artifact:prose');
    expect(outputForStep({ role: 'asset', consumes: ['artifact'] }, 'web-page')).toBe('image-briefs');
    expect(outputForStep({ role: 'asset', consumes: ['voice', 'artifact'] }, 'media')).toBe('none');
    expect(outputForStep({ role: 'relay', consumes: ['anchor', 'artifact'] }, 'media')).toBe('relay');
    // A model VOICE or render is parsed as the work by the runner (ADR-0092 stage 4); admission refuses a model VOICE.
    expect(outputForStep({ role: 'voice', consumes: ['artifact'] }, 'prose')).toBe('artifact:prose');
    expect(outputForStep({ role: 'render', consumes: ['artifact'] }, 'web-page')).toBe('artifact:web-page');
  });
});
