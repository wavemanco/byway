/**
 * Templates held to what their steps execute (ADR-0090): C7's implement works from the spec when there is one and
 * names its requirements in the "Why:" the blind scope cut reads. C3's header image is made when the writer says Yes,
 * and the AI's view of it is one optional line of advice (ADR-0101).
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
      // D3 (ADR-0101): the writer's Yes decides, so C3's prompt asks for exactly one image.
      ['product.c3.asset.md', { min: 1, max: 1 }],
      ['product.c5.anchor-frames.md', 'each'],
      // C5's anchor step in a run with no video model: a still per shot (F12 (b), 2026-10-31).
      ['product.c5.shot-frames.md', 'each'],
    ]);
    expect(library.render('product.c3.asset', { medium: 'prose', artifact: '# A piece' }).images).toEqual({ min: 1, max: 1 });
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

describe('a line of advice for the person is the prompt’s to ask for (D3, ADR-0101)', () => {
  const briefs = FILES.filter((f) => f.template.output === 'image-briefs');
  const file = (output: string, extra: string[]) =>
    ['---', 'id: product.test.x', 'version: 1', 'fidelity: project', 'slots: artifact', `output: ${output}`, ...extra, 'source: test', '---', '## user', '{{artifact}}', ''].join('\n');

  it('only C3’s header-image prompt asks for one; the renderer says so there and nowhere else', () => {
    expect(FILES.filter((f) => f.template.advice).map((f) => f.name)).toEqual(['product.c3.asset.md']);
    expect(library.render('product.c3.asset', { medium: 'prose', artifact: '# A piece' }).advice).toBe(true);
    expect(library.render('article.ASSET', { medium: 'web-page', artifact: '<p>A page</p>' })).not.toHaveProperty('advice');
    expect(library.render('helper.asset.briefs', { medium: 'prose', artifact: '# A piece' })).not.toHaveProperty('advice');
  });

  it('a template’s answer format names an advice field exactly when it declares one', () => {
    for (const f of briefs) expect(/"advice"/.test(f.raw.slice(f.raw.indexOf('## '))), f.name).toBe(f.template.advice);
  });

  it('is declared as "advice: yes", on an image-briefs template only', () => {
    expect(parseTemplateFile(file('image-briefs', ['images: 1-1', 'advice: yes']), 'product.test.x.md').advice).toBe(true);
    expect(parseTemplateFile(file('image-briefs', ['images: 1-1']), 'product.test.x.md').advice).toBe(false);
    expect(() => parseTemplateFile(file('image-briefs', ['images: 1-1', 'advice: no']), 'product.test.x.md')).toThrow(/advice/);
    expect(() => parseTemplateFile(file('plain-text', ['advice: yes']), 'product.test.x.md')).toThrow(/only an image-briefs template asks for advice/);
  });
});

describe('C3’s header image (D3, ADR-0101)', () => {
  const p = library.render('product.c3.asset', { medium: 'prose', artifact: '# A piece' });

  it('v3: says the writer asked for the image and asks for one brief, with no way to answer with none', () => {
    expect(p.version).toBe(3);
    expect(p.user).toMatch(/^The writer asked for a header image for this piece:/);
    expect(p.user).toMatch(/Write a brief for one header image\./);
    expect(p.user).not.toMatch(/empty list|no image at all|up to 1/i);
  });

  it('the AI’s view is advice for the writer, never a reason to leave the brief out', () => {
    expect(p.user).toMatch(/put it in `advice`/);
    expect(p.user).toMatch(/Write the brief all the same: the writer decides, and can cut the image afterwards\./);
    expect(p.user).toMatch(/`advice` \(optional\): one short sentence for the writer, at most 200 characters, in plain words\. Leave it out when you have none\./);
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
