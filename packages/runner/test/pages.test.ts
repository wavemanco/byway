/**
 * The real Playwright tests (the e2e scenarios fake the renderer): tiles at 1440 wide, the phone and first-screen
 * surfaces (RENDER-1), images from the artifact route, other hosts and WebSockets blocked (ENG-14), a bounded render
 * for a page that never settles, a page that opens dialogs in a loop (in its own process, which must survive) and a
 * failing artifact route (SEC-5), a cancelled render, and a browser that comes back
 * after a crash or a failed launch (ENG-14). Renders sharing one browser (ADR-0106): a page late to close retires the
 * browser without failing the others, a browser that does not open a context cannot hold a load, and a load byway's own
 * close stops says so. And the launch itself (F18; ADR-0084): the effective command line of a
 * Chromium started from the one stated launch, read back through CDP, with a control that shows the check can tell
 * the two sandbox settings apart; and a readiness check that starts the browser the renders then share.
 */
import { spawn } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it, onTestFinished } from 'vitest';
import type { Browser, BrowserContext, LaunchOptions, Page } from 'playwright';
import { StepError } from '../src/activities/failures.ts';
import { allowedUrl, chromiumLaunchOptions, launchChromium, LINK_CLOSE, LINK_DIGIT_0, LINK_INDEX_END, LINK_OPEN, OFFSET, playwrightPages, RENDER_ALLOWLIST, RENDERER_OS_SANDBOX_DEFAULT, REVERSED, TURNED } from '../src/pages.ts';
import { headlessShell, possibleSandboxCause, sandboxAdvice, type SandboxHost } from '../src/sandbox.ts';

/** The launch byway makes when the person has not switched the sandbox off: inside it (ADR-0105). */
const STATED = { osSandbox: RENDERER_OS_SANDBOX_DEFAULT };

const pages = playwrightPages({ maxTileHeight: 1200 });
const opened: { close(): Promise<void> }[] = [pages];
// All at once: one after another, closing every renderer the tests opened ran past this hook's limit on a loaded
// machine (32 busy processes on 16 threads), all tests passing.
afterAll(async () => {
  await Promise.all(opened.map((p) => p.close()));
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
 * Test-only: the stated launch with flags added in test code. Production cannot add any (launchChromium takes only the
 * OS sandbox setting); a test that needs a flag composes it here, from the same options.
 */
async function launchWith(extra: readonly string[], change: Partial<LaunchOptions> = {}): Promise<Browser> {
  const { chromium } = await import('playwright');
  const opts = chromiumLaunchOptions(STATED);
  return chromium.launch({ ...opts, ...change, args: [...(opts.args ?? []), ...extra] });
}

/**
 * Counts the reads of the page's layout and style made in the page from here on (a box's rects, a range's rects, a
 * computed style), and says how many so far. It wraps the page's own functions once; the read's code calls them.
 */
const LAYOUT_READS = `(() => {
  const key = '__byway_test_layout_reads';
  if (!window[key]) {
    const count = { n: 0 };
    const wrap = (owner, name) => { const f = owner[name]; owner[name] = function (...a) { count.n++; return f.apply(this, a); }; };
    for (const owner of [Element.prototype, Range.prototype]) for (const name of ['getBoundingClientRect', 'getClientRects']) wrap(owner, name);
    wrap(window, 'getComputedStyle');
    Object.defineProperty(window, key, { value: count });
  }
  return window[key].n;
})()`;

/**
 * Test-only: a browser whose contexts and pages the test sees as the renderer opens them: `context` is handed each
 * context and `page` each page, and either may hand back a Proxy to stand in its place.
 */
function seenThrough(b: Browser, see: { context?: (c: BrowserContext) => BrowserContext; page?: (p: Page) => Page }): Browser {
  return new Proxy(b, {
    get(target, prop, receiver) {
      if (prop !== 'newContext') return Reflect.get(target, prop, receiver);
      return async (...args: Parameters<Browser['newContext']>) => {
        const context = await target.newContext(...args);
        const opening = new Proxy(context, {
          get(c, p, r) {
            if (p !== 'newPage') return Reflect.get(c, p, r);
            return async () => {
              const page = await c.newPage();
              return see.page ? see.page(page) : page;
            };
          },
        });
        return see.context ? see.context(opening) : opening;
      };
    },
  });
}

/**
 * Test-only: `o` (a browser or a context) with each call of its close() noted in `log` as `what`. While `hold()` gives a
 * promise, a close waits for it before it starts, as for a renderer too stuck to close: it cannot end before the test
 * lets it go.
 */
function closeSeen<T extends object>(o: T, what: string, log: string[], hold: () => Promise<void> | undefined = () => undefined): T {
  return new Proxy(o, {
    get(t, p, r) {
      const v = Reflect.get(t, p, r) as unknown;
      if (p !== 'close' || typeof v !== 'function') return v;
      return async (...a: unknown[]) => {
        log.push(what);
        const held = hold();
        if (held) await held;
        return (v as (...x: unknown[]) => Promise<void>).apply(t, a);
      };
    },
  });
}

/**
 * Test-only: the stated launch, watched through the `launch` option, as a read sees it. It counts the contexts reads
 * open (one per read; a read made again opens a second), and notes for each sample of a read how many text nodes it
 * measured (the read's `r.sample()` returns that number) and how many times it read the page's layout or style, and
 * how many times the end of the read (`r.final()`) read them. While `hold` is set, a read's first sample waits for it,
 * as on a machine too slow for any deadline: the read cannot finish before the test lets it go.
 */
function watched() {
  const seen = { contexts: 0, samples: [] as Array<{ measured: number; layoutReads: number }>, finalLayoutReads: 0, hold: undefined as Promise<void> | undefined };
  const launch = async (): Promise<Browser> => {
    const browser = await launchChromium(STATED);
    return new Proxy(browser, {
      get(target, prop, receiver) {
        if (prop !== 'newContext') return Reflect.get(target, prop, receiver);
        return async (...args: Parameters<Browser['newContext']>) => {
          seen.contexts++;
          const context = await target.newContext(...args);
          return new Proxy(context, {
            get(c, p, r) {
              if (p !== 'newPage') return Reflect.get(c, p, r);
              return async () => {
                const page = await c.newPage();
                return new Proxy(page, {
                  get(pg, name, rr) {
                    const v = Reflect.get(pg, name, rr) as unknown;
                    if (name !== 'evaluate') return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(pg) : v;
                    return async (code: string) => {
                      const sample = typeof code === 'string' && code.includes('r.sample()');
                      if (!sample && !(typeof code === 'string' && code.includes('r.final()'))) return pg.evaluate(code);
                      if (sample && seen.hold) await seen.hold;
                      const before = Number(await pg.evaluate(LAYOUT_READS));
                      const result = await pg.evaluate(code);
                      const after = Number(await pg.evaluate(LAYOUT_READS));
                      if (sample) seen.samples.push({ measured: Number(JSON.parse(String(result))), layoutReads: after - before });
                      else seen.finalLayoutReads = after - before;
                      return result;
                    };
                  },
                });
              };
            },
          });
        };
      },
    });
  };
  return { seen, launch };
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
    // The page never settles, so a render of it can end only at its deadline, however fast the machine: were the deadline
    // not kept, the test would time out. The deadline is short, to keep the test quick, and long enough for the plain
    // page after it to render on a busy machine (renders take no deadline of their own, so that next render runs under
    // the same 5 s). Nothing here measures time (this test required the render to end within the limit, both closes and
    // 5 s: on GitHub's 2-CPU Windows machine it took 18.8 s once, against 14 s, in run 39079760987).
    const seen = { launches: 0, contexts: 0 };
    const counted = (into: typeof seen, closing: string[], stuck: () => Promise<void> | undefined) => async () => {
      into.launches++;
      const b = seenThrough(await launchChromium(STATED), { context: (c) => (into.contexts++, closeSeen(c, 'context', closing, stuck)) });
      return closeSeen(b, 'browser', closing, stuck);
    };
    const shut: string[] = [];
    const quick = playwrightPages({ timeoutMs: 5_000, closeTimeoutMs: 2_000, launch: counted(seen, shut, () => undefined) });
    opened.push(quick);
    await quick.ready();
    // The readiness check drew byway's test page in a context of its own and closed it (ADR-0105): not counted below.
    shut.length = 0;
    const before = { ...seen };
    const out = await quick.screenshots(BUSY, none).catch((e: unknown) => e);
    expect(out).toBeInstanceOf(StepError);
    expect((out as Error).message).toBe('The page did not finish rendering within 5 s, so it could not be shown.');
    // Made once: the renderer did not try again (one context), and a StepError is not retried by the workflow.
    expect(seen.contexts - before.contexts).toBe(1);
    // The deadline closed the stuck page's context before the render ended (a slow close under load may add the browser).
    expect(shut[0]).toBe('context');
    const next = await quick.screenshots(SIMPLE, none);
    expect(next.length).toBe(1);
    expect(seen.contexts - before.contexts).toBe(2);

    // A stuck page is then closed and, if it will not close, the browser, each within its own limit. Here the test holds
    // both from closing, as for a renderer too stuck to close, so the render can end only by giving up on each; the next
    // render then launches a browser again. On a renderer whose own limit only stops a hung render, the render is
    // cancelled once its page asks for its image, which never comes (so no page spins a CPU while it is held): a cancel
    // closes the page the same way as the deadline, and nothing in this part runs under a short deadline.
    const held = { launches: 0, contexts: 0 };
    const closing: string[] = [];
    let stuck: Promise<void> | undefined;
    const patient = playwrightPages({ timeoutMs: 300_000, closeTimeoutMs: 2_000, launch: counted(held, closing, () => stuck) });
    opened.push(patient);
    await patient.ready();
    closing.length = 0;
    // Neither the stuck page's context nor the browser closes until the test lets them: when it ends, whichever way it
    // ends (a timeout included), so the browsers can close after it.
    let release = () => {};
    stuck = new Promise<void>((r) => (release = r));
    onTestFinished(() => {
      stuck = undefined;
      release();
    });
    const ctrl = new AbortController();
    const reason = new Error('cancelled while its image was awaited');
    const waiting = '<!doctype html><html><body><img src="/api/artifacts/sha256:never">Waiting</body></html>';
    const from = { ...held };
    const cancelled = patient.screenshots(
      waiting,
      () => {
        ctrl.abort(reason);
        return new Promise<undefined>(() => undefined);
      },
      { signal: ctrl.signal },
    );
    await expect(cancelled).rejects.toBe(reason);
    expect(held.contexts - from.contexts).toBe(1);
    // Later closes are not held; these two stay held until the test ends.
    stuck = undefined;
    // The render ended though neither closed: it gave up on the context, then on the browser, which it forgot.
    expect(closing).toEqual(['context', 'browser']);
    const launched = held.launches;
    const after = await patient.screenshots(SIMPLE, none);
    expect(after.length).toBe(1);
    expect(held.launches - launched).toBe(1);
  }, 120_000);

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
    // A page that never settles, rendered by a renderer whose own limit only stops a hung render: only the cancel can stop
    // this render before the test's own timeout, however fast the machine. The cancel comes once the page has loaded, so
    // the render is under way. Nothing here measures time (this test required the render to end within 15 s).
    const ctrl = new AbortController();
    const reason = new Error('cancelled by the run');
    const steps: string[] = [];
    const patient = playwrightPages({
      timeoutMs: 300_000,
      launch: async () =>
        seenThrough(await launchChromium(STATED), {
          context: (c) => closeSeen(c, 'context closed', steps),
          page: (p) => {
            p.once('load', () => {
              steps.push('cancelled');
              ctrl.abort(reason);
            });
            return p;
          },
        }),
    });
    opened.push(patient);
    await expect(patient.screenshots(BUSY, none, { signal: ctrl.signal })).rejects.toBe(reason);
    // Its page's context was closed, which stops the page's renderer, before the render ended.
    expect(steps).toEqual(['cancelled', 'context closed']);
  }, 60_000);

  it('stops a render whose step is cancelled while the browser is still starting', async () => {
    // The cancel lands after the render's first check and before it waits on the page: it must still stop the render,
    // not leave it running to the deadline.
    const ctrl = new AbortController();
    const reason = new Error('cancelled while the browser started');
    const starting = playwrightPages({
      timeoutMs: 30_000,
      launch: async () => {
        const b = await launchChromium(STATED);
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
    // to be held in memory whole, bounded only by the render's deadline. Here the renderer's own limit only stops a hung
    // render, so the endless response cannot be waited out: the render can end before the test's own timeout only if
    // that response is cut off, however fast the machine. Nothing here measures time (this test required the render to
    // end within 15 s).
    const CAP = 64 * 1024;
    const hits: string[] = [];
    const endless = new Set<ServerResponse>();
    // How much of the endless response the server had sent when the renderer closed it.
    let sentWhenCut: number | undefined;
    let cutSeen = () => {};
    const cut = new Promise<void>((r) => (cutSeen = r));
    const cdn = createServer((req, res) => {
      hits.push(req.url ?? '');
      // In a block of its own, so the second script's const is not declared twice (that threw, so the larger script never
      // ran even when it came whole, and the check on its image below could not fail).
      const ran = (name: string) => `{ const img = document.createElement('img'); img.src = 'http://${cdnHost}/${name}.png'; document.documentElement.appendChild(img); }`;
      // A script that runs only if it arrives whole: its last line asks for an image.
      if (req.url === '/big.js') return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(`/*${'x'.repeat(CAP + 1024)}*/\n${ran('big-ran')}`);
      if (req.url === '/small.js') return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(`/*${'x'.repeat(CAP - 1024)}*/\n${ran('small-ran')}`);
      if (req.url === '/endless.js') {
        endless.add(res);
        res.writeHead(200, { 'content-type': 'text/javascript' });
        let sent = 0;
        const more = () => {
          if (res.destroyed || !endless.has(res)) return;
          const chunk = `/*${'y'.repeat(16 * 1024)}*/\n`;
          res.write(chunk, (e) => {
            if (!e) sent += chunk.length;
            setTimeout(more, 1);
          });
        };
        res.on('close', () => {
          // Closed by the renderer, not by the clean-up below (which empties the set first).
          if (!endless.delete(res)) return;
          sentWhenCut ??= sent;
          cutSeen();
        });
        return void more();
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => cdn.listen(0, '127.0.0.1', () => r()));
    const cdnHost = `127.0.0.1:${(cdn.address() as AddressInfo).port}`;
    // The requests of the page that failed, as the page saw them: blocked (Chromium says net::ERR_BLOCKED_BY_CLIENT, with
    // a suffix for a request a route blocked), or why else.
    const failed: string[] = [];
    const why = (text: string) => (/^net::ERR_BLOCKED_BY_CLIENT\b/.test(text) ? 'blocked' : text);
    const capped = playwrightPages({
      // Five minutes, many times what this test takes (about 3.4 s on GitHub's 2-CPU Windows machine, a browser launch
      // included): a limit that only stops a hung render.
      timeoutMs: 300_000,
      maxFetchBytes: CAP,
      admit: (u) => u.protocol === 'http:' && u.host === cdnHost,
      launch: async () =>
        seenThrough(await launchWith(LOCAL_NETWORK_CHECKS_OFF), {
          page: (p) => {
            p.on('requestfailed', (r) => failed.push(`${new URL(r.url()).pathname} ${why(r.failure()?.errorText ?? '')}`));
            return p;
          },
        }),
    });
    opened.push(capped);
    try {
      const html = `<!doctype html><html><head><script src="http://${cdnHost}/small.js"></script><script src="http://${cdnHost}/big.js"></script><script src="http://${cdnHost}/endless.js"></script></head><body><div style="height:50px">x</div></body></html>`;
      expect((await capped.screenshots(html, none)).length).toBe(1);
      // The endless one was cut off once more than the cap of it had come, and closed; the page got neither it nor the
      // larger one (each blocked, not answered), and the one under the cap ran.
      await cut;
      expect(sentWhenCut).toBeGreaterThan(CAP);
      expect(failed.sort()).toEqual(['/big.js blocked', '/endless.js blocked']);
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
        const b = await launchChromium(STATED);
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
    const failing = playwrightPages({ launch: async () => refusing(await launchChromium(STATED)) });
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

  it('starts Chromium from the one stated launch: inside its OS sandbox unless the setting is off, with the WebRTC flags, as the command line shows (F18; ADR-0105)', async () => {
    expect(RENDERER_OS_SANDBOX_DEFAULT).toBe(true);
    const stated = await launchWith(['--enable-automation']);
    // The other setting, which only the person can choose in Settings: so the check is seen to tell the two apart here.
    const off = await launchWith(['--enable-automation'], { chromiumSandbox: chromiumLaunchOptions({ osSandbox: false }).chromiumSandbox });
    try {
      const args = await commandLine(stated);
      expect(args).not.toContain('--no-sandbox');
      for (const flag of chromiumLaunchOptions(STATED).args ?? []) expect(args).toContain(flag);
      expect(await commandLine(off)).toContain('--no-sandbox');
    } finally {
      await stated.close();
      await off.close();
    }
  }, 60_000);

  it("names, in the Windows fix, the file the stated launch runs: Playwright's headless shell, not the full Chromium Playwright names (ADR-0105)", async () => {
    const { chromium } = await import('playwright');
    const named = headlessShell(chromium.executablePath());
    const browser = await launchWith(['--enable-automation']);
    try {
      const [ran] = await commandLine(browser);
      const same = (p: string) => (process.platform === 'win32' ? realpathSync.native(p).toLowerCase() : realpathSync.native(p));
      expect(named.executable).toBeDefined();
      expect(same(named.executable!)).toBe(same(ran!));
      // So the fix byway gives on Windows names that file.
      const windows: SandboxHost = { os: 'windows', root: false, container: false, appArmorRestricts: false, userNamespacesOff: false };
      expect(sandboxAdvice(windows, named).fix).toContain(`(${named.executable})`);
    } finally {
      await browser.close();
    }
  }, 60_000);

  it("when asked whether it is ready, draws byway's own test page once on each browser, and the renders that follow share the browser (F18; ADR-0105)", async () => {
    let launches = 0;
    const contexts: string[] = [];
    const browsers: Browser[] = [];
    const counted = playwrightPages({
      launch: async (setting) => {
        launches++;
        const b = await launchChromium(setting);
        browsers.push(b);
        return seenThrough(b, { context: (c) => (contexts.push('context'), c) });
      },
    });
    opened.push(counted);
    await counted.ready();
    expect(launches).toBe(1);
    // A launch alone does not start the page renderer, the process the sandbox is for: the check drew a page.
    expect(contexts).toEqual(['context']);
    await counted.ready();
    expect(contexts).toEqual(['context']);
    expect((await counted.screenshots(SIMPLE, none)).length).toBe(1);
    expect((await counted.render(SIMPLE, none, ['fold'])).length).toBe(1);
    await counted.ready();
    expect(launches).toBe(1);
    expect(contexts.length).toBe(3);
    // A browser that went away (a crash) is launched again, and the check draws its test page on the new one.
    await browsers[0]!.close();
    await counted.ready();
    expect(launches).toBe(2);
    expect(contexts.length).toBe(4);
  }, 60_000);

  it("fails plainly when the page renderer cannot draw byway's test page; with the sandbox on, the sandbox is named as one possible cause (ADR-0105)", async () => {
    const host: SandboxHost = { os: 'windows', root: false, container: false, appArmorRestricts: false, userNamespacesOff: false };
    // A page renderer that dies as the page loads: what security software stopping it would look like.
    const crashing = (b: Browser): Browser =>
      seenThrough(b, {
        page: (p) =>
          new Proxy(p, {
            get(t, name, r) {
              if (name === 'goto') return async () => Promise.reject(new Error('page.goto: Target crashed\nCall log:\n  - navigating to "http://byway-render.localhost/page"'));
              const v = Reflect.get(t, name, r) as unknown;
              return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
            },
          }),
      });
    const on = playwrightPages({ host, launch: async (setting) => crashing(await launchChromium(setting)) });
    const off = playwrightPages({ host, osSandbox: () => false, launch: async (setting) => crashing(await launchChromium(setting)) });
    opened.push(on, off);
    const withSandbox = await on.ready().catch((e: unknown) => e);
    expect(withSandbox).toBeInstanceOf(StepError);
    // The Windows fix names the headless shell byway launches.
    const named = headlessShell((await import('playwright')).chromium.executablePath());
    expect((withSandbox as Error).message).toBe(possibleSandboxCause('Target crashed', sandboxAdvice(host, named)));
    expect((withSandbox as Error).message).toContain(`(${named.executable})`);
    const without = await off.ready().catch((e: unknown) => e);
    expect(without).toBeInstanceOf(StepError);
    expect((without as Error).message).toBe("The page renderer started but could not draw byway's test page (Target crashed).");
    // Not proven: asked again, it draws the test page again, and fails again.
    await expect(on.ready()).rejects.toThrow(/could not draw byway's test page/);
  }, 60_000);

  it('reads the OS sandbox setting before each load: after a change the next load launches with it, and a render under way finishes on the browser it started on (ADR-0105)', async () => {
    let osSandbox = true;
    const launchedWith: boolean[] = [];
    const browsers: Browser[] = [];
    const r = playwrightPages({
      osSandbox: () => osSandbox,
      launch: async (setting) => {
        launchedWith.push(setting.osSandbox);
        // The stated launch, with --enable-automation so the test can read the command line.
        const b = await launchWith(['--enable-automation'], { chromiumSandbox: chromiumLaunchOptions(setting).chromiumSandbox });
        browsers.push(b);
        return b;
      },
    });
    opened.push(r);
    // A render whose page waits for an image the test holds: it is under way on the sandboxed browser.
    const asked = gate();
    const image = gate();
    const drawn: boolean[] = [];
    const first = r.screenshots(
      '<!doctype html><html><body><img src="/api/artifacts/sha256:held" width="10" height="10">Waiting</body></html>',
      async () => {
        asked.open();
        await image.wait;
        return { body: PIXEL, contentType: 'image/png' };
      },
      { drawn: (how) => drawn.push(how.osSandbox) },
    );
    await asked.wait;
    osSandbox = false;
    // The next render launches a browser without the sandbox, and says so to the one who asked for it.
    expect((await r.screenshots(SIMPLE, none, { drawn: (how) => drawn.push(how.osSandbox) })).length).toBe(1);
    expect(launchedWith).toEqual([true, false]);
    expect(drawn).toEqual([true, false]);
    expect(await commandLine(browsers[0]!)).not.toContain('--no-sandbox');
    expect(await commandLine(browsers[1]!)).toContain('--no-sandbox');
    // The render under way was not cut short: it finishes on the sandboxed browser, which is then closed.
    const gone = new Promise<void>((done) => (browsers[0]!.isConnected() ? browsers[0]!.once('disconnected', () => done()) : done()));
    image.open();
    expect((await first).length).toBe(1);
    await gone;
    // Switched back on, the same the other way: the readiness check follows the setting too.
    osSandbox = true;
    await r.ready();
    expect(launchedWith).toEqual([true, false, true]);
  }, 120_000);
});

/** Test-only: a promise the test settles. `open()` lets whatever waits on `wait` go on. */
function gate(): { wait: Promise<void>; open: () => void } {
  let open = () => {};
  const wait = new Promise<void>((r) => (open = r));
  return { wait, open };
}

/**
 * Test-only: `b` with each newContext noted in `log` as 'newContext' (and `asked` called), and each close of the browser
 * as 'browser'. While `hold()` gives a promise, a context opens only once it settles, as for a browser too stuck to
 * answer; if the browser is closed first, the newContext fails as Playwright's does on a closed browser. `context` is
 * handed each context that opens and may hand back a Proxy to stand in its place.
 */
function opening(b: Browser, log: string[], see: { asked?: () => void; hold?: () => Promise<void> | undefined; context?: (c: BrowserContext) => BrowserContext } = {}): Browser {
  let shut = () => {};
  const closed = new Promise<never>((_, reject) => (shut = () => reject(new Error('browser.newContext: Target page, context or browser has been closed'))));
  closed.catch(() => undefined);
  return new Proxy(b, {
    get(target, prop, receiver) {
      if (prop === 'newContext') {
        return async (...args: Parameters<Browser['newContext']>) => {
          log.push('newContext');
          see.asked?.();
          const held = see.hold?.();
          if (held) await Promise.race([held, closed]);
          const context = await target.newContext(...args);
          return see.context ? see.context(context) : context;
        };
      }
      if (prop === 'close') {
        return async (...a: Parameters<Browser['close']>) => {
          log.push('browser');
          shut();
          return target.close(...a);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

describe('one browser, many renders: a page that is late to close, and a browser that does not answer (SEC-5; ADR-0106)', () => {
  // None of these measures time. Where a close or a context must be late, the test holds it until the renderer has
  // given up on it, so it is late however fast the machine; where a render must end at its deadline or its cancel, the
  // thing it waits for never comes, so only the deadline or the cancel can end it (else the test times out).
  const WAITING = '<!doctype html><html><body style="margin:0"><img src="/api/artifacts/sha256:wait" width="10" height="10"><div style="height:100px">Waiting</div></body></html>';
  const png = { body: PIXEL, contentType: 'image/png' };

  it('a page late to close retires its browser, not closing it under the other renders: they finish, and the browser is closed once the last of them ends', async () => {
    const closing: string[] = [];
    let launches = 0;
    let stuck: Promise<void> | undefined;
    const held = gate();
    onTestFinished(() => {
      stuck = undefined;
      held.open();
    });
    const shared = playwrightPages({
      // A limit that only stops a hung render; the close limit is short, and the test holds the close past it.
      timeoutMs: 300_000,
      closeTimeoutMs: 1_000,
      launch: async () => {
        launches++;
        const b = seenThrough(await launchChromium(STATED), { context: (c) => closeSeen(c, 'context', closing, () => stuck) });
        return closeSeen(b, 'browser', closing);
      },
    });
    opened.push(shared);
    // B is under way on the shared browser: its page waits for its image, which the test sends later.
    const asked = gate();
    const image = gate();
    const b = shared.screenshots(WAITING, async () => {
      asked.open();
      await image.wait;
      return png;
    });
    await asked.wait;
    // A renders on the same browser; its context does not close until the test ends, so the renderer gives up on it.
    stuck = held.wait;
    expect((await shared.screenshots(SIMPLE, none)).length).toBe(1);
    stuck = undefined;
    // A's context was asked to close; the browser was not, as B still renders on it.
    expect(closing).toEqual(['context']);
    image.open();
    expect((await b).length).toBe(1);
    // B's own context closed, and then the browser, B being the last render on it.
    expect(closing).toEqual(['context', 'context', 'browser']);
    // The next render launches a browser again.
    expect((await shared.screenshots(SIMPLE, none)).length).toBe(1);
    expect(launches).toBe(2);
  }, 120_000);

  // A hung browser: its newContext never answers until the browser is closed. Before ADR-0106 nothing bounded it.
  it('a browser that does not open a context cannot hold a read past its deadline; it is closed, and the next read launches another', async () => {
    const log: string[] = [];
    let launches = 0;
    // The browser stops answering once the readiness check has drawn its test page on it, so the read's short deadline
    // is not spent on the launch.
    let hold = false;
    const hung = playwrightPages({
      timeoutMs: 300_000,
      closeTimeoutMs: 1_000,
      launch: async () => (++launches === 1 ? opening(await launchChromium(STATED), log, { hold: () => (hold ? new Promise<void>(() => undefined) : undefined) }) : launchChromium(STATED)),
    });
    opened.push(hung);
    await hung.ready();
    hold = true;
    log.length = 0;
    const err = await hung.shownText('<p>Text</p>', none, { deadline: Date.now() + 1_500 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StepError);
    expect((err as Error).message).toBe("The page did not finish loading in the time byway gives a page's reads, so its text could not be read.");
    // The read asked for a context and gave up on it; the browser, which did not answer, was closed (the read was its last load).
    expect(log).toEqual(['newContext', 'browser']);
    expect((await hung.shownText('<p>Next</p>', none)).text).toBe('Next');
    expect(launches).toBe(2);
  }, 60_000);

  it('a browser that does not open a context cannot hold a render past its cancel; it is closed', async () => {
    const told: string[] = [];
    const ctrl = new AbortController();
    const reason = new Error('cancelled while the context opened');
    const cancelled = playwrightPages({
      timeoutMs: 300_000,
      closeTimeoutMs: 1_000,
      launch: async () => opening(await launchChromium(STATED), told, { asked: () => ctrl.abort(reason), hold: () => new Promise<void>(() => undefined) }),
    });
    opened.push(cancelled);
    await expect(cancelled.screenshots(SIMPLE, none, { signal: ctrl.signal })).rejects.toBe(reason);
    expect(told).toEqual(['newContext', 'browser']);
  }, 60_000);

  it('a context that opens after its render gave up is closed as it opens, and the browser, which answered, is kept', async () => {
    const log: string[] = [];
    let launches = 0;
    const late = gate();
    const ctrl = new AbortController();
    const reason = new Error('cancelled while the context opened');
    const r = playwrightPages({
      // A close limit far longer than a context takes to open and close, so the browser is not judged stuck.
      timeoutMs: 300_000,
      closeTimeoutMs: 60_000,
      launch: async () => {
        launches++;
        return opening(await launchChromium(STATED), log, {
          asked: () => {
            // The render gives up (its step is cancelled) while its context is being opened; then the context opens.
            if (!ctrl.signal.aborted) {
              ctrl.abort(reason);
              late.open();
            }
          },
          hold: () => (ctrl.signal.aborted && log.length === 1 ? late.wait : undefined),
          context: (c) => closeSeen(c, 'context', log),
        });
      },
    });
    opened.push(r);
    await expect(r.screenshots(SIMPLE, none, { signal: ctrl.signal })).rejects.toBe(reason);
    expect(log).toEqual(['newContext', 'context']);
    expect((await r.screenshots(SIMPLE, none)).length).toBe(1);
    expect(launches).toBe(1);
  }, 60_000);

  it("a render or read that byway's own close stops says so, whether a call was under way or not, and not as a crash would", async () => {
    const MINE = 'byway closed the page renderer as it shut down';
    // A render waiting for its image (Playwright's goto under way when the browser is closed).
    const r1 = playwrightPages({ timeoutMs: 300_000 });
    opened.push(r1);
    const asked = gate();
    const drawing = r1
      .screenshots(WAITING, () => {
        asked.open();
        return new Promise<undefined>(() => undefined);
      })
      .catch((e: unknown) => e);
    await asked.wait;
    await r1.close();
    const drawn = await drawing;
    expect(drawn).toBeInstanceOf(StepError);
    expect((drawn as Error).message).toBe(`The page could not be drawn: ${MINE}.`);
    // Playwright's own error, kept as the cause, names the reason byway closed the browser with.
    const playwrights = (e: unknown): string => {
      let at = e as { cause?: unknown; message?: string } | undefined;
      while (at?.cause) at = at.cause as typeof at;
      return at?.message ?? '';
    };
    expect(playwrights(drawn)).toMatch(new RegExp(`^page\\.goto: ${MINE}`));

    // A render between two calls (its screenshot held until the browser is closed): Playwright's error then says only
    // that the browser is closed, as a crash's would.
    const between = gate();
    const shoot = gate();
    const r2 = playwrightPages({
      timeoutMs: 300_000,
      launch: async () =>
        seenThrough(await launchChromium(STATED), {
          page: (p) =>
            new Proxy(p, {
              get(pg, name, rr) {
                const v = Reflect.get(pg, name, rr) as unknown;
                if (name !== 'screenshot') return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(pg) : v;
                return async (...a: Parameters<Page['screenshot']>) => {
                  between.open();
                  await shoot.wait;
                  return pg.screenshot(...a);
                };
              },
            }),
        }),
    });
    opened.push(r2);
    const shooting = r2.screenshots(SIMPLE, none).catch((e: unknown) => e);
    await between.wait;
    await r2.close();
    shoot.open();
    const shot = await shooting;
    expect(shot).toBeInstanceOf(StepError);
    expect((shot as Error).message).toBe(`The page could not be drawn: ${MINE}.`);
    expect(playwrights(shot)).toMatch(/^page\.screenshot: Target page, context or browser has been closed/);

    // A read waiting for its image.
    const r3 = playwrightPages({ timeoutMs: 300_000 });
    opened.push(r3);
    const wanted = gate();
    const reading = r3
      .shownText(WAITING, () => {
        wanted.open();
        return new Promise<undefined>(() => undefined);
      })
      .catch((e: unknown) => e);
    await wanted.wait;
    await r3.close();
    const read = await reading;
    expect(read).toBeInstanceOf(StepError);
    expect((read as Error).message).toBe(`The page's text could not be read: ${MINE}.`);
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

  it('a long left-to-right text in a right-to-left page is read in one call, its words apart as a visitor sees them: each character measured once, each space between its words judged once (round 12)', async () => {
    // Every word boundary there is where runs of two directions meet, judged where the runs meet (round 12): by whether
    // the space between the two words shows, one read of that space's box. How long the read takes depends on the
    // machine (1.7 to 4.3 s on GitHub's 2-CPU Windows machine; this test required under 20 s), so the test measures no
    // time. It reads with a limit that only stops a hung read, and checks the text and the read's work by count: the
    // first sample reads the layout once for each character it measures, the 32 after it read nothing (nothing on the
    // page changes), and the end of the read once for each space between two words at most, each with a few reads more
    // for the page's handful of elements. Reads of the layout that grow faster than the text fail these counts on any
    // machine; work on boxes already measured is not counted.
    const { seen, launch } = watched();
    // Five minutes a read, many times the slowest seen (4.3 s): a limit that only stops a hung read.
    const patient = playwrightPages({ timeoutMs: 300_000, launch });
    opened.push(patient);
    const words = Array.from({ length: 12000 }, (_, i) => `word${i}`).join(' ');
    const arabic = 'مرحبا بكم ١٩٩٨';
    const shown = await patient.shownText(`<!doctype html><html dir="rtl"><head><title>T</title></head><body><p>${words}</p><p>${arabic}</p></body></html>`, none);
    expect(shown.text.startsWith('word0 word1 word2 ')).toBe(true);
    expect(shown.text.endsWith(`word11999\n${arabic}`)).toBe(true);
    const characters = (words + arabic).replace(/\s/g, '').length;
    const spaces = (words + arabic).replace(/\S/g, '').length;
    const FEW = 100;
    expect(seen.contexts).toBe(1);
    expect(seen.samples.map((s) => [s.measured, s.layoutReads > 0])).toEqual([[2, true], ...Array.from({ length: 32 }, () => [0, false])]);
    expect(seen.samples[0]!.layoutReads).toBeGreaterThanOrEqual(characters);
    expect(seen.samples[0]!.layoutReads).toBeLessThanOrEqual(characters + FEW);
    expect(seen.finalLayoutReads).toBeLessThanOrEqual(spaces + FEW);
  }, 120_000);

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

  it('a file the page loads from an admitted host that fails, comes back cut off or with a server error is fetched again in a second read, then the read fails plainly; one slow to come is waited for (r12 verifier: Tailwind under load)', async () => {
    // A read that went on without a stylesheet or a script the page loads (Tailwind's browser build, under load) judged
    // an unstyled page as the one a visitor sees: its screen-reader-only text shown, its lines counted otherwise.
    const CAP = 64 * 1024;
    const hits: Record<string, number> = {};
    const cdn = createServer((req, res) => {
      const u = req.url ?? '';
      hits[u] = (hits[u] ?? 0) + 1;
      const css = (text: string) => void res.writeHead(200, { 'content-type': 'text/css' }).end(text);
      if (u === '/once.css') return hits[u] === 1 ? void req.socket.destroy() : css('.x{display:none}');
      if (u === '/never.css') return void req.socket.destroy();
      if (u === '/big.css') return css(`/*${'x'.repeat(CAP + 1024)}*/.x{display:none}`);
      if (u === '/busy.css') return void res.writeHead(503).end();
      if (u === '/slow.css') return void setTimeout(() => css('.x{display:none}'), 1_500);
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => cdn.listen(0, '127.0.0.1', () => r()));
    const host = `127.0.0.1:${(cdn.address() as AddressInfo).port}`;
    const reader = playwrightPages({ maxFetchBytes: CAP, admit: (u) => u.protocol === 'http:' && u.host === host, launch: () => launchWith(LOCAL_NETWORK_CHECKS_OFF) });
    opened.push(reader);
    const page = (file: string) => `<!doctype html><html><head><title>T</title><link rel="stylesheet" href="http://${host}/${file}"></head><body><p>Shown</p><p class="x">Gone</p></body></html>`;
    try {
      // A connection that fails once: the second read gets the stylesheet, and the page is read styled.
      expect((await reader.shownText(page('once.css'), none)).text).toBe('Shown\ufdec');
      expect(hits['/once.css']).toBe(2);
      for (const [file, what] of [
        ['never.css', 'could not be fetched'],
        ['big.css', 'came back cut off, larger than the 64 KiB byway takes from one file'],
        ['busy.css', 'came back with a server error (503)'],
      ] as const) {
        const err = await reader.shownText(page(file), none).catch((e: unknown) => e);
        expect(err, file).toBeInstanceOf(StepError);
        expect((err as Error).message, file).toMatch(new RegExp(`^The page's text could not be read as a visitor sees it: it loads http://${host.replace(/\./g, '\\.')}/${file.replace('.', '\\.')}, which ${what.replace(/[()]/g, '\\$&')}`));
        expect(hits[`/${file}`], file).toBe(2);
      }
      // A file that is not there is what a visitor's browser gets too: the page is read without it, once.
      expect((await reader.shownText(page('missing.css'), none)).text).toBe('Shown\nGone');
      expect(hits['/missing.css']).toBe(1);
      // A file the page itself stops asking for (an image whose source a script changes while it is on its way) is not a
      // file that failed: only the fetch failing counts.
      const dropped = `<!doctype html><html><head><title>T</title></head><body><p>Shown</p><img id="i" src="http://${host}/slow.css"><script>setTimeout(() => { document.getElementById('i').remove(); }, 0); document.getElementById('i').src = 'data:,';</script></body></html>`;
      expect((await reader.shownText(dropped, none)).text).toBe('Shown');
      // A stylesheet a script asks for once the page has loaded, slow to come, is waited for before the page is sampled.
      const late = `<!doctype html><html><head><title>T</title></head><body><p>Shown</p><p class="x">Gone</p><script>addEventListener('load', () => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'http://${host}/slow.css'; document.head.append(l); });</script></body></html>`;
      expect((await reader.shownText(late, none)).text).toBe('Shown\ufdec');
    } finally {
      await new Promise((r) => cdn.close(r));
    }
  }, 120_000);

  // How long a read of such a page takes depends on the machine. The read grows with the page: about 8 s for 20,000
  // elements left open on the owner's machine. Round 1's test, which required these reads to finish within the 30 s
  // deadline, took about 12 s there and 18 to 23 s on GitHub's 2-CPU Windows machine, and in run 39015137461 that read
  // ran past the deadline and failed plainly, as it should; with Chromium's CPU throttled 3 times, it fails the same way
  // on the owner's machine. So neither test below measures time.
  // The first reads with a reader whose limit only stops a hung read, and checks the text and the work: the first of the
  // 33 samples measures each text node once, and the 32 after it, with nothing on the page changed, read nothing of its
  // layout or style (r11: measuring every node again at each sample ran these pages past the deadline; without that,
  // the read of the 20,000-element page left open runs past 30 s on the owner's machine too). The second makes the read
  // slower than its deadline on any machine, and checks that it fails plainly, once.
  const NESTED = (n: number) => `<!doctype html><html><head><title>T</title></head><body><p>Keep</p><p>${'<span>'.repeat(n)}Gone${'</span>'.repeat(n)}</p></body></html>`;
  const OPEN = `<!doctype html><html><head><title>T</title></head><body><p>${Array.from({ length: 20_000 }, (_, i) => `<span>w${i} `).join('')}</p><p>Tail</p></body></html>`;
  /** A read's 33 samples on a page where nothing changes: [text nodes measured, whether it read the layout or style]. */
  const once = (nodes: number) => [[nodes, true], ...Array.from({ length: 32 }, () => [0, false])];

  it('a page nesting thousands of inline elements left open is read in one call, each text node measured once (r10: the JavaScript-off read crashed; r11)', async () => {
    const { seen, launch } = watched();
    // Five minutes a read, many times the slowest seen (about 30 s): a limit that only stops a hung read.
    const patient = playwrightPages({ timeoutMs: 300_000, launch });
    opened.push(patient);
    const read = async (html: string) => {
      seen.contexts = 0;
      seen.samples = [];
      const text = (await patient.shownText(html, none)).text;
      return { text, contexts: seen.contexts, samples: seen.samples.map((s) => [s.measured, s.layoutReads > 0]) };
    };
    for (const n of [5_000, 20_000]) expect(await read(NESTED(n)), String(n)).toEqual({ text: 'Keep\nGone', contexts: 1, samples: once(2) });
    const open = await read(OPEN);
    expect(open.text).toMatch(/^w0 w1 w2 [^]* w19999\nTail$/);
    expect(open).toMatchObject({ contexts: 1, samples: once(20_001) });
    expect((await read('<p>Next</p>')).text).toBe('Next');
  }, 1_500_000);

  it('a read slower than its deadline fails plainly at it, once, and the next read works, on any machine (SEC-5)', async () => {
    // The page above, read by a reader with a short deadline whose first sample is held until the read has failed: the
    // read cannot finish in time however fast the machine. Were the read to wait for its work past the deadline, it would
    // never fail, and the test would time out; were it read again, a second context would open.
    const { seen, launch } = watched();
    const quick = playwrightPages({ timeoutMs: 5_000, closeTimeoutMs: 2_000, launch });
    opened.push(quick);
    await quick.ready();
    // The readiness check drew byway's test page in a context of its own (ADR-0105).
    const before = seen.contexts;
    let release = () => {};
    seen.hold = new Promise<void>((r) => (release = r));
    try {
      const err = await quick.shownText(OPEN, none).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StepError);
      expect((err as Error).message).toBe('The page did not finish loading within 5 s, so its text could not be read.');
      expect(seen.contexts - before).toBe(1);
    } finally {
      release();
      seen.hold = undefined;
    }
    expect((await quick.shownText('<p>Next</p>', none)).text).toBe('Next');
  }, 60_000);

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

  it('vertical and turned text: whether two neighbours stand glued is judged along the text\'s own line, from its writing mode and its transforms (r12 verifier)', async () => {
    const cases: [string, string][] = [
      // Flex items set top to bottom in a vertical writing mode, with no gap, show glued (round 12 read a line break, so
      // it stored a typed space the item's edge drops, and refused words glued as the line has them).
      ['<div style="writing-mode:vertical-rl;display:flex;height:400px">Already registered?<a href="/l">Sign in</a> today</div>', 'Already registered?Sign intoday'],
      ['<div style="writing-mode:vertical-lr;display:flex;height:400px"><span>Fresh</span><a href="/b">bread</a></div>', 'Freshbread'],
      ['<div style="writing-mode:sideways-rl;display:flex;height:400px"><span>Fresh</span><a href="/b">bread</a></div>', 'Freshbread'],
      ['<div style="writing-mode:sideways-lr;display:flex;height:400px"><span>Fresh</span><a href="/b">bread</a></div>', 'Freshbread'],
      // With a gap they stand apart; words in one flow of text keep their spaces; a <br> and an inline block's edge part.
      ['<div style="writing-mode:vertical-rl;display:flex;gap:8px;height:400px"><span>Fresh</span><b>bread</b></div>', 'Fresh\nbread'],
      ['<div style="writing-mode:vertical-rl;height:400px">Already registered? <a href="/l">Sign in</a><br>Today</div>', 'Already registered? Sign in\nToday'],
      ['<div style="writing-mode:vertical-rl;text-orientation:upright;height:400px">Tags <span style="display:inline-block">NEW</span><span style="display:inline-block">HOT</span></div>', 'Tags\nNEWHOT'],
      // A label turned a quarter turn either way, or upside down, by transform or by rotate: its flex items glued, in order.
      ['<div style="position:absolute;left:0;top:300px;transform:rotate(-90deg);transform-origin:left top;display:flex"><span>Scroll</span><a href="/more">down</a> now</div>', 'Scrolldownnow'],
      ['<div style="position:absolute;left:40px;top:120px;transform:rotate(90deg);transform-origin:left top;display:flex">Find<a href="/m">menu</a></div>', 'Findmenu'],
      ['<div style="transform:rotate(180deg);display:flex;width:300px"><span>Upside</span><b>down</b></div>', 'Upsidedown'],
      ['<div style="rotate:90deg;display:flex;width:200px;margin:120px"><span>Turn</span><b>ed</b> by rotate</div>', 'Turnedby rotate'],
      // Turned at an angle: words in one flow of text keep their spaces (round 12 read "AlreadyhereSignin"), flex items
      // with no gap are glued and a margin parts them.
      ['<div style="transform:rotate(-30deg);width:400px;margin:150px">Already here <b>Sign in</b></div>', 'Already here Sign in'],
      ['<div style="transform:rotate(-30deg);display:flex;width:400px;margin:150px"><span>Already</span><a href="/l">Sign in</a></div>', 'AlreadySign in'],
      ['<div style="transform:rotate(-30deg);display:flex;width:400px;margin:150px"><span>Already</span><a href="/l" style="margin-left:6px">Sign in</a></div>', 'Already\nSign in'],
      ['<svg width="200" height="200"><text x="50" y="50" transform="rotate(90 50 50)">Hello world</text></svg>', 'Hello world'],
      // Skewed text (a slanted heading, a skewed badge): the gap along the line is measured between the characters'
      // advances, not their slanted outlines, which overlap the next character's (round 13's first fix read
      // "Bigsummersaletoday").
      ['<h2 style="transform:skewX(-12deg)">Big summer sale today</h2>', 'Big summer sale today'],
      ['<h2 style="transform:skewX(-20deg);font-size:32px;display:flex"><span>Big</span><b>summer</b> sale</h2>', 'Bigsummersale'],
      ['<p><span style="display:inline-block;transform:skewX(-12deg);padding:2px 8px">Hot deal</span> now</p>', 'Hot deal\nnow'],
      // Two labels turned a quarter turn in one column, sections apart, are not one line: apart across boxes, not in the
      // other order (round 13's first form of this rule read them as reversed, so deleting a ticker between two such
      // side labels was refused as words in another order).
      ['<div style="position:absolute;left:20px;top:300px;transform:rotate(-90deg);transform-origin:left top">Since 2011</div><div style="position:absolute;left:20px;top:900px;transform:rotate(-90deg);transform-origin:left top">01 Menu</div>', 'Since 2011\n01 Menu'],
      // Far apart along their line, the second after the first: apart across boxes. The second before the first in one
      // row of one box (row-reverse, order) is in the other order, as in straight text (round 13 read these apart, so a
      // visitor's "rye … Fresh" was stored as "Fresh rye").
      ['<div style="writing-mode:vertical-rl;display:flex;gap:5em;height:500px;font:20px Arial"><span>Fresh</span> <span>bread</span></div>', 'Fresh\nbread'],
      ['<div style="writing-mode:vertical-rl;display:flex;flex-direction:row-reverse;justify-content:flex-end;gap:5em;height:500px;font:20px Arial"><span>Fresh</span> <span>bread</span></div>', `Fresh${REVERSED}bread`],
      ['<div style="writing-mode:vertical-rl;display:flex;gap:5em;height:500px;font:20px Arial"><span>Fresh</span> <span style="order:-1">bread</span></div>', `Fresh${REVERSED}bread`],
      ['<div style="writing-mode:vertical-rl;display:flex;flex-direction:row-reverse;justify-content:space-between;height:400px;font:20px Arial"><span>Scroll</span> <span>down</span></div>', `Scroll${REVERSED}down`],
      ['<div style="position:absolute;left:30px;top:450px;transform:rotate(-90deg);transform-origin:left top;display:flex;flex-direction:row-reverse;justify-content:space-between;width:400px;font:20px Arial"><span>Scroll</span> <span>down</span></div>', `Scroll${REVERSED}down`],
      ['<div style="position:absolute;left:30px;top:450px;transform:rotate(-90deg);transform-origin:left top;display:flex;gap:5em;width:400px;font:20px Arial"><span>Fresh</span> <span style="order:-1">bread</span></div>', `Fresh${REVERSED}bread`],
      // A slight tilt beside straight text is measured along their common line.
      ['<p>Sale <span style="display:inline-block;transform:rotate(3deg)">now</span></p>', 'Sale\nnow'],
      ['<p>Sale<span style="display:inline-block;transform:rotate(3deg)">now</span></p>', 'Salenow'],
      // A word turned against the text beside it is judged by their shapes on the screen: apart where those stand apart.
      ['<p>Menu <span style="display:inline-block;transform:rotate(90deg)">Today</span></p>', 'Menu\nToday'],
      ['<div style="position:absolute;left:300px;top:40px;transform:rotate(90deg);transform-origin:left top">Side</div><p style="margin-top:200px">Body</p>', 'Side\nBody'],
      // Where the read cannot measure (a turn near an eighth of a turn, a turn in 3D) and the two stand near, a box's edge
      // between them is never read as parting them: they are glued, marked as not measured (TURNED); in one flow of text
      // they are as the text runs them.
      ['<div style="transform:rotate(-45deg);display:flex;width:400px;margin:150px"><span>Already here</span><b>Sign in</b></div>', `Already here${TURNED}Sign in`],
      ['<div style="transform:perspective(400px) rotateY(40deg);display:flex;width:400px;margin:100px"><span>Tilted card</span><b>Go</b></div>', `Tilted card${TURNED}Go`],
    ];
    for (const [b, want] of cases) expect((await pages.shownText(body(b), none)).text, b).toBe(want);
  }, 120_000);

  it('neighbours across a box\'s edge offset across their line (an item raised or lowered beside the next) stand on one row: where they meet along it the read cannot tell whether they stand apart, and the second before the first is in the other order (r13 verifier)', async () => {
    const cases: [string, string][] = [
      // Round 12 and 13 read a pair across a box's edge overlapping across the line by less than half the smaller box as
      // on rows of their own, apart across boxes however close they stood, and never checked their order: they stored
      // "Sign in today" a visitor sees as "Sign intoday" beside a lowered link, and "Fresh rye" a visitor reads "rye Fresh".
      // Lowered by a relative offset, a margin or padding, as beside align-items:flex-start; in straight and vertical text.
      ['<p style="display:flex;align-items:flex-start;font:20px Arial"><span>Already have an account?</span><a href="/l" style="position:relative;top:14px">Sign in</a> today</p>', `Already have an account?${OFFSET}Sign in${OFFSET}today`],
      ['<p style="display:flex;align-items:flex-start;font:20px Arial"><span>Fresh</span><span style="margin-top:14px">bread</span></p>', `Fresh${OFFSET}bread`],
      ['<p style="display:flex;align-items:flex-start;font:20px Arial"><span>Fresh</span><span style="margin-top:12px">bread</span></p>', `Fresh${OFFSET}bread`],
      ['<p style="display:flex;align-items:flex-start;font:20px Arial"><span>Fresh</span><span style="margin-top:20px">bread</span></p>', `Fresh${OFFSET}bread`],
      ['<p style="display:flex;align-items:flex-start;font:18px/28px Arial">Already have an account?<a href="/l" style="padding-top:16px">Sign in</a></p>', `Already have an account?${OFFSET}Sign in`],
      ['<div style="writing-mode:vertical-rl;display:flex;align-items:flex-start;height:300px;font:20px Arial"><span>Fresh</span><span style="margin-block-start:14px">bread</span></div>', `Fresh${OFFSET}bread`],
      // Offset by less than half the box: one row, glued; a gap along the line parts them.
      ['<p style="display:flex;align-items:flex-start;font:20px Arial"><span>Fresh</span><span style="margin-top:8px">bread</span></p>', 'Freshbread'],
      ['<p style="display:flex;align-items:flex-start;gap:8px;font:20px Arial"><span>Fresh</span><span style="margin-top:14px">bread</span></p>', 'Fresh\nbread'],
      // The second before the first along the line: in the other order.
      ['<p style="display:flex;flex-direction:row-reverse;justify-content:flex-end;align-items:flex-start;gap:6px;font:20px Arial"><span>Fresh</span> <span style="margin-top:14px">bread</span></p>', `Fresh${REVERSED}bread`],
      // Rows of their own stay apart across boxes, though their letters' boxes overlap where lines are set solid: a block
      // that starts where the one above ends, flex items wrapped onto the next row, words in inline blocks wrapped.
      ['<div style="font:20px/1 \'Courier New\',monospace"><div>Fresh</div><div style="margin-left:60px">bread</div></div>', 'Fresh\nbread'],
      ['<p style="display:flex;flex-wrap:wrap;width:120px;font:48px/.85 Arial"><span>Big</span><span>bold</span></p>', 'Big\nbold'],
      ['<h1 style="font:64px/.9 Arial;width:300px"><span style="display:inline-block">Fresh</span> <span style="display:inline-block">bread</span></h1>', 'Fresh\nbread'],
      // A line pulled up over the one before by a negative margin overlaps it along the line, so it is not beside it.
      ['<h2 style="font:36px Arial;margin:0">Fresh bread daily</h2><p style="margin:-8px 0 0;font:16px Arial">Baked every morning</p>', 'Fresh bread daily\nBaked every morning'],
    ];
    for (const [b, want] of cases) expect((await pages.shownText(body(b), none)).text, b).toBe(want);
  }, 120_000);

  it('a box a transform turns or scales clips its text where it stands on the screen, and an ellipsis cuts vertical or turned text where it cuts a line (r12 measured the clip unturned)', async () => {
    const shown = await pages.shownText(
      body(
        [
          // Turned a quarter turn: the box keeps "Shown" and cuts "Cut", 100 px along its own line.
          '<div style="position:absolute;left:300px;top:40px;transform:rotate(90deg);transform-origin:left top;width:80px;height:20px;line-height:20px;overflow:hidden;white-space:nowrap">Shown<span style="margin-left:100px">Cut</span></div>',
          // Scaled up, as a hero's slow zoom or a card's scale-105: the text by its right edge shows.
          '<div style="margin:160px 0 0 40px;width:300px;transform:scale(1.1);overflow:hidden"><p style="margin:0;text-align:right">Right edge</p></div>',
          // Tilted a little, as a card turned 2 degrees.
          '<div style="margin:40px;width:300px;transform:rotate(2deg);overflow:hidden"><p style="margin:0;text-align:right">Tilted edge</p></div>',
        ].join(''),
      ),
      none,
    );
    expect(shown.text).toBe('Shown﷭\nRight edge\nTilted edge');
    expect(shown.hidden).toEqual([['Cut', null]]);
    // An ellipsis cuts the same characters from a line set top to bottom, or turned a quarter turn, as from the line laid
    // out across the page.
    const line = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0;font:16px Arial';
    const across = await pages.shownText(body(`<p style="width:120px;${line}">Fresh bread baked every day</p>`), none);
    expect(across.text).toMatch(/^Fresh [^﷭]+﷭$/);
    const down = await pages.shownText(body(`<p style="writing-mode:vertical-rl;height:120px;${line}">Fresh bread baked every day</p>`), none);
    const turned = await pages.shownText(body(`<p style="position:absolute;left:300px;top:40px;transform:rotate(90deg);transform-origin:left top;width:120px;${line}">Fresh bread baked every day</p>`), none);
    for (const r of [down, turned]) {
      expect(r.text).toBe(across.text);
      expect(r.hidden).toEqual(across.hidden);
    }
  }, 60_000);

  it('an ellipsis, a line clamp and a box of fixed height cut the same characters in a box a transform scales or CSS zoom shrinks as at full size (r13 verifier)', async () => {
    // Round 13 set the ellipsis's band from the box's scaled place and its unscaled width, so under scale(0.9) or zoom:0.9
    // the last letters an ellipsis cut were read as shown, and under zoom a box of fixed height kept a row it cuts.
    const kinds: Record<string, (wrap: string) => string> = {
      truncate: (wrap) => body(`<div style="${wrap}"><p style="width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:16px Arial;margin:0">Fresh sourdough bread daily</p><p>Second line</p></div>`),
      clamp: (wrap) => body(`<div style="${wrap}"><p style="width:200px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font:16px/20px Arial;margin:0">Fresh bread baked every single morning by hand in the oven</p><p>Second line</p></div>`),
      fixed: (wrap) => body(`<div style="${wrap}"><p style="width:220px;height:28px;overflow:hidden;font:16px/20px Arial;margin:0">Fresh bread every morning with our sourdough starter</p><p>Second line</p></div>`),
    };
    for (const [kind, page] of Object.entries(kinds)) {
      const full = await pages.shownText(page(''), none);
      expect(full.hidden.length, kind).toBe(1);
      for (const wrap of ['transform:scale(0.9);transform-origin:left top', 'transform:scale(0.8);transform-origin:left top', 'transform:scale(1.1);transform-origin:left top', 'zoom:0.9', 'zoom:0.8']) {
        const r = await pages.shownText(page(wrap), none);
        expect(r.text, `${kind} ${wrap}`).toBe(full.text);
        expect(r.hidden, `${kind} ${wrap}`).toEqual(full.hidden);
      }
    }
  }, 120_000);

  it('a 3D transform that keeps the element\'s own plane flat (AOS\'s flip at rest, vanilla-tilt at rest, translateZ(0)) is read as flat: its box clips where it stands and its flex rows are measured (r13 verifier)', async () => {
    // Round 13 read any transform holding perspective() as a turn in 3D: a card that hides its overflow kept nothing, so
    // its lines were not offered, said to be hidden from sight, and its flex rows were read as not measured.
    const card = (tf: string) => body(`<div style="transform:${tf};overflow:hidden;width:400px;padding:16px"><h3>Fresh bread</h3><p style="display:flex">Already a member? <a href="/in">Sign in</a></p></div><div style="transform:${tf};width:400px;padding:16px"><p style="display:flex">Price: <b>$20</b></p></div>`);
    for (const tf of ['perspective(2500px) rotateY(0)', 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)', 'perspective(1000px)', 'translateZ(0)', 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)']) {
      const r = await pages.shownText(card(tf), none);
      expect(r.text, tf).toBe('Fresh bread\nAlready a member?Sign in\nPrice:$20');
      expect(r.hidden, tf).toEqual([]);
    }
    // As AOS 2.3.4 runs a flip (its stylesheet's flip-left and flip-up, the class its script adds) and vanilla-tilt 1.8.1
    // rests (the transform its reset sets), on cards that hide their overflow.
    const aos = '<style>[data-aos^=flip]{backface-visibility:hidden;transition-property:transform;transition-duration:.4s}[data-aos=flip-left]{transform:perspective(2500px) rotateY(-100deg)}[data-aos=flip-left].aos-animate{transform:perspective(2500px) rotateY(0)}[data-aos=flip-up]{transform:perspective(2500px) rotateX(-100deg)}[data-aos=flip-up].aos-animate{transform:perspective(2500px) rotateX(0)}.c{overflow:hidden;padding:24px;width:320px;display:inline-block;vertical-align:top}</style>';
    const flips = await pages.shownText(body(`${aos}<div class="c" data-aos="flip-left"><h3>Brand identity</h3><p>Logos, type and colour.</p></div><div class="c" data-aos="flip-up"><h3>Web design</h3><p>Fast sites.</p></div><script>addEventListener('load', () => document.querySelectorAll('[data-aos]').forEach((e) => e.classList.add('aos-animate')));</script>`), none);
    expect(flips.text).toBe('Brand identity\nLogos, type and colour.\nWeb design\nFast sites.');
    const tilt = await pages.shownText(body('<div class="t" style="overflow:hidden;padding:24px;width:320px;will-change:transform"><h3>Harbour Coffee</h3><p style="display:flex"><span>A brand</span><b>for a café</b></p></div><script>document.querySelectorAll(".t").forEach((e) => { e.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)"; });</script>'), none);
    expect(tilt.text).toBe('Harbour Coffee\nA brandfor a café');
    // A 3D matrix that tilts the plane, or a box its parent sets in 3D and moves out of the plane, is still not read.
    expect((await pages.shownText(body('<div style="transform:perspective(1000px) rotateX(0deg);transform-style:preserve-3d;width:400px"><p style="display:flex;transform:translateZ(50px)"><span>Fresh</span><b>bread</b></p></div>'), none)).text).toBe(`Fresh${TURNED}bread`);
  }, 60_000);

  it('an endless animation is judged at each of the points of its cycle the read holds it at: two neighbours glued at any of them are glued (r12 verifier: a nudge judged at its first keyframe)', async () => {
    const css = '<style>@keyframes nudge{0%{transform:translateX(-14px)}8%,100%{transform:none}}.n{display:inline-block;margin-left:24px;animation:nudge 3s infinite}@keyframes peek{0%{transform:translateY(-120%)}10%,100%{transform:none}}.peek{display:inline-block;animation:peek 4s infinite}</style>';
    // The link rests glued to the words after it (a flex item whose leading space a browser drops) for all of its cycle
    // but its start, where round 12 judged it and stored "Sign intoday".
    expect((await pages.shownText(body(`${css}<p style="display:flex">Already have an account?<a class="n" href="/l">Sign in</a> today</p>`), none)).text).toBe('Already have an account?\nSign intoday');
    // A badge that rests glued to its heading and peeks in from above at the start of its cycle.
    expect((await pages.shownText(body(`${css}<h2 style="display:flex"><span>Pricing</span><b class="peek">New</b></h2>`), none)).text).toBe('PricingNew');
    // A pulse that only fades, and one that never brings its item beside its neighbour, change nothing.
    const fade = '<style>@keyframes fade{50%{opacity:.4}}.f{animation:fade 2s infinite}</style>';
    expect((await pages.shownText(body(`${fade}<p style="display:flex;gap:6px"><span>Fresh</span><b class="f">bread</b></p>`), none)).text).toBe('Fresh\nbread');
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
    // The reader's own limit only stops a hung read, so only the shared deadline can stop these reads before the test's
    // own timeout; the first read's page never finishes loading (its image never comes), so that read can end only at the
    // shared deadline, however fast the machine. Its message is the shared deadline's, not the reader's own limit's.
    // Nothing here measures time.
    let contexts = 0;
    const patient = playwrightPages({ timeoutMs: 300_000, launch: async () => seenThrough(await launchChromium(STATED), { context: (c) => (contexts++, c) }) });
    opened.push(patient);
    await patient.ready();
    const cut = 'The page did not finish loading in the time byway gives a page\'s reads, so its text could not be read.';
    const hang = '<!doctype html><html><body><img src="/api/artifacts/sha256:never">Text</body></html>';
    const never = () => new Promise<undefined>(() => undefined);
    const err = await patient.shownText(hang, never, { deadline: Date.now() + 1_500 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StepError);
    expect((err as Error).message).toBe(cut);
    // A read whose shared deadline has passed fails before it loads anything; one with time left reads the page.
    const before = contexts;
    const late = await patient.shownText('<p>Next</p>', none, { deadline: Date.now() - 1 }).catch((e: unknown) => e);
    expect(late).toBeInstanceOf(StepError);
    expect((late as Error).message).toBe(cut);
    expect(contexts).toBe(before);
    expect((await patient.shownText('<p>Next</p>', none, { deadline: Date.now() + 300_000 })).text).toBe('Next');
    expect(contexts).toBe(before + 1);
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
    const failing = playwrightPages({ launch: async () => crashing(await launchChromium(STATED)) });
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
