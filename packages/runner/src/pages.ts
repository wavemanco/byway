/**
 * RENDER for web pages (spec §3.1 `view`, §3.2), with Playwright Chromium. A page is rendered as the surfaces the
 * protocol's RENDER makes (06-runbook §1) and the critic, defect-check and tells-sweep prompts name (RENDER-1):
 * - `desktop`: the whole page on a wide screen, 1440 px wide;
 * - `mobile`: the whole page on a phone, 390 × 844 (a mobile viewport, so the page's own viewport tag applies);
 * - `fold`: the first screen as a visitor lands, 1440 × 900, not scrolled.
 * Whole pages are tiled into screenshots at most 2576 px tall, and at most 2576 px wide (a page wider than its screen
 * is shot as wide as it overflows, so the overflow shows). Motion is reduced; the network is blocked except an
 * allowlist (Google Fonts, jsDelivr, unpkg, cdnjs) and the local artifact route, served from the artifact store, and
 * WebSockets and non-proxied WebRTC are blocked as well (ENG-14).
 *
 * A render is bounded (SEC-5): everything from loading the page to the last screenshot runs under one deadline. A
 * page that never settles (a script that loops after load) has its context closed, which stops its renderer, and the
 * render fails with a plain message that is not retried. A render whose step is cancelled stops the same way. Dialogs
 * the page opens (alert, confirm, prompt, even in a loop) are dismissed by byway, and a dismissal that fails because the
 * page was closed is swallowed, so such a page cannot end the engine's process. A browser that crashed, disconnected or
 * failed to launch is launched again on the next render (ENG-14).
 */
import type { Browser, BrowserContext, Page, Route } from 'playwright';
import { StepError } from './activities/failures.ts';
import type { Surface } from './types.ts';

export type { Surface } from './types.ts';
export { isSurface, SURFACES } from './surfaces.ts';

/** One surface's screenshots: whole-page tiles top to bottom, or the single first-screen shot. */
export interface SurfaceShots {
  surface: Surface;
  tiles: Uint8Array[];
}

export interface RenderOptions {
  /** Stops the render (closing its page) when aborted: the step was cancelled. */
  signal?: AbortSignal;
}

/** Serves `/api/artifacts/<id>` requests from the artifact store; undefined is a 404. */
export type ArtifactResolver = (artifactId: string) => Promise<{ body: Uint8Array; contentType: string } | undefined>;

export interface PageRenderer {
  /** PNG tiles of the whole page on a wide screen, top to bottom. */
  screenshots(html: string, resolve: ArtifactResolver, opts?: RenderOptions): Promise<Uint8Array[]>;
  /** The page as each surface shows it, in the order asked. */
  render(html: string, resolve: ArtifactResolver, surfaces: readonly Surface[], opts?: RenderOptions): Promise<SurfaceShots[]>;
  close(): Promise<void>;
}

/** Hosts a rendered page may load from (spec §3.2). Everything else is blocked. */
export const RENDER_ALLOWLIST: readonly string[] = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com'];

/** Chromium flags: WebRTC may not open UDP paths around the request filter. */
const LAUNCH_ARGS = ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--webrtc-ip-handling-policy=disable_non_proxied_udp'];

export interface PlaywrightPagesOptions {
  /** Wide-screen width (and the first screen's). */
  width?: number;
  /** The phone's screen. */
  mobile?: { width: number; height: number };
  /** Tile height limit: 2576 px keeps every tile inside the image models' size limits. */
  maxTileHeight?: number;
  /** Tile width limit, for a page that overflows its screen sideways. */
  maxTileWidth?: number;
  /** A runaway page stops here rather than producing dozens of tiles (per surface). */
  maxTiles?: number;
  allowHosts?: readonly string[];
  /** How long one surface may take, from loading the page to its last screenshot. */
  timeoutMs?: number;
  /** How long closing a stuck page may take before the whole browser is closed and relaunched. */
  closeTimeoutMs?: number;
  /** Launches the browser; defaults to headless Playwright Chromium with LAUNCH_ARGS. Tests inject their own. */
  launch?: () => Promise<Browser>;
}

/** A private origin the page is served from, so relative artifact routes resolve without touching the network. */
const ORIGIN = 'http://byway-render.localhost';
const FOLD_HEIGHT = 900;

const sleep = (ms: number) => new Promise<'late'>((r) => setTimeout(() => r('late'), ms).unref());

export function playwrightPages(opts: PlaywrightPagesOptions = {}): PageRenderer {
  const width = opts.width ?? 1440;
  const mobile = opts.mobile ?? { width: 390, height: 844 };
  const maxTile = opts.maxTileHeight ?? 2576;
  const maxWidth = opts.maxTileWidth ?? 2576;
  const maxTiles = opts.maxTiles ?? 8;
  const allow = new Set(opts.allowHosts ?? RENDER_ALLOWLIST);
  const timeout = opts.timeoutMs ?? 30_000;
  const closeTimeout = opts.closeTimeoutMs ?? 5_000;
  let browser: Promise<Browser> | undefined;

  /** The shared browser, launched again after a failed launch, a crash or a disconnect. */
  const getBrowser = async (): Promise<Browser> => {
    for (let current = browser; current; current = browser) {
      const b = await current.catch(() => undefined);
      if (b?.isConnected()) return b;
      // Gone: forget it, unless a concurrent render already launched a new one (then look again).
      if (browser === current) browser = undefined;
    }
    const launching = (async () => {
      const b = await (opts.launch ?? launchChromium)();
      b.on('disconnected', () => {
        if (browser === launching) browser = undefined;
      });
      return b;
    })();
    browser = launching;
    launching.catch(() => {
      if (browser === launching) browser = undefined;
    });
    return launching;
  };

  /** Close a context; if a stuck renderer keeps it from closing, close the browser too (relaunched on next use). */
  const dispose = async (b: Browser, context: BrowserContext): Promise<void> => {
    const closed = await Promise.race([context.close().then(() => 'closed' as const, () => 'closed' as const), sleep(closeTimeout)]);
    if (closed === 'late') {
      if (browser && (await browser.catch(() => undefined)) === b) browser = undefined;
      await Promise.race([b.close().catch(() => undefined), sleep(closeTimeout)]);
    }
  };

  const route = (html: string, resolve: ArtifactResolver) => async (r: Route) => {
    try {
      const url = new URL(r.request().url());
      if (url.origin === ORIGIN) {
        if (url.pathname === '/page') return await r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
        const m = /^\/api\/artifacts\/(.+)$/.exec(url.pathname);
        const found = m ? await resolve(decodeURIComponent(m[1] as string)) : undefined;
        return await (found ? r.fulfill({ status: 200, contentType: found.contentType, body: Buffer.from(found.body) }) : r.fulfill({ status: 404, body: '' }));
      }
      if (url.protocol === 'https:' && allow.has(url.hostname)) return await r.continue();
      return await r.abort('blockedbyclient');
    } catch {
      // A resolver that failed (a missing or corrupt artifact) is a 404; a page already closed needs no answer.
      await r.fulfill({ status: 404, body: '' }).catch(() => undefined);
    }
  };

  /** Whole-page tiles at the page's width (at least the screen's, at most maxWidth). */
  const tilesOf = async (page: Page, screenWidth: number): Promise<Uint8Array[]> => {
    // Strings, not functions: this package compiles without the DOM library.
    const size = JSON.parse(
      String(
        await page.evaluate(
          'JSON.stringify({ w: Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0, 1), h: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0, 1) })',
        ),
      ),
    ) as { w: number; h: number };
    const w = Math.min(Math.max(screenWidth, size.w), maxWidth);
    const tiles: Uint8Array[] = [];
    for (let y = 0; y < size.h && tiles.length < maxTiles; y += maxTile) {
      const shot = await page.screenshot({ type: 'png', fullPage: true, animations: 'disabled', clip: { x: 0, y, width: w, height: Math.min(maxTile, size.h - y) } });
      tiles.push(new Uint8Array(shot));
    }
    return tiles;
  };

  /** One screen size: load the page once and take the surfaces it serves, all under one deadline. */
  const shoot = async (html: string, resolve: ArtifactResolver, screen: 'wide' | 'phone', want: readonly Surface[], signal: AbortSignal | undefined): Promise<SurfaceShots[]> => {
    if (signal?.aborted) throw stopped(signal);
    const b = await getBrowser();
    const phone = screen === 'phone';
    const context = await b.newContext({
      viewport: phone ? mobile : { width, height: FOLD_HEIGHT },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
      ...(phone ? { isMobile: true, hasTouch: true } : {}),
    });
    // Every dialog any page of this context opens (alert, confirm, prompt, also from a popup) is answered here, and a
    // failed answer is swallowed. Without a listener Playwright answers them itself, and when the deadline closes the
    // context while a page opens dialogs in a loop, its own answer rejects unhandled ("session closed") and ends the
    // process the renderer runs in, which is the engine (SEC-5).
    context.on('dialog', (dialog) => {
      (dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss()).catch(() => undefined);
    });
    let timer: NodeJS.Timeout | undefined;
    let onAbort: (() => void) | undefined;
    try {
      const work = (async () => {
        await context.routeWebSocket(/.*/, (ws) => ws.close());
        await context.route('**/*', route(html, resolve));
        const page = await context.newPage();
        page.setDefaultTimeout(timeout);
        await page.goto(`${ORIGIN}/page`, { waitUntil: 'load', timeout });
        await page.evaluate('document.fonts ? document.fonts.ready.then(() => true) : true');
        const out: SurfaceShots[] = [];
        // The first screen is taken before anything else touches the page: as a visitor lands.
        for (const surface of [...want].sort((a, b) => Number(b === 'fold') - Number(a === 'fold'))) {
          if (surface === 'fold') {
            await page.evaluate('window.scrollTo(0, 0)');
            out.push({ surface, tiles: [new Uint8Array(await page.screenshot({ type: 'png', animations: 'disabled' }))] });
          } else {
            out.push({ surface, tiles: await tilesOf(page, phone ? mobile.width : width) });
          }
        }
        return out;
      })();
      // Whichever loses the race below still settles later; it must not become an unhandled rejection.
      work.catch(() => undefined);
      const limit = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new StepError(`The page did not finish rendering within ${Math.round(timeout / 1000)} s, so it could not be shown.`)), timeout);
        if (signal) {
          onAbort = () => reject(stopped(signal));
          signal.addEventListener('abort', onAbort, { once: true });
        }
      });
      limit.catch(() => undefined);
      return await Promise.race([work, limit]);
    } finally {
      if (timer) clearTimeout(timer);
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
      await dispose(b, context);
    }
  };

  const render: PageRenderer['render'] = async (html, resolve, surfaces, renderOpts = {}) => {
    const wide = surfaces.filter((s) => s !== 'mobile');
    const shots = [
      ...(wide.length ? await shoot(html, resolve, 'wide', wide, renderOpts.signal) : []),
      ...(surfaces.includes('mobile') ? await shoot(html, resolve, 'phone', ['mobile'], renderOpts.signal) : []),
    ];
    return surfaces.map((s) => shots.find((x) => x.surface === s)!);
  };

  return {
    render,
    async screenshots(html, resolve, renderOpts) {
      return (await render(html, resolve, ['desktop'], renderOpts))[0]!.tiles;
    },
    async close() {
      const current = browser;
      browser = undefined;
      const b = await current?.catch(() => undefined);
      await b?.close();
    },
  };
}

/** Headless Chromium with the flags above. */
export async function launchChromium(extraArgs: readonly string[] = []): Promise<Browser> {
  const { chromium } = await import('playwright');
  return chromium.launch({ headless: true, args: [...LAUNCH_ARGS, ...extraArgs] });
}

/** The error a cancelled render ends with: the signal's own reason (Temporal's CancelledFailure) when it has one. */
function stopped(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('The render was stopped.');
}
