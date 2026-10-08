import { describe, expect, it } from 'vitest';
import { ARTIFACT_FENCE, GREAT_MIN_REFERENCES, greatLineup, imagesSlot, labelled, labelOf, problemSlot, vanillaLabelled } from '../src/slots.ts';

describe('slot helpers (spec §3.3 shared conventions)', () => {
  it('labels items A, B, C… and continues past Z', () => {
    expect([0, 1, 25, 26, 27].map(labelOf)).toEqual(['A', 'B', 'Z', 'AA', 'AB']);
    expect(() => labelOf(-1)).toThrow();
  });

  it('lays out options under "### A" headings', () => {
    expect(labelled(['First idea', 'Second idea'])).toBe('### A\nFirst idea\n\n### B\nSecond idea');
  });

  it('lays out unseeded (vanilla) runs under "### V1" headings', () => {
    expect(vanillaLabelled(['one', 'two', 'three'])).toBe('### V1\none\n\n### V2\ntwo\n\n### V3\nthree');
  });

  it('describes a GREAT-mode lineup as R references and "M items, labelled A–X", never saying which is ours (ADR-0072)', () => {
    expect(greatLineup(4)).toEqual({ refs: '4', labels: '5 items, labelled A–E' });
    expect(greatLineup(9)).toEqual({ refs: '9', labels: '10 items, labelled A–J' });
    for (const r of [3, 4, 12, 30]) expect(greatLineup(r).labels).not.toMatch(/\bours?\b/i);
    // ADR-0071: GREAT mode needs at least three references; with fewer the runner uses OK mode (blank refs).
    expect(GREAT_MIN_REFERENCES).toBe(3);
    expect(() => greatLineup(2)).toThrow(/at least 3 references/);
    expect(() => greatLineup(3.5)).toThrow(/at least 3 references/);
  });

  it('lists generated images by their artifact route: Markdown images for prose, "address | alt | slot" lines for pages', () => {
    const images = [
      { artifactId: 'art_1', alt: 'A loaf on a board', slot: 'hero' },
      { artifactId: 'art_2', alt: 'Hands kneading', slot: 'detail' },
    ];
    expect(imagesSlot('prose', images)).toBe('![A loaf on a board](/api/artifacts/art_1)\n![Hands kneading](/api/artifacts/art_2)');
    expect(imagesSlot('web-page', images)).toBe('/api/artifacts/art_1 | A loaf on a board | hero\n/api/artifacts/art_2 | Hands kneading | detail');
    expect(() => imagesSlot('code-diff', images)).toThrow(/integrate/);
  });

  it('keeps alt text on one line and free of the separators it is written between', () => {
    expect(imagesSlot('web-page', [{ artifactId: 'a', alt: 'x | y\nz', slot: 'hero' }])).toBe('/api/artifacts/a | x / y z | hero');
    expect(imagesSlot('prose', [{ artifactId: 'a', alt: 'see [this]', slot: '' }])).toBe('![see (this)](/api/artifacts/a)');
  });

  it('builds the problem slot from a problem brief, attachments fenced', () => {
    const text = problemSlot({
      text: 'Our onboarding email gets no replies.',
      deliverable: 'an email',
      audience: 'new trial users',
      constraints: ['under 120 words', 'no discount'],
      attachments: [{ name: 'current.md', text: 'Hi there,\n```\ncode\n```' }],
    });
    expect(text).toBe(
      [
        'Our onboarding email gets no replies.',
        '',
        'Deliverable: an email',
        'Audience: new trial users',
        'Constraints:',
        '- under 120 words',
        '- no discount',
        '',
        'Attachment: current.md',
        '````',
        'Hi there,',
        '```',
        'code',
        '```',
        '````',
      ].join('\n'),
    );
    expect(problemSlot({ text: '  Just this.  ' })).toBe('Just this.');
  });

  it('names the fence language of each medium\'s artifact', () => {
    expect(ARTIFACT_FENCE).toEqual({ 'web-page': 'html', prose: 'markdown', options: 'json', media: 'json', 'code-diff': 'diff' });
  });
});
