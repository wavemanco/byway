import { describe, expect, it } from 'vitest';
import { FILES, library, mediumOf, sampleSlots } from './library.ts';

/**
 * Template guarantees from the Phase 4 review: fences that survive nested code blocks (ENG-1), swap prompts that are
 * true about who chose the swaps (TELLS-1, convention C2), and storyboards that carry their on-screen copy (VOICE-1,
 * convention C4).
 */

const answerFormat = (raw: string) => raw.slice(raw.lastIndexOf('## Answer format'));

/**
 * Artifacts whose content can itself hold a fenced block: Markdown with code, a diff that touches Markdown, a page about
 * developer tools. The article's paraphrased prompts are left as they are: they are Study 1 instruments shared with the
 * research arms (C1-H), and the runner's fence reader handles longer fences whatever a prompt says.
 */
const FENCED = FILES.filter((f) => ['artifact:prose', 'artifact:code-diff', 'artifact:web-page'].includes(f.template.output) && !f.template.id.startsWith('article.'));

describe('nested fences (ENG-1)', () => {
  it('covers the prose, diff and page templates', () => {
    // 22 since the three voice.apply helpers of these media were retired (VOICE makes no model call, ADR-0081).
    expect(FENCED.length).toBeGreaterThanOrEqual(22);
  });

  it.each(FENCED.map((f) => [f.name, f] as const))('%s says to fence content that has its own fences with a longer fence', (_n, f) => {
    const format = answerFormat(f.raw);
    expect(format).toMatch(/three or more backticks/);
    expect(format).toMatch(/more backticks than the longest run/);
  });
});

/** Every step that applies TELLS swaps: the per-configuration ones and C1's runbook swap. */
const SWAPS = FILES.filter((f) => /\.apply-swaps$/.test(f.template.id) || f.template.id === 'runbook.tells-swap');

describe('swaps a person chose (TELLS-1, C2)', () => {
  it('covers C1, C3, C4, C5 and C7', () => {
    expect(SWAPS.map((f) => f.template.id).sort()).toEqual(['product.c3.apply-swaps', 'product.c4.apply-swaps', 'product.c5.apply-swaps', 'product.c7.apply-swaps', 'runbook.tells-swap']);
  });

  it.each(SWAPS.map((f) => [f.name, f] as const))('%s says a person chose these swaps, one by one, and names its provenance', (_n, f) => {
    const user = library.render(f.template.id, sampleSlots(mediumOf(f.template))).user;
    expect(user).toMatch(/chose these swaps/);
    // The runner asks which finds to swap before this step runs; only the chosen ones reach the critique slot.
    expect(f.template.source).toMatch(/chosen one by one/);
  });
});

const STORYBOARDS = FILES.filter((f) => f.template.output === 'artifact:media');

describe('storyboard on-screen copy (VOICE-1, C4)', () => {
  it.each(STORYBOARDS.map((f) => [f.name, f] as const))('%s shows the headline, tagline and per-shot caption in its shape', (_n, f) => {
    const format = answerFormat(f.raw);
    for (const field of ['"caption"', '"headline"', '"tagline"', '"voiceover"']) expect(format, field).toContain(field);
  });
});

describe('the C5 launch check says what its critic is shown (RENDER-1, BLIND-1)', () => {
  const id = 'product.c5.gate-critic';
  const render = (slots: Record<string, string>) => {
    const r = library.render(id, sampleSlots('media', slots));
    return `${r.system ?? ''}\n${r.user}`;
  };

  it('claims no feed mock and no served size, which v1 never renders, in either mode', () => {
    for (const text of [render({ refs: '4', view: '### A\nShot 1' }), render({ refs: '4', view: '' }), render({ refs: '', view: 'Shot 1' })]) {
      expect(text).not.toMatch(/as they appear in a feed|in a feed\.|at its served size|as its audience meets it/);
      expect(text).toMatch(/as they were generated/);
    }
  });

  it('names the form the lineup takes: every ad as one sheet, or every storyboard written out', () => {
    expect(render({ refs: '4', view: '' })).toMatch(/Each ad is attached as one image after a line naming its label/);
    const written = render({ refs: '4', view: '### A\nShot 1' });
    expect(written).toMatch(/Each ad's storyboard is written out under its label/);
    expect(written).not.toMatch(/attached as one image/);
  });
});
