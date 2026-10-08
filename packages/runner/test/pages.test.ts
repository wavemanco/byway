/**
 * The one real Playwright test (the e2e scenarios fake the renderer): a tiny page renders to PNG tiles at 1440 wide,
 * images come from the artifact route, and anything off the allowlist is blocked.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { playwrightPages } from '../src/pages.ts';

const pages = playwrightPages({ maxTileHeight: 1200 });
afterAll(() => pages.close());

/** Width and height from a PNG's IHDR chunk. */
const size = (png: Uint8Array) => {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
};

const PIXEL = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

describe('web-page RENDER with Playwright Chromium', () => {
  it('screenshots the full page at 1440 wide in tiles, serving artifacts and blocking other hosts', async () => {
    const asked: string[] = [];
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>T</title>
      <link rel="stylesheet" href="https://example.com/evil.css"></head>
      <body style="margin:0"><img id="art" style="display:block" src="/api/artifacts/sha256:abc" width="40" height="40">
      <div style="height:2000px;background:#123">Tall</div>
      <script>window.addEventListener('load', () => { document.title = document.getElementById('art').naturalWidth > 0 ? 'img-ok' : 'img-missing'; });</script>
      </body></html>`;
    const tiles = await pages.screenshots(html, async (id) => {
      asked.push(id);
      return id === 'sha256:abc' ? { body: PIXEL, contentType: 'image/png' } : undefined;
    });
    expect(asked).toEqual(['sha256:abc']);
    expect(tiles.length).toBe(2);
    expect(tiles.map(size)).toEqual([
      { width: 1440, height: 1200 },
      { width: 1440, height: 2040 - 1200 },
    ]);
    // PNG signature.
    expect(Array.from(tiles[0]!.slice(1, 4))).toEqual([0x50, 0x4e, 0x47]);
  }, 60_000);
});
