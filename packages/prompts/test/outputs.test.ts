import { describe, expect, it } from 'vitest';
import { MEDIA } from '@byway/contracts';
import { OUTPUT_CONTRACTS, OUTPUT_IDS, outputForPurpose, outputForStep } from '../src/outputs.ts';
import { FILES } from './library.ts';

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

  it('image-briefs names C3’s optional line of advice beside the images, and every image-briefs template answers in its fields', () => {
    const contract = OUTPUT_CONTRACTS['image-briefs'];
    // Optional, as the media contract marks its optional fields; only a template that says advice: yes asks for it (ADR-0101).
    expect(contract).toMatch(/\],"advice"\?:string\}/);
    const keys = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap(keys) : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...keys(x)]) : []);
    const briefs = FILES.filter((f) => f.template.output === 'image-briefs');
    expect(briefs.map((f) => f.name)).toContain('product.c3.asset.md');
    for (const f of briefs) {
      const shape = f.raw.slice(f.raw.indexOf('## Answer format')).split('\n').find((l) => l.trim().startsWith('{"images"'));
      expect(shape, f.name).toBeDefined();
      for (const k of keys(JSON.parse(shape!))) expect(contract, `${f.name}: "${k}"`).toContain(`"${k}"`);
    }
  });

  it.each([
    ['build:web-page', 'artifact:web-page'],
    ['seed:options', 'artifact:options'],
    ['fix:code-diff', 'artifact:code-diff'],
    ['asset.integrate:prose', 'artifact:prose'],
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
    // VOICE writes the person's copy back with no model call (ADR-0081), and its helper is retired: no voice.apply.
    for (const m of MEDIA) expect(() => outputForPurpose(`voice.apply:${m}`)).toThrow(/Unknown purpose "voice\.apply:/);
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
