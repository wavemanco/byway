/**
 * CRITIC modes, lineups and verdicts without Temporal: which note a fallback carries (LABEL-2); a lineup whose items
 * all take one form, with nothing that gives ours away and nothing nested under the lineup's labels (ENG-7,
 * BLIND-1); web pages shown by their named surfaces, references too (RENDER-1); and the rank a GREAT critic hands its
 * gate, with the lineup size the gate's threshold was written for (GATE-1). On cards, a critic that reads text gets
 * every item's whole words under its label, and an image-only critic's cards cut words only visibly, with the cut
 * kept for retries and said once in the verdict's note for the step (F13, ADR-0087; the step's own note carries it
 * once model-step.ts appends it, which one test below is marked pending for).
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CompletionRequest, CompletionResult, Gateway } from '@byway/contracts';
import { buildLineup, CARD_NOTE, cutNote, FEW_REFS_NOTE, OK_FALLBACK_NOTE, planCritic, verdictOf, WORDS_UNDER_LABEL, type Lineup } from '../src/activities/critic.ts';
import { StepError } from '../src/activities/failures.ts';
import type { RunnerDeps } from '../src/activities/deps.ts';
import { modelStep } from '../src/activities/model-step.ts';
import { ArtifactReader, userMessage } from '../src/activities/prompting.ts';
import { CARD_MAX_HEIGHT } from '../src/cards.ts';
import { textView, viewKindOf } from '../src/formats.ts';
import { sectionOf } from '../src/parse.ts';
import { SURFACE_CAPTIONS } from '../src/surfaces.ts';
import type { PageRenderer } from '../src/pages.ts';
import type { RunRef, StepSpec, View } from '../src/types.ts';
import { storeBrief } from './helpers/briefs.ts';
import { fakePages, fakeShots, modelShownText, png, type FakePages } from './helpers/fake-pages.ts';
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
      expect(Object.keys(shapes)).toEqual(lineup.labels);
      if (form === 'cards' && viewKindOf(medium) === 'text') {
        // A critic that reads text gets words under a label exactly when its item has words (F13): ours here, and
        // never the image references. Every label still has one card image, drawn by one template.
        expect(shapes[lineup.ours]).toBe(JSON.stringify({ text: 'words', images: ['image/png'], captions: [] }));
        for (const label of lineup.labels.filter((l) => l !== lineup.ours)) expect(shapes[label]).toBe(JSON.stringify({ text: 'note', images: ['image/png'], captions: [] }));
      } else {
        // The same parts under every label, ours included, wherever ours lands.
        expect(new Set(Object.values(shapes)).size, JSON.stringify(shapes)).toBe(1);
      }
      if (form === 'cards') {
        if (viewKindOf(medium) === 'screenshots') expect(shapes[lineup.ours]).toBe(JSON.stringify({ text: null, images: ['image/png'], captions: [] }));
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

/** The card page a lineup item was drawn from (the fake renderers remember every page they rendered). */
function cardOf(lineup: Lineup, label: string): string {
  const id = lineup.images.find((g) => g.label === label)!.artifactIds[0]!;
  const pages = deps.pages as FakePages | MeasuringPages;
  if ('byId' in pages) return pages.byId.get(id) ?? fail(`no card was rendered for ${label}`);
  for (const html of pages.rendered) {
    const bytes = fakeShots(html, 'desktop').tiles[0]!;
    if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` === id) return html;
  }
  return fail(`no card was rendered for ${label}`);
}

const fail = (message: string): never => {
  throw new Error(message);
};

interface MeasuringPages extends PageRenderer {
  rendered: string[];
  /** The page each one-tile render came from, by the id its PNG is stored under. */
  byId: Map<string, string>;
}

/**
 * A renderer that measures as a browser would, without one: each paragraph of words takes a row per 100 characters,
 * 17 px a row, and the rest of the card 200 px; tiled at CARD_MAX_HEIGHT, each tile's colour from the page. `tiles`
 * overrides the count, for a renderer whose cards never fit.
 */
function measuringPages(tiles?: number): MeasuringPages {
  const rendered: string[] = [];
  const byId = new Map<string, string>();
  const shots = (html: string): Uint8Array[] => {
    const rows = [...html.matchAll(/<p class="(?:text|cut)"[^>]*>([^<]*)<\/p>/g)].reduce((n, m) => n + Math.max(1, Math.ceil(m[1]!.replace(/&[a-z#0-9]+;/g, '_').length / 100)), 0);
    const height = Math.max(900, 200 + rows * 17);
    const h = createHash('sha256').update(html).digest();
    const count = tiles ?? Math.ceil(height / CARD_MAX_HEIGHT);
    return Array.from({ length: count }, (_, i) => png(8, i < count - 1 ? CARD_MAX_HEIGHT : Math.max(1, height - (count - 1) * CARD_MAX_HEIGHT), [h[0]!, h[1]!, (h[2]! + i) % 256]));
  };
  return {
    rendered,
    byId,
    async render(html, _resolve, surfaces) {
      rendered.push(html);
      const out = shots(html);
      if (out.length === 1) byId.set(`sha256:${createHash('sha256').update(out[0]!).digest('hex')}`, html);
      return surfaces.map((surface) => ({ surface, tiles: out }));
    },
    async screenshots(html) {
      return shots(html);
    },
    // PageRenderer.ready (ADR-0084): this fake renderer is always ready.
    async ready() {},
    // PageRenderer.shownText (ADR-0081): the page reader's own model, as the e2e scenarios' fake renderer answers.
    async shownText(html) {
      return modelShownText(html);
    },
    async close() {},
  };
}

/**
 * Each label's words in a labelled view, split at the lineup's own headings in label order, so an item's inner
 * headings (a memo's `# Title`) stay in its section.
 */
function sectionsOf(view: string, labels: readonly string[]): Record<string, string | undefined> {
  const lines = view.split('\n');
  const starts: number[] = [];
  for (const label of labels) starts.push(lines.indexOf(`### ${label}`, (starts.at(-1) ?? -1) + 1));
  return Object.fromEntries(labels.map((l, i) => [l, starts[i]! < 0 ? undefined : lines.slice(starts[i]! + 1, i + 1 < labels.length ? starts[i + 1] : undefined).join('\n').trim()]));
}

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
      const section = view ? (sectionsOf(view, lineup.labels)[l] ?? null) : null;
      // In a text lineup every item has its own words: what matters is that each has some, in the same slot. On
      // cards, a label carries its item's words or the note that its image shows it.
      const text = lineup.form === 'text' ? (section?.trim() ? 'text' : 'none') : section === null ? null : section === CARD_NOTE ? 'note' : 'words';
      return [l, JSON.stringify({ text, ...parts[l]! })];
    }),
  );
}

describe('a card lineup shows every word or says what it left out (F13)', () => {
  const image = async (c: number) => (await store.artifacts.put(png(4, 3, [c, c, c]), 'image/png')).id;
  const text = async (t: string) => (await store.artifacts.putText(t, 'text/plain')).id;
  /** About 30,000 characters of ordinary prose that ends in a sentinel. */
  const longRef = () => text(`${'Every spring the river takes a little more of the bank, and the town argues about it again. '.repeat(330)}REF-END-SENTINEL`);
  const ourProse = async () => ({ pool: false, items: [{ textArtifactId: await text(`The migration is on track.\n\n${'Our plan holds, and the numbers say why. '.repeat(120)}OURS-END-SENTINEL`), imageArtifactIds: [] }] }) satisfies View;
  const labelShowing = (lineup: Lineup, id: string) => lineup.labels.find((l) => cardOf(lineup, l).includes(encodeURIComponent(id)))!;
  const labelReading = (lineup: Lineup, words: string) => lineup.labels.find((l) => sectionsOf(lineup.slots.view!, lineup.labels)[l]?.includes(words))!;
  /** A run in the store, so the lineup's cards are kept under it as a step's are. */
  const aRun = async (id: string) => (await store.createRun({ id, workspaceId: (await store.ensureDefaultWorkspace()).id, recipeId: 'tiny', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium: 'media', budgetUsd: 5 })).id;
  const answerFor = (lineup: Lineup) => ({ answer: { mode: 'GREAT' as const, critique: lineup.labels.map((l) => `### ${l}\n- Gap.`).join('\n\n'), ranking: lineup.labels }, lineup });

  it('a critic that reads text gets every item’s whole words under its label, an image the note, and one card each', async () => {
    const reader = new ArtifactReader(deps);
    const picture = await image(10);
    const long = await longRef();
    const lineup = await buildLineup(deps, reader, 'prose', { view: await ourProse() }, [picture, long, await text('A short reference, plainly put.')], () => 0.5);
    expect(lineup.form).toBe('cards');
    const view = lineup.slots.view!;
    expect(view).toContain('OURS-END-SENTINEL');
    expect(view).toContain('REF-END-SENTINEL');
    expect(sectionsOf(view, lineup.labels)[labelShowing(lineup, picture)]).toBe(CARD_NOTE);
    // One card image under every label; a card for an item with words says where its words are, and holds none.
    for (const label of lineup.labels) expect(lineup.images.filter((g) => g.label === label).flatMap((g) => g.artifactIds)).toHaveLength(1);
    expect(cardOf(lineup, lineup.ours)).toContain(WORDS_UNDER_LABEL);
    expect(cardOf(lineup, lineup.ours)).not.toContain('OURS-END-SENTINEL');
    expect(cardOf(lineup, labelShowing(lineup, picture))).not.toContain(WORDS_UNDER_LABEL);
    // Ours and the long text reference reach the critic in the same shape.
    const shapes = await shapesOf(reader, lineup);
    expect(shapes[lineup.ours]).toBe(shapes[labelReading(lineup, 'REF-END-SENTINEL')]);
    expect(lineup.cut).toEqual([]);
  });

  it('the words under a text item’s label on cards are the words the text form gives it', async () => {
    const reader = new ArtifactReader(deps);
    const view = await ourProse();
    const long = await longRef();
    const short = await text('A short reference, plainly put.');
    const cards = await buildLineup(deps, reader, 'prose', { view }, [await image(10), long, short], () => 0.5);
    const texts = await buildLineup(deps, reader, 'prose', { view }, [long, short, await text('Another reference.')], () => 0.5);
    expect([cards.form, texts.form]).toEqual(['cards', 'text']);
    for (const words of ['REF-END-SENTINEL', 'OURS-END-SENTINEL', 'plainly put']) {
      expect(sectionsOf(cards.slots.view!, cards.labels)[labelReading(cards, words)]).toBe(sectionsOf(texts.slots.view!, texts.labels)[labelReading(texts, words)]);
    }
  });

  it('whether a label carries words follows whether its item has words, never whether it is ours', async () => {
    const reader = new ArtifactReader(deps);
    // Prose with an illustration against image references only: ours is drawn by its picture, as they are (BLIND-1).
    const illustration = await image(5);
    const view: View = { pool: false, items: [{ textArtifactId: await text('An illustrated piece. OURS-END-SENTINEL'), imageArtifactIds: [illustration] }] };
    const lineup = await buildLineup(deps, reader, 'prose', { view }, [await image(10), await image(20), await image(30)], () => 0.5);
    expect(lineup.form).toBe('cards');
    expect(lineup.slots.view).not.toContain('OURS-END-SENTINEL');
    for (const label of lineup.labels) expect(sectionsOf(lineup.slots.view!, lineup.labels)[label]).toBe(CARD_NOTE);
    expect(cardOf(lineup, lineup.ours)).toContain(encodeURIComponent(illustration));
    expect(cardOf(lineup, lineup.ours)).not.toContain(WORDS_UNDER_LABEL);
  });

  it('an image-only critic’s card cuts words visibly, and the cut is recorded for the item, never for its label', async () => {
    deps.pages = measuringPages();
    const reader = new ArtifactReader(deps);
    const frames = [await image(1), await image(2), await image(3)];
    const long = await longRef();
    const view: View = { pool: false, items: [{ textArtifactId: await text('Shot 1 (3s): Open on hands.\n\nVoice-over: Less time.'), imageArtifactIds: frames }] };
    const lineup = await buildLineup(deps, reader, 'media', { view }, [await image(10), long, await image(30)], () => 0.5);
    expect(lineup.form).toBe('cards');
    expect(lineup.slots.view).toBe('');
    const card = cardOf(lineup, lineup.labels.find((l) => cardOf(lineup, l).includes('Every spring'))!);
    expect(card).not.toContain('REF-END-SENTINEL');
    expect(card).toMatch(/\[… [\d,]+ more words not shown\]/);
    expect(lineup.cut).toEqual([{ item: { ref: long }, unit: 'words', shown: expect.any(Number), total: 5_941, begins: 'Every spring the river takes a…' }]);
    expect(lineup.cut[0]!.shown).toBeLessThan(5_941);
    // Ours fitted whole, so it is not in the record, and its words are on its card.
    expect(cardOf(lineup, lineup.ours)).toContain('Voice-over: Less time.');
  });

  it('a cut is kept with its card: the same run gives the same record and note again, without drawing again', async () => {
    const pages = measuringPages();
    deps.pages = pages;
    const reader = new ArtifactReader(deps);
    const frames = [await image(1), await image(2)];
    const view: View = { pool: false, items: [{ textArtifactId: await text(`Shot 1 (3s): Open on hands.\n\nVoice-over: ${'Less time, more of it. '.repeat(1_300)}`), imageArtifactIds: frames }] };
    const refs = [await image(10), await longRef(), await image(30)];
    const runId = await aRun('run-cut');
    const first = await buildLineup(deps, reader, 'media', { view }, refs, () => 0.5, true, undefined, runId);
    const renders = pages.rendered.length;
    const again = await buildLineup(deps, new ArtifactReader(deps), 'media', { view }, refs, () => 0.5, true, undefined, runId);
    expect(pages.rendered.length).toBe(renders);
    expect(again.images).toEqual(first.images);
    expect(again.cut).toEqual(first.cut);
    expect(first.cut.map((c) => c.item)).toEqual(expect.arrayContaining(['ours', { ref: refs[1] }]));
    expect(verdictOf([answerFor(again)]).note).toBe(verdictOf([answerFor(first)]).note);
  });

  it('the note names the cut items once over the step’s shuffles, as the person knows them, never by label', async () => {
    deps.pages = measuringPages();
    const reader = new ArtifactReader(deps);
    const frames = [await image(1), await image(2)];
    const view: View = { pool: false, items: [{ textArtifactId: await text(`Shot 1 (3s): Open on hands.\n\nVoice-over: ${'Less time, more of it. '.repeat(1_300)}`), imageArtifactIds: frames }] };
    const refs = [await image(10), await longRef(), await image(30)];
    const runId = await aRun('run-note');
    const shuffles = [await buildLineup(deps, reader, 'media', { view }, refs, () => 0.1, true, undefined, runId), await buildLineup(deps, reader, 'media', { view }, refs, () => 0.9, true, undefined, runId)];
    expect(shuffles[0]!.ours).not.toBe(shuffles[1]!.ours);
    const { note } = verdictOf(shuffles.map(answerFor));
    expect(note).toMatch(/^The outside critic was not shown all the text: it saw the first [\d,]+ of [\d,]+ words of your work and the first [\d,]+ of 5,941 words of the example that begins “Every spring the river takes a…”\.$/);
    expect(note!.match(/your work/g)).toHaveLength(1);
    expect(note!.match(/Every spring/g)).toHaveLength(1);
    expect(note).not.toMatch(/\b[A-D]\b/);
    // Nothing cut, nothing said.
    expect(verdictOf([answerFor({ ...shuffles[0]!, cut: [] })]).note).toBeUndefined();
  });

  it('the note says a cut in the unit the card cut by, and reads plainly whatever the count', () => {
    const with_ = (cut: Lineup['cut']): Lineup => ({ slots: {}, images: [], labels: ['A', 'B', 'C', 'D'], ours: 'A', form: 'cards', cut });
    expect(cutNote([with_([{ item: { ref: 'x' }, unit: 'characters', shown: 9_000, total: 20_000, begins: '春眠不觉晓…' }])])).toBe(
      'The outside critic was not shown all the text: it saw the first 9,000 of 20,000 characters of the example that begins “春眠不觉晓…”.',
    );
    expect(cutNote([with_([{ item: 'ours', unit: 'words', shown: 0, total: 1 }])])).toBe('The outside critic was not shown all the text: it saw none of the text of your work (1 word).');
    expect(cutNote([with_([{ item: { ref: 'x' }, unit: 'words', shown: 0, total: 5_941, begins: 'Every spring the river takes a…' }])])).toBe(
      'The outside critic was not shown all the text: it saw none of the text of the example that begins “Every spring the river takes a…” (5,941 words).',
    );
  });

  describe('a GREAT critic step whose card was cut', () => {
    const criticStep: StepSpec = { id: 'critic', role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'product.test.critic', consumes: ['view'], produces: ['critique', 'score'], knobs: { mode: 'GREAT', refs: 3 } };
    const ranked = '### A\n- Gap.\n\n### B\n- Gap.\n\n### C\n- Gap.\n\n### D\n- Gap.\n\nRanking: A, B, C, D';

    /** One media critic step against an image, the long text reference and an image, with a renderer that measures. */
    async function criticStepWithACut() {
      const pages = measuringPages();
      const requests: CompletionRequest[] = [];
      const gateway = {
        demo: false,
        async complete(req: CompletionRequest): Promise<CompletionResult> {
          requests.push(req);
          return { text: ranked, stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0, ledgerEntryId: `l${requests.length}` };
        },
        spend: async (id: string) => ({ workspaceId: id, spentUsd: 0, capUsd: 100, byRun: {} }),
      } as unknown as Gateway;
      const stepDeps: RunnerDeps = { gateway, store, prompts: fakePrompts(), pages, random: () => 0.5 };
      const runId = await aRun('run-step-note');
      await store.updateRun(runId, { status: 'running' });
      const run: RunRef = { runId, workspaceId: (await store.ensureDefaultWorkspace()).id, recipeId: 'tiny', profileId: 'demo', medium: 'media', problemId: await storeBrief(store.artifacts, { text: 'An ad' }), seeds: [] };
      const view: View = { pool: false, items: [{ textArtifactId: await text('Shot 1 (3s): Open on hands.\n\nVoice-over: Less time.'), imageArtifactIds: [await image(1), await image(2)] }] };
      const refs = [await image(10), await longRef(), await image(30)];
      const out = await modelStep(stepDeps, { run, call: { key: `${runId}/critic/-/1`, stepId: 'critic', stage: 'D1' }, step: criticStep, ports: { view }, refs });
      const notes = (await store.events(runId)).filter((e) => e.type === 'step-finished').map((e) => e.data.note);
      return { out, notes, pages, requests };
    }

    it('shows the critic the cut card, one image under each label, and ranks ours', async () => {
      const { out, pages, requests } = await criticStepWithACut();
      expect(requests).toHaveLength(1);
      const images = requests[0]!.messages[0]!.content.flatMap((c) => (c.type === 'image' ? [c.artifactId] : []));
      expect(images).toHaveLength(4);
      const cut = images.map((id) => pages.byId.get(id) ?? '').filter((html) => /\[… [\d,]+ more words not shown\]/.test(html));
      expect(cut).toHaveLength(1);
      expect(cut[0]).toContain('Every spring the river');
      expect(out.score).toMatchObject({ kind: 'rank', of: 4 });
    });

    // ADR-0087: verdictOf gives the sentence as the verdict's note, and the model step appends it to the step's note.
    it('says in the step’s note whose words the critic was not shown', async () => {
      const { out, notes } = await criticStepWithACut();
      expect(out.note).toMatch(/^The outside critic was not shown all the text: it saw the first [\d,]+ of 5,941 words of the example that begins “Every spring the river takes a…”\.$/);
      expect(notes).toEqual([out.note]);
    });
  });

  it('a card that does not fit in one picture stops the step, naming the item, rather than show part of it', async () => {
    deps.pages = measuringPages(2);
    const reader = new ArtifactReader(deps);
    const view: View = { pool: false, items: [{ textArtifactId: await text('Shot 1 (3s): Open on hands.'), imageArtifactIds: [await image(1)] }] };
    const refs = [await image(10), await longRef(), await image(30)];
    for (const [medium, ours] of [
      ['media', view],
      ['prose', await ourProse()],
    ] as const) {
      const built = buildLineup(deps, reader, medium, { view: ours }, refs, () => 0.5);
      await expect(built).rejects.toBeInstanceOf(StepError);
      await expect(built).rejects.toThrow(/^The examples could not be shown to the critic alongside the work: the card for (your work|one of the example images|the example that begins “[^”]+”) does not fit in one picture\.$/);
    }
  });
});

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
    const lineup: Lineup = { slots: {}, images: [], labels: ['A', 'B', 'C', 'D'], ours: 'B', form: 'text', cut: [] };
    const v = verdictOf([{ answer: { mode: 'GREAT', critique: '### B\n- gap', ranking: ['A', 'B', 'C', 'D'] }, lineup }], 5);
    expect(v.score).toEqual({ kind: 'rank', rank: 2, of: 4, writtenFor: 5 });
  });
});
