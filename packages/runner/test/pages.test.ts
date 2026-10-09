/**
 * The real Playwright tests (the e2e scenarios fake the renderer): tiles at 1440 wide, the phone and first-screen
 * surfaces (RENDER-1), images from the artifact route, other hosts and WebSockets blocked (ENG-14), a bounded render
 * for a page that never settles, a page that opens dialogs in a loop (in its own process, which must survive) and a
 * failing artifact route (SEC-5), a cancelled render, and a browser that comes back
 * after a crash or a failed launch (ENG-14). And the launch itself (F18; ADR-0084): the effective command line of a
 * Chromium started from the one stated launch, read back through CDP, with a control that shows the check can tell
 * the two sandbox settings apart; and a readiness check that starts the browser the renders then share.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import type { Browser, LaunchOptions } from 'playwright';
import { StepError } from '../src/activities/failures.ts';
import { allowedUrl, chromiumLaunchOptions, launchChromium, playwrightPages, RENDER_ALLOWLIST, RENDERER_OS_SANDBOX } from '../src/pages.ts';

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
/** A page that never settles: once loaded, its script loops forever. */
const BUSY = '<!doctype html><html><body><script>addEventListener("load", () => setTimeout(() => { for (;;) {} }, 0));</script>Busy</body></html>';

/** Chromium's own local-network checks would also stop a page reaching 127.0.0.1; off, so only byway's rule is tested. */
const LOCAL_NETWORK_CHECKS_OFF = ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests'];

/**
 * Test-only: the stated launch with flags added in test code. Production cannot add any (launchChromium takes no
 * parameter); a test that needs a flag composes it here, from the same options.
 */
async function launchWith(extra: readonly string[], change: Partial<LaunchOptions> = {}): Promise<Browser> {
  const { chromium } = await import('playwright');
  const opts = chromiumLaunchOptions();
  return chromium.launch({ ...opts, ...change, args: [...(opts.args ?? []), ...extra] });
}

/** The browser's own command line, read through CDP (it answers only when --enable-automation is set). */
async function commandLine(browser: Browser): Promise<string[]> {
  const session = await browser.newBrowserCDPSession();
  try {
    return (await session.send('Browser.getBrowserCommandLine')).arguments;
  } finally {
    await session.detach();
  }
}

describe('the rule for what a rendered page may load from the network (spec §3.2)', () => {
  it('admits HTTPS from an allowlisted host, and nothing else', () => {
    const hosts = new Set(RENDER_ALLOWLIST);
    expect(allowedUrl(new URL('https://unpkg.com/react@18/umd/react.production.min.js'), hosts)).toBe(true);
    expect(allowedUrl(new URL('https://fonts.gstatic.com/s/inter/v1/a.woff2'), hosts)).toBe(true);
    for (const url of ['http://unpkg.com/react', 'https://unpkg.com.evil.example/x', 'https://evil.example/unpkg.com', 'https://127.0.0.1/x', 'https://cdn.jsdelivr.net.:443/x']) {
      expect(allowedUrl(new URL(url), hosts), url).toBe(false);
    }
  });
});

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
    // The limit is short, to keep the test quick, and long enough for the plain page after it to render on a busy
    // machine. Launching the browser comes before a render's deadline and is the slowest step under load, so the
    // browser is started first and the time measured is the render's own.
    const limitMs = 5_000;
    const closeMs = 2_000;
    const quick = playwrightPages({ timeoutMs: limitMs, closeTimeoutMs: closeMs });
    opened.push(quick);
    await quick.ready();
    const started = Date.now();
    const err = await quick.screenshots(BUSY, none).catch((e: unknown) => e);
    // The deadline, then closing the stuck page and, if it will not close, the browser: each one bounded.
    expect(Date.now() - started).toBeLessThan(limitMs + 2 * closeMs + 5_000);
    expect(err).toBeInstanceOf(StepError);
    expect((err as Error).message).toMatch(/did not finish rendering within 5 s/);
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
    const ctrl = new AbortController();
    const reason = new Error('cancelled by the run');
    setTimeout(() => ctrl.abort(reason), 500);
    const started = Date.now();
    await expect(pages.screenshots(BUSY, none, { signal: ctrl.signal })).rejects.toBe(reason);
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 60_000);

  it('stops a render whose step is cancelled while the browser is still starting', async () => {
    // The cancel lands after the render's first check and before it waits on the page: it must still stop the render,
    // not leave it running to the deadline.
    const ctrl = new AbortController();
    const reason = new Error('cancelled while the browser started');
    const starting = playwrightPages({
      timeoutMs: 30_000,
      launch: async () => {
        const b = await launchChromium();
        ctrl.abort(reason);
        return b;
      },
    });
    opened.push(starting);
    await expect(starting.screenshots(BUSY, none, { signal: ctrl.signal })).rejects.toBe(reason);
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
    const open = playwrightPages({ launch: () => launchWith(LOCAL_NETWORK_CHECKS_OFF) });
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

  it('holds the allowlist on every redirect hop: a hop to another host is blocked, hops within it are followed, a loop is cut', async () => {
    // Playwright asks the route handler about a request's first URL only; Chromium follows its redirects by itself. So
    // an allowlisted CDN answering with a redirect could send the page on to any host (the class of F17, at the
    // renderer's boundary). Each hop's target must pass the same rule.
    const hits = { cdn: [] as string[], other: [] as string[] };
    const other = createServer((req, res) => {
      hits.other.push(req.url ?? '');
      res.end('/* reached a host off the allowlist */');
    });
    const cdn = createServer((req, res) => {
      hits.cdn.push(req.url ?? '');
      if (req.url === '/out.js') return void res.writeHead(302, { location: `http://127.0.0.1:${(other.address() as AddressInfo).port}/exfil.js` }).end();
      if (req.url === '/in.js') return void res.writeHead(302, { location: '/final.js' }).end();
      if (req.url === '/loop.js') return void res.writeHead(307, { location: '/loop.js' }).end();
      // Served compressed, as CDNs do: the page must still get a script it can run. Running, it asks for an image, which
      // the page's load then waits for, so the render cannot finish before the request arrives.
      if (req.url === '/final.js') {
        const ran = `const img = document.createElement('img'); img.src = 'http://${cdnHost}/ran.png'; document.documentElement.appendChild(img);`;
        return void res.writeHead(200, { 'content-type': 'text/javascript', 'content-encoding': 'gzip' }).end(gzipSync(ran));
      }
      res.writeHead(404).end();
    });
    await Promise.all([other, cdn].map((s) => new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))));
    const cdnHost = `127.0.0.1:${(cdn.address() as AddressInfo).port}`;
    // The test CDN speaks plain HTTP, so the rule is the test's: this one host and port. Chromium's own local-network
    // checks are off, so only byway's rule decides what the page reaches.
    const strict = playwrightPages({ admit: (u) => u.protocol === 'http:' && u.host === cdnHost, launch: () => launchWith(LOCAL_NETWORK_CHECKS_OFF) });
    opened.push(strict);
    try {
      const html = `<!doctype html><html><head><script src="http://${cdnHost}/out.js"></script><script src="http://${cdnHost}/in.js"></script><script src="http://${cdnHost}/loop.js"></script></head><body><div style="height:50px">x</div></body></html>`;
      expect((await strict.screenshots(html, none)).length).toBe(1);
      expect(hits.other).toEqual([]);
      // A redirect loop inside the allowlist stops after five hops: the first request and five redirects.
      expect([...hits.cdn].sort()).toEqual(['/final.js', '/in.js', ...Array<string>(6).fill('/loop.js'), '/out.js', '/ran.png']);
    } finally {
      await Promise.all([other, cdn].map((s) => new Promise((r) => s.close(r))));
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

  it('starts Chromium from the one stated launch: its sandbox policy and WebRTC flags are what the command line shows (F18)', async () => {
    const stated = await launchWith(['--enable-automation']);
    // Control: the other sandbox setting, so the check is seen to tell the two apart on this computer.
    const other = await launchWith(['--enable-automation'], { chromiumSandbox: !RENDERER_OS_SANDBOX });
    try {
      const args = await commandLine(stated);
      expect(args.includes('--no-sandbox')).toBe(!RENDERER_OS_SANDBOX);
      for (const flag of chromiumLaunchOptions().args ?? []) expect(args).toContain(flag);
      expect((await commandLine(other)).includes('--no-sandbox')).toBe(RENDERER_OS_SANDBOX);
    } finally {
      await stated.close();
      await other.close();
    }
  }, 60_000);

  it('starts the browser when asked whether it is ready, and the renders that follow share it (F18)', async () => {
    let launches = 0;
    const counted = playwrightPages({
      launch: async () => {
        launches++;
        return launchChromium();
      },
    });
    opened.push(counted);
    await counted.ready();
    expect(launches).toBe(1);
    expect((await counted.screenshots(SIMPLE, none)).length).toBe(1);
    expect((await counted.render(SIMPLE, none, ['fold'])).length).toBe(1);
    await counted.ready();
    expect(launches).toBe(1);
  }, 60_000);
});
