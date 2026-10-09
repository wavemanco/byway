/**
 * Templates held to what their steps execute (ADR-0090): C7's implement works from the spec when there is one and
 * names its requirements in the "Why:" the blind scope cut reads.
 */
import { describe, expect, it } from 'vitest';
import { parseTemplateFile } from '../src/index.ts';
import { FILES, library } from './library.ts';

describe('how many images an ASSET prompt asks for is its own to declare (F11)', () => {
  const briefs = FILES.filter((f) => f.template.output === 'image-briefs');

  it('every image-briefs template declares it, and the renderer hands it to the runner', () => {
    expect(briefs.map((f) => [f.name, f.template.images])).toEqual([
      ['article.ASSET.md', { min: 1, max: 3 }],
      ['helper.asset.briefs@media.md', 'each'],
      ['helper.asset.briefs@options.md', 'each'],
      ['helper.asset.briefs@prose.md', { min: 0, max: 3 }],
      ['helper.asset.briefs@web-page.md', { min: 1, max: 3 }],
      ['product.c2.mood-boards.md', 'each'],
      // D3: C3 keeps the model's "no image" answer (the owner's decision is pending), so its minimum is 0.
      ['product.c3.asset.md', { min: 0, max: 1 }],
      ['product.c5.anchor-frames.md', 'each'],
    ]);
    expect(library.render('product.c3.asset', { medium: 'prose', artifact: '# A piece' }).images).toEqual({ min: 0, max: 1 });
    expect(library.render('helper.asset.briefs', { medium: 'media', artifact: '{}' }).images).toBe('each');
    expect(library.render('product.c7.implement', { medium: 'code-diff', problem: 'p', brief: '' }).images).toBeUndefined();
  });

  it('one per shot or option only on media and options, whose work lists the shots or options', () => {
    for (const f of briefs) {
      const medium = f.template.medium ?? (f.name.includes('c5') ? 'media' : f.name.includes('c2') ? 'options' : 'other');
      expect(f.template.images === 'each', f.name).toBe(medium === 'media' || medium === 'options');
    }
  });

  it('a template offers an empty list exactly when its minimum is 0', () => {
    for (const f of briefs) {
      const offersNone = /empty list/i.test(f.raw.slice(f.raw.indexOf('## ')));
      const min = f.template.images === 'each' ? 1 : f.template.images!.min;
      expect(offersNone, f.name).toBe(min === 0);
    }
  });

  it('refuses a count on any other template, a missing one on an image-briefs template, and a range upside down', () => {
    const file = (output: string, images?: string) =>
      ['---', 'id: product.test.x', 'version: 1', 'fidelity: project', 'slots: artifact', `output: ${output}`, ...(images ? [`images: ${images}`] : []), 'source: test', '---', '## user', '{{artifact}}', ''].join('\n');
    expect(() => parseTemplateFile(file('image-briefs'), 'product.test.x.md')).toThrow(/must declare images/);
    expect(() => parseTemplateFile(file('plain-text', '1-3'), 'product.test.x.md')).toThrow(/only an image-briefs template/);
    expect(() => parseTemplateFile(file('image-briefs', '3-1'), 'product.test.x.md')).toThrow(/minimum above its maximum/);
    expect(() => parseTemplateFile(file('image-briefs', 'some'), 'product.test.x.md')).toThrow(/images/);
    expect(parseTemplateFile(file('image-briefs', '2-4'), 'product.test.x.md').images).toEqual({ min: 2, max: 4 });
  });
});

describe('C7 implement (F09)', () => {
  const render = (brief: string) => library.render('product.c7.implement', { medium: 'code-diff', problem: 'Make the export handle currencies.', brief });

  it('with a spec: shows it, and asks the “Why:” to name the requirements that shaped the change', () => {
    const p = render('1. Keep the CSV header? Default: yes.');
    expect(p.version).toBe(3);
    expect(p.user).toContain('<brief>\n1. Keep the CSV header? Default: yes.\n</brief>');
    expect(p.user).toMatch(/Name in it the requirements from the spec that shaped the change/);
  });

  it('without one: neither the spec section nor the instruction about it', () => {
    const p = render('');
    expect(p.user).not.toContain('<brief>');
    expect(p.user).not.toMatch(/requirements from the spec/);
  });
});
