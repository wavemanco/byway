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
 *
 * The same renderer reads the text a page shows, for VOICE's arbiter (ADR-0081): the page is loaded with JavaScript off,
 * under the same allowlist, request filter and deadline as a render, and only its first document is read: a later
 * navigation the request filter sees (a meta refresh to an address) gets No Content, a move to a fragment of the page
 * keeps it, and a page that navigates away where no route sees it (a meta refresh to about:blank) is a plain StepError.
 * It reads what a sighted visitor sees, as the page settles (ShownText). It changes no sandbox setting.
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
  /**
   * The time (as Date.now()) by which the load must finish, as well as within the renderer's own timeout: reads that
   * share one deadline share its time (a VOICE question's two reads, inside an activity's one minute).
   */
  deadline?: number;
}

/** Serves `/api/artifacts/<id>` requests from the artifact store; undefined is a 404. */
export type ArtifactResolver = (artifactId: string) => Promise<{ body: Uint8Array; contentType: string } | undefined>;

/**
 * The text Chromium shows of a page, with JavaScript off (VOICE's arbiter, ADR-0081), as it settles (web fonts loaded,
 * animations and transitions taken to their end, an endless one stopped).
 * - `text` is what a sighted visitor sees: the body's innerText (the text as laid out, after display, visibility, the
 *   hidden attribute, whitespace collapsing and block breaks), with CSS text-transform undone first so letters read as
 *   written, and with every text node a style hides from sight taken out first ('' with no body). A text node is hidden
 *   from sight when Chromium lays it out but: it or an ancestor has opacity 0; its colour and fill are fully
 *   transparent, with no stroke, no shadow and no background clipped to the text; or none of its boxes, once clipped
 *   by every ancestor whose overflow is hidden or clip (an absolutely or fixed positioned element escapes those below
 *   its containing block), by an absolutely or fixed positioned ancestor's `clip` rect and by an ancestor's
 *   `clip-path: inset(…)`, keeps more than a pixel in each direction short of the page's top or start edge, beyond
 *   which no scrolling reaches (so a screen-reader-only class, font size 0 and text moved off the page are hidden).
 *   With JavaScript off, text a script would bring into sight (a section that waits at opacity 0 for a scroll
 *   animation's script) reads as hidden. An absolutely or fixed positioned element that then shows no text and holds
 *   no image or control is left out too: it stands outside the text's flow, so it breaks no line (innerText would put
 *   its box on a line of its own). Not detected: text covered by another element or coloured as its background, other
 *   clip-path shapes, masks and filters, and text clipped in part (an ellipsis);
 * - `linked` is the same text read again after each link's (`a[href]`) content is wrapped in markers: LINK_OPEN, the
 *   link's index in `hrefs` in the digits from LINK_DIGIT_0, LINK_INDEX_END, the content, LINK_CLOSE;
 * - `hidden` is each text node hidden from sight, in document order: its text (whitespace collapsed, ends trimmed) and
 *   its link's href, or null;
 * - `title` is document.title.
 */
export interface ShownText {
  title: string;
  text: string;
  linked: string;
  /** Each link's href attribute, by index. */
  hrefs: string[];
  hidden: [text: string, href: string | null][];
}

/** The markers in ShownText.linked: noncharacters, which a page does not show. */
export const LINK_OPEN = '﷐';
export const LINK_INDEX_END = '﷑';
export const LINK_CLOSE = '﷒';
/** The digit 0 of a link's index; 1 to 9 follow it. */
export const LINK_DIGIT_0 = 0xfde0;

export interface PageRenderer {
  /** PNG tiles of the whole page on a wide screen, top to bottom. */
  screenshots(html: string, resolve: ArtifactResolver, opts?: RenderOptions): Promise<Uint8Array[]>;
  /** The page as each surface shows it, in the order asked. */
  render(html: string, resolve: ArtifactResolver, surfaces: readonly Surface[], opts?: RenderOptions): Promise<SurfaceShots[]>;
  /** The text the page shows a sighted visitor, with JavaScript off (VOICE's arbiter). */
  shownText(html: string, resolve: ArtifactResolver, opts?: RenderOptions): Promise<ShownText>;
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
/** The address the page is served at. */
const PAGE_URL = `${ORIGIN}/page`;
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

  /**
   * The request filter: the page and the artifact route are served, allowlisted hosts pass, everything else is blocked.
   * With `oneDocument`, a second navigation (a meta refresh, a link followed) is answered with No Content, so the
   * browser stays on the first document, the one read.
   */
  const route = (html: string, resolve: ArtifactResolver, oneDocument = false) => {
    let navigated = false;
    return async (r: Route) => {
      try {
        const request = r.request();
        // (Any frame's: a frame's text is not the page's, and a navigation's frame may not be known yet.)
        if (oneDocument && request.isNavigationRequest()) {
          // No Content: browsers stay on the page (an aborted navigation would show an error page instead).
          if (navigated) return await r.fulfill({ status: 204, body: '' });
          navigated = true;
        }
        const url = new URL(request.url());
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

  /**
   * Load the page once in a fresh context and run `use` on it, everything under one deadline: a page that never
   * settles, or a step that is cancelled, has its context closed (SEC-5). `text` loads it with JavaScript off, for the
   * arbiter, and reads its first document only.
   */
  const loaded = async <T>(html: string, resolve: ArtifactResolver, screen: 'wide' | 'phone' | 'text', signal: AbortSignal | undefined, use: (page: Page) => Promise<T>, deadline?: number): Promise<T> => {
    if (signal?.aborted) throw stopped(signal);
    const text = screen === 'text';
    const late = (cut: boolean) => {
      if (cut) return new StepError(`The page did not finish ${text ? 'loading' : 'rendering'} in the time byway gives a page's ${text ? 'reads, so its text could not be read' : 'renders, so it could not be shown'}.`);
      const s = Math.round(timeout / 1000);
      return new StepError(text ? `The page did not finish loading within ${s} s, so its text could not be read.` : `The page did not finish rendering within ${s} s, so it could not be shown.`);
    };
    if (deadline !== undefined && deadline <= Date.now()) throw late(true);
    const b = await getBrowser();
    const phone = screen === 'phone';
    const context = await b.newContext({
      viewport: phone ? mobile : { width, height: FOLD_HEIGHT },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
      ...(phone ? { isMobile: true, hasTouch: true } : {}),
      // The arbiter reads the page as its markup and stylesheets make it: no script-made copy.
      ...(text ? { javaScriptEnabled: false } : {}),
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
        await context.route('**/*', route(html, resolve, text));
        const page = await context.newPage();
        page.setDefaultTimeout(timeout);
        await page.goto(PAGE_URL, { waitUntil: 'load', timeout });
        return use(page);
      })();
      // Whichever loses the race below still settles later; it must not become an unhandled rejection.
      work.catch(() => undefined);
      const limit = new Promise<never>((_, reject) => {
        const left = deadline === undefined ? timeout : Math.min(timeout, deadline - Date.now());
        timer = setTimeout(() => reject(late(left < timeout)), Math.max(left, 0));
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

  /** One screen size: load the page once and take the surfaces it serves, all under one deadline. */
  const shoot = (html: string, resolve: ArtifactResolver, screen: 'wide' | 'phone', want: readonly Surface[], signal: AbortSignal | undefined): Promise<SurfaceShots[]> =>
    loaded(html, resolve, screen, signal, async (page) => {
      const phone = screen === 'phone';
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
    });

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
    async shownText(html, resolve, renderOpts = {}) {
      return loaded(
        html,
        resolve,
        'text',
        renderOpts.signal,
        async (page) => {
          // Only the first document is read. A navigation no route sees (to about:blank or about:srcdoc) replaces it, or
          // destroys the context the read runs in: either way the page's own text cannot be read. A move to a fragment
          // of the page (#top) keeps the document, so it is not one.
          const first = (url: string) => url.replace(/#.*$/s, '') === PAGE_URL;
          let away = false;
          page.on('framenavigated', (frame) => {
            if (frame === page.mainFrame() && !first(frame.url())) away = true;
          });
          const gone = () => new StepError('The page navigates away as it loads (a meta refresh, for example), so the text it shows could not be read.');
          if (!first(page.url())) throw gone();
          let read: unknown;
          try {
            read = await page.evaluate(SHOWN_TEXT);
          } catch (e) {
            if (away || !first(page.url()) || /Execution context was destroyed/.test((e as Error).message)) throw gone();
            throw e;
          }
          if (away || !first(page.url())) throw gone();
          return JSON.parse(String(read)) as ShownText;
        },
        renderOpts.deadline,
      );
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
 * Read in the page (a string: this package compiles without the DOM library), in this order:
 * 1. The page's web fonts are waited for, and animations and transitions are taken to their end (an endless one, which
 *    cannot end, is stopped), so the page is read as it settles, not at a frame of a fade-in or in a fallback font.
 * 2. The text nodes a style hides from sight (ShownText) are found, on the page as laid out, and so are the absolutely
 *    or fixed positioned elements that then show no text. The noncharacters the arbiter marks a copy of the page with
 *    (U+FDD0 to U+FDEF) are taken out of the text while this is measured, and put back, so a marked copy is measured
 *    as the page itself is.
 * 3. Text-transform is undone on every element (inline and important, so no page rule wins) and on first letters and
 *    lines, each text node hidden from sight is emptied, and each such positioned element is not displayed; the body's
 *    innerText is read.
 * 4. In each text node inside a link, the characters between its first and last that are not whitespace are wrapped in
 *    the ShownText markers, and the text is read again. A marker stands beside a character, never beside whitespace
 *    alone, so it changes no whitespace a browser collapses or drops (as at a button's edge).
 * Text a page does not show as text (a script, a style, a textarea's value, a title, a template) is left alone.
 */
const SHOWN_TEXT = `(async () => {
  const title = document.title;
  const body = document.body;
  if (!body) return JSON.stringify({ title, text: '', linked: '', hrefs: [], hidden: [] });
  if (document.fonts) await document.fonts.ready;
  for (const a of document.getAnimations()) {
    try { a.finish(); } catch { a.cancel(); }
  }
  const nodes = [];
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (parent && !parent.closest('script, style, textarea, title, template')) nodes.push(n);
  }
  const MARK = /[\\ufdd0-\\ufdef]/;
  const MARKS = /[\\ufdd0-\\ufdef]/g;
  const SPACE = /^[ \\t\\n\\f\\r]*$/;
  const marked = new Map();
  for (const n of nodes) if (MARK.test(n.data)) { marked.set(n, n.data); n.data = n.data.replace(MARKS, ''); }
  // Hidden from sight (see ShownText), measured on the page as laid out.
  const styles = new Map();
  const style = (e) => { let s = styles.get(e); if (!s) { s = getComputedStyle(e); styles.set(e, s); } return s; };
  const memo = (f) => { const m = new Map(); return (e) => { let v = m.get(e); if (v === undefined) { v = f(e); m.set(e, v); } return v; }; };
  const faded = memo((e) => style(e).opacity === '0' || (!!e.parentElement && faded(e.parentElement)));
  const clipsText = memo((e) => /\\btext\\b/.test(style(e).backgroundClip + ' ' + (style(e).webkitBackgroundClip || '')) || (!!e.parentElement && clipsText(e.parentElement)));
  const alpha = (c) => {
    if (!c || c === 'transparent') return 0;
    const slash = /\\/\\s*([0-9.]+)(%?)\\s*\\)$/.exec(c);
    if (slash) return parseFloat(slash[1]) / (slash[2] ? 100 : 1);
    const rgba = /^rgba\\(([^)]*)\\)$/.exec(c);
    if (rgba) { const v = rgba[1].split(/[\\s,]+/).filter(Boolean); return v.length >= 4 ? parseFloat(v[3]) : 1; }
    return 1;
  };
  const clear = memo((e) => {
    const s = style(e);
    const stroke = parseFloat(s.webkitTextStrokeWidth || '0') > 0 && alpha(s.webkitTextStrokeColor) > 0;
    return alpha(s.color) === 0 && alpha(s.webkitTextFillColor || s.color) === 0 && !stroke && (s.textShadow || 'none') === 'none' && !clipsText(e);
  });
  const NO_OVERFLOW = new Set(['inline', 'contents', 'none', 'table', 'inline-table', 'table-row', 'table-row-group', 'table-header-group', 'table-footer-group', 'table-column', 'table-column-group', 'ruby', 'ruby-text']);
  const len = (v, whole, auto) => v === 'auto' ? auto : v.endsWith('%') ? (parseFloat(v) / 100) * whole : parseFloat(v) || 0;
  // The rects one element clips its content to: its overflow (unless escaped), its clip rect, its clip-path inset.
  const owned = [new Map(), new Map()];
  const own = (e, overflow) => {
    const m = owned[overflow ? 1 : 0];
    let v = m.get(e);
    if (!v) { v = clipsOf(e, overflow); m.set(e, v); }
    return v;
  };
  const clipsOf = (e, overflow) => {
    const s = style(e);
    const out = [];
    const r = e.getBoundingClientRect();
    if (overflow) {
      const ox = /hidden|clip/.test(s.overflowX);
      const oy = /hidden|clip/.test(s.overflowY);
      const svg = e instanceof SVGSVGElement;
      if ((ox || oy) && (svg || !NO_OVERFLOW.has(s.display.split(' ')[0]) && !/math/.test(s.display))) {
        const l = r.left + (svg ? 0 : e.clientLeft);
        const t = r.top + (svg ? 0 : e.clientTop);
        const w = svg ? r.width : e.clientWidth;
        const h = svg ? r.height : e.clientHeight;
        out.push({ l: ox ? l : -Infinity, t: oy ? t : -Infinity, r: ox ? l + w : Infinity, b: oy ? t + h : Infinity });
      }
    }
    const rect = /^rect\\((.*)\\)$/.exec(s.clip || '');
    if (rect && (s.position === 'absolute' || s.position === 'fixed')) {
      const v = rect[1].split(/\\s*,\\s*|\\s+/).filter(Boolean);
      if (v.length === 4) out.push({ t: r.top + len(v[0], 0, 0), r: r.left + len(v[1], 0, r.width), b: r.top + len(v[2], 0, r.height), l: r.left + len(v[3], 0, 0) });
    }
    const inset = /^inset\\(([^)]*)\\)/.exec(s.clipPath || '');
    if (inset) {
      const v = inset[1].split(/\\s+round\\s+/)[0].trim().split(/\\s+/);
      const [t, rr, b, l] = v.length === 1 ? [v[0], v[0], v[0], v[0]] : v.length === 2 ? [v[0], v[1], v[0], v[1]] : v.length === 3 ? [v[0], v[1], v[2], v[1]] : v;
      out.push({ t: r.top + len(t, r.height, 0), r: r.right - len(rr, r.width, 0), b: r.bottom - len(b, r.height, 0), l: r.left + len(l, r.width, 0) });
    }
    return out;
  };
  const positioned = (s) => s.position !== 'static' || s.transform !== 'none';
  const contains = (s) => s.transform !== 'none' || s.filter !== 'none' || /paint|layout|strict|content/.test(s.contain || '');
  // Every rect that clips a text node whose parent is e: walking up, an absolutely positioned element escapes the overflow
  // of ancestors below its containing block (the nearest positioned one), and a fixed one that of every ancestor below
  // one with a transform, a filter or containment.
  const clips = memo((start) => {
    const out = [];
    let escape = '';
    for (let e = start; e && e !== body && e !== document.documentElement; e = e.parentElement) {
      const s = style(e);
      if ((escape === 'abs' && positioned(s)) || (escape === 'fixed' && contains(s))) escape = '';
      out.push(...own(e, !escape));
      if (escape !== 'fixed' && s.position === 'absolute') escape = 'abs';
      if (s.position === 'fixed') escape = 'fixed';
    }
    return out;
  });
  const rtl = style(document.documentElement).direction === 'rtl';
  const pageWidth = document.documentElement.clientWidth;
  const unseen = (n) => {
    const parent = n.parentElement;
    if (faded(parent) || clear(parent)) return true;
    const range = document.createRange();
    range.selectNodeContents(n);
    const boxes = [...range.getClientRects()];
    if (!boxes.length) return false;
    const cs = clips(parent);
    return !boxes.some((q) => {
      let l = q.left, t = q.top, r = q.right, b = q.bottom;
      for (const c of cs) { l = Math.max(l, c.l); t = Math.max(t, c.t); r = Math.min(r, c.r); b = Math.min(b, c.b); }
      const off = b + scrollY <= 0 || (rtl ? l + scrollX >= pageWidth : r + scrollX <= 0);
      return r - l > 1 && b - t > 1 && !off;
    });
  };
  const hiddenNodes = nodes.filter((n) => !SPACE.test(n.data) && unseen(n));
  // An absolutely or fixed positioned element that shows no text and holds no image or control stands outside the
  // text's flow and shows nothing in it: it is left out of the read, so it breaks no line (innerText would put its box
  // on a line of its own, as for a screen-reader-only span between two words).
  const hiddenSet = new Set(hiddenNodes);
  const textSet = new Set(nodes);
  const REPLACED = 'img, svg, video, audio, canvas, iframe, object, embed, input, select, textarea, button, meter, progress, picture';
  const aside = [];
  for (const el of body.querySelectorAll('*')) {
    const s = style(el);
    if (s.position !== 'absolute' && s.position !== 'fixed') continue;
    if (el.matches(REPLACED) || el.querySelector(REPLACED)) continue;
    const inner = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let shows = false;
    for (let n = inner.nextNode(); n && !shows; n = inner.nextNode()) shows = textSet.has(n) && !SPACE.test(n.data) && !hiddenSet.has(n);
    if (!shows) aside.push(el);
  }
  for (const [n, data] of marked) n.data = data;
  const squash = (t) => t.replace(MARKS, '').replace(/[ \\t\\n\\f\\r]+/g, ' ').trim();
  const hidden = hiddenNodes.map((n) => { const a = n.parentElement.closest('a[href]'); return [squash(n.data), a ? a.getAttribute('href') : null]; });
  for (const el of document.querySelectorAll('*')) if (el.style) el.style.setProperty('text-transform', 'none', 'important');
  const sheet = document.createElement('style');
  sheet.textContent = '*::first-letter, *::first-line { text-transform: none !important; }';
  (document.head || document.documentElement).appendChild(sheet);
  for (const n of hiddenNodes) n.data = '';
  for (const el of aside) el.style.setProperty('display', 'none', 'important');
  const text = body.innerText;
  const hrefs = [];
  const index = new Map();
  for (const n of nodes) {
    const a = n.parentElement.closest('a[href]');
    if (!a) continue;
    const m = /^([ \\t\\n\\f\\r]*)([\\s\\S]*?)([ \\t\\n\\f\\r]*)$/.exec(n.data);
    if (!m || !m[2]) continue;
    let i = index.get(a);
    if (i === undefined) {
      i = hrefs.length;
      index.set(a, i);
      hrefs.push(a.getAttribute('href'));
    }
    const digits = String(i).replace(/[0-9]/g, (d) => String.fromCharCode(${LINK_DIGIT_0} + Number(d)));
    n.data = m[1] + ${JSON.stringify(LINK_OPEN)} + digits + ${JSON.stringify(LINK_INDEX_END)} + m[2] + ${JSON.stringify(LINK_CLOSE)} + m[3];
  }
  return JSON.stringify({ title, text, linked: body.innerText, hrefs, hidden });
})()`;

/** Headless Chromium with the flags above. */
export async function launchChromium(extraArgs: readonly string[] = []): Promise<Browser> {
  const { chromium } = await import('playwright');
  return chromium.launch({ headless: true, args: [...LAUNCH_ARGS, ...extraArgs] });
}

/** The error a cancelled render ends with: the signal's own reason (Temporal's CancelledFailure) when it has one. */
function stopped(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('The render was stopped.');
}
