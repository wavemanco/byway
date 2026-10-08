/**
 * Lineup cards (BLIND-1): one template draws every item of a mixed lineup, and the real renderer turns each card into
 * exactly one PNG, 1440 wide and at most one tile tall, whatever it holds: a contact sheet of frames with words, a
 * page's tall screenshots one under another, a single image, or a long text. Text is escaped.
 *
 * A card never hides what it holds (F13, ADR-0087): it has no height cap and no hidden overflow, so a render shows how
 * tall it really is, and words that do not fit one image are cut where the critic can see it, with a closing line
 * saying how many were left out, and recorded.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Gateway } from '@byway/contracts';
import { buildLineup } from '../src/activities/critic.ts';
import { ArtifactReader } from '../src/activities/prompting.ts';
import { cardHtml, CARD_MAX_HEIGHT, CARD_WIDTH, firstWords, fitCard, fontSizeFor, imageSize, MAX_CARD_RENDERS, wordCount, wordsThatFit, type CardContent } from '../src/cards.ts';
import { playwrightPages, type PageRenderer } from '../src/pages.ts';
import type { View } from '../src/types.ts';
import { png } from './helpers/fake-pages.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { createTestStore } from './helpers/memo.ts';

const pages = playwrightPages();
afterAll(() => pages.close(), 60_000);

const size = (bytes: Uint8Array) => {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
};

/** Ordinary prose of about `chars` characters in paragraphs, ending in a sentinel sentence. */
const essay = (chars: number, sentinel: string) => {
  const paragraph = 'The harbour wakes before the town does, and the boats go out in the order their owners argue about every winter. ';
  const paragraphs: string[] = [];
  for (let n = 0; n < chars; n += paragraph.length * 4) paragraphs.push(paragraph.repeat(4).trim());
  return `${paragraphs.join('\n\n')}\n\n${sentinel}`;
};

describe('card pages', () => {
  it('escape their text and keep artifact ids inside their attribute', () => {
    const html = cardHtml({ images: [{ artifactId: 'sha256:ab"><script>x</script>' }], layout: 'grid', text: '<img src=x onerror=alert(1)> & "quotes"' });
    expect(html).not.toMatch(/<script>|<img src=x/);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quotes&quot;');
    expect(html).toContain('src="/api/artifacts/sha256%3Aab%22%3E%3Cscript%3Ex%3C%2Fscript%3E"');
  });

  it('set long text smaller, never below 12 px', () => {
    expect(fontSizeFor('Short.', 1000)).toBe(24);
    expect(fontSizeFor('word '.repeat(4000), 2000)).toBeLessThan(24);
    expect(fontSizeFor('word '.repeat(100_000), 500)).toBe(12);
  });

  it('read image sizes from PNG, JPEG and WebP headers', () => {
    expect(imageSize(png(16, 9, [1, 2, 3]))).toEqual({ width: 16, height: 9 });
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x40, 0x04, 0x00, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(imageSize(jpeg)).toEqual({ width: 1024, height: 576 });
    const webp = new Uint8Array(30);
    webp.set(Buffer.from('RIFF\0\0\0\0WEBPVP8X', 'ascii'));
    webp.set([0xff, 0x03, 0x00], 24);
    webp.set([0x3f, 0x02, 0x00], 27);
    expect(imageSize(webp)).toEqual({ width: 1024, height: 576 });
    expect(imageSize(Uint8Array.from([1, 2, 3]))).toBeUndefined();
  });

  it('never clip: no height cap and no hidden overflow, so a render shows how tall a card is (F13)', () => {
    const html = cardHtml({ images: [], layout: 'grid', text: 'A long reference essay. '.repeat(2_000) });
    expect(html).not.toMatch(/overflow\s*:\s*hidden/);
    expect(html).not.toMatch(new RegExp(`max-height\\s*:\\s*${CARD_MAX_HEIGHT}px`));
  });

  it('count words, keep the first ones as written, and close a cut card with a line saying how many are not shown (F13)', () => {
    expect(wordCount('  one two\nthree  ')).toBe(3);
    expect(wordCount('')).toBe(0);
    expect(firstWords('one two\n\nthree four', 3)).toBe('one two\n\nthree');
    expect(firstWords('one two', 0)).toBe('');
    expect(firstWords('one two', 9)).toBe('one two');
    const some = cardHtml({ images: [], layout: 'grid', text: 'one two', omitted: 5 });
    expect(some).toContain('one two');
    expect(some).toContain('[… 5 more words not shown]');
    // Words being cut are set at the floor, so as many as possible are shown.
    expect(some).toMatch(/class="text" style="font-size:12px"/);
    const none = cardHtml({ images: [], layout: 'grid', text: '', omitted: 1_234 });
    expect(none).toContain('[all 1,234 words not shown]');
    expect(cardHtml({ images: [], layout: 'grid', text: 'one two' })).not.toContain('not shown');
  });

  it('estimate how many words fit at the 12 px floor, leaving a line for the closing note (F13)', () => {
    const card = (text: string): CardContent => ({ images: [], layout: 'grid', text });
    expect(wordsThatFit(card('Short.'))).toBe(1);
    const many = wordsThatFit(card('word '.repeat(100_000)));
    expect(many).toBeGreaterThan(1_000);
    expect(many).toBeLessThan(100_000);
    // Frames take room from the words.
    const frames = Array.from({ length: 6 }, (_, i) => ({ artifactId: `sha256:f${i}`, width: 1024, height: 576 }));
    expect(wordsThatFit({ images: frames, layout: 'grid', text: 'word '.repeat(100_000) })).toBeLessThan(many);
  });
});

/**
 * A stand-in renderer that measures as a browser would, without one: each paragraph of words takes a row per 100
 * characters, 17 px a row, and the rest of the card `extra` px; tiled at CARD_MAX_HEIGHT. It keeps every page.
 */
function measuring(extra = 100, perRow = 100) {
  const calls: string[] = [];
  const render = async (html: string): Promise<Uint8Array[]> => {
    calls.push(html);
    const paragraphs = [...html.matchAll(/<p class="(?:text|cut)"[^>]*>([^<]*)<\/p>/g)].map((m) => m[1]!.replace(/&[a-z#0-9]+;/g, '_'));
    const rows = paragraphs.reduce((n, p) => n + Math.max(1, Math.ceil(p.length / perRow)), 0);
    const height = Math.max(900, extra + rows * 17);
    const tiles: Uint8Array[] = [];
    for (let y = 0; y < height; y += CARD_MAX_HEIGHT) tiles.push(png(8, Math.min(CARD_MAX_HEIGHT, height - y), [y % 256, 1, 2]));
    return tiles;
  };
  return { calls, render };
}

describe('fitting a card into one image (F13)', () => {
  it('keeps every word when they fit, with no closing line', async () => {
    const r = measuring();
    const fitted = await fitCard({ images: [], layout: 'grid', text: essay(5_000, 'THE-END') }, r.render);
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    expect(fitted.cut).toBeUndefined();
    expect(fitted.html).toContain('THE-END');
    expect(r.calls).toHaveLength(1);
  });

  it('shows every word when the browser fits more than the cautious estimate said', async () => {
    // Words set more tightly than the estimate assumes: the first try is cut, its render shows room for all of them.
    const r = measuring(100, 400);
    const text = essay(30_000, 'THE-END');
    expect(wordsThatFit({ images: [], layout: 'grid', text })).toBeLessThan(wordCount(text));
    const fitted = await fitCard({ images: [], layout: 'grid', text }, r.render);
    expect(fitted).toMatchObject({ ok: true });
    if (fitted.ok) expect(fitted.cut).toBeUndefined();
    if (fitted.ok) expect(fitted.html).toContain('THE-END');
    expect(r.calls).toHaveLength(2);
  });

  it('cuts what the render measured as too tall, visibly, and records how many words were shown', async () => {
    const r = measuring();
    const text = essay(30_000, 'THE-END');
    const fitted = await fitCard({ images: [], layout: 'grid', text }, r.render);
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    expect(fitted.cut).toBeDefined();
    const { shownWords, totalWords } = fitted.cut!;
    expect(totalWords).toBe(wordCount(text));
    expect(shownWords).toBeGreaterThan(0);
    expect(shownWords).toBeLessThan(totalWords);
    expect(fitted.html).not.toContain('THE-END');
    expect(fitted.html).toContain(`[… ${(totalWords - shownWords).toLocaleString('en-US')} more words not shown]`);
    expect(size(fitted.png).height).toBeLessThanOrEqual(CARD_MAX_HEIGHT);
    expect(r.calls.length).toBeLessThanOrEqual(MAX_CARD_RENDERS);
  });

  it('drops every word when none fit beside the images, and fails when the card is taller than one image without them', async () => {
    // The rest of the card takes all but one row of the image: no word fits beside the closing line, so all go.
    const crowded = measuring(CARD_MAX_HEIGHT - 20);
    const text = 'word '.repeat(5_000);
    const fitted = await fitCard({ images: [], layout: 'grid', text }, crowded.render);
    expect(fitted).toMatchObject({ ok: true, cut: { shownWords: 0, totalWords: 5_000 } });
    if (fitted.ok) expect(fitted.html).toContain('[all 5,000 words not shown]');
    expect(crowded.calls.length).toBeLessThanOrEqual(MAX_CARD_RENDERS);
    // Taller than one image even without words: never the first tile of it.
    const tall = measuring(CARD_MAX_HEIGHT + 10);
    expect(await fitCard({ images: [], layout: 'grid', text }, tall.render)).toEqual({ ok: false, reason: 'too-tall' });
    expect(tall.calls.length).toBeLessThanOrEqual(MAX_CARD_RENDERS);
    expect(await fitCard({ images: [], layout: 'grid', text: '' }, tall.render)).toEqual({ ok: false, reason: 'too-tall' });
    expect(await fitCard({ images: [], layout: 'grid', text: 'x' }, async () => [])).toEqual({ ok: false, reason: 'empty' });
  });

  it('a card whose words reach the critic another way is rendered once and never cut', async () => {
    const r = measuring(CARD_MAX_HEIGHT + 10);
    expect(await fitCard({ images: [], layout: 'grid', text: 'Its words are written out under this label.' }, r.render, { cut: false })).toEqual({ ok: false, reason: 'too-tall' });
    expect(r.calls).toHaveLength(1);
  });
});

describe('cards rendered by Playwright Chromium', () => {
  const store = new Map<string, Uint8Array>();
  const resolve = async (id: string) => {
    const body = store.get(id);
    return body ? { body, contentType: 'image/png' } : undefined;
  };
  const put = (id: string, bytes: Uint8Array) => {
    store.set(id, bytes);
    return { artifactId: id, ...imageSize(bytes)! };
  };
  const tiles = async (html: string) => (await pages.render(html, resolve, ['desktop']))[0]!.tiles;
  const one = async (html: string) => {
    const shot = await tiles(html);
    expect(shot).toHaveLength(1);
    const s = size(shot[0]!);
    expect(s.width).toBe(CARD_WIDTH);
    expect(s.height).toBeLessThanOrEqual(CARD_MAX_HEIGHT);
    return s;
  };

  it('a contact sheet of six frames with its words is one image', async () => {
    const frames = Array.from({ length: 6 }, (_, i) => put(`sha256:frame${i}`, png(1024, 576, [40 * i, 90, 160])));
    const words = Array.from({ length: 6 }, (_, i) => `Shot ${i + 1} (3s): The cup on a desk, steam rising.\n   On screen: Again?`).join('\n\n');
    await one(cardHtml({ images: frames, layout: 'grid', text: `${words}\n\nVoice-over: Less time.` }));
  }, 60_000);

  it('a page of three tall screenshots is one image, and so is a single image', async () => {
    const shots = [0, 1, 2].map((i) => put(`sha256:tile${i}`, png(1440, 2576, [10, 20 * i, 30])));
    await one(cardHtml({ images: shots, layout: 'stack', text: '' }));
    const single = await one(cardHtml({ images: [put('sha256:ref', png(800, 600, [200, 10, 10]))], layout: 'grid', text: '' }));
    // A short card is as tall as the wide screen (1440 × 900): every card is at least that.
    expect(single.height).toBe(900);
  }, 60_000);

  it('a long text runs past one image: nothing hides it, so the render shows it does not fit (F13)', async () => {
    expect((await tiles(cardHtml({ images: [], layout: 'grid', text: 'A long reference essay. '.repeat(2_000) }))).length).toBeGreaterThan(1);
  }, 60_000);

  it('a card of 20,000 to 30,000 characters is fitted into one image: every word shows, or the card says how many do not (F13)', async () => {
    const frames = [0, 1, 2].map((i) => put(`sha256:board${i}`, png(1024, 576, [30, 60 * i, 90])));
    for (const card of [
      { images: [], layout: 'grid', text: essay(20_000, 'THE-LAST-SENTENCE.') },
      { images: [], layout: 'grid', text: essay(30_000, 'THE-LAST-SENTENCE.') },
      { images: frames, layout: 'grid', text: essay(30_000, 'THE-LAST-SENTENCE.') },
    ] satisfies CardContent[]) {
      // Whether every word fits whole depends on this machine's fonts: whatever the browser fits, the card shows.
      const whole = (await tiles(cardHtml(card))).length === 1;
      let renders = 0;
      const fitted = await fitCard(card, async (html) => {
        renders++;
        return tiles(html);
      });
      expect(fitted.ok).toBe(true);
      if (!fitted.ok) continue;
      expect(renders).toBeLessThanOrEqual(MAX_CARD_RENDERS);
      // One tile is the whole page (nothing clips it), so whatever the page holds is in the image.
      expect(await tiles(fitted.html)).toHaveLength(1);
      expect(size(fitted.png)).toMatchObject({ width: CARD_WIDTH });
      // The estimate is cautious, and the first render calibrates it: words the browser fits are not lost to it.
      if (whole) expect(fitted.cut?.shownWords ?? wordCount(card.text)).toBeGreaterThanOrEqual(0.95 * wordCount(card.text));
      if (fitted.cut) {
        expect(fitted.html).not.toContain('THE-LAST-SENTENCE.');
        expect(fitted.html).toContain(`[… ${(fitted.cut.totalWords - fitted.cut.shownWords).toLocaleString('en-US')} more words not shown]`);
        expect(fitted.cut.totalWords).toBe(wordCount(card.text));
      } else {
        expect(fitted.html).toContain('THE-LAST-SENTENCE.');
      }
    }
  }, 120_000);

  it('a media lineup records whose words its cards cut, as the step note names them (F13)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'byway-cards-'));
    const db = createTestStore({ dataDir: dir });
    try {
      const recorded: string[] = [];
      const renderer: PageRenderer = { ...pages, render: (html, res, surfaces, opts) => (recorded.push(html), pages.render(html, res, surfaces, opts)) };
      const deps = { gateway: {} as Gateway, store: db, prompts: fakePrompts(), pages: renderer };
      const image = async (c: number) => (await db.artifacts.put(png(1024, 576, [c, c, c]), 'image/png')).id;
      const frames = [await image(1), await image(2), await image(3)];
      const board = (await db.artifacts.putText('Shot 1 (3s): Open on hands.\n\nVoice-over: Less time.', 'text/plain')).id;
      const view: View = { pool: false, items: [{ textArtifactId: board, imageArtifactIds: frames }] };
      const long = (await db.artifacts.putText(essay(30_000, 'THE-LAST-SENTENCE.'), 'text/plain')).id;
      const runId = (await db.createRun({ id: 'run-cards', workspaceId: (await db.ensureDefaultWorkspace()).id, recipeId: 'tiny', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium: 'media', budgetUsd: 5 })).id;
      const lineup = await buildLineup(deps, new ArtifactReader(deps), 'media', { view }, [await image(10), long, await image(30)], () => 0.5, true, undefined, runId);
      expect(lineup.form).toBe('cards');
      for (const g of lineup.images) expect(g.artifactIds).toHaveLength(1);
      const cards = recorded.filter((h) => h.includes('class="card"'));
      const last = [...cards].reverse().find((h) => h.includes('The harbour wakes'))!;
      if (last.includes('THE-LAST-SENTENCE.')) {
        expect(lineup.cut).toEqual([]);
      } else {
        expect(last).toMatch(/\[… [\d,]+ more words not shown\]/);
        expect(lineup.cut).toEqual([expect.objectContaining({ item: { ref: long }, begins: expect.stringMatching(/^The harbour wakes/) })]);
      }
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
