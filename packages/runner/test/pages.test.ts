/**
 * The real Playwright tests (the e2e scenarios fake the renderer): tiles at 1440 wide, the phone and first-screen
 * surfaces (RENDER-1), images from the artifact route, other hosts and WebSockets blocked (ENG-14), a bounded render
 * for a page that never settles, a page that opens dialogs in a loop (in its own process, which must survive) and a
 * failing artifact route (SEC-5), a cancelled render, and a browser that comes back
 * after a crash or a failed launch (ENG-14).
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { StepError } from '../src/activities/failures.ts';
import { launchChromium, LINK_CLOSE, LINK_DIGIT_0, LINK_INDEX_END, LINK_OPEN, playwrightPages } from '../src/pages.ts';

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

/** Runs a TypeScript file in a fresh Node process (Node strips the types) and collects what it printed. */
const runNode = (file: string, args: string[]) =>
  new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    const killer = setTimeout(() => child.kill(), 50_000);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(killer);
      resolve({ code, stdout, stderr });
    });
  });

const PIXEL =Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
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

  it.each(['interval', 'alertloop', 'confirmloop', 'promptloop', 'once'])(
    'a page that opens dialogs (%s) does not crash the process that renders it (SEC-5)',
    async (variant) => {
      // Its own process: inside vitest an unhandled rejection is caught by the runner and would not end the process.
      const { code, stdout, stderr } = await runNode(fileURLToPath(new URL('./helpers/dialog-page.ts', import.meta.url)), [variant, '3000']);
      expect(stderr).not.toMatch(/ProtocolError|unhandled|Unhandled/);
      expect(code).toBe(0);
      expect(stdout).toMatch(/^(rendered|rejected: The page did not finish rendering within 3 s)/m);
      expect(stdout).toMatch(/^survived$/m);
    },
    60_000,
  );

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

describe('the text a page shows, for VOICE\'s arbiter (ADR-0081): Chromium, JavaScript off', () => {
  it('reads the body as laid out (hidden content out, blocks on lines of their own, whitespace collapsed), the title, and no script-made copy', async () => {
    const html = `<!doctype html><html><head><title> My \n page </title><style>h1{text-transform:uppercase}.gone{display:none}</style></head>
      <body><h1>Hello world</h1><p>A <span hidden>secret</span> <b>bold</b>   text</p><p class="gone">Gone</p>
      <script>document.body.append('script-made')</script><p>End&nbsp;here</p></body></html>`;
    const shown = await pages.shownText(html, none);
    expect(shown.title).toBe('My page');
    // text-transform is undone (letters as written); the script never ran; a no-break space is kept.
    expect(shown.text).toBe('Hello world\n\nA bold text\n\nEnd here');
    expect(shown.hrefs).toEqual([]);
  }, 60_000);

  it('marks each link\'s words with its index, and lists each address', async () => {
    const shown = await pages.shownText('<p>Read <a href="/terms">the terms</a> and <a href="/faq">FAQ</a>.</p>', none);
    expect(shown.text).toBe('Read the terms and FAQ.');
    expect(shown.hrefs).toEqual(['/terms', '/faq']);
    expect(shown.linked).toBe(`Read ${LINK_OPEN}${String.fromCharCode(LINK_DIGIT_0)}${LINK_INDEX_END}the terms${LINK_CLOSE} and ${LINK_OPEN}${String.fromCharCode(LINK_DIGIT_0 + 1)}${LINK_INDEX_END}FAQ${LINK_CLOSE}.`);
  }, 60_000);

  it('reads the first document only: a meta refresh does not replace it; other hosts stay blocked', async () => {
    const asked: string[] = [];
    const html = '<!doctype html><html><head><meta http-equiv="refresh" content="0;url=/elsewhere"><link rel="stylesheet" href="https://example.com/evil.css"></head><body><p>Stay here</p><img src="/api/artifacts/sha256:abc"></body></html>';
    const first = await pages.shownText(html, async (id) => {
      asked.push(id);
      return undefined;
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(first.text).toBe('Stay here');
    expect(asked).toEqual(['sha256:abc']);
  }, 60_000);

  it('is bounded and cancellable like a render (SEC-5)', async () => {
    const quick = playwrightPages({ timeoutMs: 2_000, closeTimeoutMs: 2_000 });
    opened.push(quick);
    // With JavaScript off a busy script cannot hold the page; an artifact that never comes back holds its load.
    const hang = '<!doctype html><html><body><img src="/api/artifacts/sha256:never">Text</body></html>';
    const never = () => new Promise<undefined>(() => undefined);
    const err = await quick.shownText(hang, never).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StepError);
    expect((err as Error).message).toMatch(/did not finish loading within 2 s, so its text could not be read/);
    expect((await quick.shownText('<p>Next</p>', none)).text).toBe('Next');
    const ctrl = new AbortController();
    const reason = new Error('cancelled by the run');
    setTimeout(() => ctrl.abort(reason), 300);
    await expect(pages.shownText(hang, never, { signal: ctrl.signal })).rejects.toBe(reason);
  }, 60_000);
});
