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
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import type { Browser, LaunchOptions } from 'playwright';
import { StepError } from '../src/activities/failures.ts';
import { allowedUrl, chromiumLaunchOptions, launchChromium, LINK_CLOSE, LINK_DIGIT_0, LINK_INDEX_END, LINK_OPEN, playwrightPages, RENDER_ALLOWLIST, RENDERER_OS_SANDBOX } from '../src/pages.ts';

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
      // Under load Chromium can refuse a screenshot while a dialog is open: a plain step failure too, never a raw error.
      expect(stdout).toMatch(/^(rendered|rejected: The page did not finish rendering within 3 s|rejected: The page could not be drawn: )/m);
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

  it('holds at most a capped number of bytes of one allowlisted response: a larger one, or one that never ends, is cut off and the render goes on', async () => {
    // An allowlisted CDN serves whatever a package holds, and a model-written page names the files. Each response used
    // to be held in memory whole, bounded only by the render's deadline.
    const CAP = 64 * 1024;
    const hits: string[] = [];
    const endless = new Set<import('node:http').ServerResponse>();
    const cdn = createServer((req, res) => {
      hits.push(req.url ?? '');
      const ran = (name: string) => `const img = document.createElement('img'); img.src = 'http://${cdnHost}/${name}.png'; document.documentElement.appendChild(img);`;
      // A script that runs only if it arrives whole: its last line asks for an image.
      if (req.url === '/big.js') return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(`/*${'x'.repeat(CAP + 1024)}*/\n${ran('big-ran')}`);
      if (req.url === '/small.js') return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(`/*${'x'.repeat(CAP - 1024)}*/\n${ran('small-ran')}`);
      if (req.url === '/endless.js') {
        endless.add(res);
        res.writeHead(200, { 'content-type': 'text/javascript' });
        const more = () => {
          if (res.destroyed || !endless.has(res)) return;
          res.write(`/*${'y'.repeat(16 * 1024)}*/\n`, () => setTimeout(more, 1));
        };
        res.on('close', () => endless.delete(res));
        return void more();
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => cdn.listen(0, '127.0.0.1', () => r()));
    const cdnHost = `127.0.0.1:${(cdn.address() as AddressInfo).port}`;
    const capped = playwrightPages({ timeoutMs: 20_000, maxFetchBytes: CAP, admit: (u) => u.protocol === 'http:' && u.host === cdnHost, launch: () => launchWith(LOCAL_NETWORK_CHECKS_OFF) });
    opened.push(capped);
    try {
      const html = `<!doctype html><html><head><script src="http://${cdnHost}/small.js"></script><script src="http://${cdnHost}/big.js"></script><script src="http://${cdnHost}/endless.js"></script></head><body><div style="height:50px">x</div></body></html>`;
      const started = Date.now();
      expect((await capped.screenshots(html, none)).length).toBe(1);
      // The endless one was cut at the cap, not waited out to the deadline.
      expect(Date.now() - started).toBeLessThan(15_000);
      expect(hits).toContain('/small-ran.png');
      expect(hits).not.toContain('/big-ran.png');
    } finally {
      for (const res of endless) res.destroy();
      endless.clear();
      await new Promise((r) => cdn.close(r));
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

  it('turns a renderer failure while drawing (a Playwright protocol error) into one plain step failure, not the raw error', async () => {
    // Seen under load in the dialog-interval test: Chromium refused the screenshot, and Playwright's own message reached
    // the step as it was, an error the workflow does not know (so Temporal retried it as if it were transient).
    const RAW = 'page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot';
    const refusing = (b: Browser): Browser =>
      new Proxy(b, {
        get(target, prop, receiver) {
          if (prop !== 'newContext') return Reflect.get(target, prop, receiver);
          return async (...args: Parameters<Browser['newContext']>) => {
            const context = await target.newContext(...args);
            return new Proxy(context, {
              get(c, p, r) {
                if (p !== 'newPage') return Reflect.get(c, p, r);
                return async () => {
                  const page = await c.newPage();
                  return new Proxy(page, {
                    get(pg, name, rr) {
                      if (name === 'screenshot') return async () => Promise.reject(new Error(`${RAW}\nCall log:\n  - taking page screenshot`));
                      const v = Reflect.get(pg, name, rr) as unknown;
                      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(pg) : v;
                    },
                  });
                };
              },
            });
          };
        },
      });
    const failing = playwrightPages({ launch: async () => refusing(await launchChromium()) });
    opened.push(failing);
    const err = await failing.render(SIMPLE, none, ['desktop', 'fold']).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StepError);
    expect((err as Error).message).toBe('The page could not be drawn: the page renderer could not take its screenshot (Unable to capture screenshot).');
    expect((err as Error).message).not.toMatch(/Protocol error|page\.screenshot|Call log/);
    expect((err as Error).cause).toBeInstanceOf(Error);
    // A cancelled render still ends with the cancel's own reason, not a step failure.
    const ctrl = new AbortController();
    const reason = new Error('cancelled by the run');
    ctrl.abort(reason);
    await expect(failing.screenshots(SIMPLE, none, { signal: ctrl.signal })).rejects.toBe(reason);
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

describe('the text a page shows a visitor, for VOICE\'s arbiter (ADR-0081): Chromium, JavaScript on', () => {
  /** The words of a read: its characters between separators (HIDDEN_HERE and REVERSED included). */
  const words = (t: string) => t.split(/[\s﷭﷮]+/).filter(Boolean);
  const body = (b: string) => `<!doctype html><html><head><title>T</title></head><body style="font:16px Arial">${b}</body></html>`;

  it('reads the body as a visitor sees it (hidden content out, one separator between neighbours), the title, and the text a script makes', async () => {
    const html = `<!doctype html><html><head><title> My \n page </title><style>h1{text-transform:uppercase}.gone{display:none}</style></head>
      <body><h1>Hello world</h1><p>A <span hidden>secret</span> <b>bold</b>   text</p><p class="gone">Gone</p>
      <script>document.body.append('script-made')</script><p>End&nbsp;here</p></body></html>`;
    const shown = await pages.shownText(html, none);
    expect(shown.title).toBe('My page');
    // Letters as written (text-transform does not change them); the script ran, as in a visitor's browser (round 9 read
    // with JavaScript off); a no-break space is kept.
    // GONE_HERE marks where text that is not laid out stands (the hidden span, the paragraph styled away).
    expect(shown.text).toBe('Hello world\nA\ufdec bold text\ufdec\nscript-made\nEnd\u00a0here');
    expect(shown.hrefs).toEqual([]);
    expect(shown.unlaid).toBe('');
  }, 60_000);

  it('leaves out text a stylesheet hides from sight though a browser lays it out, and lists it with its link (r9)', async () => {
    const sr = '.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}';
    const css = `${sr}.cp{clip-path:inset(50%)}.old{position:absolute;clip:rect(1px,1px,1px,1px)}.grad{color:transparent;background:linear-gradient(red,blue);-webkit-background-clip:text;background-clip:text}`;
    const html = `<!doctype html><html><head><style>${css}</style></head><body>
      <p>Rated 4.5<span class="sr"> out of 5</span> stars</p>
      <p>Sale <i style="opacity:0">ends</i> today</p>
      <div style="opacity:0"><p>Faded <b>out</b></p></div>
      <p><span style="font-size:0">Zero</span>Big</p>
      <p><span style="color:transparent">Clear</span> Seen</p>
      <p style="text-indent:-9999px">Replaced</p>
      <p><a href="/r">Read more<span class="sr"> about bread</span></a></p>
      <div style="height:0;overflow:hidden">Folded</div>
      <p><span class="cp">Clipped</span> path</p>
      <p><span class="old">Old clip</span> rect</p>
      <h2 class="grad">Gradient</h2>
      <div style="height:20px;overflow:auto">Scroll<br>down</div>
      <div style="height:40px"></div>
      <div style="height:0">Spills</div>
    </body></html>`;
    const shown = await pages.shownText(html, none);
    // What a visitor sees, scrolling included: overflow that only scrolls, or spills, still shows. Where hidden text
    // stands, the read says so (HIDDEN_HERE).
    expect(words(shown.text)).toEqual(['Rated', '4.5', 'stars', 'Sale', 'today', 'Big', 'Seen', 'Read', 'more', 'path', 'rect', 'Gradient', 'Scroll', 'down', 'Spills']);
    expect(shown.text).toMatch(/^Rated 4\.5﷭\nstars\nSale﷭ today﷭\nBig/);
    expect(shown.linked.replace(/[﷐-﷒﷠-﷩]/g, '')).toBe(shown.text);
    expect(shown.linked).toContain(`${LINK_OPEN}${String.fromCharCode(LINK_DIGIT_0)}${LINK_INDEX_END}Read more﷭${LINK_CLOSE}`);
    expect(shown.hrefs).toEqual(['/r']);
    expect(shown.hidden).toEqual([
      ['out of 5', null],
      ['ends', null],
      ['Faded', null],
      ['out', null],
      ['Zero', null],
      ['Clear', null],
      ['Replaced', null],
      ['about bread', '/r'],
      ['Folded', null],
      ['Clipped', null],
      ['Old clip', null],
    ]);
    // A screen-reader-only space between two words leaves them glued, as a visitor sees them (innerText read a line
    // break there); an out-of-flow box between two words is a box of its own.
    const flow = await pages.shownText(body(`<style>${sr}</style><p>Sale<span class="sr"> </span>today</p><p>Call<span style="position:absolute;top:0;right:0">Badge</span>now</p>`), none);
    expect(flow.text).toBe('Saletoday\nCall\nBadge\nnow');
    expect(flow.hidden).toEqual([]);
  }, 60_000);

  it('separators come from where a visitor sees each character: glued, apart in the flow, apart across boxes, or in the other order (r10)', async () => {
    const cases: [string, string][] = [
      // Flex items with no gap show glued; a margin parts them (innerText put a line break between them).
      ['<p style="display:flex">Call us <b>today</b></p>', 'Call ustoday'],
      ['<p style="display:flex">Have? <a href="/l" style="margin-left:4px">Sign in</a> now</p>', 'Have?\nSign innow'],
      ['<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><p>One</p><p>Two</p></div>', 'One\nTwo'],
      // A float, a reversed row and a bdo: the next character is shown before the one before it.
      ['<p>Alpha <span style="float:right">Beta</span> Gamma</p>', 'Alpha\nBeta﷮Gamma'],
      ['<p style="display:flex;gap:6px;flex-direction:row-reverse"><span>Hello</span> <span>world</span></p>', 'Hello﷮world'],
      ['<p><bdo dir="rtl">Hi</bdo></p>', 'H﷮i'],
      // Punctuation takes the direction of the letters around it, so "New!" is as reversed as "New" (r10 generator).
      ['<p><span style="float:right">New!</span>Annual</p>', 'New!﷮Annual'],
      // A gap beside a character its box cuts off is measured from the part that shows (r10 generator); a character whose
      // middle the box cuts off is not seen (r10 verifier).
      ['<p><span style="display:inline-block;width:.5em;overflow:hidden;vertical-align:bottom">MW</span> Menu</p>', 'M﷭\nMenu'],
      ['<p><span style="display:inline-block;width:.5em;overflow:hidden;vertical-align:bottom">MW</span>Menu</p>', 'M﷭Menu'],
      // content-visibility: hidden skips content only where it applies (not on an inline box or a table row); text in
      // a display: contents element shows (r10 hand cases).
      ['<p>Sale<span hidden="until-found"> ends</span> today</p>', 'Sale ends today'],
      ['<p>A<ruby style="content-visibility:hidden">Kan<rt>k</rt></ruby>B</p>', 'AKankB'],
      ['<table><tbody style="content-visibility:hidden"><tr><td>Cell</td></tr></tbody></table><p style="content-visibility:hidden">Gone</p>', 'Cell﷬'],
      ['<p>Hi <em style="display:contents">there</em> you</p>', 'Hi there you'],
      // Inline blocks, buttons and a display:block cite are boxes of their own.
      ['<p>Tags: <span style="display:inline-block;padding:2px 6px">New</span><span style="display:inline-block;padding:2px 6px">tech</span></p>', 'Tags:\nNew\ntech'],
      ['<blockquote>“Worth it.”<cite style="display:block">— Maya R.</cite></blockquote>', '“Worth it.”\n— Maya R.'],
      // A superscript, letter-spacing and a word broken over rows stay glued; words wrapped over rows are apart in the flow.
      ['<p>x<sup>2</sup> y</p>', 'x2 y'],
      ['<p style="letter-spacing:.3em;text-transform:uppercase">Our services</p>', 'Our services'],
      ['<p style="width:60px;word-break:break-all">Breadbreadbread loaf</p>', 'Breadbreadbread loaf'],
      ['<p style="width:60px">Hello world again</p>', 'Hello world again'],
      // Table cells, a <br>, and newlines a white-space style keeps are breaks; so is a button's edge.
      ['<table><tr><td>Name<br>Note</td><td>$9</td></tr></table>', 'Name\nNote\n$9'],
      ['<address style="white-space:pre-line">Crumb &amp; Co.\n12 Baker Street</address>', 'Crumb & Co.\n12 Baker Street'],
      ['<p>Pay <button type="button"><b>$20</b> now</button>Total</p>', 'Pay\n$20 now\nTotal'],
      ['<p dir="rtl">שלום <b>עולם</b></p>', 'שלום עולם'],
    ];
    for (const [b, want] of cases) expect((await pages.shownText(body(b), none)).text, b).toBe(want);
  }, 120_000);

  it('hides from sight, character by character, what a visitor cannot see: faint, filtered, clipped by a shape, cut off by an ellipsis or a box (r10)', async () => {
    const shown = await pages.shownText(
      body(
        [
          '<p>A<span style="filter:opacity(0)">B</span>C</p>',
          '<p>D<span style="opacity:0.01">E</span>F</p>',
          '<p>G<span style="position:absolute;clip-path:circle(0)">H</span>I</p>',
          '<p>J<span style="display:inline-block;clip-path:polygon(0 0, 0 0, 0 0)">K</span>L</p>',
          '<p>M<span style="display:inline-block;clip-path:circle(40%)">N</span>O</p>',
          '<p style="width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Fresh bread baked every day</p>',
          '<p style="width:120px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">Fresh bread baked every single day by hand</p>',
          '<div style="height:20px;width:200px;overflow:hidden;line-height:20px"><p style="margin:0">Fresh bread baked every single morning by hand in the oven</p></div>',
        ].join(''),
      ),
      none,
    );
    // A faint or filtered word leaves its gap; a clipped absolutely positioned one leaves none; a circle that keeps most
    // of its word shows it. Per character: the ellipsis takes "aked", the clamp the end of its second row, the box all
    // but its first row.
    expect(shown.text).toBe('A﷭ C\nD﷭ F\nG﷭I\nJ﷭\nL\nMNO\nFresh bread b﷭\nFresh bread baked every﷭\nFresh bread baked every﷭');
    expect(shown.hidden).toEqual([
      ['B', null],
      ['E', null],
      ['H', null],
      ['K', null],
      ['aked every day', null],
      ['single day by hand', null],
      ['single morning by hand in the oven', null],
    ]);
  }, 60_000);

  it('a character a box cuts off is shown only where the box keeps its middle: a sliver of a row is hidden from sight (r10 verifier)', async () => {
    // Round 9's reproduction, at the default line height: the 20 px box keeps the top 2 px of the second row.
    const fixed = await pages.shownText(body('<div style="height:20px;overflow:hidden;width:200px"><p style="margin:0">Fresh bread baked every single morning by hand in the oven</p></div>'), none);
    expect(fixed.text).toBe('Fresh bread baked every﷭');
    expect(fixed.hidden).toEqual([['single morning by hand in the oven', null]]);
    // Tailwind's h-20 overflow-hidden card: 80 px with rows of 24 px, so the fourth row shows only its top 5 px.
    const card = await pages.shownText(body('<p style="height:80px;overflow:hidden;width:180px;line-height:24px;margin:0">Our classic loaf, slow proved for a deep flavour. Slice it thin and toast it. Best with salted butter and honey.</p>'), none);
    expect(card.text).toBe('Our classic loaf, slow proved for a deep flavour. Slice it thin and﷭');
    expect(card.hidden).toEqual([['toast it. Best with salted butter and honey.', null]]);
    // Cut along its width to a sliver: hidden (a box that keeps a letter's middle shows it, as the separators test has it).
    expect((await pages.shownText(body('<p><span style="display:inline-block;width:.15em;overflow:hidden;vertical-align:bottom">MW</span> Menu</p>'), none)).text).toBe('﷭Menu');
  }, 60_000);

  it('a colour that leaves the text no ink hides it: a clear text fill, as Chromium paints with, or a colour almost clear (r10 verifier)', async () => {
    const shown = await pages.shownText(
      body(
        [
          '<p>Rated <span style="-webkit-text-fill-color:transparent">5</span> stars</p>',
          '<p>Sale <span style="color:rgba(0,0,0,0.02)">ends</span> today</p>',
          '<p>Open <span style="color:rgba(0,0,0,0.2);opacity:0.2">late</span> daily</p>',
          // Gradient text: a clear fill over a background clipped to the text shows; a stroke shows too.
          '<h2 style="-webkit-text-fill-color:transparent;background:linear-gradient(red,blue);-webkit-background-clip:text;background-clip:text">Gradient</h2>',
          '<h2 style="-webkit-text-fill-color:transparent;-webkit-text-stroke:1px black">Outline</h2>',
        ].join(''),
      ),
      none,
    );
    expect(shown.text).toBe('Rated﷭ stars\nSale﷭ today\nOpen﷭ daily\nGradient\nOutline');
    expect(shown.hidden).toEqual([['5', null], ['ends', null], ['late', null]]);
  }, 60_000);

  it('svg text is inked by its fill and stroke; a character with no glyph neither hides its line nor stands between neighbours a visitor sees glued (r11 verifier)', async () => {
    const shown = await pages.shownText(
      body(
        [
          // svg text paints with its fill, not its colour: none, clear or a fill-opacity of 0 leaves it no ink.
          '<p>Badge: <svg width="200" height="30"><text x="0" y="20" fill="none">Secret label</text></svg></p>',
          '<svg width="300" height="30"><text x="0" y="20" fill-opacity="0">Faint label</text></svg>',
          '<svg width="300" height="30"><text x="0" y="20" style="fill:transparent">Clear label</text></svg>',
          '<svg width="300" height="30"><text x="0" y="20" fill="none" stroke="black">Stroked label</text></svg>',
          '<svg width="300" height="30"><text x="0" y="20">Visible label</text></svg>',
          // A zero-width space opening a text node goes with the character after it (round 11 read it as hidden).
          '<p>Hello <b>&#8203;world</b> today</p>',
          // A no-break space standing elsewhere than between its neighbours: they are glued as a visitor sees them.
          '<p>dc<span style="display:inline-block;width:0"><span style="position:absolute;top:400px">&nbsp;</span></span>Call</p>',
        ].join(''),
      ),
      none,
    );
    expect(shown.text).toBe('Badge:﷭\nStroked label\nVisible label\nHello \u200bworld today\ndc\u00a0Call');
    expect(shown.hidden).toEqual([['Secret label', null], ['Faint label', null], ['Clear label', null]]);
  }, 60_000);

  it('lists the text a stylesheet adds on an element that shows none of the page\'s own text (r10 verifier: generated content)', async () => {
    const css = '<style>p:empty::before{content:"Coming soon"}li::before{content:"\\2713  "}.ic::before{content:"\\2605"}.n::before{content:"New: "}</style>';
    const shown = await pages.shownText(body(`${css}<p id="s"></p><p class="n">Spring sale</p><ul><li></li><li>Fresh</li></ul><i class="ic"></i><span class="ic" style="opacity:0"></span><p>End</p>`), none);
    // Beside the page's own text ("New: Spring sale", "✓ Fresh") it is decoration, not listed; faded, it is not seen.
    expect(shown.generated).toEqual(['Coming soon', '✓', '★']);
    expect(shown.text).toBe('Spring sale\nFresh\nEnd');
  }, 60_000);

  it('a drop cap (a floated first letter) is read as part of its word, as a visitor reads it (r10 verifier)', async () => {
    const css = '<style>.d::first-letter{float:left;font-size:3em;line-height:1;margin-right:8px}.i::first-letter{initial-letter:3;margin-right:6px}</style>';
    for (const [b, want] of [
      ['<p class="d">Once upon a time</p>', 'Once upon a time'],
      ['<div class="d"><p>“Twice upon a time</p></div>', '“Twice upon a time'],
      ['<p class="i">Thrice upon a time</p>', 'Thrice upon a time'],
      // A letter on its own before a space stays apart from the next word.
      ['<p class="d">A time</p>', 'A time'],
    ]) expect((await pages.shownText(body(`${css}${b}`), none)).text, b).toBe(want);
  }, 60_000);

  it('a section that waits out of view (moved aside by a transform) for a scroll script is read where it shows once revealed (r10 verifier)', async () => {
    const css = '<style>body{overflow-x:hidden}.s{transition:transform .6s}.s.l{transform:translate3d(100%,0,0)}.s.r{transform:translate3d(-100%,0,0)}.s.f{transform:perspective(2500px) rotateY(-100deg);backface-visibility:hidden}.s.in{transform:none}</style>';
    const tall = '<div style="height:1500px"></div>';
    // As AOS 2 does it: a scroll listener adds the class once the section's top is on the screen.
    const script = '<script>const go = () => document.querySelectorAll(".s").forEach((e) => { if (e.getBoundingClientRect().top < innerHeight - 50) e.classList.add("in"); }); addEventListener("scroll", go); go();</script>';
    const shown = await pages.shownText(body(`${css}<p>Top</p>${tall}<div class="s l"><h3>Websites</h3><p>Fast sites you can update.</p></div>${tall}<div class="s r"><h3>Brand strategy</h3></div>${tall}<div class="s f"><h3>Tidewater Coffee</h3></div>${tall}${script}`), none);
    expect(shown.text).toBe('Top\nWebsites\nFast sites you can update.\nBrand strategy\nTidewater Coffee');
    expect(shown.hidden).toEqual([]);
    // A carousel that moves its track by a transform: each slide is read where it shows.
    const carousel = await pages.shownText(
      body('<div style="width:400px;overflow:hidden"><div id="t" style="display:flex;transition:transform .5s"><p style="flex:0 0 400px;margin:0">First slide</p><p style="flex:0 0 400px;margin:0">Second slide</p></div></div><script>let i = 0; setInterval(() => { i = (i + 1) % 2; document.getElementById("t").style.transform = "translateX(" + (-400 * i) + "px)"; }, 3000);</script>'),
      none,
    );
    expect(carousel.text).toBe('First slide\nSecond slide');
    // A ticker an endless animation carries across the screen from beyond its edge: read where its cycle shows it (an
    // endless animation is taken through its cycle across the samples; round 10 stopped it, off the screen).
    const ticker = await pages.shownText(body('<style>@keyframes run{to{transform:translateX(-100%)}}</style><div style="overflow:hidden;white-space:nowrap"><div style="display:inline-block;padding-left:100%;animation:run 20s linear infinite">Now open for Sunday lunch</div></div><p>After</p>'), none);
    expect(ticker.text).toBe('Now open for Sunday lunch\nAfter');
    expect(ticker.hidden).toEqual([]);
  }, 60_000);

  it('slides a script fades in and out in turn, stacked in one place, are never seen together: apart across boxes, not in another order', async () => {
    // Each slide is shown at samples the others are hidden at, where it stands. Read from those boxes, the slides
    // overlap and the next one's first letter stands before the last one's end, which a visitor never sees: the
    // slides are apart across boxes (round 12's first fix read them from where each stood, as in another order).
    const fade = body(
      '<style>.car{position:relative;height:60px;width:600px}.s{position:absolute;left:0;top:0;margin:0;opacity:0;transition:opacity .5s}.s.on{opacity:1}</style><div class="car"><p class="s on">Great bread every day</p><p class="s">Best coffee in town</p><p class="s">Friendly staff</p></div><p>After</p><script>const ss = [...document.querySelectorAll(".s")]; let k = 0; setInterval(() => { ss[k].classList.remove("on"); k = (k + 1) % ss.length; ss[k].classList.add("on"); }, 2000);</script>',
    );
    expect((await pages.shownText(fade, none)).text).toBe('Great bread every day\nBest coffee in town\nFriendly staff\nAfter');
  }, 60_000);

  it('runs a page\'s scripts the same way each time: a stopped clock, a seeded Math.random, however long the page is (r10)', async () => {
    const live = (tail: string) =>
      body(
        `<p>Now: <span id="c"></span></p><p>Served <span id="n">0</span>+ loaves</p><p id="q"></p>${tail}<script>setInterval(() => { document.getElementById("c").textContent = new Date().toISOString(); }, 1000); let v = 0; const t = setInterval(() => { v += 100; document.getElementById("n").textContent = v; if (v >= 2500) clearInterval(t); }, 30); document.getElementById("q").textContent = ["Alpha", "Beta", "Gamma"][Math.floor(Math.random() * 3)];</script>`,
      );
    const a = await pages.shownText(live('<p>End</p>'), none);
    expect(a.text).toMatch(/^Now: 2026-01-01T12:00:\d\d\.\d{3}Z\nServed 2500\+ loaves\n(Alpha|Beta|Gamma)\nEnd$/);
    expect((await pages.shownText(live('<p>End</p>'), none)).text).toBe(a.text);
    // A page made longer by an edit is scrolled in more steps; its clock still reads the same at the end.
    expect((await pages.shownText(live('<p>End</p><div style="height:12000px"></div><p>More</p>'), none)).text).toBe(`${a.text}\nMore`);
    // A script that moves within the document (history.pushState) or tries to leave it (location) does not stop the read.
    const moving = body('<p>Stay</p><script>history.pushState(null, "", "/elsewhere"); setTimeout(() => { location.href = "/other"; }, 100);</script>');
    expect((await pages.shownText(moving, none)).text).toBe('Stay');
  }, 60_000);

  it('runs animation frames on the read\'s clock, twenty a second, so an animation that draws every frame ends where its time says (r10 verifier: GSAP)', async () => {
    // A count-up drawn every frame for two seconds, as GSAP or a counter script draws it: it ends at its last value, and
    // the frames are counted at the read's rate (Playwright's own frames made a GSAP page's read take 8 to 12 s).
    const html = body('<p id="n">0</p><p id="f"></p><script>let t0 = null, frames = 0; const tick = (now) => { if (t0 === null) t0 = now; frames++; const k = Math.min(1, (now - t0) / 2000); document.getElementById("n").textContent = Math.round(k * 2500); if (k < 1) requestAnimationFrame(tick); else document.getElementById("f").textContent = "frames " + frames; }; requestAnimationFrame(tick); const id = requestAnimationFrame(() => { document.body.append("never"); }); cancelAnimationFrame(id);</script>');
    expect((await pages.shownText(html, none)).text).toBe('2500\nframes 41');
  }, 60_000);

  it('reads a page whose sections a script reveals as the visitor scrolls, revealed, whatever the script does on the way back (r10)', async () => {
    const style = '<style>.r{opacity:0;transform:translate3d(0,40px,0);transition:opacity .6s,transform .6s}.r.in{opacity:1;transform:none}</style>';
    const tall = '<div style="height:1500px"></div>';
    const shown = await pages.shownText(
      body(
        [
          style,
          '<p>Top</p>',
          tall,
          // An IntersectionObserver reveal with a staggered delay.
          '<section><p class="r io">Observed one</p><p class="r io">Observed two</p></section>',
          tall,
          // A scroll listener that adds the class in view and takes it away out of view.
          '<p class="r toggle">Toggled</p>',
          tall,
          // A lazy image the page waits for before it shows its caption.
          '<figure><img loading="lazy" src="/api/artifacts/sha256:img" width="10" height="10" onload="this.nextElementSibling.style.opacity=1"><figcaption style="opacity:0">Caption</figcaption></figure>',
          '<script>const io = new IntersectionObserver((es) => es.forEach((e, i) => { if (e.isIntersecting) setTimeout(() => e.target.classList.add("in"), i * 150); }), { threshold: 0.3 }); document.querySelectorAll(".io").forEach((el) => io.observe(el)); addEventListener("scroll", () => document.querySelectorAll(".toggle").forEach((el) => { const b = el.getBoundingClientRect(); el.classList.toggle("in", b.top < innerHeight && b.bottom > 0); }));</script>',
        ].join(''),
      ),
      async () => ({ body: PIXEL, contentType: 'image/png' }),
    );
    expect(shown.text).toBe('Top\nObserved one\nObserved two\nToggled\nCaption');
    expect(shown.hidden).toEqual([]);
  }, 60_000);

  it('applies a stylesheet a script makes, as a visitor\'s browser does: Tailwind\'s browser build, from an admitted host (r10)', async () => {
    const tw = readFileSync(createRequire(import.meta.url).resolve('@tailwindcss/browser'));
    const cdn = createServer((_, res) => {
      res.setHeader('content-type', 'text/javascript');
      res.end(tw);
    });
    await new Promise<void>((r) => cdn.listen(0, '127.0.0.1', () => r()));
    const cdnHost = `127.0.0.1:${(cdn.address() as AddressInfo).port}`;
    const scripted = playwrightPages({ admit: (u) => u.protocol === 'http:' && u.host === cdnHost, launch: () => launchWith(LOCAL_NETWORK_CHECKS_OFF) });
    opened.push(scripted);
    try {
      const html = `<!doctype html><html><head><title>T</title><script src="http://${cdnHost}/tw.js"></script></head><body class="p-8"><p>Rated 4.5<span class="sr-only"> out of 5</span> stars</p><a href="/s" class="px-4">Get started<span class="hidden md:inline"> free</span></a><p class="hidden">Gone</p><p class="flex"><span>Call us</span> <b class="ml-1">today</b></p></body></html>`;
      const shown = await scripted.shownText(html, none);
      // sr-only applies (round 9, with JavaScript off, read "out of 5" as shown); md:inline shows at 1440 px; hidden is
      // not laid out; ml-1 parts two flex items.
      expect(shown.text).toBe('Rated 4.5\ufded\nstars\nGet started free\ufdec\nCall us\ntoday');
      expect(shown.hidden).toEqual([['out of 5', null]]);
    } finally {
      cdn.close();
    }
  }, 120_000);

  it('a page nesting thousands of inline elements left open is read, once, within the deadline (r10: the JavaScript-off read crashed)', async () => {
    // Read within a render's deadline, not only failed plainly in it: the read measures a page again only after something
    // on it changed (r11: measuring every text node again at each of the 33 samples ran these pages past the deadline).
    for (const n of [5_000, 20_000]) {
      const html = `<!doctype html><html><head><title>T</title></head><body><p>Keep</p><p>${'<span>'.repeat(n)}Gone${'</span>'.repeat(n)}</p></body></html>`;
      expect((await pages.shownText(html, none)).text, String(n)).toBe('Keep\nGone');
    }
    const open = `<!doctype html><html><head><title>T</title></head><body><p>${Array.from({ length: 20_000 }, (_, i) => `<span>w${i} `).join('')}</p><p>Tail</p></body></html>`;
    expect((await pages.shownText(open, none)).text).toMatch(/^w0 w1 w2 [^]* w19999\nTail$/);
    expect((await pages.shownText('<p>Next</p>', none)).text).toBe('Next');
  }, 180_000);

  it('text in a marquee is seen wherever its scrolling has taken it: it is measured by the marquee\'s own box (r9)', async () => {
    const html = '<p>Before</p><div><marquee>Breaking news today</marquee></div><div><marquee direction="up" style="height:20px">Up <b>and</b> away</marquee></div><p>After</p>';
    for (let k = 0; k < 3; k++) {
      const shown = await pages.shownText(html, none);
      expect(shown.text).toBe('Before\nBreaking news today\nUp and away\nAfter');
      expect(shown.hidden).toEqual([]);
    }
    // A marquee a style hides is hidden with everything in it.
    expect((await pages.shownText('<p>Before</p><div style="opacity:0"><marquee>Gone</marquee></div>', none)).hidden).toEqual([['Gone', null]]);
  }, 60_000);

  it('reads a page as it settles: animations and transitions are taken to their end, an endless one is stopped (r9)', async () => {
    const css = '@keyframes in{from{opacity:0}to{opacity:1}}@keyframes blink{50%{opacity:0}}.in{animation:in 2s both}.late{animation:in 1s 20s both}.blink{animation:blink 1s infinite}';
    const shown = await pages.shownText(`<style>${css}</style><h1 class="in">Welcome</h1><p class="late">Later</p><p class="blink">Live</p>`, none);
    expect(shown.text).toBe('Welcome\nLater\nLive');
    expect(shown.hidden).toEqual([]);
  }, 60_000);

  it('marks each link\'s words with its index, and lists each address', async () => {
    const shown = await pages.shownText('<p>Read <a href="/terms">the terms</a> and <a href="/faq">FAQ</a>.</p>', none);
    expect(shown.text).toBe('Read the terms and FAQ.');
    expect(shown.hrefs).toEqual(['/terms', '/faq']);
    expect(shown.linked).toBe(`Read ${LINK_OPEN}${String.fromCharCode(LINK_DIGIT_0)}${LINK_INDEX_END}the terms${LINK_CLOSE} and ${LINK_OPEN}${String.fromCharCode(LINK_DIGIT_0 + 1)}${LINK_INDEX_END}FAQ${LINK_CLOSE}.`);
  }, 60_000);

  it('a button is a box of its own: its content stands apart from the text beside it, as a visitor sees it (innerText read them glued)', async () => {
    const html = '<p>Pay <button type="button"><a href="/b"><i>now</i> today  </a></button>Total <a href="/c"> here </a></p>';
    const shown = await pages.shownText(html, none);
    expect(shown.text).toBe('Pay\nnow today\nTotal here');
    expect(shown.linked.replace(/[﷐-﷒﷠-﷩]/g, '')).toBe(shown.text);
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

  it('a page that navigates away as it loads (to about:blank, which no route sees) is a plain StepError, not a raw retried error (r8)', async () => {
    for (const to of ['about:blank', 'about:srcdoc']) {
      const html = `<!doctype html><html><head><meta http-equiv="refresh" content="0;url=${to}"></head><body><p>Gone soon</p></body></html>`;
      for (let k = 0; k < 3; k++) {
        const err = await pages.shownText(html, none).catch((e: unknown) => e);
        expect(err, to).toBeInstanceOf(StepError);
        expect((err as Error).message).toBe('The page navigates away as it loads (a meta refresh, for example), so the text it shows could not be read.');
      }
    }
    // A refresh later than the read, or to the page's own address, reads the page.
    expect((await pages.shownText('<meta http-equiv="refresh" content="5;url=about:blank"><p>Stay</p>', none)).text).toBe('Stay');
    expect((await pages.shownText('<meta http-equiv="refresh" content="0"><p>Stay</p>', none)).text).toBe('Stay');
    // So does one to a fragment of the page: the document stays the same (r9; round 8 called it navigating away).
    expect((await pages.shownText('<meta http-equiv="refresh" content="0;url=#m"><p id="m">Stay</p>', none)).text).toBe('Stay');
    expect((await pages.shownText('<meta http-equiv="refresh" content="0;url=/page#top"><p>Stay</p>', none)).text).toBe('Stay');
  }, 60_000);

  it('reads that share a deadline stop at it, whatever time each read has left (r8)', async () => {
    const hang = '<!doctype html><html><body><img src="/api/artifacts/sha256:never">Text</body></html>';
    const never = () => new Promise<undefined>(() => undefined);
    const t0 = Date.now();
    const err = await pages.shownText(hang, never, { deadline: t0 + 1_500 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StepError);
    expect((err as Error).message).toBe('The page did not finish loading in the time byway gives a page\'s reads, so its text could not be read.');
    expect(Date.now() - t0).toBeLessThan(10_000);
    const late = await pages.shownText('<p>Next</p>', none, { deadline: Date.now() - 1 }).catch((e: unknown) => e);
    expect(late).toBeInstanceOf(StepError);
    expect((await pages.shownText('<p>Next</p>', none, { deadline: Date.now() + 20_000 })).text).toBe('Next');
  }, 60_000);

  it('is bounded and cancellable like a render (SEC-5)', async () => {
    const quick = playwrightPages({ timeoutMs: 2_000, closeTimeoutMs: 2_000 });
    opened.push(quick);
    // An artifact that never comes back holds its load; a script that loops once the read runs its clock holds the read.
    const hang = '<!doctype html><html><body><img src="/api/artifacts/sha256:never">Text</body></html>';
    const never = () => new Promise<undefined>(() => undefined);
    for (const page of [hang, BUSY]) {
      const err = await quick.shownText(page, never).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StepError);
      expect((err as Error).message).toMatch(/did not finish loading within 2 s, so its text could not be read/);
    }
    expect((await quick.shownText('<p>Next</p>', none)).text).toBe('Next');
    const ctrl = new AbortController();
    const reason = new Error('cancelled by the run');
    setTimeout(() => ctrl.abort(reason), 300);
    await expect(pages.shownText(hang, never, { signal: ctrl.signal })).rejects.toBe(reason);
  }, 60_000);

  it('turns a renderer failure while reading (a Playwright protocol error) into one plain step failure, as a render\'s is', async () => {
    const RAW = 'page.evaluate: Protocol error (Runtime.callFunctionOn): Target crashed';
    const crashing = (b: Browser): Browser =>
      new Proxy(b, {
        get(target, prop, receiver) {
          if (prop !== 'newContext') return Reflect.get(target, prop, receiver);
          return async (...args: Parameters<Browser['newContext']>) => {
            const context = await target.newContext(...args);
            return new Proxy(context, {
              get(c, p, r) {
                if (p !== 'newPage') return Reflect.get(c, p, r);
                return async () => {
                  const page = await c.newPage();
                  return new Proxy(page, {
                    get(pg, name, rr) {
                      if (name === 'evaluate') return async () => Promise.reject(new Error(`${RAW}\nCall log:\n  - evaluating`));
                      const v = Reflect.get(pg, name, rr) as unknown;
                      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(pg) : v;
                    },
                  });
                };
              },
            });
          };
        },
      });
    const failing = playwrightPages({ launch: async () => crashing(await launchChromium()) });
    opened.push(failing);
    const err = await failing.shownText('<p>Hello</p>', none).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StepError);
    expect((err as Error).message).toBe('The page\'s text could not be read: the page renderer failed while reading it (Target crashed).');
    expect((err as Error).cause).toBeInstanceOf(Error);
    const ctrl = new AbortController();
    const reason = new Error('cancelled by the run');
    ctrl.abort(reason);
    await expect(failing.shownText('<p>Hello</p>', none, { signal: ctrl.signal })).rejects.toBe(reason);
  }, 60_000);
});
