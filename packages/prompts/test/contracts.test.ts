import { describe, expect, it } from 'vitest';
import { ARTIFACT_FENCE, type OutputId } from '../src/index.ts';
import { FILES, library, mediumOf, sampleSlots } from './library.ts';

/**
 * Every template states its exact output contract (spec §3.3), in a closing "## Answer format" section, so the
 * runner's parsers and the gateway's mock responders can rely on one shape.
 */

/** Words each contract's answer-format section must contain. */
const MARKERS: Record<OutputId, string[]> = {
  'artifact:web-page': ['```html', 'HTML document'],
  'artifact:prose': ['```markdown'],
  'artifact:options': ['```json', '"options"', '"title"', '"pitch"', '"rationale"'],
  'artifact:media': ['```json', '"storyboard"', '"shot"', '"description"', '"imagePrompt"', '"durationSec"', '"caption"', '"voiceover"', '"headline"', '"tagline"'],
  'artifact:code-diff': ['```diff', 'Why:'],
  critique: ['Score: N/10'],
  choice: ['Choice:'],
  defects: ['No defects.'],
  cut: ['Remove', 'Delete', 'Drop', 'Merge', 'Nothing to remove.'],
  'tells-hits': ['```json', '"hits"', '"pattern"', '"where"', '"alternative"'],
  keep: ['Keep: A', 'Keep: B'],
  'plain-text': ['plain text'],
  'image-briefs': ['```json', '"images"', '"slot"', '"prompt"', '"alt"', '"size"', '1024x1024', '1536x1024', '1024x1536'],
  intake: ['```json', '"answers"', '"questionId"', '"answer"', '"confidence"', '"rationale"', '"routes"'],
  recipe: ['```json', 'byway.recipe/1'],
  dedupe: ['```json', '"keep"', '"merged"', '"into"', '"from"'],
  overlap: ['```json', '"flags"', '"label"', '"overlapsWith"', '"note"'],
  relay: ['```json', '"clipPrompt"', '"durationSec"'],
  catalog: [],
  none: [],
};

/**
 * A GREAT-mode critic's answer format (ADR-0072): every item's critique under its "### X" heading, then a last line
 * ranking every label once, best first.
 */
const GREAT_MARKERS = ['### A', 'Intent:', 'Ranking:', 'every label', 'once', 'best first', 'Ranking: C, A, E, B, D'];

const answering = FILES.filter((f) => !['catalog', 'none'].includes(f.template.output));
const critics = FILES.filter((f) => f.template.output === 'critique');

/** Render a template both ways a critic can run (with and without references) or once for everything else. */
function renders(f: (typeof FILES)[number]): { mode: string; user: string; system: string }[] {
  const medium = mediumOf(f.template);
  const modes = f.template.slots.includes('refs') ? [{ mode: 'GREAT', refs: '4' }, { mode: 'OK', refs: '' }] : [{ mode: 'only' }];
  return modes.map(({ mode, ...extra }) => {
    const r = library.render(f.template.id, sampleSlots(medium, extra));
    return { mode, user: r.user, system: r.system ?? '' };
  });
}

describe('output contracts in the templates', () => {
  it.each(answering.map((f) => [f.name, f] as const))('%s ends with an answer-format section that states its contract', (_n, f) => {
    for (const { mode, user } of renders(f)) {
      const at = user.lastIndexOf('## Answer format');
      expect(at, `${mode}: no "## Answer format" section`).toBeGreaterThan(0);
      const tail = user.slice(at);
      const markers = f.template.output === 'critique' && mode === 'GREAT' ? GREAT_MARKERS : MARKERS[f.template.output];
      for (const marker of markers) expect(tail.toLowerCase(), `${mode}: missing ${marker}`).toContain(marker.toLowerCase());
      // Slot values come before the answer format, so nothing the user pasted can follow the instructions…
      for (const m of user.matchAll(/SLOT_[A-Z]+/g)) expect(m.index, `${mode}: ${m[0]} after the answer format`).toBeLessThan(at);
      // …and the format names a fence at most once, so it never opens a block a parser could mistake for the work.
      expect(tail.split('```').length - 1, mode).toBeLessThanOrEqual(1);
    }
  });

  it.each(critics.map((f) => [f.name, f] as const))('critic %s branches on refs: GREAT mode ranks the whole lineup, OK mode scores', (_n, f) => {
    expect(f.template.slots).toContain('refs');
    expect(f.template.version, 'the GREAT branch changed with ADR-0072').toBeGreaterThanOrEqual(2);
    const [great, ok] = renders(f);
    const g = `${great?.system}\n${great?.user}`;
    const o = `${ok?.system}\n${ok?.user}`;
    expect(g).toMatch(/\bGREAT\b/);
    expect(g).toContain('There are 4 references and 1 of ours (SLOT_LABELS).');
    // It ranks every item and critiques every item, because it is not told which one is ours (ADR-0072).
    expect(g).toMatch(/Rank every \w+ by polish and taste/);
    expect(g).toMatch(/For each \w+:/);
    expect(g).toMatch(/not told which \w+ that is/);
    expect(g).toContain('Ranking:');
    expect(g).not.toMatch(/Rank: N of M|Score: N\/10/);
    expect(o).not.toMatch(/\bGREAT\b/);
    expect(o).not.toMatch(/Rank: N of M|Ranking:|references and 1 of ours/);
    expect(o).toContain('Score: N/10');
    // The article's critic: infer the intended aesthetic, picture a top studio's execution, name the biggest gaps.
    for (const text of [g, o]) {
      expect(text).toMatch(/going for/i);
      expect(text).toMatch(/top studio/i);
      expect(text).toMatch(/biggest gaps|weaknesses/i);
    }
  });

  it.each(FILES.filter((f) => f.template.slots.includes('problem')).map((f) => [f.name, f] as const))('%s puts the problem inside <problem>…</problem>', (_n, f) => {
    expect(f.raw).toMatch(/<problem>\n\{\{problem\}\}\n<\/problem>/);
  });

  it.each(FILES.filter((f) => f.template.slots.includes('artifact') && f.template.output !== 'recipe').map((f) => [f.name, f] as const))(
    '%s gives the current artifact as one fenced block in its medium\'s language',
    (_n, f) => {
      const medium = mediumOf(f.template);
      expect(medium, f.name).toBeDefined();
      const lang = ARTIFACT_FENCE[medium as keyof typeof ARTIFACT_FENCE];
      expect(f.raw).toContain(`\`\`\`${lang}\n{{artifact}}\n\`\`\``);
    },
  );

  it('advisor templates give the chooser questions and recipes as fenced JSON', () => {
    expect(FILES.find((f) => f.template.id === 'advisor.intake')?.raw).toContain('```json\n{{questions}}\n```');
    for (const id of ['advisor.compose', 'advisor.compose.repair']) expect(FILES.find((f) => f.template.id === id)?.raw).toContain('```json\n{{nearest}}\n```');
    expect(FILES.find((f) => f.template.id === 'advisor.compose.repair')?.raw).toContain('```json\n{{artifact}}\n```');
  });
});
