/**
 * The real Playwright tests (the e2e scenarios fake the renderer): tiles at 1440 wide, the phone and first-screen
 * surfaces (RENDER-1), images from the artifact route, other hosts and WebSockets blocked (ENG-14), a bounded render
 * for a page that never settles and a failing artifact route (SEC-5), a cancelled render, and a browser that comes back
 * after a crash or a failed launch (ENG-14).
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { StepError } from '../src/activities/failures.ts';
import { launchChromium, playwrightPages } from '../src/pages.ts';

const pages = playwrightPages({ maxTileHeight: 1200 });
const opened: { close(): Promise<void> }[] = [pages];
afterAll(async () => {
  for (const p of opened) await p.close();
}, 60_000);

/** Width and height from a PNG's IHDR chunk. */
const size = (png: Uint8Array) => {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
};

const PIXEL = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const SIMPLE = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"><div style="height:500px;background:#345">Hi</div></body></html>';
const none = async () => undefined;

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

  it('renders the surfaces the prompts name: a wide screen, a phone and the first screen (RENDER-1)', async () => {
    const tall = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"><div style="height:1500px;background:#234">Tall</div></body></html>';
    const shots = await pages.render(tall, none, ['desktop', 'mobile', 'fold']);
    expect(shots.map((s) => s.surface)).toEqual(['desktop', 'mobile', 'fold']);
    expect(shots[0]!.tiles.map(size)).toEqual([
      { width: 1440, height: 1200 },
      { width: 1440, height: 300 },
    ]);
    expect(shots[1]!.tiles.map(size)).toEqual([
      { width: 390, height: 1200 },
      { width: 390, height: 300 },
    ]);
    expect(shots[2]!.tiles.map(size)).toEqual([{ width: 1440, height: 900 }]);
    // Only what is asked for, in the order asked.
    expect((await pages.render(tall, none, ['fold'])).map((s) => s.surface)).toEqual(['fold']);
  }, 60_000);

  it('shoots a phone page as wide as it overflows, so sideways scrolling shows', async () => {
    const wide = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"><div style="width:700px;height:200px;background:#456">Too wide</div></body></html>';
    const [phone] = await pages.render(wide, none, ['mobile']);
    expect(size(phone!.tiles[0]!).width).toBe(700);
  }, 60_000);

  it('bounds a page that never settles: the render fails plainly and is not retried, and the next render works (SEC-5)', async () => {
    const quick = playwrightPages({ timeoutMs: 2_000, closeTimeoutMs: 2_000 });
    opened.push(quick);
    const busy = '<!doctype html><html><body><script>addEventListener("load", () => setTimeout(() => { for (;;) {} }, 0));</script>Busy</body></html>';
    const started = Date.now();
    const err = await quick.screenshots(busy, none).catch((e: unknown) => e);
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(err).toBeInstanceOf(StepError);
    expect((err as Error).message).toMatch(/did not finish rendering within 2 s/);
    expect((await quick.screenshots(SIMPLE, none)).length).toBe(1);
  }, 60_000);

  it('answers 404 when the artifact route fails, instead of an unhandled rejection (SEC-5)', async () => {
    const html = '<!doctype html><html><body style="margin:0"><img src="/api/artifacts/sha256:broken" width="10" height="10"><div style="height:100px">x</div></body></html>';
    const tiles = await pages.screenshots(html, async () => {
      throw new Error('artifact file is corrupt');
    });
    expect(tiles.length).toBe(1);
  }, 60_000);

  it('stops a render when its step is cancelled', async () => {
    const slow = '<!doctype html><html><body><script>addEventListener("load", () => setTimeout(() => { for (;;) {} }, 0));</script>Busy</body></html>';
    const ctrl = new AbortController();
    const reason = new Error('cancelled by the run');
    setTimeout(() => ctrl.abort(reason), 500);
    const started = Date.now();
    await expect(pages.screenshots(slow, none, { signal: ctrl.signal })).rejects.toBe(reason);
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 60_000);

  it('blocks WebSockets, which request routing does not see (ENG-14)', async () => {
    let upgrades = 0;
    const server = createServer((_, res) => res.end('ok'));
    server.on('upgrade', (_req, socket) => {
      upgrades++;
      socket.destroy();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as AddressInfo).port;
    // Chromium's own local-network checks would also stop a socket to 127.0.0.1; turn them off so only byway's block is tested.
    const open = playwrightPages({ launch: () => launchChromium(['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests']) });
    opened.push(open);
    try {
      const html = `<!doctype html><html><body><script>try { new WebSocket('ws://127.0.0.1:${port}/exfil'); } catch (e) {}</script><div style="height:50px">x</div></body></html>`;
      await open.screenshots(html, none);
      await new Promise((r) => setTimeout(r, 500));
      expect(upgrades).toBe(0);
    } finally {
      await new Promise((r) => server.close(r));
    }
  }, 60_000);

  it('launches the browser again after a crash or a failed launch (ENG-14)', async () => {
    const launched: Browser[] = [];
    let failNext = true;
    const flaky = playwrightPages({
      launch: async () => {
        if (failNext) {
          failNext = false;
          throw new Error('Chromium could not start');
        }
        const b = await launchChromium();
        launched.push(b);
        return b;
      },
    });
    opened.push(flaky);
    await expect(flaky.screenshots(SIMPLE, none)).rejects.toThrow(/could not start/);
    expect((await flaky.screenshots(SIMPLE, none)).length).toBe(1);
    // The browser goes away underneath (a crash): the next render starts a new one.
    await launched[0]!.close();
    expect((await flaky.screenshots(SIMPLE, none)).length).toBe(1);
    expect(launched.length).toBe(2);
  }, 60_000);
});
