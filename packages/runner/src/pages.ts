/**
 * RENDER for web pages (spec §3.1 `view`, §3.2), with Playwright Chromium. A page is rendered as the surfaces the
 * protocol's RENDER makes (06-runbook §1) and the critic, defect-check and tells-sweep prompts name (RENDER-1):
 * - `desktop`: the whole page on a wide screen, 1440 px wide;
 * - `mobile`: the whole page on a phone, 390 × 844 (a mobile viewport, so the page's own viewport tag applies);
 * - `fold`: the first screen as a visitor lands, 1440 × 900, not scrolled.
 * Whole pages are tiled into screenshots at most 2576 px tall, and at most 2576 px wide (a page wider than its screen
 * is shot as wide as it overflows, so the overflow shows). Motion is reduced; the network is blocked except an
 * allowlist (Google Fonts, jsDelivr, unpkg, cdnjs), checked on every redirect hop too, and the local artifact route,
 * served from the artifact store, and WebSockets and non-proxied WebRTC are blocked as well (ENG-14).
 *
 * A render is bounded (SEC-5): everything from loading the page to the last screenshot runs under one deadline. A
 * page that never settles (a script that loops after load) has its context closed, which stops its renderer, and the
 * render fails with a plain message that is not retried. A render whose step is cancelled stops the same way. Dialogs
 * the page opens (alert, confirm, prompt, even in a loop) are dismissed by byway, and a dismissal that fails because the
 * page was closed is swallowed, so such a page cannot end the engine's process. A browser that crashed, disconnected or
 * failed to launch is launched again on the next render (ENG-14).
 *
 * The renderer is shared by every medium, not only web pages: it draws C1 views of model-written HTML and JavaScript,
 * web-page references given as HTML, and the cards a GREAT critic sees whenever a lineup mixes forms (BLIND-1), which
 * decode reference images people upload and images providers return. All of that is untrusted, so its Chromium is
 * started in one place with one stated policy (F18; ADR-0084): chromiumLaunchOptions() says how; launchChromium() is the
 * only production launch and takes no parameter, so no caller can add a flag; Chromium's environment holds no provider
 * key, nothing secret-looking and nothing from the secrets file; and a Chromium that cannot start fails every use with
 * one plain message that is not retried. Whether Chromium's OS sandbox is on (RENDERER_OS_SANDBOX) is kept as it always
 * was until the owner decides. ready() and checkRenderer() say whether the renderer can start before a run that needs
 * it spends anything.
 */
import type { Browser, BrowserContext, LaunchOptions, Page, Route } from 'playwright';
import { namesFromEnvFile, withoutSecrets, type Env } from '@byway/gateway';
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
  /**
   * Starts the shared browser, or finds it running, so a run that will need it can be refused before anything is
   * spent; rejects as a render would when it cannot start. The browser it starts is the one later renders reuse.
   */
  ready(): Promise<void>;
  close(): Promise<void>;
}

/** Hosts a rendered page may load from (spec §3.2). Everything else is blocked. */
export const RENDER_ALLOWLIST: readonly string[] = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com'];

/** Whether a rendered page may load `url` from the network: HTTPS from an allowlisted host. */
export function allowedUrl(url: URL, hosts: ReadonlySet<string>): boolean {
  return url.protocol === 'https:' && hosts.has(url.hostname);
}

/** Chromium flags: WebRTC may not open UDP paths around the request filter. */
const LAUNCH_ARGS: readonly string[] = ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--webrtc-ip-handling-policy=disable_non_proxied_udp'];

/**
 * Whether the renderer's Chromium runs inside its OS sandbox: the one place byway states it. It is off, as it always
 * has been (Playwright's default, which adds --no-sandbox to every Chromium process), and stays off until the owner
 * decides (docs/reviews/2026-10-08-external-review-verification.md §4 item 2; ADR-0084). Switching it on was verified
 * on Windows 11 (the renderer drops to Untrusted integrity, tiles are pixel-identical, a launch takes about 100 ms), but
 * a host that cannot start the sandbox (Linux with unprivileged user namespaces restricted, running as root or in a
 * container) would then stop rendering, and whether an owner opt-out should exist belongs to the same decision.
 */
export const RENDERER_OS_SANDBOX: boolean = false;

/**
 * How the renderer's Chromium is launched, for every use of it. `env` exists so tests can pass a fixture; it can only
 * take variables away. Playwright would otherwise hand Chromium the engine's whole environment, provider keys included;
 * it gets none of them, nothing secret-looking and no name the secrets file listed (withoutSecrets, the rule `next build`
 * also follows: ADR-0030's "keys never enter a sandbox", applied to the renderer).
 */
export function chromiumLaunchOptions(env: Env = process.env): LaunchOptions {
  return { headless: true, chromiumSandbox: RENDERER_OS_SANDBOX, args: [...LAUNCH_ARGS], env: withoutSecrets(env, namesFromEnvFile(env)) };
}

/** What to run when Playwright's Chromium was never downloaded (it is a separate download from the package). */
const INSTALL_CHROMIUM = 'pnpm --filter ./apps/web exec playwright install chromium';

/**
 * A Chromium that could not start, as one plain step failure for every use of the renderer (a web page's view, an HTML
 * reference, a lineup card, the readiness check). Not retried: a missing or broken Chromium does not start on a second
 * try, and a retry would only repeat the wait. Playwright's first line says what went wrong; its box of advice and its
 * call log stay on the cause.
 */
export function launchFailure(err: unknown): StepError {
  const first = (err instanceof Error ? err.message : String(err)).split(/\r?\n/)[0] ?? '';
  const said = first.replace(/^browserType\.launch:\s*/, '').trim().replace(/\.$/, '');
  return new StepError(`The page renderer could not start (${said}), so pages, and the cards that show a reviewer the examples beside the work, cannot be drawn. If Playwright's Chromium is not installed: ${INSTALL_CHROMIUM}`, {
    cause: err,
  });
}

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
  /**
   * For tests only: which network URLs a page may load, in place of the rule (HTTPS from `allowHosts`), because a local
   * test server speaks plain HTTP. Production passes none.
   */
  admit?: (url: URL) => boolean;
  /** How long one surface may take, from loading the page to its last screenshot. */
  timeoutMs?: number;
  /** How long closing a stuck page may take before the whole browser is closed and relaunched. */
  closeTimeoutMs?: number;
  /** For tests only: how to launch the browser. Production passes none, so it is always launchChromium(). */
  launch?: () => Promise<Browser>;
}

/** A private origin the page is served from, so relative artifact routes resolve without touching the network. */
const ORIGIN = 'http://byway-render.localhost';
/** The statuses a response redirects with. */
const REDIRECTS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
/** Redirects one request may follow inside the allowlist (a CDN resolving a version takes one or two); more is a loop. */
const MAX_REDIRECTS = 5;
const FOLD_HEIGHT = 900;

const sleep = (ms: number) => new Promise<'late'>((r) => setTimeout(() => r('late'), ms).unref());

export function playwrightPages(opts: PlaywrightPagesOptions = {}): PageRenderer {
  const width = opts.width ?? 1440;
  const mobile = opts.mobile ?? { width: 390, height: 844 };
  const maxTile = opts.maxTileHeight ?? 2576;
  const maxWidth = opts.maxTileWidth ?? 2576;
  const maxTiles = opts.maxTiles ?? 8;
  const allow = new Set(opts.allowHosts ?? RENDER_ALLOWLIST);
  const admit = opts.admit ?? ((url: URL) => allowedUrl(url, allow));
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

  /**
   * An admitted request, fetched hop by hop. Playwright asks the route handler about a request's first URL only, and
   * Chromium follows a redirect by itself, so a request merely continued could be sent on from an allowlisted CDN to
   * any host. Here Playwright's request API fetches each hop without following redirects; a hop is followed only to a
   * URL the same rule admits, for a GET or HEAD, at most MAX_REDIRECTS times, and anything else is blocked. The page
   * gets the final response under the URL it asked for, so relative URLs inside it resolve against an admitted URL too.
   */
  const fetchAdmitted = async (r: Route, first: URL): Promise<void> => {
    const followable = ['GET', 'HEAD'].includes(r.request().method());
    let url = first;
    let response = await r.fetch({ maxRedirects: 0, timeout });
    for (let hops = 0; REDIRECTS.has(response.status()); hops++) {
      const location = response.headers()['location'];
      const next = location ? new URL(location, url) : undefined;
      await response.dispose();
      if (!next || !followable || hops >= MAX_REDIRECTS || !admit(next)) return await r.abort('blockedbyclient');
      url = next;
      response = await r.fetch({ url: next.href, maxRedirects: 0, timeout });
    }
    // The request API decodes the body (gzip, br), so the encoding and the encoded length no longer describe it.
    const headers = Object.fromEntries(Object.entries(response.headers()).filter(([name]) => name !== 'content-encoding' && name !== 'content-length'));
    await r.fulfill({ response, headers });
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
      if (admit(url)) return await fetchAdmitted(r, url);
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
          // A cancel that came while the browser started or the context opened has already fired: no event will follow.
          if (signal.aborted) onAbort();
          else signal.addEventListener('abort', onAbort, { once: true });
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
    try {
      const wide = surfaces.filter((s) => s !== 'mobile');
      const shots = [
        ...(wide.length ? await shoot(html, resolve, 'wide', wide, renderOpts.signal) : []),
        ...(surfaces.includes('mobile') ? await shoot(html, resolve, 'phone', ['mobile'], renderOpts.signal) : []),
      ];
      return surfaces.map((s) => shots.find((x) => x.surface === s)!);
    } catch (e) {
      throw drawFailure(e, renderOpts.signal);
    }
  };

  return {
    render,
    async ready() {
      await getBrowser();
    },
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

/**
 * The renderer's Chromium, launched once per call as chromiumLaunchOptions() says. It takes no parameter, so nothing
 * can add a flag to the production launch; a test that needs one composes it from chromiumLaunchOptions() in test code.
 * A failure to start is launchFailure's plain message.
 */
export async function launchChromium(): Promise<Browser> {
  try {
    const { chromium } = await import('playwright');
    return await chromium.launch(chromiumLaunchOptions());
  } catch (e) {
    throw launchFailure(e);
  }
}

export type RendererCheck = { ready: true } | { ready: false; message: string };

/**
 * Whether the renderer can start on this computer, for the "renderer" line byway prints at start-up. It makes the
 * stated launch once and closes it again, and never throws: byway keeps running either way, since prose, options and
 * code-diff runs need no renderer unless a lineup forms cards.
 */
export async function checkRenderer(): Promise<RendererCheck> {
  const pages = playwrightPages();
  try {
    await pages.ready();
    return { ready: true };
  } catch (e) {
    return { ready: false, message: (e instanceof StepError ? e : launchFailure(e)).message };
  } finally {
    await pages.close().catch(() => undefined);
  }
}

/**
 * A render's failure as its step sees it. A step failure (the deadline, a Chromium that could not start) and a cancel
 * (its own reason) pass as they are. Anything else is the renderer failing while it drew the page: a Playwright protocol
 * error ("Unable to capture screenshot", seen under load while a page opened dialogs), or a page or browser closed
 * underneath. That reached the step raw, an error the workflow does not know, so Temporal retried it as though it were
 * transient and the run showed Playwright's own words. It is one plain step failure instead, not retried, like the
 * deadline: Playwright's message (its method, the protocol command, its call log) stays on the cause.
 */
export function drawFailure(err: unknown, signal: AbortSignal | undefined): unknown {
  if (err instanceof StepError) return err;
  if (signal?.aborted) return stopped(signal);
  const first = (err instanceof Error ? err.message : String(err)).split(/\r?\n/)[0] ?? '';
  const said = first
    .replace(/^[\w.]+:\s*/, '')
    .replace(/^Protocol error \([^)]*\):\s*/, '')
    .trim()
    .replace(/\.$/, '');
  const what = /screenshot/i.test(first) ? 'could not take its screenshot' : 'failed while drawing it';
  return new StepError(`The page could not be drawn: the page renderer ${what}${said ? ` (${said})` : ''}.`, { cause: err });
}

/** The error a cancelled render ends with: the signal's own reason (Temporal's CancelledFailure) when it has one. */
function stopped(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('The render was stopped.');
}
