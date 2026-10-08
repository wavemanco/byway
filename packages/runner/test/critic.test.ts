/**
 * CRITIC modes, lineups and verdicts without Temporal: which note a fallback carries (LABEL-2); a lineup whose items
 * all take one form, with nothing that gives ours away and nothing nested under the lineup's labels (ENG-7,
 * BLIND-1); web pages shown by their named surfaces, references too (RENDER-1); and the rank a GREAT critic hands its
 * gate, with the lineup size the gate's threshold was written for (GATE-1).
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Gateway } from '@byway/contracts';
import { buildLineup, CARD_NOTE, FEW_REFS_NOTE, OK_FALLBACK_NOTE, planCritic, verdictOf, type Lineup } from '../src/activities/critic.ts';
import type { RunnerDeps } from '../src/activities/deps.ts';
import { ArtifactReader, userMessage } from '../src/activities/prompting.ts';
import { textView } from '../src/formats.ts';
import { sectionOf } from '../src/parse.ts';
import { SURFACE_CAPTIONS } from '../src/surfaces.ts';
import type { View } from '../src/types.ts';
import { fakePages, fakeShots, png, type FakePages } from './helpers/fake-pages.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

let dir: string;
let store: MemoStore;
let deps: RunnerDeps;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-critic-'));
  store = createTestStore({ dataDir: dir });
  deps = { gateway: {} as Gateway, store, prompts: fakePrompts(), pages: fakePages() };
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const headings = (text: string) => [...text.matchAll(/^#{1,6}[ \t]+([A-Z]{1,2})[ \t]*$/gm)].map((m) => m[1]);

describe('a GREAT lineup: every item one block, in one form, nothing that gives ours away', () => {
  it('a pooled view (C2’s option set) is one item under one label, its options numbered, not labelled (ENG-7)', async () => {
    const pool = await Promise.all(['1. Fix-it Fridays: weekly repair nights\n   Why: habit', '1. Parts club: members get parts at cost\n   Why: loyalty', '1. Ride clinic: tune-ups on the trail\n   Why: reach'].map((t) => store.artifacts.putText(t, 'text/plain')));
    const view: View = { pool: true, items: pool.map((r) => ({ textArtifactId: r.id, imageArtifactIds: [] })) };
    const refs = await Promise.all([1, 2, 3].map((i) => store.artifacts.putText(JSON.stringify({ options: [{ title: `Prior art ${i}`, pitch: 'Known', rationale: 'Worked' }] }), 'application/json')));
    const lineup = await buildLineup(deps, new ArtifactReader(deps), 'options', { view }, refs.map((r) => r.id), () => 0.3);
    expect(headings(lineup.slots.view!)).toEqual(lineup.labels);
    const ours = sectionOf(lineup.slots.view!, lineup.ours)!;
    expect(ours).toContain('1. Fix-it Fridays');
    expect(ours).toContain('3. Ride clinic');
  });

  it('a storyboard against image references is drawn by its frames only: no words, no image prompts, no process lines (BLIND-1)', async () => {
    const frames = await Promise.all([1, 2, 3].map(async (c) => (await store.artifacts.put(png(4, 3, [c, 2, 3]), 'image/png')).id));
    const board = (await store.artifacts.putText('Shot 1 (3s): Open on hands.\n   Frame: Close-up of hands, morning light\n   Clip: made\n\nVoice-over: Less time.', 'text/plain')).id;
    const view: View = { pool: false, items: [{ textArtifactId: board, imageArtifactIds: frames }] };
    const refs = await Promise.all([10, 20, 30, 40].map(async (c) => (await store.artifacts.put(png(4, 3, [c, c, c]), 'image/png')).id));
    const lineup = await buildLineup(deps, new ArtifactReader(deps), 'media', { view }, refs, () => 0.6);
    expect(lineup.form).toBe('cards');
    // Media judges see frames (MEDIUM_FORMAT): with every item an image, the view slot has no text at all.
    expect(lineup.slots.view).toBe('');
    const ours = cardOf(lineup, lineup.ours);
    for (const f of frames) expect(ours).toContain(encodeURIComponent(f));
    expect(ours).not.toMatch(/Open on hands|Frame:|Clip:|Voice-over/);
  });

  it('a storyboard read as text never shows how it was made (BLIND-1)', async () => {
    const sb = { storyboard: [{ shot: 1, description: 'Open on hands.', imagePrompt: 'Close-up, morning light', durationSec: 3, caption: 'Again?', clipArtifactId: 'sha256:x' }], voiceover: 'Less time.', headline: 'Time, handed back.' };
    const text = textView('media', JSON.stringify(sb));
    expect(text).toBe('Headline: Time, handed back.\n\nShot 1 (3s): Open on hands.\n   On screen: Again?\n\nVoice-over: Less time.');
  });

  it('a web page and its HTML references are shown by the same named surfaces, under their labels (RENDER-1)', async () => {
    const shot = async (c: number) => (await store.artifacts.put(png(4, 3, [c, 0, 0]), 'image/png')).id;
    const view: View = { pool: false, items: [{ imageArtifactIds: [], surfaces: [{ surface: 'desktop', imageArtifactIds: [await shot(1)] }, { surface: 'mobile', imageArtifactIds: [await shot(2)] }, { surface: 'fold', imageArtifactIds: [await shot(3)] }] }] };
    const refs = await Promise.all([1, 2, 3].map((i) => store.artifacts.putText(`<!doctype html><html><body><h1>Ref ${i}</h1></body></html>`, 'text/html')));
    const reader = new ArtifactReader(deps);
    const lineup = await buildLineup(deps, reader, 'web-page', { view }, refs.map((r) => r.id), () => 0.1, true, ['desktop', 'mobile']);
    for (const label of lineup.labels) {
      expect(lineup.images.filter((g) => g.label === label).map((g) => g.caption)).toEqual([SURFACE_CAPTIONS.desktop, SURFACE_CAPTIONS.mobile]);
    }
    const message = await userMessage(reader, 'Rank them.', lineup.images);
    const texts = message.content.flatMap((p) => (p.type === 'text' ? [p.text] : []));
    expect(texts.filter((t) => /^### [A-D]$/.test(t))).toEqual(lineup.labels.map((l) => `### ${l}`));
  });
});

describe('every item of a GREAT lineup reaches the critic in the same number and kind of parts (BLIND-1)', () => {
  const frame = async (c: number) => (await store.artifacts.put(png(16, 9, [c, 1, 2]), 'image/png')).id;
  const image = async (c: number) => (await store.artifacts.put(png(4, 3, [c, c, c]), 'image/png')).id;
  const text = async (t: string, mediaType = 'text/plain') => (await store.artifacts.putText(t, mediaType)).id;
  const storyboardRef = (i: number) => text(JSON.stringify({ storyboard: [{ shot: 1, description: `Reference ad ${i} opens on a mug`, imagePrompt: `ref prompt ${i}`, durationSec: 3 }], voiceover: `Ref VO ${i}` }), 'application/json');
  const ourBoard = async () => {
    const frames = [await frame(1), await frame(2), await frame(3)];
    const board = await text('Shot 1 (3s): Open on hands.\n\nShot 2 (3s): The cup.\n\nVoice-over: Less time.');
    return { frames, view: { pool: false, items: [{ textArtifactId: board, imageArtifactIds: frames }] } satisfies View };
  };
  const ourPage = async (wideTiles = 2) => {
    const view: View = { pool: false, items: [{ imageArtifactIds: [], surfaces: [{ surface: 'desktop', imageArtifactIds: (await Promise.all([7, 8].map(frame))).slice(0, wideTiles) }, { surface: 'mobile', imageArtifactIds: [await frame(9)] }, { surface: 'fold', imageArtifactIds: [await frame(10)] }] }] };
    return view;
  };
  const ourProse = async () => ({ pool: false, items: [{ textArtifactId: await text('# Memo\n\nThe migration is on track, <b>mostly</b>.'), imageArtifactIds: [] }] }) satisfies View;

  const scenarios: [string, () => Promise<{ medium: 'media' | 'prose' | 'web-page'; view: View; refs: string[] }>, 'cards' | 'text' | 'surfaces'][] = [
    ['a storyboard against four image references (the re-check)', async () => ({ medium: 'media', view: (await ourBoard()).view, refs: [await image(10), await image(20), await image(30), await image(40)] }), 'cards'],
    ['a storyboard against four storyboard references (the re-check)', async () => ({ medium: 'media', view: (await ourBoard()).view, refs: [await storyboardRef(1), await storyboardRef(2), await storyboardRef(3), await storyboardRef(4)] }), 'text'],
    ['a storyboard against images and text', async () => ({ medium: 'media', view: (await ourBoard()).view, refs: [await image(10), await storyboardRef(1), await image(30), await text('A plain description of a great ad.')] }), 'cards'],
    ['prose against image references', async () => ({ medium: 'prose', view: await ourProse(), refs: [await image(10), await image(20), await image(30)] }), 'cards'],
    ['prose against text references', async () => ({ medium: 'prose', view: await ourProse(), refs: [await text('# One\n\nClear.'), await text('# Two\n\nShort.'), await text('# Three\n\nPlain.')] }), 'text'],
    ['a web page against image references', async () => ({ medium: 'web-page', view: await ourPage(), refs: [await image(10), await image(20), await image(30)] }), 'cards'],
    ['a web page against pages given as HTML', async () => ({ medium: 'web-page', view: await ourPage(1), refs: await Promise.all([1, 2, 3].map((i) => text(`<!doctype html><html><body><h1>Ref ${i}</h1></body></html>`, 'text/html'))) }), 'surfaces'],
  ];

  it.each(scenarios)('%s', async (_name, make, form) => {
    const { medium, view, refs } = await make();
    const reader = new ArtifactReader(deps);
    for (const draw of [0.05, 0.5, 0.95]) {
      const lineup = await buildLineup(deps, reader, medium, { view }, refs, () => draw);
      expect(lineup.form).toBe(form);
      const shapes = await shapesOf(reader, lineup);
      // The same parts under every label, ours included, wherever ours lands.
      expect(new Set(Object.values(shapes)).size, JSON.stringify(shapes)).toBe(1);
      expect(Object.keys(shapes)).toEqual(lineup.labels);
      if (form === 'cards') {
        expect(shapes[lineup.ours]).toBe(JSON.stringify({ text: viewTextOf(medium), images: ['image/png'], captions: [] }));
        // One card per item, drawn by one template.
        for (const g of lineup.images) expect(g.artifactIds).toHaveLength(1);
        for (const label of lineup.labels) expect(cardOf(lineup, label)).toMatch(/^<!doctype html>.*class="card"/s);
      }
      if (form === 'text') expect(lineup.images).toEqual([]);
    }
  });

  it('a card shows a text reference and our words escaped, and a page one under another as the page', async () => {
    const refs = [await image(10), await text('<script>alert(1)</script> & a great ad'), await image(30)];
    const { frames, view } = await ourBoard();
    const lineup = await buildLineup(deps, new ArtifactReader(deps), 'media', { view }, refs, () => 0.5);
    const cards = lineup.labels.map((l) => cardOf(lineup, l));
    expect(cards.join('')).not.toContain('<script>');
    expect(cards.some((c) => c.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; a great ad'))).toBe(true);
    // A reference has text here, so ours is shown with its words too, under its frames.
    const ours = cardOf(lineup, lineup.ours);
    expect(ours).toContain('Shot 2 (3s): The cup.');
    for (const f of frames) expect(ours).toContain(encodeURIComponent(f));
    const page = await buildLineup(deps, new ArtifactReader(deps), 'web-page', { view: await ourPage() }, [await image(10), await image(20), await image(30)], () => 0.5);
    expect(cardOf(page, page.ours)).toContain('class="stack"');
  });
});

/** The card page a lineup item was drawn from (the fake renderer remembers every page it rendered). */
function cardOf(lineup: Lineup, label: string): string {
  const id = lineup.images.find((g) => g.label === label)!.artifactIds[0]!;
  const rendered = (deps.pages as FakePages).rendered;
  for (const html of rendered) {
    const bytes = fakeShots(html, 'desktop').tiles[0]!;
    if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` === id) return html;
  }
  throw new Error(`no card was rendered for ${label}`);
}

/** What a text critic reads under each label of a card lineup: nothing for a screenshot medium, a placeholder else. */
const viewTextOf = (medium: string) => (medium === 'prose' ? CARD_NOTE : null);

/** Each label's parts as the critic receives them: its text in the view slot, its images' types and their captions. */
async function shapesOf(reader: ArtifactReader, lineup: Lineup): Promise<Record<string, string>> {
  const message = await userMessage(reader, 'Rank them.', lineup.images);
  const parts: Record<string, { images: string[]; captions: string[] }> = Object.fromEntries(lineup.labels.map((l) => [l, { images: [], captions: [] }]));
  let label: string | undefined;
  for (const p of message.content.slice(1)) {
    if (p.type === 'text') {
      const heading = /^### ([A-Z]{1,2})$/.exec(p.text);
      if (heading) label = heading[1];
      else parts[label!]!.captions.push(p.text);
    } else parts[label!]!.images.push(p.mediaType);
  }
  const view = lineup.slots.view ?? '';
  return Object.fromEntries(
    lineup.labels.map((l) => {
      const section = view ? (sectionOf(view, l) ?? null) : null;
      // In a text lineup every item has its own words: what matters is that each has some, in the same slot.
      const text = lineup.form === 'text' ? (section?.trim() ? 'text' : 'none') : section;
      return [l, JSON.stringify({ text, ...parts[l]! })];
    }),
  );
}

describe('our section of a lineup critique is the top-level one (ENG-7)', () => {
  it('takes the shallowest heading for the label, not an inner one of the same name', () => {
    const critique = '## A\n- Generic.\n\n## B\n#### Option 1\n- Fine.\n### A\n- inner\n\n## C\n- Plain.';
    expect(sectionOf(critique, 'A')).toBe('- Generic.');
    expect(sectionOf('### A\n- inner\n# A\n- outer', 'A')).toBe('- outer');
  });
});

const great = { knobs: { mode: 'GREAT', refs: 4 } };
const random = () => 0.5;

describe('the OK fallback says what was supplied (LABEL-2)', () => {
  it('no examples: the ADR-0071 note; one or two: says fewer than three were given', () => {
    expect(planCritic(great, [], random)).toMatchObject({ mode: 'OK', note: OK_FALLBACK_NOTE });
    expect(planCritic(great, ['a'], random)).toMatchObject({ mode: 'OK', note: FEW_REFS_NOTE });
    expect(planCritic(great, ['a', 'b'], random)).toMatchObject({ mode: 'OK', note: FEW_REFS_NOTE });
    expect(FEW_REFS_NOTE).toMatch(/^Fewer than three examples were supplied/);
    expect(planCritic(great, ['a', 'b', 'c'], random)).toMatchObject({ mode: 'GREAT' });
  });
});

describe('a GREAT verdict names the lineup its gate was written for (GATE-1)', () => {
  it('carries the refs knob plus ours with our rank', () => {
    const lineup: Lineup = { slots: {}, images: [], labels: ['A', 'B', 'C', 'D'], ours: 'B', form: 'text' };
    const v = verdictOf([{ answer: { mode: 'GREAT', critique: '### B\n- gap', ranking: ['A', 'B', 'C', 'D'] }, lineup }], 5);
    expect(v.score).toEqual({ kind: 'rank', rank: 2, of: 4, writtenFor: 5 });
  });
});
