/**
 * RS (2026-10-08 external review, verified): the protocol's summary surfaces said external seed strings were untested.
 * String Seed of Thought v3 does compare external randomness with model-written strings (§5.1.2, a probabilistic-
 * instruction test; App. D.6, open-ended generation on NoveltyBench Curated with DeepSeek-R1-0528). What is untested is
 * the article's own setup: a shell-generated string driving a design workflow.
 *
 * The block prose (01 · SEED) had been narrowed once already, but the summaries never followed, because nothing tied
 * them to it. These checks do: no surface may repeat a blanket "untested" claim, the block's evidence names D.6 with its
 * model and benchmark, and every corrected statement is logged in protocol/04's Corrections, the protocol's own record
 * of changes, with its original wording.
 */
import { describe, expect, it } from 'vitest';
import { brokenLink, filesUnder, read, relativeLinks, section } from './docs.ts';

/** The statements the review found, exactly as they read before the correction. */
const ORIGINALS = [
  { surface: 'protocol/map/off-center-map.html', text: 'External seed strings untested; SSoT tested model-written strings' },
  { surface: 'protocol/map/off-center-map.html', text: 'the external-RNG variant is untested' },
  { surface: 'protocol/04-use-case-evidence.md', text: "The article's external shell-RNG variant is untested." },
  { surface: 'protocol/04-use-case-evidence.md', text: 'No test of external seed strings.' },
  { surface: 'protocol/README.md', text: 'The external shell-RNG seed. SSoT tested a seed string the model writes itself.' },
] as const;

/** Blanket shapes of the same claim, so a reworded copy is caught too. */
const BLANKET = [/external[\s-]+seed[\s-]+strings?[^.;]*untested/i, /no test of external seed/i, /external[\s-]+(?:shell[\s-]+)?RNG[\s-]+(?:variant|seed)[^.;·]*untested/i];

const CORRECTIONS_HEADING = '## Corrections';
const ROUND_3 = '**Round 3: post-release review (2026-10-08)**';

/** A protocol file's text without 04's Corrections section, which quotes the old wording on purpose. */
function readable(file: string): string {
  const text = read(file);
  if (file !== 'protocol/04-use-case-evidence.md') return text;
  return text.replace(section(text, CORRECTIONS_HEADING) ?? '', '');
}

/** The rows of the Round 3 table in 04's Corrections: its Original and Correction cells. */
function round3Rows(): { original: string; correction: string }[] {
  const corrections = section(read('protocol/04-use-case-evidence.md'), CORRECTIONS_HEADING) ?? '';
  const start = corrections.indexOf(ROUND_3);
  if (start < 0) return [];
  const rows: { original: string; correction: string }[] = [];
  for (const line of corrections.slice(start).split('\n').slice(1)) {
    if (line.startsWith('**')) break;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 2 || cells[0] === 'Original' || /^-+$/.test(cells[0] ?? '')) continue;
    rows.push({ original: cells[0] ?? '', correction: cells[1] ?? '' });
  }
  return rows;
}

describe('SEED evidence wording matches String Seed of Thought v3 (RS)', () => {
  const surfaces = filesUnder('protocol', /\.(md|html)$/);

  it('no protocol surface says external seed strings are untested', () => {
    expect(surfaces.length).toBeGreaterThan(8);
    const hits = surfaces.flatMap((file) => {
      const text = readable(file);
      const quoted = ORIGINALS.map((o) => o.text).filter((t) => text.includes(t));
      const reworded = BLANKET.filter((re) => re.test(text)).map(String);
      return [...quoted, ...reworded].map((hit) => `${file}: ${hit}`);
    });
    expect(hits).toEqual([]);
  });

  it("01 · SEED cites App. D.6 with its model and benchmark beside §5.1.2, and keeps the article's setup untested", () => {
    const evidence = section(read('protocol/01-blocks.md'), '## SEED · External Seeding')?.split('**Evidence.**')[1] ?? '';
    const ssot = evidence.split('\n- ').find((item) => item.includes('String Seed of Thought')) ?? '';
    expect(ssot).toContain('§5.1.2');
    expect(ssot).toContain('App. D.6');
    expect(ssot).toContain('DeepSeek-R1');
    expect(ssot).toContain('NoveltyBench Curated');
    expect(ssot).toMatch(/shell[^.]*not been tested directly/);
  });

  it('every corrected statement has a Round 3 row in 04 · Corrections, quoting its original wording and citing the source', () => {
    const rows = round3Rows();
    for (const { text } of ORIGINALS) expect(rows.filter((r) => r.original.includes(text)), text).toHaveLength(1);
    // The 01 · SEED evidence line gained App. D.6; that change is logged too.
    expect(rows.filter((r) => r.original.includes('01 · SEED'))).toHaveLength(1);
    for (const row of rows) expect(row.correction, row.original).toMatch(/§5\.1\.2|App\. D\.6/);
  });

  it("the corrected surfaces' links resolve (files and heading anchors)", () => {
    const files = ['protocol/01-blocks.md', 'protocol/04-use-case-evidence.md', 'protocol/README.md', 'docs/superpowers/specs/2026-10-07-product-v1-design.md'];
    const broken = files.flatMap((file) =>
      relativeLinks(read(file))
        .flatMap(({ target }) => brokenLink(file, target) ?? [])
        .map((why) => `${file}: ${why}`),
    );
    expect(broken).toEqual([]);
  });

  it("the product spec's SEED note cites D.6 as indirect evidence about the runner-injected string", () => {
    const spec = read('docs/superpowers/specs/2026-10-07-product-v1-design.md');
    const note = spec.split('\n').find((l) => l.startsWith('**SEED in the product.**')) ?? '';
    expect(note).toContain('App. D.6');
    expect(note).toMatch(/indirect/);
  });
});
