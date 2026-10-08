/**
 * Lineup cards (BLIND-1): one template draws every item of a mixed lineup, and the real renderer turns each card into
 * exactly one PNG, 1440 wide and at most one tile tall, whatever it holds: a contact sheet of frames with words, a
 * page's tall screenshots one under another, a single image, or a long text. Text is escaped.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { cardHtml, CARD_MAX_HEIGHT, CARD_WIDTH, fontSizeFor, imageSize } from '../src/cards.ts';
import { playwrightPages } from '../src/pages.ts';
import { png } from './helpers/fake-pages.ts';

const pages = playwrightPages();
afterAll(() => pages.close(), 60_000);

const size = (bytes: Uint8Array) => {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
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
  const one = async (html: string) => {
    const [shot] = await pages.render(html, resolve, ['desktop']);
    expect(shot!.tiles).toHaveLength(1);
    const s = size(shot!.tiles[0]!);
    expect(s.width).toBe(CARD_WIDTH);
    expect(s.height).toBeLessThanOrEqual(CARD_MAX_HEIGHT);
    return s;
  };

  it('a contact sheet of six frames with its words is one image', async () => {
    const frames = Array.from({ length: 6 }, (_, i) => put(`sha256:frame${i}`, png(1024, 576, [40 * i, 90, 160])));
    const words = Array.from({ length: 6 }, (_, i) => `Shot ${i + 1} (3s): The cup on a desk, steam rising.\n   On screen: Again?`).join('\n\n');
    await one(cardHtml({ images: frames, layout: 'grid', text: `${words}\n\nVoice-over: Less time.` }));
  }, 60_000);

  it('a page of three tall screenshots is one image, and a long text alone is one image', async () => {
    const tiles = [0, 1, 2].map((i) => put(`sha256:tile${i}`, png(1440, 2576, [10, 20 * i, 30])));
    await one(cardHtml({ images: tiles, layout: 'stack', text: '' }));
    await one(cardHtml({ images: [], layout: 'grid', text: 'A long reference essay. '.repeat(2_000) }));
    const single = await one(cardHtml({ images: [put('sha256:ref', png(800, 600, [200, 10, 10]))], layout: 'grid', text: '' }));
    // A short card is as tall as the wide screen (1440 × 900): every card is at least that.
    expect(single.height).toBe(900);
  }, 60_000);
});
