/**
 * RENDER for web pages (spec §3.1 `view`, §3.2), with Playwright Chromium. A page is rendered as the surfaces the
 * protocol's RENDER makes (06-runbook §1) and the critic, defect-check and tells-sweep prompts name (RENDER-1):
 * - `desktop`: the whole page on a wide screen, 1440 px wide;
 * - `mobile`: the whole page on a phone, 390 × 844 (a mobile viewport, so the page's own viewport tag applies);
 * - `fold`: the first screen as a visitor lands, 1440 × 900, not scrolled.
 * Whole pages are tiled into screenshots at most 2576 px tall, and at most 2576 px wide (a page wider than its screen
 * is shot as wide as it overflows, so the overflow shows). Motion is reduced; the network is blocked except an
 * allowlist (Google Fonts, jsDelivr, unpkg, cdnjs), checked on every redirect hop too and held to a byte cap per
 * response (render-fetch.ts), and the local artifact route, served from the artifact store, and WebSockets and
 * non-proxied WebRTC are blocked as well (ENG-14).
 *
 * A render is bounded (SEC-5): everything from opening the page's context to the last screenshot runs under one
 * deadline. A page that never settles (a script that loops after load) has its context closed, which stops its
 * renderer, and the render fails with a plain message that is not retried. A render whose step is cancelled stops the
 * same way, and so does one whose browser does not open a context. Dialogs the page opens (alert, confirm, prompt, even
 * in a loop) are dismissed by byway, and a dismissal that fails because the page was closed is swallowed, so such a page
 * cannot end the engine's process. A browser that crashed, disconnected or failed to launch is launched again on the
 * next render (ENG-14). Renders share one browser. A render whose page does not close in time retires that browser
 * rather than closing it under the others: new renders launch another, the renders still on it finish there, and it is
 * closed when the last of them ends, at the latest one render's limit plus the close limit after it was retired
 * (render-browsers.ts; ADR-0106).
 *
 * The renderer is shared by every medium, not only web pages: it draws C1 views of model-written HTML and JavaScript,
 * web-page references given as HTML, and the cards a GREAT critic sees whenever a lineup mixes forms (BLIND-1), which
 * decode reference images people upload and images providers return. All of that is untrusted, so its Chromium is
 * started in one place with one stated policy (F18; ADR-0084): chromiumLaunchOptions() says how; launchChromium() is the
 * only production launch and takes only the OS sandbox setting, so no caller can add a flag; Chromium's environment holds
 * no provider key, nothing secret-looking and nothing from the secrets file; and a Chromium that cannot start fails every
 * use with one plain message that is not retried.
 *
 * Chromium runs inside its OS sandbox unless the person switched it off in Settings (ADR-0105). The setting is the
 * store's, read before each load (render-browsers.ts): a change applies from the next load, and the loads under way
 * finish on the browser they started on. A sandbox that cannot start says why on this computer and the fix (sandbox.ts).
 * ready() draws byway's own test page, with a script, the first time it is asked on each browser, so the sandboxed page
 * renderer itself has started before a run that needs it spends anything; checkRenderer() does the same at start-up and,
 * to tell whether the sandbox is the cause, tries the other setting on that test page.
 *
 * The same renderer, launched as stated above, reads the text a page shows a visitor, for VOICE's arbiter (ADR-0081):
 * the page is loaded with JavaScript on, as a visitor and the critic's renders see it, under the same allowlist, request
 * filter (every redirect hop and the byte cap included) and deadline as a render, and only its first document is read:
 * a later navigation the request filter sees (a meta refresh to an address, a script setting location) gets No
 * Content, a move within the document (a fragment, history.pushState) keeps it, and a page that navigates away where no
 * route sees it (a meta refresh to about:blank) is a plain StepError. Its scripts run under a stopped clock and a seeded
 * Math.random, so a page reads the same each time; the page is scrolled through and back, and what each character
 * shows is measured from its box (ShownText). It runs under the same sandbox setting as a render.
 */
import type { Browser, BrowserContext, LaunchOptions, Page, Route } from 'playwright';
import type { RendererCheckRecord } from '@byway/contracts';
import { namesFromEnvFile, withoutSecrets, type Env } from '@byway/gateway';
import { StepError } from './activities/failures.ts';
import { renderBrowsers } from './render-browsers.ts';
import { fetchHop, MAX_RENDER_FETCH_BYTES } from './render-fetch.ts';
import { isSandboxFailure, possibleSandboxCause, sandboxAdvice, sandboxFailureMessage, sandboxHost, type SandboxHost } from './sandbox.ts';
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
  /**
   * Told, for each load of the page, the OS sandbox setting of the browser it is drawn in, before the page's content
   * runs: a step whose pages were drawn with the sandbox off says so (the run's note; ADR-0105).
   */
  drawn?: (how: { osSandbox: boolean }) => void;
}

/** Serves `/api/artifacts/<id>` requests from the artifact store; undefined is a 404. */
export type ArtifactResolver = (artifactId: string) => Promise<{ body: Uint8Array; contentType: string } | undefined>;

/**
 * The text of a page as a visitor sees it (VOICE's arbiter, ADR-0081): read by the runner's Chromium with JavaScript on,
 * at 1440 × 900, the screen the critic's wide renders use.
 *
 * How the page is read (the visitor read). The page's scripts run under a stopped clock set to one instant (READ_CLOCK)
 * that moves only as the read moves it, the same way each time, with Math.random seeded and animation frames run on that
 * clock twenty times a second; every IntersectionObserver is told at once that each element it watches is in view (a
 * visitor scrolls to every part of the page). Once the page has loaded, the line marks of a marked copy are taken out of
 * its text (a mark may stand in several text nodes, as where a script puts each letter of a heading in an element of its
 * own), its web fonts and images are loaded (lazy ones now), and the clock runs 1.5 s. The page is then scrolled from the
 * top in steps of 720 px (longer on a page taller than 21,600 px, so there are at most 30), then to its end, then back to
 * the top, where the clock runs on in the same steps; at each step a scroll event is dispatched, the clock runs 0.2 s and
 * the page is sampled, so every page is sampled at the same 33 instants, 1.5 s to 7.9 s after it loaded. Before the read
 * looks at the page (once loaded, before each sample, before the end) it waits for every file on its way from an admitted
 * host; a file that does not arrive whole stops the read, which is made once more, then fails (shownText). A sample takes
 * every animation and transition to its end and holds an endless one at the next of eight points of its cycle. Then, if
 * the document changed since the last sample (a script's change, seen by a mutation observer) or an animation runs, it
 * measures each text node a style shows (visible, with an ink of at least 0.05: the alpha of its fill colour, or of a
 * stroke, times its opacity counting filter: opacity()), unless it was measured with its present text where it is now
 * (its box and what clips it); else it measures nothing, so text a fixed header holds keeps the place it was measured at.
 * A node keeps the measurement where most of its characters are seen, then one taken while it was on the screen, then
 * the later one. So a section a script reveals as the visitor scrolls, by its opacity or by moving it into
 * view (a slide, a flip), a carousel's slides that move or fade and a ticker are read where they show, even when the
 * script hides them again on the way back. Whether a node is laid out at all is read at the end: a slide a script hides
 * by switching its display is read as not laid out unless it shows at the read's last instant. A node whose text a
 * script changed after its last measurement is measured at the end, and so is a node shown at the end that moved since
 * its measurement (an endless pulse, a tween that settled later, a slide moved on), so that how its characters sit
 * beside their neighbours is judged where it stands then. Each measurement notes until when it held: the first sample
 * at which its node was not shown where it was measured (hidden by a style, or elsewhere), and the first at which the
 * node no longer stood there (not laid out, or elsewhere). The last sample holds each endless animation at the first point
 * of its cycle; at the end each is held at every other point in turn, and each node shown at the last instant that such
 * an animation can move is measured again where it stands at that point (a motion a script draws is not such a one).
 *
 * What a character is. Each character (code point) that is not HTML whitespace, in the body's text nodes (not in a
 * script, a style, a textarea, a title, a template or a noscript), in document order:
 * - not laid out (its node has no box at the end of the read: display none, a closed details, an option, a canvas's
 *   or video's fallback, the content of a box with content-visibility: hidden, which skips its content only where
 *   layout containment applies, not on an inline box or a table row; text in a display: contents element is laid out
 *   where its parent is): not in the text, and not listed;
 * - shown: where it was measured, every clip keeps the middle of its box: every ancestor whose overflow is hidden or clip
 *   or that has paint containment (an absolutely or fixed positioned element escapes those below its containing block),
 *   an absolutely or fixed positioned ancestor's `clip` rect, and the bounding box of an ancestor's clip-path inset(),
 *   circle(), ellipse() or polygon() (one with no area keeps nothing), each in the box's own points where a transform
 *   turns, scales or skews it or CSS zoom scales it (a 3D matrix that keeps the box's own plane flat, as AOS's flip at
 *   rest, perspective(2500px) rotateY(0), is read as flat; a box whose place cannot be told, under a turn in 3D, keeps
 *   nothing, and the line marks of the text it hides are listed in `unplaced`); its middle is not short of the page's
 *   top or start edge (where no scrolling reaches), nor, when the page's overflow is hidden, beyond the screen's width or
 *   (down the page) its height; and it is not in the band an ellipsis takes at the end of a line a box cuts short
 *   (text-overflow: ellipsis on a box whose content overflows it, or the last line of a line-clamp box; on a box whose
 *   plane map is not the identity, as in vertical or turned text or a box a transform or zoom scales, from the box's own
 *   points along the line's own axes, and where those cannot be told, the whole box). Text in a marquee is measured by
 *   the marquee's own box, through which it scrolls;
 * - hidden from sight: laid out, but not shown (a screen-reader-only class; opacity, a clear text fill or a colour almost
 *   clear that leave it less than 0.05 of ink, and svg text by its fill and fill-opacity, or its stroke; font size 0; a
 *   character whose middle a box or a clip cuts off, such as a sliver of a row a box of fixed height cuts; cut off by an
 *   ellipsis; moved off the page).
 * A character with no box of its own (a zero-width or combining one) goes with the character before it in its text
 * node, or, opening the node, with the first after it that has one.
 * Not detected: text covered by another element, painted behind an ancestor's background or coloured as it, turned
 * away from the screen, clipped by a clip-path given by url() or path() or by a mask, or faint or small but over those
 * thresholds (opacity 0.06, a 3 px font); text inside a shadow root is not read.
 *
 * The fields:
 * - `text`: the shown characters in document order, each pair of neighbours with one separator between them, from
 *   where their boxes are and what lies between them in the document. None between a drop cap (the first letter of a
 *   block, with any punctuation before it, that the block or one it begins styles with a floated ::first-letter or an
 *   initial letter) and the rest of its word. The rest is judged from their boxes: at the read's last instant, where
 *   both are shown then (so an item that keeps moving is judged beside its neighbour where both stand), and, where an
 *   endless animation can move either, at every other point of its cycle where both are shown, glued if glued at any;
 *   else where they were measured, if both were shown there at one sample, or, never shown together, if both stood
 *   there side by side at one sample, laid out, one of them hidden by a style (a word a script reveals after its
 *   neighbour and hides again before the read comes back), not in one place (two nodes whose boxes overlap by more than
 *   half, as slides stacked and shown in turn). Else they were never side by side (a carousel's slides, stacked or on a
 *   track that moved on): a line break where the edge of a box lies between them, else as the text runs them (a space
 *   where whitespace lies between, else none). From the boxes, along the line their text runs along: each text node's
 *   frame (its line's direction and its block's) comes from its element's writing mode and the plane map of every
 *   transform and CSS zoom up to the page; two neighbours whose frames run within 10 degrees are judged along their
 *   common line from their corners (each character along the line its own advance, across it all of its outline), so
 *   flex items set top to bottom, or turned, with no gap show glued; neighbours whose frames run further apart, or whose
 *   corners cannot be told, are apart where their shapes stand further apart than the tolerance and glued where they
 *   meet, and where only their bounding boxes are known (a turn in 3D, a turn near an eighth of a turn) and those meet,
 *   a box's edge between them is never read as parting them: none, marked TURNED (in one flow of text, as the text runs
 *   them). Two pieces of vertical or turned text across a box's edge more than four times the font size apart along
 *   their line are apart across boxes (a line break) where the second stands after the first (in their direction), or
 *   where either stands in a box positioned out of the flow (absolutely or fixed) that the other is not in; else as
 *   follows. Then:
 *   REVERSED when a visitor sees the second before the first on one row (two characters of one direction: a letter by
 *   its script, a digit left to right, Arabic-Indic digits and the Arabic decimal and thousands separators included,
 *   with a number's own signs, a currency or percent sign beside its digits or a point, comma, colon, slash, plus or
 *   minus between two; punctuation or a symbol by the letters around it in its
 *   text node when those on both sides agree, else by its block's direction), except two apart in a paragraph or box of
 *   the other direction, which a visitor reads in that direction's order (punctuation beside a number resolves as the
 *   bidi algorithm resolves it, the number counting as right to left there). In one flow of text where right-to-left
 *   text is involved (either character, or the direction either is laid out in), a space where whitespace between them
 *   is laid out wider than the tolerance, else none, wherever the runs' order puts them. Where the two differ in
 *   direction, or either runs against the direction it is laid out in (its block's, or an isolating element's, as a
 *   dir attribute's), across a box's edge, between the boxes' text on that row. None when a visitor sees
 *   them glued (on one row, no more than a tenth of the smaller font size apart, whatever lies between them, as for
 *   flex items with no gap; or on two rows a word is broken over, with nothing between; the gap is measured between
 *   the parts of the two boxes a visitor sees, so a character its box cuts off part of ends at the cut); a line break
 *   when they are apart and the edge of a box of its own lies between them (a block, a flex or grid item, a table cell,
 *   a floated or positioned box, an inline block, a button, an image or a control) or a forced break does (a `<br>`, a
 *   newline a white-space style keeps); else a space (apart within one flow of text: on one row, or on rows the text
 *   wraps over with whitespace between). A row is an overlap across the line of at least half the shorter box; across
 *   a box's edge, also any overlap across it where the text of each one's box on its row stands beside the other's along
 *   the line, not over it (an item raised or lowered beside the next: a margin, padding or relative offset beside
 *   align-items: flex-start), and where a line height is set smaller than the letters, their middles nearer than half
 *   their line heights together (which two rows of their own never are): there, where the two meet along the line (no
 *   more than the tolerance apart), none, marked OFFSET, since whether a visitor sees them apart cannot be told. A run of
 *   characters with no glyph (a no-break or other space that is not HTML whitespace, a zero-width or format character)
 *   takes the separator of the visible characters on either side of it wherever those stand glued. HIDDEN_HERE follows
 *   the shown character after which text a visitor does not see stands, hidden from sight or in an
 *   element that is not laid out (or begins the text). In a marked copy (page-arbiter.ts), the line marks stand beside
 *   the characters they mark;
 * - `linked`: the same with each link's (`a[href]`) characters wrapped in markers: LINK_OPEN, the link's index in
 *   `hrefs` in the digits from LINK_DIGIT_0, LINK_INDEX_END, the characters, LINK_CLOSE;
 * - `hidden`: each run of characters hidden from sight within one text node, in document order: its text (whitespace
 *   collapsed, ends trimmed, line marks kept) and its link's href, or null;
 * - `unlaid`: the line marks found in text that is not laid out;
 * - `unplaced`: the line marks found in text hidden from sight by a box whose place the read cannot tell;
 * - `title`: document.title;
 * - `generated`: see below.
 */
export interface ShownText {
  title: string;
  text: string;
  linked: string;
  /** Each link's href attribute, by index. */
  hrefs: string[];
  hidden: [text: string, href: string | null][];
  unlaid: string;
  /**
   * The line marks found in text hidden from sight where a box clips it whose place on the screen the read cannot tell
   * (a box turned in 3D that hides its overflow): only to say why a line is not offered. A read without it has none.
   */
  unplaced?: string;
  /**
   * The text a stylesheet adds (CSS generated content, the strings of a ::before's or ::after's `content`) on each
   * element that shows it with no text of the page's own beside it (an empty element, an icon), in document order. A
   * read without it (the e2e scenarios' model) has none.
   */
  generated?: string[];
  /**
   * Where in `text` a line break stands between two characters on one row, apart across a box's edge (a flex item's, a
   * chip's), not on rows of their own: only to say so when a write is refused. A read without it has none.
   */
  rowBreaks?: number[];
}

/** The markers in ShownText.linked: noncharacters, which a page does not show. */
export const LINK_OPEN = '﷐';
export const LINK_INDEX_END = '﷑';
export const LINK_CLOSE = '﷒';
/** The digit 0 of a link's index; 1 to 9 follow it. */
export const LINK_DIGIT_0 = 0xfde0;
/** The marks page-arbiter.ts puts into a copy of a page: a line's start, its end (each followed by its number), the number's end. */
export const LINE_START = '﷓';
export const LINE_END = '﷔';
export const NUMBER_END = '﷕';
/** In ShownText.text: text hidden from sight stands here; and two neighbours a visitor sees in the other order. */
export const HIDDEN_HERE = '﷭';
export const REVERSED = '﷮';
/** In ShownText.text: text that is not laid out stands here (it tells why a line is not offered; it is not compared). */
export const GONE_HERE = '﷬';
/**
 * In ShownText.text: two neighbours read as glued only because the read cannot measure how they sit (vertical or
 * turned text it does not read: a turn in 3D, a turn near an eighth of a turn, where only their bounding boxes are
 * known and those meet; see ShownText).
 */
export const TURNED = '﷫';
/**
 * In ShownText.text: two neighbours across a box's edge, offset across their line (one raised or lowered beside the
 * next, as a flex item with a margin, padding or relative offset), that meet along it: read as glued only because the
 * read cannot tell whether a visitor sees them apart (see ShownText).
 */
export const OFFSET = '﷪';

export interface PageRenderer {
  /** PNG tiles of the whole page on a wide screen, top to bottom. */
  screenshots(html: string, resolve: ArtifactResolver, opts?: RenderOptions): Promise<Uint8Array[]>;
  /** The page as each surface shows it, in the order asked. */
  render(html: string, resolve: ArtifactResolver, surfaces: readonly Surface[], opts?: RenderOptions): Promise<SurfaceShots[]>;
  /** The text the page shows a visitor, read with JavaScript on (VOICE's arbiter; see ShownText). */
  shownText(html: string, resolve: ArtifactResolver, opts?: RenderOptions): Promise<ShownText>;
  /**
   * Starts the shared browser, or finds it running, under the sandbox setting in force, and draws byway's own test page
   * in it, with a script, the first time it is asked on that browser: so a run that will need the renderer is refused
   * before anything is spent when its page renderer cannot start (in its sandbox, when that is on). Rejects with a plain
   * step failure; one for a sandbox that cannot start says why on this computer and the fix. The browser it starts is
   * the one later renders reuse.
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
 * Whether the renderer's Chromium runs inside its OS sandbox when nothing has said otherwise: on (ADR-0105). The setting
 * is the person's, kept in the store (Store.getRendererSettings) and read before each load; only Settings switches it
 * off, and a setting that cannot be read counts as on. With it on, the page renderer runs at Untrusted integrity on
 * Windows; with it off, Playwright adds --no-sandbox to every Chromium process.
 */
export const RENDERER_OS_SANDBOX_DEFAULT = true;

/** The one thing a launch of the renderer's Chromium can vary: the person's OS sandbox setting (ADR-0105). */
export interface LaunchSetting {
  osSandbox: boolean;
}

/**
 * How the renderer's Chromium is launched, for every use of it, under the OS sandbox setting. `env` exists so tests can
 * pass a fixture; it can only take variables away. Playwright would otherwise hand Chromium the engine's whole
 * environment, provider keys included; it gets none of them, nothing secret-looking and no name the secrets file listed
 * (withoutSecrets, the rule `next build` also follows: ADR-0030's "keys never enter a sandbox", applied to the renderer).
 */
export function chromiumLaunchOptions(setting: LaunchSetting, env: Env = process.env): LaunchOptions {
  return { headless: true, chromiumSandbox: setting.osSandbox, args: [...LAUNCH_ARGS], env: withoutSecrets(env, namesFromEnvFile(env)) };
}

/** What to run when Playwright's Chromium was never downloaded (it is a separate download from the package). */
const INSTALL_CHROMIUM = 'pnpm --filter ./apps/web exec playwright install chromium';

/** Playwright's first line, without its method ("browserType.launch: ") or a closing stop. */
const launchSaid = (err: unknown): string =>
  ((err instanceof Error ? err.message : String(err)).split(/\r?\n/)[0] ?? '')
    .replace(/^browserType\.launch:\s*/, '')
    .trim()
    .replace(/\.$/, '');

export interface LaunchFailureOptions {
  /** The setting the launch was made with; a sandbox failure is told apart only when the sandbox was on (or unknown). */
  osSandbox?: boolean;
  /** Playwright's Chromium, for the Windows fix. */
  executable?: string;
  /** The computer, for the reason given; read from this one when not given. */
  host?: SandboxHost;
}

/**
 * A Chromium that could not start, as one plain step failure for every use of the renderer (a web page's view, an HTML
 * reference, a lineup card, the readiness check). Not retried: a missing or broken Chromium does not start on a second
 * try, and a retry would only repeat the wait. A sandbox that could not start says so, why on this computer and the fix
 * (sandbox.ts); anything else gives Playwright's first line and the install command. Playwright's box of advice and its
 * call log stay on the cause.
 */
export function launchFailure(err: unknown, opts: LaunchFailureOptions = {}): StepError {
  if (opts.osSandbox !== false && isSandboxFailure(err)) {
    const advice = sandboxAdvice(opts.host ?? sandboxHost(), { ...(opts.executable ? { executable: opts.executable } : {}), error: err });
    return new StepError(sandboxFailureMessage(advice), { cause: err });
  }
  return new StepError(`The page renderer could not start (${launchSaid(err)}), so pages, and the cards that show a reviewer the examples beside the work, cannot be drawn. If Playwright's Chromium is not installed: ${INSTALL_CHROMIUM}`, {
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
  /** The most one allowlisted response may hold (render-fetch.ts MAX_RENDER_FETCH_BYTES); tests pass a small one. */
  maxFetchBytes?: number;
  /**
   * How long a page's context may take to close once its render or read is over (to open and close, if it had not
   * opened) before its browser is retired: new renders launch another, and it is closed once the renders still on it
   * end (ADR-0106). A render that closes a retired browser waits for that close at most this long too.
   */
  closeTimeoutMs?: number;
  /**
   * The person's OS sandbox setting, read before each load (ADR-0105): the worker passes the store's
   * (storeOsSandbox). None: on.
   */
  osSandbox?: () => boolean | Promise<boolean>;
  /**
   * For tests only: how to launch the browser, given the setting it is launched with. Production passes none, so it is
   * always launchChromium().
   */
  launch?: (setting: LaunchSetting) => Promise<Browser>;
  /** For tests only: the computer, for the reason a failure gives. */
  host?: SandboxHost;
}

/** The store's OS sandbox setting, as the renderer reads it before each load (ADR-0105). */
export const storeOsSandbox =
  (store: { getRendererSettings(): Promise<{ osSandbox: boolean }> }): (() => Promise<boolean>) =>
  async () =>
    (await store.getRendererSettings()).osSandbox;

/** byway's own test page for the readiness check: the title is set by its script, so a page renderer that runs it answers. */
const READY_PAGE = '<!doctype html><html><head><meta charset="utf-8"><title>byway</title></head><body><script>document.title = String(6 * 7);</script></body></html>';
const READY_ANSWER = '42';
const noArtifacts: ArtifactResolver = async () => undefined;

/** A private origin the page is served from, so relative artifact routes resolve without touching the network. */
const ORIGIN = 'http://byway-render.localhost';
/** The address the page is served at. */
const PAGE_URL = `${ORIGIN}/page`;
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
  const maxFetchBytes = opts.maxFetchBytes ?? MAX_RENDER_FETCH_BYTES;
  const closeTimeout = opts.closeTimeoutMs ?? 5_000;
  const launch = opts.launch ?? launchChromium;
  /**
   * The shared browser and those retired from it (render-browsers.ts; ADR-0106), each launched with the OS sandbox
   * setting read for the load that launched it (ADR-0105).
   */
  const browsers = renderBrowsers((osSandbox) => launch({ osSandbox }), { timeoutMs: timeout, closeTimeoutMs: closeTimeout, ...(opts.osSandbox ? { osSandbox: opts.osSandbox } : {}) });
  /** Browsers that have drawn a page: the readiness check has nothing left to prove on them. */
  const proven = new WeakSet<Browser>();

  /**
   * Close a load's context once the load is over, whether it has opened yet or not: a context that opens after its load
   * gave up is closed as it opens. One not closed within closeTimeout means a stuck renderer, a browser that does not
   * answer, or the engine's own thread paused: its browser is retired, so new loads launch another, and the loads still
   * on it finish there instead of failing with it (ADR-0106).
   */
  const dispose = async (b: Browser, opening: Promise<BrowserContext>): Promise<void> => {
    const closing = opening.then(
      (context) => context.close(),
      () => undefined,
    );
    const closed = await Promise.race([closing.then(() => 'closed' as const, () => 'closed' as const), sleep(closeTimeout)]);
    if (closed === 'late') browsers.retire(b);
  };

  /**
   * An admitted request, fetched hop by hop. Playwright asks the route handler about a request's first URL only, and
   * Chromium follows a redirect by itself, so a request merely continued could be sent on from an allowlisted CDN to
   * any host. Here each hop is fetched without following redirects (render-fetch.ts); a hop is followed only to a URL
   * the same rule admits, for a GET or HEAD, at most MAX_REDIRECTS times, and anything else is blocked. A body over
   * maxFetchBytes is cut off and blocked too: it is never held whole. The page gets the final response under the URL it
   * asked for, so relative URLs inside it resolve against an admitted URL too.
   */
  const fetchAdmitted = async (r: Route, first: URL): Promise<string | undefined> => {
    const request = r.request();
    const method = request.method();
    const followable = method === 'GET' || method === 'HEAD';
    const headers = await request.allHeaders();
    const body = followable ? undefined : (request.postDataBuffer() ?? undefined);
    const signal = AbortSignal.timeout(timeout);
    let url = first;
    for (let hops = 0; ; hops++) {
      let hop: Awaited<ReturnType<typeof fetchHop>>;
      try {
        hop = await fetchHop({ url: url.href, method, headers, ...(body ? { body } : {}), signal, maxBytes: maxFetchBytes });
      } catch (e) {
        // The fetch itself failed (not the page's side of the request, as a request the page cancelled): a 404 to the
        // page, as before, and the reason to the caller.
        await r.fulfill({ status: 404, body: '' }).catch(() => undefined);
        return `could not be fetched (${e instanceof Error && /^(TimeoutError|AbortError)$/.test(e.name) ? 'it took too long' : 'the connection failed'})`;
      }
      if (REDIRECTS.has(hop.status)) {
        const next = hop.location ? new URL(hop.location, url) : undefined;
        if (!next || !followable || hops >= MAX_REDIRECTS || !admit(next)) {
          await r.abort('blockedbyclient');
          return hops >= MAX_REDIRECTS ? 'redirects more times than byway follows' : 'redirects where byway does not load from';
        }
        url = next;
        continue;
      }
      if (!hop.body) {
        await r.abort('blockedbyclient');
        return `came back cut off, larger than the ${bytesSaid(maxFetchBytes)} byway takes from one file`;
      }
      await r.fulfill({ status: hop.status, headers: hop.headers, body: hop.body });
      // A server's error that need not come again: a visitor who loads the page later gets the file.
      if (hop.status >= 500) return `came back with a server error (${hop.status})`;
      if (hop.status === 408 || hop.status === 429) return `came back refused for now (${hop.status})`;
      return undefined;
    }
  };

  /**
   * The request filter: the page and the artifact route are served, admitted hosts are fetched hop by hop (above),
   * everything else is blocked.
   * With `oneDocument`, a second navigation (a meta refresh, a link followed) is answered with No Content, so the
   * browser stays on the first document, the one read. With `fetches` (a text read), every file fetched from an admitted
   * host is counted while it is on its way, and the first that does not arrive whole is noted (see Fetches).
   */
  const route = (html: string, resolve: ArtifactResolver, oneDocument = false, fetches?: Fetches) => {
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
        if (admit(url)) {
          if (!fetches) return void (await fetchAdmitted(r, url));
          fetches.pending++;
          const said = url.href.length > 120 ? `${url.href.slice(0, 117)}...` : url.href;
          try {
            const why = await fetchAdmitted(r, url);
            if (why) fetches.failed ??= `it loads ${said}, which ${why}`;
            return;
          } finally {
            if (--fetches.pending === 0) for (const done of fetches.idle.splice(0)) done();
          }
        }
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
   * Load the page once in a fresh context and run `use` on it, everything from opening the context to the last
   * screenshot under one deadline and the step's cancel: a page that never settles, a browser that does not open a
   * context, or a step that is cancelled, ends the load, and its context is closed (SEC-5; dispose). The launch is not
   * under them: it keeps Playwright's own launch timeout, so a slow launch is not cut off. `text` loads it for the
   * arbiter's visitor read (ShownText): on the wide screen, its scripts under a stopped clock, Math.random seeded and
   * every element an IntersectionObserver watches in view, and it reads the first document only. `check` loads byway's
   * own test page for the readiness check, on the wide screen. `drawn` is told the browser's OS sandbox setting before
   * the page's content runs (ADR-0105).
   */
  const loaded = async <T>(
    html: string,
    resolve: ArtifactResolver,
    screen: 'wide' | 'phone' | 'text' | 'check',
    signal: AbortSignal | undefined,
    use: (page: Page) => Promise<T>,
    deadline?: number,
    fetches?: Fetches,
    drawn?: RenderOptions['drawn'],
  ): Promise<T> => {
    if (signal?.aborted) throw stopped(signal);
    const text = screen === 'text';
    const late = (cut: boolean) => {
      const s = Math.round(timeout / 1000);
      if (screen === 'check') return new StepError(`The page renderer did not draw byway's test page within ${s} s.`);
      if (cut) return new StepError(`The page did not finish ${text ? 'loading' : 'rendering'} in the time byway gives a page's ${text ? 'reads, so its text could not be read' : 'renders, so it could not be shown'}.`);
      return new StepError(text ? `The page did not finish loading within ${s} s, so its text could not be read.` : `The page did not finish rendering within ${s} s, so it could not be shown.`);
    };
    if (deadline !== undefined && deadline <= Date.now()) throw late(true);
    // Counted on this browser until the load lets it go, below (render-browsers.ts).
    const b = await browsers.take();
    const phone = screen === 'phone';
    let timer: NodeJS.Timeout | undefined;
    let onAbort: (() => void) | undefined;
    let opening: Promise<BrowserContext> | undefined;
    try {
      const work = (async () => {
        opening = b.newContext({
          viewport: phone ? mobile : { width, height: FOLD_HEIGHT },
          deviceScaleFactor: 1,
          reducedMotion: 'reduce',
          serviceWorkers: 'block',
          ...(phone ? { isMobile: true, hasTouch: true } : {}),
        });
        const context = await opening;
        // Every dialog any page of this context opens (alert, confirm, prompt, also from a popup) is answered here, and
        // a failed answer is swallowed. Without a listener Playwright answers them itself, and when the deadline closes
        // the context while a page opens dialogs in a loop, its own answer rejects unhandled ("session closed") and ends
        // the process the renderer runs in, which is the engine (SEC-5).
        context.on('dialog', (dialog) => {
          (dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss()).catch(() => undefined);
        });
        if (text) {
          // The visitor read: one stopped clock for every read, so a page's scripts read the same each time.
          await context.clock.install({ time: READ_CLOCK - 1 });
          await context.clock.pauseAt(READ_CLOCK);
          await context.addInitScript({ content: VISITOR_INIT });
        }
        await context.routeWebSocket(/.*/, (ws) => ws.close());
        await context.route('**/*', route(html, resolve, text, fetches));
        const page = await context.newPage();
        page.setDefaultTimeout(timeout);
        drawn?.({ osSandbox: browsers.osSandboxOf(b) ?? RENDERER_OS_SANDBOX_DEFAULT });
        await page.goto(PAGE_URL, { waitUntil: 'load', timeout });
        // A page renderer started on this browser and loaded a page: the readiness check has nothing left to prove here.
        proven.add(b);
        return use(page);
      })();
      // Whichever loses the race below still settles later; it must not become an unhandled rejection.
      work.catch(() => undefined);
      const limit = new Promise<never>((_, reject) => {
        const left = deadline === undefined ? timeout : Math.min(timeout, deadline - Date.now());
        timer = setTimeout(() => reject(late(left < timeout)), Math.max(left, 0));
        if (signal) {
          onAbort = () => reject(stopped(signal));
          // A cancel that came while the browser started has already fired: no event will follow.
          if (signal.aborted) onAbort();
          else signal.addEventListener('abort', onAbort, { once: true });
        }
      });
      limit.catch(() => undefined);
      return await Promise.race([work, limit]);
    } catch (e) {
      // A load that failed on a browser byway closed (it shut down, or a retired browser's backstop) says so, whatever
      // Playwright's error says: a call made after the close fails only with "Target page, context or browser has been
      // closed", the text a crash gives. The deadline and a cancel keep their own.
      const why = browsers.closedWith(b);
      if (why && !(e instanceof StepError) && !signal?.aborted) throw new RendererClosed(why, { cause: e });
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
      try {
        if (opening) await dispose(b, opening);
      } finally {
        await browsers.release(b);
      }
    }
  };

  /** One screen size: load the page once and take the surfaces it serves, all under one deadline. */
  const shoot = (html: string, resolve: ArtifactResolver, screen: 'wide' | 'phone', want: readonly Surface[], renderOpts: RenderOptions): Promise<SurfaceShots[]> =>
    loaded(
      html,
      resolve,
      screen,
      renderOpts.signal,
      async (page) => {
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
      },
      undefined,
      undefined,
      renderOpts.drawn,
    );

  const render: PageRenderer['render'] = async (html, resolve, surfaces, renderOpts = {}) => {
    try {
      const wide = surfaces.filter((s) => s !== 'mobile');
      const shots = [
        ...(wide.length ? await shoot(html, resolve, 'wide', wide, renderOpts) : []),
        ...(surfaces.includes('mobile') ? await shoot(html, resolve, 'phone', ['mobile'], renderOpts) : []),
      ];
      return surfaces.map((s) => shots.find((x) => x.surface === s)!);
    } catch (e) {
      throw drawFailure(e, renderOpts.signal);
    }
  };

  return {
    render,
    async ready() {
      // Found (or launched) under the setting in force. A browser that has drawn a page has nothing left to prove; on one
      // that has not, byway's own test page is drawn and its script must run (ADR-0105). The test page is not a run's
      // content, so it never counts as a page drawn for a run (RenderOptions.drawn).
      const b = await browsers.find();
      if (proven.has(b)) return;
      let on = browsers.osSandboxOf(b) ?? RENDERER_OS_SANDBOX_DEFAULT;
      try {
        await loaded(
          READY_PAGE,
          noArtifacts,
          'check',
          undefined,
          async (page) => {
            const answer = String(await page.evaluate('document.title'));
            if (answer !== READY_ANSWER) throw new Error(`its script did not run (the page's title was ${JSON.stringify(answer)})`);
          },
          undefined,
          undefined,
          // The browser the test page was drawn in, which a change of setting since find() may have replaced.
          (how) => (on = how.osSandbox),
        );
      } catch (e) {
        throw readyFailure(e, on, opts.host);
      }
    },
    async screenshots(html, resolve, renderOpts) {
      return (await render(html, resolve, ['desktop'], renderOpts))[0]!.tiles;
    },
    async shownText(html, resolve, renderOpts = {}) {
      // A read in which a file the page loads from an admitted host did not arrive whole (a stylesheet, a script such as
      // Tailwind's browser build, a font) is not the page a visitor sees: the page is read once more, in a fresh context,
      // and if that file fails again the read fails plainly, saying which (fail closed: an unstyled read never decides
      // what a visitor sees). A failure is the read's plain step failure, as a render's is drawFailure's.
      for (let attempt = 1; ; attempt++) {
        const fetches: Fetches = { pending: 0, idle: [] };
        try {
          return await readOnce(html, resolve, renderOpts, fetches);
        } catch (e) {
          if (!(e instanceof Unloaded)) throw readFailure(e, renderOpts.signal);
          if (attempt === 1 && !renderOpts.signal?.aborted) continue;
          throw new StepError(`The page's text could not be read as a visitor sees it: ${e.message}, also when byway read the page again, and a page read without a file it loads is not the page a visitor sees.`);
        }
      }
    },
    close: () => browsers.close(),
  };

  /**
   * One visitor read (ShownText), in a fresh context. Before each step that looks at the page (once it has loaded, before
   * each sample and before the end), every file on its way from an admitted host is waited for, and the read stops
   * (Unloaded) as soon as one did not arrive whole.
   */
  function readOnce(html: string, resolve: ArtifactResolver, renderOpts: RenderOptions, fetches: Fetches): Promise<ShownText> {
    const settled = async () => {
      if (fetches.pending) await new Promise<void>((done) => fetches.idle.push(done));
      if (fetches.failed) throw new Unloaded(fetches.failed);
    };
    return loaded(
      html,
      resolve,
      'text',
      renderOpts.signal,
      async (page) => {
        // Only the first document is read. A navigation no route sees (to about:blank or about:srcdoc) replaces it, or
        // destroys the context the read runs in: either way the page's own text cannot be read. The read's functions
        // live in the first document (installed only where the init script found the page's own address), so each
        // call finds them gone once another document took its place. A move within the document (a fragment,
        // history.pushState) keeps it, so it is not one.
        const gone = () => new StepError('The page navigates away as it loads (a meta refresh, for example), so the text it shows could not be read.');
        const evaluate = async (code: string): Promise<unknown> => {
          try {
            return await page.evaluate(code);
          } catch (e) {
            if (/Execution context was destroyed|navigat/i.test((e as Error).message)) throw gone();
            throw e;
          }
        };
        const call = async (what: string): Promise<unknown> => {
          const v = JSON.parse(String(await evaluate(`(async () => { const r = window[${JSON.stringify(READ_KEY)}]; return r ? JSON.stringify(await (${what})) : 'null'; })()`))) as unknown;
          if (v === null) throw gone();
          return v;
        };
        await settled();
        if (!(await evaluate(VISITOR_BEGIN))) throw gone();
        await call('r.loadAll()');
        await page.clock.runFor(SETTLE_MS);
        const sample = async () => {
          await settled();
          await call('r.sample()');
        };
        await sample();
        const height = Number(await call('r.scroll(0)'));
        const step = Math.max(STEP_PX, Math.ceil(height / MAX_STEPS));
        let steps = 0;
        for (let y = 0; y < height && steps < MAX_STEPS; y += step, steps++) {
          await call(`r.scroll(${y})`);
          await page.clock.runFor(STEP_MS);
          await sample();
        }
        await call('r.scroll(1e9)');
        await page.clock.runFor(STEP_MS);
        await sample();
        // Back at the top, the clock runs on to the same total on every page, in the same steps, so the page is
        // sampled at the same instants however long it is (a slide a carousel shows only late is seen on every page).
        await call('r.scroll(0)');
        for (let k = steps; k <= MAX_STEPS; k++) {
          await page.clock.runFor(STEP_MS);
          await sample();
        }
        await settled();
        return (await call('r.final()')) as ShownText;
      },
      renderOpts.deadline,
      fetches,
      renderOpts.drawn,
    );
  }
}

/** A text read stopped because a file its page loads from an admitted host did not arrive whole: its message says which. */
class Unloaded extends Error {}

/** A load that failed on a browser byway itself closed (render-browsers.ts): its message is the reason byway gave. */
class RendererClosed extends Error {}

/**
 * A text read's record of the files its page fetches from admitted hosts (pages.ts route): how many are on their way, who
 * waits for none to be, and the first that did not arrive whole (a failed connection, a body cut off at the byte cap, a
 * server error, a redirect byway does not follow). A file that is not there (a 404) is what a visitor's browser gets
 * too, so it is not one.
 */
interface Fetches {
  pending: number;
  idle: (() => void)[];
  failed?: string;
}

/** A byte count as the read's refusal says it: 64 KiB, 20 MiB. */
const bytesSaid = (n: number): string => (n % (1024 * 1024) === 0 ? `${n / (1024 * 1024)} MiB` : `${Math.round(n / 1024)} KiB`);

/** The instant every visitor read takes place at (its stopped clock; see ShownText): any fixed instant serves. */
const READ_CLOCK = Date.UTC(2026, 0, 1, 12);
/** How far the read runs the clock once the page has loaded, and at each step of the scroll. */
const SETTLE_MS = 1_500;
const STEP_MS = 200;
/**
 * The scroll's steps: 720 px apart (a screen's 0.8), and at most this many, so a page taller than 21,600 px takes
 * longer steps.
 */
const STEP_PX = 720;
const MAX_STEPS = 30;
/** How often the read's clock runs a page's animation frames: twenty a second. */
const FRAME_MS = 50;
/** Where the read's functions live in the page, and the first document's own mark (names a page will not use). */
const READ_KEY = `__byway_read_${Math.random().toString(36).slice(2)}`;
const DOC_KEY = `__byway_doc_${Math.random().toString(36).slice(2)}`;

/**
 * Run in every document of a read's context before its own scripts: Math.random seeded (mulberry32), every
 * IntersectionObserver target reported in view once it is observed (and never out of it), and the first document,
 * the one served at the page's address, marked as such.
 */
const VISITOR_INIT = `(() => {
  if (location.href.replace(/#[\\s\\S]*$/, '') === ${JSON.stringify(PAGE_URL)}) Object.defineProperty(window, ${JSON.stringify(DOC_KEY)}, { value: true });
  let s = 0x2545f491;
  Math.random = function random() { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // Animation frames on the read's clock, ${1000 / FRAME_MS} a second: the callbacks asked for run together, given the
  // clock's time. (Playwright's own frames on its clock made a GSAP page's read take 8 to 12 s.)
  const frames = new Map();
  let lastFrame = 0, due = false;
  const flush = () => {
    due = false;
    const now = performance.now();
    const cbs = [...frames.values()];
    frames.clear();
    for (const cb of cbs) { try { cb(now); } catch (e) { setTimeout(() => { throw e; }, 0); } }
  };
  window.requestAnimationFrame = function requestAnimationFrame(cb) { const id = ++lastFrame; frames.set(id, cb); if (!due) { due = true; setTimeout(flush, ${FRAME_MS}); } return id; };
  window.cancelAnimationFrame = function cancelAnimationFrame(id) { frames.delete(id); };
  if (typeof window.IntersectionObserver !== 'function') return;
  const view = () => ({ x: 0, y: 0, top: 0, left: 0, width: innerWidth, height: innerHeight, right: innerWidth, bottom: innerHeight });
  class InView {
    constructor(callback, options) {
      this._cb = callback;
      this._targets = new Set();
      this._pending = [];
      this.root = (options && options.root) || null;
      this.rootMargin = (options && options.rootMargin) || '0px 0px 0px 0px';
      const t = options && options.threshold;
      this.thresholds = Array.isArray(t) ? t : [typeof t === 'number' ? t : 0];
    }
    observe(target) {
      if (!target || this._targets.has(target)) return;
      this._targets.add(target);
      this._pending.push(target);
      if (this._pending.length > 1) return;
      queueMicrotask(() => {
        const ts = this._pending.filter((x) => this._targets.has(x));
        this._pending = [];
        if (!ts.length) return;
        const entries = ts.map((target) => { const r = target.getBoundingClientRect(); return { target, isIntersecting: true, isVisible: true, intersectionRatio: 1, boundingClientRect: r, intersectionRect: r, rootBounds: view(), time: performance.now() }; });
        this._cb.call(this, entries, this);
      });
    }
    unobserve(target) { this._targets.delete(target); }
    disconnect() { this._targets.clear(); this._pending = []; }
    takeRecords() { return []; }
  }
  Object.defineProperty(window, 'IntersectionObserver', { value: InView, writable: true, configurable: true });
})()`;

/**
 * Run once the page has loaded (a string: this package compiles without the DOM library). In the first document only
 * (else it returns false), it takes the line marks out of the text, noting where each stood, so the page is measured as
 * it would be without them, and it installs the read's functions (see ShownText):
 * - loadAll(): the page's fonts and images loaded, lazy ones too;
 * - scroll(y): the page scrolled there at once, and told so; returns the page's height;
 * - sample(): every animation and transition taken to its end (an endless one held at the next point of its cycle), then
 *   each text node a style now shows measured, unless it was measured with its present text where it is now (its box
 *   and what clips it), keeping the measurement where it shows most;
 * - final(): ShownText, from those measurements and the page's structure as it is now.
 */
const VISITOR_BEGIN = `(() => {
  if (!window[${JSON.stringify(DOC_KEY)}]) return false;
  const html = document.documentElement;
  const SPACE = /^[ \\t\\n\\f\\r]$/;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'TITLE', 'TEMPLATE', 'NOSCRIPT']);
  const MARK = /[\\ufdd0-\\ufdef]/;
  const title = document.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'title')[0];
  // The line marks come out of the text before anything is measured, and each is noted where it stood: a line's start
  // before the character after it, its end after the character before it, whatever text node holds that character. A
  // mark's own characters may stand in several text nodes (a script that puts each letter of a heading in an element of
  // its own), so they are read across nodes, in document order.
  const LS = ${JSON.stringify(LINE_START)}, LE = ${JSON.stringify(LINE_END)}, NE = ${JSON.stringify(NUMBER_END)};
  const marks = new Map();
  const note = (n, at, mark, start) => {
    let m = marks.get(n);
    if (!m) { m = { data: n.data, at: [] }; marks.set(n, m); }
    m.at.push([at, mark, start]);
  };
  // The mark being read (its characters so far, whether it starts a line, and where an end goes); the line starts read
  // and waiting for the next character; and the place just after the last character kept.
  let building = null;
  let waiting = [];
  let last = null;
  const walker = document.createTreeWalker(html, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (title && title.contains(n)) continue;
    const d = n.data;
    if (!building && !waiting.length && !MARK.test(d)) {
      for (let i = d.length - 1; i >= 0; i--) if (!SPACE.test(d[i])) { last = [n, i + 1]; break; }
      continue;
    }
    let out = '';
    for (let i = 0; i < d.length; i++) {
      const c = d[i];
      if (MARK.test(c)) {
        // A line's start or end begins a mark (one left unfinished is dropped); its number's end finishes it.
        if (c === LS || c === LE) building = { s: c, start: c === LS, end: last };
        else if (building) {
          building.s += c;
          if (c === NE) {
            if (building.start) waiting.push(building.s);
            else if (building.end) note(building.end[0], building.end[1], building.s, false);
            building = null;
          }
        }
        continue;
      }
      if (!SPACE.test(c) && waiting.length) {
        for (const w of waiting) note(n, out.length, w, true);
        waiting = [];
      }
      out += c;
      if (!SPACE.test(c)) last = [n, out.length];
    }
    if (out !== d) n.data = out;
    const m = marks.get(n);
    if (m) m.data = out;
  }
  // In each node, by place, an end before a start at the same place (the end follows the character before it).
  for (const m of marks.values()) m.at.sort((a, b) => a[0] - b[0] || Number(a[2]) - Number(b[2]));
  const measured = new Map();
  // Which sample of the read each measurement was taken at.
  let samples = 0;
  // How many points of an endless animation's cycle the samples hold it at, in turn.
  const CYCLE = 8;
  // Whether the page may have changed since the last sample: a change to the document (a script's), noted here, or a
  // running animation. Where neither happened, nothing on the page has moved and a sample measures nothing again.
  let changed = true;
  const watch = new MutationObserver(() => { changed = true; });
  watch.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });

  /** Helpers for one pass over the page as it is now: each style and box is read once a pass. */
  const pass = () => {
    const body = document.body;
    const styles = new Map();
    const style = (e) => { let s = styles.get(e); if (!s) { s = getComputedStyle(e); styles.set(e, s); } return s; };
    // A value down the tree: own(e) combined with the parent's, memoized, without recursion (a page may nest deeply).
    const chain = (own, combine, base) => {
      const m = new Map();
      return (e) => {
        const path = [];
        let acc = base;
        for (let x = e; x; x = x.parentElement) { const v = m.get(x); if (v !== undefined) { acc = v; break; } path.push(x); }
        for (let i = path.length - 1; i >= 0; i--) { acc = combine(own(path[i]), acc); m.set(path[i], acc); }
        return acc;
      };
    };
    const tag = (e) => e.tagName.toUpperCase();
    const filterOpacity = (f) => { let o = 1; if (f && f !== 'none') for (const m of f.matchAll(/opacity\\(\\s*([0-9.]+)(%?)\\s*\\)/g)) o *= parseFloat(m[1]) / (m[2] ? 100 : 1); return o; };
    const opacity = chain((e) => { const s = style(e); const o = parseFloat(s.opacity) * filterOpacity(s.filter); return isNaN(o) ? 1 : o; }, (a, b) => a * b, 1);
    const clipsText = chain((e) => /\\btext\\b/.test(style(e).backgroundClip + ' ' + (style(e).webkitBackgroundClip || '')), (a, b) => a || b, false);
    const skipped = chain((e) => SKIP.has(tag(e)), (a, b) => a || b, false);
    const linkOf = chain((e) => (tag(e) === 'A' && e.hasAttribute('href') ? e : null), (a, b) => a || b, null);
    const marqueeOf = chain((e) => (tag(e) === 'MARQUEE' ? e : null), (a, b) => a || b, null);
    const blockOf = chain((e) => { const d = style(e).display; return !/^inline/.test(d) && d !== 'contents' ? e : null; }, (a, b) => a || b, null);
    const alpha = (c) => {
      if (!c || c === 'transparent') return 0;
      const slash = /\\/\\s*([0-9.]+)(%?)\\s*\\)$/.exec(c);
      if (slash) return parseFloat(slash[1]) / (slash[2] ? 100 : 1);
      const rgba = /^rgba\\(([^)]*)\\)$/.exec(c);
      if (rgba) { const v = rgba[1].split(/[\\s,]+/).filter(Boolean); return v.length >= 4 ? parseFloat(v[3]) : 1; }
      return 1;
    };
    // An svg paint's alpha: none leaves no ink, a gradient or pattern (url()) is taken as full.
    const paint = (v) => (!v || v === 'none' ? 0 : /^url\\(/.test(v) ? 1 : alpha(v));
    const share = (v) => { const x = parseFloat(v); return isNaN(x) ? 1 : x; };
    // How much ink the text in e has: its fill's alpha (Chromium paints text with -webkit-text-fill-color, which is
    // the colour unless set; svg text with its fill and fill-opacity), or a stroke's, or full where a shadow or a
    // background clipped to the text paints it.
    const ink = (e) => {
      const s = style(e);
      if (clipsText(e) || (s.textShadow || 'none') !== 'none') return 1;
      if (e instanceof SVGElement) return Math.max(paint(s.fill) * share(s.fillOpacity), parseFloat(s.strokeWidth || '0') > 0 ? paint(s.stroke) * share(s.strokeOpacity) : 0);
      const stroke = parseFloat(s.webkitTextStrokeWidth || '0') > 0 ? alpha(s.webkitTextStrokeColor) : 0;
      return Math.max(alpha(s.webkitTextFillColor || s.color), stroke);
    };
    // Whether e is rendered at all: not under display none, nor in content a browser skips (content-visibility: hidden,
    // the body of a closed details), where boxes may still be reported. An element with display: contents has no box of
    // its own (checkVisibility says no), and its text is rendered where its nearest ancestor with a box is.
    const renderedMemo = new Map();
    const rendered = (e) => {
      let v = renderedMemo.get(e);
      if (v === undefined) {
        let b = e;
        while (b.parentElement && style(b).display === 'contents') b = b.parentElement;
        v = !b.checkVisibility || b.checkVisibility();
        renderedMemo.set(e, v);
      }
      return v;
    };
    // content-visibility: hidden skips an element's content only where layout containment applies: not on an inline box
    // (a span, a ruby), a table row, row group or column, or an element with no box (display: contents). Chromium paints
    // the text of a span with hidden="until-found".
    const UNCONTAINED = new Set(['inline', 'contents', 'ruby', 'ruby-base', 'ruby-text', 'ruby-base-container', 'ruby-text-container', 'table-row', 'table-row-group', 'table-header-group', 'table-footer-group', 'table-column', 'table-column-group']);
    // Whether the text directly in e is rendered: e is, and does not skip its own content (a closed details shows only
    // its summary; content-visibility: hidden keeps the box and skips what is in it).
    const textRendered = (e) => rendered(e) && !(tag(e) === 'DETAILS' && !e.open) && !(style(e).contentVisibility === 'hidden' && !UNCONTAINED.has(style(e).display));
    /**
     * Whether a style keeps the text in e from sight as a whole: invisible, or its ink faded below 0.05 by its opacity
     * (filter: opacity() included) and its colour's alpha together.
     */
    const faded = (e) => /hidden|collapse/.test(style(e).visibility) || opacity(e) * ink(e) < 0.05;
    const REPLACED = new Set(['IMG', 'SVG', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED', 'INPUT', 'SELECT', 'TEXTAREA', 'METER', 'PROGRESS', 'PICTURE']);
    /*
     * How a box stands on the screen (vertical and turned text). A plane map m = [a, b, c, d] takes a vector (x, y) of
     * a box, before its transforms, to (a x + b y, c x + d y) on the screen: the linear part of every transform from
     * the box up to the page (an element's rotate, scale and transform, in that order; a translate only moves it; an
     * inline box, an element with no box and a table column have none), and every CSS zoom, a scale of all an element
     * holds (inline boxes included). A 3D matrix is read by what it does to the
     * element's own plane (z = 0): flat where nothing there changes its w (m14 and m24: no perspective tilts the plane)
     * and the plane stays at z = 0 (m13 and m23: not turned out of the screen; and m43 too where its parent sets it in
     * 3D, by preserve-3d or a perspective, which would scale it), as AOS's flip at rest, perspective(2500px) rotateY(0),
     * and vanilla-tilt's reset are (round 13 read any perspective() as a turn). null where a transform turns the box out
     * of the screen's plane (a 3D turn, a perspective that tilts it) or byway does not read it (a motion path).
     */
    const I2 = [1, 0, 0, 1];
    const mul = (p, q) => [p[0] * q[0] + p[1] * q[2], p[0] * q[1] + p[1] * q[3], p[2] * q[0] + p[3] * q[2], p[2] * q[1] + p[3] * q[3]];
    const angle = (v) => {
      const m = /^(-?[0-9.]+(?:e-?[0-9]+)?)(deg|rad|grad|turn)?$/.exec(v || '');
      if (!m) return NaN;
      const x = parseFloat(m[1]);
      return m[2] === 'rad' ? x : m[2] === 'grad' ? (x * Math.PI) / 200 : m[2] === 'turn' ? x * 2 * Math.PI : (x * Math.PI) / 180;
    };
    const UNTRANSFORMED = new Set(['inline', 'contents', 'none', 'table-column', 'table-column-group']);
    // Whether e's parent sets it in 3D (preserve-3d, or a perspective), so that moving it out of its plane scales it.
    const in3d = (e) => {
      const p = e.parentElement;
      if (!p) return false;
      const s = style(p);
      return s.transformStyle === 'preserve-3d' || (!!s.perspective && s.perspective !== 'none');
    };
    const ownMap = (e) => {
      const s = style(e);
      // CSS zoom scales the element and all it holds, as a scale would: its own sizes (client and offset sizes, computed
      // lengths) are before it, its boxes on the screen after it.
      const zf = parseFloat(s.zoom);
      const zm = isFinite(zf) && zf > 0 && Math.abs(zf - 1) > 1e-6 ? [zf, 0, 0, zf] : I2;
      const d = (s.display || '').split(' ')[0];
      if (!(e instanceof SVGElement) && !REPLACED.has(tag(e)) && (UNTRANSFORMED.has(d) || d.startsWith('ruby'))) return zm;
      if (s.offsetPath && s.offsetPath !== 'none') return null;
      let m = zm;
      const rot = (s.rotate || 'none').trim();
      if (rot !== 'none') {
        const parts = rot.split(/\\s+/);
        let t = angle(parts[parts.length - 1]);
        if (parts.length === 2 && parts[0] !== 'z') return null;
        if (parts.length === 4) {
          const [x, y, z] = parts.slice(0, 3).map(Number);
          if (Math.abs(x) > 1e-9 || Math.abs(y) > 1e-9 || !z) return null;
          if (z < 0) t = -t;
        }
        if (!isFinite(t)) return null;
        m = mul(m, [Math.cos(t), -Math.sin(t), Math.sin(t), Math.cos(t)]);
      }
      const sc = (s.scale || 'none').trim();
      if (sc !== 'none') {
        const v = sc.split(/\\s+/).map(Number);
        if (!isFinite(v[0]) || (v.length > 1 && !isFinite(v[1]))) return null;
        m = mul(m, [v[0], 0, 0, v.length > 1 ? v[1] : v[0]]);
      }
      const tf = (s.transform || 'none').trim();
      if (tf !== 'none') {
        const mm = /^matrix(3d)?\\(([^)]*)\\)$/.exec(tf);
        if (!mm) return null;
        const v = mm[2].split(',').map(Number);
        if (v.some((x) => !isFinite(x))) return null;
        if (!mm[1]) m = mul(m, [v[0], v[2], v[1], v[3]]);
        else if ([2, 3, 6, 7].every((k) => Math.abs(v[k]) < 1e-6) && Math.abs(v[15]) > 1e-9 && (Math.abs(v[14]) < 1e-6 || !in3d(e))) m = mul(m, [v[0] / v[15], v[4] / v[15], v[1] / v[15], v[5] / v[15]]);
        else return null;
      }
      // A translate out of the plane its parent sets in 3D scales it too.
      const tr = (s.translate || 'none').trim().split(/\\s+/);
      if (tr.length === 3 && parseFloat(tr[2]) !== 0 && in3d(e)) return null;
      return m;
    };
    const lin = chain(ownMap, (own, acc) => (own === null || acc === null ? null : mul(acc, own)), I2);
    /**
     * The frame text whose parent is e is laid out in, on the screen: u, the direction its line runs (line-left to
     * line-right), and v, the direction its block runs (where the next line goes), from e's writing mode and its plane
     * map. plain: as on a page with no transform (u across the page, v down it, scaled at most); axis: u along one of the
     * screen's axes, as in vertical text or text turned by a quarter turn; ok: a plane map byway reads.
     */
    const frames = new Map();
    const textFrame = (e) => {
      let f = frames.get(e);
      if (f) return f;
      const m = lin(e);
      f = { ok: false, plain: false, axis: false };
      if (m) {
        const wm = style(e).writingMode || '';
        const [X, Y] = /^(vertical-rl|sideways-rl|tb)/.test(wm) ? [[0, 1], [-1, 0]] : /^vertical-lr/.test(wm) ? [[0, 1], [1, 0]] : /^sideways-lr/.test(wm) ? [[0, -1], [1, 0]] : [[1, 0], [0, 1]];
        const u = [m[0] * X[0] + m[1] * X[1], m[2] * X[0] + m[3] * X[1]];
        const v = [m[0] * Y[0] + m[1] * Y[1], m[2] * Y[0] + m[3] * Y[1]];
        const nu = Math.hypot(u[0], u[1]), nv = Math.hypot(v[0], v[1]);
        const det = u[0] * v[1] - u[1] * v[0];
        if (nu > 1e-9 && nv > 1e-9 && Math.abs(det) > 1e-6 * nu * nv) {
          const E = 1e-4;
          const plain = u[0] > 0 && v[1] > 0 && Math.abs(u[1]) <= E * nu && Math.abs(v[0]) <= E * nv;
          const axis = plain || (Math.abs(u[1]) <= E * nu && Math.abs(v[0]) <= E * nv) || (Math.abs(u[0]) <= E * nu && Math.abs(v[1]) <= E * nv);
          f = { ok: true, plain, axis, u, v, uh: [u[0] / nu, u[1] / nu], vh: [v[0] / nv, v[1] / nv] };
        }
      }
      frames.set(e, f);
      return f;
    };
    /**
     * A box laid out in frame fr, from its bounding box q ({ l, t, r, b }) on the screen: its middle c, and hu and hv, half
     * its own extent along the frame's line and along its block, as vectors on the screen. Exact where fr runs along the
     * screen's axes; else its own width and height are solved from its bounding box, which cannot be done where fr is
     * turned too near an eighth of a turn (null; also for a frame that is not read).
     */
    const glyphOf = (q, fr) => {
      if (!fr.ok) return null;
      const W = q.r - q.l, H = q.b - q.t;
      const a = Math.abs(fr.u[0]), b = Math.abs(fr.v[0]), c = Math.abs(fr.u[1]), d = Math.abs(fr.v[1]);
      let w, h;
      if (fr.axis) {
        if (a >= c) { w = W / a; h = H / d; }
        else { w = H / c; h = W / b; }
      } else {
        const D = a * d - b * c;
        if (Math.abs(D) < 0.3 * (a * d + b * c)) return null;
        w = (W * d - H * b) / D;
        h = (H * a - W * c) / D;
        if (!(w > -0.5 && h > -0.5)) return null;
      }
      const hw = Math.max(0, w) / 2, hh = Math.max(0, h) / 2;
      return { c: [(q.l + q.r) / 2, (q.t + q.b) / 2], hu: [fr.u[0] * hw, fr.u[1] * hw], hv: [fr.v[0] * hh, fr.v[1] * hh] };
    };
    /** The corners on the screen of a box laid out in frame fr (see glyphOf), or null. */
    const quadOf = (q, fr) => {
      const g = glyphOf(q, fr);
      if (!g) return null;
      const [cx, cy] = g.c, [ux, uy] = g.hu, [vx, vy] = g.hv;
      return [[cx - ux - vx, cy - uy - vy], [cx + ux - vx, cy + uy - vy], [cx + ux + vx, cy + uy + vy], [cx - ux + vx, cy - uy + vy]];
    };
    /**
     * A box laid out in frame fr as a box along the unit axes u (its l and r) and n (its t and b): along u its own advance
     * only (in skewed text, not its slanted outline, which reaches over the next character's), across it all of it; null
     * where glyphOf is.
     */
    const lineBox = (q, fr, u, n) => {
      const g = glyphOf(q, fr);
      if (!g) return null;
      const cu = g.c[0] * u[0] + g.c[1] * u[1], cn = g.c[0] * n[0] + g.c[1] * n[1];
      const eu = Math.abs(g.hu[0] * u[0] + g.hu[1] * u[1]);
      const en = Math.abs(g.hu[0] * n[0] + g.hu[1] * n[1]) + Math.abs(g.hv[0] * n[0] + g.hv[1] * n[1]);
      return { l: cu - eu, r: cu + eu, t: cn - en, b: cn + en };
    };
    /** Points on the screen as a box along the axes u (its l and r) and n (its t and b), both unit vectors. */
    const along = (pts, u, n) => {
      let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
      for (const [x, y] of pts) {
        const p = x * u[0] + y * u[1], s = x * n[0] + y * n[1];
        if (p < l) l = p;
        if (p > r) r = p;
        if (s < t) t = s;
        if (s > b) b = s;
      }
      return { l, r, t, b };
    };
    /**
     * Where e's border box stands on the screen: o, the screen point of its top left corner (before its transforms),
     * its plane map m and its inverse, and its own width and height (solved from its bounding box, or its offset size
     * where the map is turned too near an eighth of a turn), so each of its own points has its place on the screen; null
     * where that cannot be told.
     */
    const boxMap = (e, r) => {
      const m = lin(e);
      if (!m) return null;
      const det = m[0] * m[3] - m[1] * m[2];
      if (!(Math.abs(det) > 1e-9)) return null;
      const a = Math.abs(m[0]), b = Math.abs(m[1]), c = Math.abs(m[2]), d = Math.abs(m[3]);
      const D = a * d - b * c;
      let w, h;
      if (Math.abs(D) >= 0.3 * (a * d + b * c)) { w = (r.width * d - r.height * b) / D; h = (r.height * a - r.width * c) / D; }
      else if (e instanceof HTMLElement) { w = e.offsetWidth; h = e.offsetHeight; }
      else return null;
      if (!(w > -0.5 && h > -0.5)) return null;
      w = Math.max(0, w);
      h = Math.max(0, h);
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      return { m, w, h, o: [cx - (m[0] * w + m[1] * h) / 2, cy - (m[2] * w + m[3] * h) / 2], inv: [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det] };
    };
    const NO_OVERFLOW = new Set(['inline', 'contents', 'none', 'table', 'inline-table', 'table-row', 'table-row-group', 'table-header-group', 'table-footer-group', 'table-column', 'table-column-group', 'ruby', 'ruby-text']);
    const len = (v, whole, auto) => v === 'auto' ? auto : v.endsWith('%') ? (parseFloat(v) / 100) * whole : parseFloat(v) || 0;
    // A clip: a rect on the screen, and the tests of boxes a transform turns or scales, each a rect in the box's own
    // points (x0 to x1, y0 to y1 from its top left corner) that a point on the screen must fall in.
    // UNPLACED keeps nothing too, as a box whose place on the screen the read cannot tell (turned in 3D): its text is
    // hidden from sight, and the read says why (ShownText.unplaced).
    const NO_TESTS = [];
    const ALL = { l: -Infinity, t: -Infinity, r: Infinity, b: Infinity, tests: NO_TESTS };
    const NONE = { l: 0, t: 0, r: 0, b: 0, tests: NO_TESTS };
    const UNPLACED = { l: 0, t: 0, r: 0, b: 0, tests: NO_TESTS, unplaced: true };
    const meet = (a, b) => {
      const at = a.tests || NO_TESTS, bt = b.tests || NO_TESTS;
      const out = { l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b), tests: !at.length ? bt : !bt.length ? at : at.concat(bt) };
      if (a.unplaced || b.unplaced) out.unplaced = true;
      return out;
    };
    const inside = (tests, x, y) => {
      for (const T of tests) {
        const dx = x - T.o[0], dy = y - T.o[1];
        const lx = T.inv[0] * dx + T.inv[1] * dy, ly = T.inv[2] * dx + T.inv[3] * dy;
        if (!(lx >= T.x0 - 0.01 && lx <= T.x1 + 0.01 && ly >= T.y0 - 0.01 && ly <= T.y1 + 0.01)) return false;
      }
      return true;
    };
    const at = (v, whole) => v === 'left' || v === 'top' ? 0 : v === 'right' || v === 'bottom' ? whole : v === 'center' ? whole / 2 : len(v, whole, whole / 2);
    /** The box a clip-path basic shape keeps: its bounding box (one with no area keeps nothing), or undefined. */
    const shape = (cp, r) => {
      const m = /^(inset|circle|ellipse|polygon)\\((.*)\\)/.exec(cp.trim());
      if (!m) return undefined;
      const kind = m[1], args = m[2];
      if (kind === 'inset') {
        const v = args.split(/\\s+round\\s+/)[0].trim().split(/\\s+/);
        const [t, rr, b, l] = v.length === 1 ? [v[0], v[0], v[0], v[0]] : v.length === 2 ? [v[0], v[1], v[0], v[1]] : v.length === 3 ? [v[0], v[1], v[2], v[1]] : v;
        return { t: r.top + len(t, r.height, 0), r: r.right - len(rr, r.width, 0), b: r.bottom - len(b, r.height, 0), l: r.left + len(l, r.width, 0) };
      }
      if (kind === 'polygon') {
        const pts = args.replace(/^\\s*(nonzero|evenodd)\\s*,/, '').split(',').map((p) => p.trim().split(/\\s+/)).map(([x, y]) => [r.left + len(x || '0', r.width, 0), r.top + len(y || '0', r.height, 0)]);
        let area = 0;
        for (let i = 0; i < pts.length; i++) { const p1 = pts[i], p2 = pts[(i + 1) % pts.length]; area += p1[0] * p2[1] - p2[0] * p1[1]; }
        if (pts.length < 3 || Math.abs(area) < 1) return NONE;
        return { l: Math.min(...pts.map((p) => p[0])), r: Math.max(...pts.map((p) => p[0])), t: Math.min(...pts.map((p) => p[1])), b: Math.max(...pts.map((p) => p[1])) };
      }
      const parts = args.split(/\\s+at\\s+/);
      const xy = (parts[1] || '50% 50%').trim().split(/\\s+/);
      const cx = r.left + at(xy[0] || '50%', r.width), cy = r.top + at(xy[1] || xy[0] || '50%', r.height);
      const sz = (parts[0] || '').trim().split(/\\s+/).filter(Boolean);
      const dx = [cx - r.left, r.right - cx], dy = [cy - r.top, r.bottom - cy];
      const side = (v, ds, whole) => v === undefined || v === 'closest-side' ? Math.min(...ds) : v === 'farthest-side' ? Math.max(...ds) : len(v, whole, 0);
      let rx, ry;
      if (kind === 'circle') rx = ry = side(sz[0], [...dx, ...dy], Math.sqrt((r.width * r.width + r.height * r.height) / 2));
      else { rx = side(sz[0], dx, r.width); ry = side(sz[1], dy, r.height); }
      if (!(rx > 0) || !(ry > 0)) return NONE;
      return { l: cx - rx, r: cx + rx, t: cy - ry, b: cy + ry };
    };
    /**
     * What e clips its content to: its overflow (unless escaped) or paint containment, its clip rect, its clip-path. On
     * a box a transform turns, scales or skews, in its own points (a test; round 12 set its unturned size on its
     * bounding box, so a hero's slow zoom or a card turned 2 degrees cut its own text); where its place cannot be told
     * (a 3D turn), it keeps nothing, as UNPLACED.
     */
    const own = (e, overflow) => {
      const s = style(e);
      const m = lin(e);
      if (!m || Math.abs(m[0] - 1) > 1e-6 || Math.abs(m[3] - 1) > 1e-6 || Math.abs(m[1]) > 1e-6 || Math.abs(m[2]) > 1e-6) return ownTurned(e, s, overflow);
      let out = ALL;
      const r = e.getBoundingClientRect();
      if (overflow) {
        const paint = /paint|strict|content/.test(s.contain || '');
        const ox = paint || /hidden|clip/.test(s.overflowX);
        const oy = paint || /hidden|clip/.test(s.overflowY);
        const svg = e instanceof SVGSVGElement;
        if ((ox || oy) && (svg || (!NO_OVERFLOW.has(s.display.split(' ')[0]) && !/math/.test(s.display)))) {
          const l = r.left + (svg ? 0 : e.clientLeft);
          const t = r.top + (svg ? 0 : e.clientTop);
          const w = svg ? r.width : e.clientWidth;
          const h = svg ? r.height : e.clientHeight;
          out = meet(out, { l: ox ? l : -Infinity, t: oy ? t : -Infinity, r: ox ? l + w : Infinity, b: oy ? t + h : Infinity });
        }
      }
      const rect = /^rect\\((.*)\\)$/.exec(s.clip || '');
      if (rect && (s.position === 'absolute' || s.position === 'fixed')) {
        const v = rect[1].split(/\\s*,\\s*|\\s+/).filter(Boolean);
        if (v.length === 4) out = meet(out, { t: r.top + len(v[0], 0, 0), r: r.left + len(v[1], 0, r.width), b: r.top + len(v[2], 0, r.height), l: r.left + len(v[3], 0, 0) });
      }
      if (s.clipPath && s.clipPath !== 'none') { const c = shape(s.clipPath, r); if (c) out = meet(out, c); }
      return out;
    };
    const ownTurned = (e, s, overflow) => {
      const paint = overflow && /paint|strict|content/.test(s.contain || '');
      const ox = paint || (overflow && /hidden|clip/.test(s.overflowX));
      const oy = paint || (overflow && /hidden|clip/.test(s.overflowY));
      const svg = e instanceof SVGSVGElement;
      const clips = ((ox || oy) && (svg || (!NO_OVERFLOW.has(s.display.split(' ')[0]) && !/math/.test(s.display)))) || (/^rect\\(/.test(s.clip || '') && (s.position === 'absolute' || s.position === 'fixed')) || (s.clipPath && s.clipPath !== 'none');
      if (!clips) return ALL;
      const bm = boxMap(e, e.getBoundingClientRect());
      if (!bm) return lin(e) ? NONE : UNPLACED;
      const T = { o: bm.o, inv: bm.inv, x0: -Infinity, x1: Infinity, y0: -Infinity, y1: Infinity };
      const cut = (c) => { T.x0 = Math.max(T.x0, c.l); T.y0 = Math.max(T.y0, c.t); T.x1 = Math.min(T.x1, c.r); T.y1 = Math.min(T.y1, c.b); };
      if ((ox || oy) && (svg || (!NO_OVERFLOW.has(s.display.split(' ')[0]) && !/math/.test(s.display)))) {
        const l = svg ? 0 : e.clientLeft, t = svg ? 0 : e.clientTop;
        const w = svg ? bm.w : e.clientWidth, h = svg ? bm.h : e.clientHeight;
        cut({ l: ox ? l : -Infinity, t: oy ? t : -Infinity, r: ox ? l + w : Infinity, b: oy ? t + h : Infinity });
      }
      const own = { left: 0, top: 0, right: bm.w, bottom: bm.h, width: bm.w, height: bm.h };
      const rect = /^rect\\((.*)\\)$/.exec(s.clip || '');
      if (rect && (s.position === 'absolute' || s.position === 'fixed')) {
        const v = rect[1].split(/\\s*,\\s*|\\s+/).filter(Boolean);
        if (v.length === 4) cut({ t: len(v[0], 0, 0), r: len(v[1], 0, bm.w), b: len(v[2], 0, bm.h), l: len(v[3], 0, 0) });
      }
      if (s.clipPath && s.clipPath !== 'none') { const c = shape(s.clipPath, own); if (c) cut(c); }
      return { l: -Infinity, t: -Infinity, r: Infinity, b: Infinity, tests: [T] };
    };
    const positioned = (s) => s.position !== 'static' || s.transform !== 'none';
    const contains = (s) => s.transform !== 'none' || s.filter !== 'none' || /paint|layout|strict|content/.test(s.contain || '');
    // The rect that clips text whose parent is e. Walking up, an absolutely positioned element escapes the overflow of
    // ancestors below its containing block (the nearest positioned one), and a fixed one that of every ancestor below
    // one with a transform, a filter or containment. Memoized by element and escape, without recursion. For a marquee
    // (own false), its own overflow is left out: its text is measured by its box.
    const known = { '': new Map(), abs: new Map(), fixed: new Map() };
    const clipOf = (start, ownOverflow) => {
      const path = [];
      let acc = ALL;
      let e = start, esc = '';
      while (e && e !== body && e !== html) {
        const k = known[esc].get(e);
        if (k && (ownOverflow || e !== start)) { acc = k; break; }
        const s = style(e);
        let x = esc;
        if ((x === 'abs' && positioned(s)) || (x === 'fixed' && contains(s))) x = '';
        path.push([e, esc, x]);
        if (x !== 'fixed' && s.position === 'absolute') x = 'abs';
        if (s.position === 'fixed') x = 'fixed';
        esc = x;
        e = e.parentElement;
      }
      for (let i = path.length - 1; i >= 0; i--) {
        const [pe, from, x] = path[i];
        const mine = ownOverflow || pe !== start;
        acc = meet(own(pe, !x && mine), acc);
        if (mine) known[from].set(pe, acc);
      }
      return acc;
    };
    const rtlPage = style(html).direction === 'rtl';
    const pageWidth = html.clientWidth;
    const ellipses = new Map();
    /**
     * The band at the end of a box's line where an ellipsis shows in place of its text, or null. On a box whose plane map
     * is not the identity (vertical or turned text, or a box a transform or CSS zoom scales), along the line's own axes
     * (turned: l and r along its u, t and b along its v), from the box's own points set on the screen (round 13 mixed a
     * scaled box's place with its unscaled width, so under scale(0.9) or zoom an ellipsis's cut letters read as shown);
     * where those cannot be told, every character in the box is taken as cut off (all).
     */
    const ellipsisOf = (e) => {
      if (ellipses.has(e)) return ellipses.get(e);
      const s = style(e);
      const fr = textFrame(e);
      const clamp = !!s.webkitLineClamp && s.webkitLineClamp !== 'none';
      // In vertical text a line runs down the box, so it overflows the box's height.
      const vertical = /^(vertical|sideways|tb)/.test(s.writingMode || '');
      const over = vertical ? e.scrollHeight > e.clientHeight + 1 : e.scrollWidth > e.clientWidth + 1;
      let v = null;
      if ((clamp && /hidden|clip/.test(fr.plain ? s.overflowY : s.overflowX + s.overflowY)) || (s.textOverflow === 'ellipsis' && /hidden|clip/.test(vertical ? s.overflowY : s.overflowX) && over)) {
        const probe = document.createElement('span');
        probe.textContent = '\\u2026';
        probe.style.cssText = 'all:initial;font:inherit;letter-spacing:inherit;white-space:pre;writing-mode:inherit;';
        e.appendChild(probe);
        const pr = probe.getBoundingClientRect();
        probe.remove();
        const rtl = s.direction === 'rtl';
        const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2;
        const r = e.getBoundingClientRect();
        const m = lin(e);
        if (fr.plain && m && Math.abs(m[0] - 1) < 1e-6 && Math.abs(m[3] - 1) < 1e-6 && Math.abs(m[1]) < 1e-6 && Math.abs(m[2]) < 1e-6) {
          const w = pr.width;
          const left = r.left + e.clientLeft + parseFloat(s.paddingLeft), right = r.left + e.clientLeft + e.clientWidth - parseFloat(s.paddingRight);
          v = { rtl, at: rtl ? left + w : right - w, clamp, bottom: r.top + e.clientTop + e.clientHeight - parseFloat(s.paddingBottom), lh };
        } else {
          const bm = boxMap(e, r);
          const p = fr.ok ? lineBox({ l: pr.left, t: pr.top, r: pr.right, b: pr.bottom }, fr, fr.uh, fr.vh) : null;
          if (!bm || !p) v = { all: true };
          else {
            // The content box, in the box's own points, then on the screen, then along the line's own axes.
            const x0 = e.clientLeft + parseFloat(s.paddingLeft), x1 = e.clientLeft + e.clientWidth - parseFloat(s.paddingRight);
            const y0 = e.clientTop + parseFloat(s.paddingTop), y1 = e.clientTop + e.clientHeight - parseFloat(s.paddingBottom);
            const pt = (x, y) => [bm.o[0] + bm.m[0] * x + bm.m[1] * y, bm.o[1] + bm.m[2] * x + bm.m[3] * y];
            const k = along([pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)], fr.uh, fr.vh);
            const w = p.r - p.l;
            // The line height on the screen: scaled as the frame scales its block direction.
            v = { turned: fr, rtl, at: rtl ? k.l + w : k.r - w, clamp, bottom: k.b, lh: lh * Math.hypot(fr.v[0], fr.v[1]) };
          }
        }
      }
      ellipses.set(e, v);
      return v;
    };
    /** Whether an ellipsis band cuts off a character whose bounding box (on the screen) is q, laid out in frame fr. */
    const cutOff = (ell, q, fr) => {
      if (ell.all) return true;
      if (!ell.turned) return (!ell.clamp || q.bottom > ell.bottom - ell.lh) && (ell.rtl ? q.left < ell.at - 0.5 : q.right > ell.at + 0.5);
      const t = ell.turned;
      if (!fr.ok || fr.uh[0] * t.uh[0] + fr.uh[1] * t.uh[1] < 0.98) return true;
      const k = lineBox({ l: q.left, t: q.top, r: q.right, b: q.bottom }, fr, t.uh, t.vh);
      if (!k) return true;
      return (!ell.clamp || k.b > ell.bottom - ell.lh) && (ell.rtl ? k.l < ell.at - 0.5 : k.r > ell.at + 0.5);
    };
    const RTL = /[\\u0590-\\u08ff\\ufb1d-\\ufdcf\\ufdf0-\\ufdff\\ufe70-\\ufeff]|\\ud802[\\udc00-\\udfff]|\\ud803[\\udc00-\\ude7f]|\\ud83a/;
    const LTR = /^[\\p{L}\\p{N}]/u;
    // Arabic-Indic and Extended Arabic-Indic digits and the Arabic decimal and thousands separators (bidi class AN) run
    // left to right, as every number does, though they sit in the Arabic block.
    const NUMBER = /[\\u0660-\\u066c\\u06f0-\\u06f9]/;
    const dirOf = (c) => NUMBER.test(c) ? 'L' : RTL.test(c) ? 'R' : LTR.test(c) ? 'L' : 'N';
    /** Where a text node is now, and what clips it, on the page: a node measured again only when this changes. */
    const where = (n) => {
      const parent = n.parentElement;
      const marquee = marqueeOf(parent);
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = marquee ? marquee.getBoundingClientRect() : range.getBoundingClientRect();
      const c = marquee ? clipOf(marquee, false) : clipOf(parent, true);
      const k = (v, s) => (isFinite(v) ? Math.round((v + s) * 2) / 2 : v);
      const tests = c.tests.map((T) => [k(T.o[0], scrollX), k(T.o[1], scrollY), ...T.inv.map((x) => Math.round(x * 1e4) / 1e4), k(T.x0, 0), k(T.x1, 0), k(T.y0, 0), k(T.y1, 0)].join(':'));
      return [k(r.left, scrollX), k(r.top, scrollY), k(r.right, scrollX), k(r.bottom, scrollY), k(c.l, scrollX), k(c.t, scrollY), k(c.r, scrollX), k(c.b, scrollY), ...tests].join(',');
    };
    /**
     * Each character of a text node, measured now: its box on the page, and whether a visitor sees it there; with how
     * many are seen, and whether the node is on the screen.
     */
    const measure = (n) => {
      const parent = n.parentElement;
      const marquee = marqueeOf(parent);
      const range = document.createRange();
      const clip = marquee ? clipOf(marquee, false) : clipOf(parent, true);
      const block = blockOf(parent);
      const ell = block && !marquee ? ellipsisOf(block) : null;
      const fs = parseFloat(style(parent).fontSize) || 16;
      // Its line height, as its element sets it (NaN for normal): two rows of text stand at least that far apart.
      const lh = parseFloat(style(parent).lineHeight);
      // The frame its text is laid out in (vertical or turned text: see sep in final).
      const fr = textFrame(parent);
      const mq = marquee ? [...marquee.getClientRects()].find((x) => x.width > 0 || x.height > 0) : null;
      const chars = [];
      const data = n.data;
      let last = null;
      let count = 0;
      for (let i = 0; i < data.length; ) {
        const w = data.codePointAt(i) > 0xffff ? 2 : 1;
        const c = data.slice(i, i + w);
        if (!SPACE.test(c)) {
          let q = null;
          if (marquee) q = mq;
          else {
            range.setStart(n, i);
            range.setEnd(n, i + w);
            const rs = range.getClientRects();
            for (let k = 0; k < rs.length && !q; k++) if (rs[k].width > 0 && rs[k].height > 0) q = rs[k];
          }
          let shown = false, box = null, vis = null, up = false;
          if (q) {
            box = { l: q.left + scrollX, t: q.top + scrollY, r: q.right + scrollX, b: q.bottom + scrollY };
            const l = Math.max(q.left, clip.l), t = Math.max(q.top, clip.t), r = Math.min(q.right, clip.r), b = Math.min(q.bottom, clip.b);
            // A visitor sees a character where every clip keeps its middle: a sliver of a row a box cuts off, or of a
            // letter, shows no letter. Short of the page's top or start edge, where no scrolling reaches, it is not seen.
            const cx = (q.left + q.right) / 2, cy = (q.top + q.bottom) / 2;
            const off = cy + scrollY < 0 || (rtlPage ? cx + scrollX > pageWidth : cx + scrollX < 0);
            shown = r > l && b > t && cx >= l && cx <= r && cy >= t && cy <= b && !off && inside(clip.tests, cx, cy);
            // Not seen where a clip stands whose place the read cannot tell (up: the read says so, ShownText.unplaced).
            up = !shown && !!clip.unplaced;
            // The part a visitor sees: a gap beside a character its box cuts off is measured from the cut.
            if (shown) vis = { l: l + scrollX, t: t + scrollY, r: r + scrollX, b: b + scrollY };
            if (shown && ell && cutOff(ell, q, fr)) shown = false;
          } else if (last && last.box) {
            // A character with no box of its own (a zero-width or combining one) goes with the one before it.
            box = last.box;
            vis = last.vis;
            shown = last.shown;
            up = last.up;
          }
          last = { i, box, vis, shown, up, fs, lh, d: dirOf(c), fr };
          chars.push(last);
          if (shown) count++;
        }
        i += w;
      }
      // Characters with no box of their own before the node's first one with a box (a zero-width space opening it) go
      // with that one.
      let next = null;
      for (let k = chars.length - 1; k >= 0; k--) {
        const ch = chars[k];
        if (ch.box) next = ch;
        else if (next) { ch.box = next.box; ch.vis = next.vis; ch.shown = next.shown; ch.up = next.up; if (ch.shown) count++; }
      }
      // The direction the text is laid out in: its block's, or that of an element inside it that isolates or embeds its
      // text (a link or span with a dir attribute, a bdi, a bdo), as a phone number in a right-to-left paragraph runs in
      // a link marked dir="ltr".
      // (bd, the block's direction, orders two runs a paragraph or box holds; id, the innermost such element's, is the
      // direction a character's own run is laid out in.)
      let iso = parent;
      while (iso && iso !== block && (style(iso).unicodeBidi || 'normal') === 'normal') iso = iso.parentElement;
      const base = style(iso || block || parent).direction === 'rtl' ? 'R' : 'L';
      const blockDir = style(block || parent).direction === 'rtl' ? 'R' : 'L';
      for (const ch of chars) { ch.bd = blockDir; ch.id = base; }
      // First, as the bidi algorithm's weak rules do, a number's own signs run with it: a currency, percent or degree
      // sign beside its digits ("$20", "20%"), and a decimal point, comma, colon, slash, plus or minus between two digits.
      const DIGIT = /^\\p{Nd}$/u, TERMINATOR = /^[#%°‰±\\p{Sc}]$/u, SEPARATOR = /^[.,:\\/+\\-\\u066b\\u066c\\u060c]$/;
      const cpAt = (i) => (i >= 0 && i < data.length ? String.fromCodePoint(data.codePointAt(i)) : '');
      const before = (i) => (i > 0 && data.charCodeAt(i - 1) >= 0xdc00 && data.charCodeAt(i - 1) <= 0xdfff ? cpAt(i - 2) : cpAt(i - 1));
      const ARABIC_NUMBER = /^[\\u0660-\\u0669\\u066b\\u066c]$/;
      for (const ch of chars) {
        const c = cpAt(ch.i);
        if (DIGIT.test(c)) { ch.num = ARABIC_NUMBER.test(c) ? 'AN' : 'EN'; continue; }
        if (ch.d !== 'N') continue;
        const w = c.length;
        if (SEPARATOR.test(c) && DIGIT.test(before(ch.i)) && DIGIT.test(cpAt(ch.i + w))) { ch.d = 'L'; ch.num = 'EN'; }
        else if (TERMINATOR.test(c)) {
          let l = ch.i, r = ch.i + w;
          while (TERMINATOR.test(before(l))) l -= before(l).length;
          while (TERMINATOR.test(cpAt(r))) r += cpAt(r).length;
          if (DIGIT.test(before(l)) || DIGIT.test(cpAt(r))) { ch.d = 'L'; ch.num = 'EN'; }
        }
      }
      // Then punctuation and symbols take a direction from the characters around them, as the bidi algorithm resolves
      // them: those on both sides when they agree, else the direction the text is laid out in. A number counts there as
      // the algorithm counts it: right to left, an Arabic-Indic one always, a European one unless the last letter before
      // it in its text node (or, with none, the direction the text is laid out in) is left to right.
      const pull = [];
      let strong = base;
      for (const ch of chars) {
        if (ch.num === 'AN') pull.push('R');
        else if (ch.num === 'EN') pull.push(strong === 'L' ? 'L' : 'R');
        else { pull.push(ch.d); if (ch.d !== 'N') strong = ch.d; }
      }
      for (let k = 0; k < chars.length; k++) {
        if (chars[k].d !== 'N') continue;
        let a = k - 1, b = k + 1;
        while (a >= 0 && chars[a].d === 'N') a--;
        while (b < chars.length && chars[b].d === 'N') b++;
        const da = a >= 0 ? pull[a] : null, db = b < chars.length ? pull[b] : null;
        const d = da && da === db ? da : base;
        for (let j = k; j < b; j++) chars[j].d = d;
        k = b - 1;
      }
      range.selectNodeContents(n);
      const nr = marquee ? marquee.getBoundingClientRect() : range.getBoundingClientRect();
      const onScreen = nr.bottom > 0 && nr.top < innerHeight && nr.right > 0 && nr.left < innerWidth;
      // The node's box on the page: two nodes in one place (slides stacked and shown in turn) are never side by side.
      const rect = { l: nr.left + scrollX, t: nr.top + scrollY, r: nr.right + scrollX, b: nr.bottom + scrollY };
      return { data, chars, marquee, count, onScreen, rect };
    };
    return { body, style, rendered, textRendered, faded, skipped, linkOf, blockOf, measure, where, rtlPage, letter: (c) => LTR.test(c), textFrame, quadOf, lineBox, along, REPLACED };
  };

  const loadAll = async () => {
    for (const img of document.images) if (img.loading === 'lazy') img.loading = 'eager';
    if (document.fonts) {
      document.fonts.forEach((f) => { if (f.status === 'unloaded') f.load().catch(() => undefined); });
      await document.fonts.ready;
    }
    await Promise.all([...document.images].map((i) => (i.complete ? null : i.decode().catch(() => undefined))));
    return true;
  };

  const scroll = (y) => {
    window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    window.dispatchEvent(new Event('scroll'));
    document.dispatchEvent(new Event('scroll'));
    return Math.max(html.scrollHeight, document.body ? document.body.scrollHeight : 0);
  };

  const sample = () => {
    samples++;
    // Every animation and transition is taken to its end; an endless one is held at a point of its cycle, a later point
    // at each sample (CYCLE points, the same on every page), so a ticker is seen where its cycle carries it.
    const animations = document.getAnimations();
    for (const a of animations) {
      let timing = null;
      try { timing = a.effect && a.effect.getComputedTiming(); } catch {}
      if (timing && timing.iterations === Infinity && typeof timing.duration === 'number' && timing.duration > 0) {
        try { a.pause(); a.currentTime = (timing.delay || 0) + timing.duration * (((samples - 1) % CYCLE) / CYCLE); } catch { a.cancel(); }
      } else { try { a.finish(); } catch { a.cancel(); } }
    }
    if (!changed && !animations.length) return 0;
    changed = false;
    const P = pass();
    if (!P.body) return 0;
    const w = document.createTreeWalker(P.body, NodeFilter.SHOW_TEXT);
    let n = 0;
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const p = t.parentElement;
      if (!p || P.skipped(p) || !/[^ \\t\\n\\f\\r]/.test(t.data)) continue;
      const had = measured.get(t);
      // Until when a measurement held, so that it can be set beside another node's (see final's sep): unseen, the
      // first sample at which the node was not shown where it was measured (a style hid it, as a script fades out a
      // slide, or it stood elsewhere); left, the first at which it no longer stood there (not laid out, or elsewhere).
      const laid = P.textRendered(p);
      if (!laid || P.faded(p)) {
        if (had && had.unseen === undefined) had.unseen = samples;
        if (had && !laid && had.left === undefined) had.left = samples;
        continue;
      }
      const fresh = !had || had.data !== t.data;
      const at = P.where(t);
      if (!fresh && had.at === at) continue;
      if (!fresh && at !== had.at0) {
        if (had.unseen === undefined) had.unseen = samples;
        if (had.left === undefined) had.left = samples;
      }
      // A node is measured again when it moved or its clip did (a section a script slides or turns into view, a
      // carousel's track). It keeps the measurement where it shows most: the more characters seen, then on the screen,
      // then the later.
      const m = P.measure(t);
      // at: where the node was last seen (a node is measured again only when it moves); at0: where this measurement
      // was taken, so the end of the read can tell whether the node still stands there.
      m.at = at;
      m.at0 = at;
      m.when = samples;
      if (fresh || m.count > had.count || (m.count === had.count && (m.onScreen || !had.onScreen))) measured.set(t, m);
      else had.at = at;
      n++;
    }
    // The read's own changes (an ellipsis's probe) are not the page's.
    watch.takeRecords();
    return n;
  };

  const final = () => {
    const pageTitle = document.title;
    const P = pass();
    const body = P.body;
    if (!body) return { title: pageTitle, text: '', linked: '', hrefs: [], hidden: [], unlaid: '', unplaced: '', generated: [] };
    const { style, rtlPage } = P;
    const hv = style(html), bv = style(body);
    // The screen clips the page where the page's overflow is hidden, unless the body scrolls in its place.
    const clips = (h, b) => (/visible/.test(h) ? /hidden|clip/.test(b) : /hidden|clip/.test(h) && !/auto|scroll/.test(b));
    const clipX = clips(hv.overflowX, bv.overflowX), clipY = clips(hv.overflowY, bv.overflowY);
    const vw = html.clientWidth, vh = innerHeight;
    const REPLACED = P.REPLACED;
    // Whether a visitor sees a character as measured: shown where it stands, and not beyond the screen where the page's
    // overflow is hidden.
    const seenAt = (c) => !!c && c.shown && !(clipX && (rtlPage ? c.box.l + c.box.r <= 0 : c.box.l + c.box.r >= 2 * vw)) && !(clipY && c.box.t + c.box.b >= 2 * vh);
    // The nodes shown at the read's last instant (each with where it stood then, and its characters' places in all), so
    // that each can be measured again at the other points of an endless animation's cycle.
    const lastNodes = [];
    // Displays whose content is part of the line's own flow of text (not a box of its own).
    const INLINE_FLOW = new Set(['inline', 'ruby', 'ruby-text', 'math', 'inline math']);
    const preserves = (s) => /^(preserve|preserve-breaks|break-spaces)$/.test(s.whiteSpaceCollapse || '') || /^(pre|pre-wrap|pre-line|break-spaces)$/.test(s.whiteSpace);
    let breaks = 0, ws = 0;
    // The whitespace characters since the last shown character (at most 64), to tell whether a space shows between two.
    let spaces = [];
    const all = [];
    const hidden = [];
    let unlaid = '';
    // The line marks in text hidden from sight where a clip stands whose place the read cannot tell (ShownText.unplaced).
    let unplaced = '';
    let hidFirst = false;
    let goneFirst = false;
    const linkIndex = new Map();
    const hrefs = [];
    const range = document.createRange();
    // A drop cap: the first letter of a block (with any punctuation before it) that the block, or one it begins, styles
    // with a floated ::first-letter or an initial letter. A visitor reads it as part of its word, however far it stands.
    const capSeen = new Set();
    let capOpen = null;
    const capOf = (p, c) => {
      const block = P.blockOf(p);
      if (capOpen) {
        if (capOpen === block) { if (P.letter(c)) capOpen = null; return true; }
        capOpen = null;
      }
      let cap = false;
      for (let e = block; e && !capSeen.has(e); e = e.parentElement ? P.blockOf(e.parentElement) : null) {
        capSeen.add(e);
        const f = getComputedStyle(e, '::first-letter');
        if ((f.float && f.float !== 'none') || (f.initialLetter && f.initialLetter !== 'normal')) cap = true;
      }
      if (cap && !P.letter(c)) capOpen = block;
      return cap;
    };
    // Text hidden from sight stands here (unseen), or text that is not laid out (gone): after the last shown character,
    // or before the first.
    const unseen = () => {
      if (all.length) all[all.length - 1].hid = true;
      else hidFirst = true;
    };
    const gone = () => {
      if (all.length) all[all.length - 1].gone = true;
      else goneFirst = true;
    };
    const visit = (t) => {
      const p = t.parentElement;
      const pre = preserves(style(p));
      const init = marks.get(t);
      const ms = init && init.data === t.data ? init.at : [];
      let rec = measured.get(t);
      if (rec && rec.data !== t.data) rec = undefined;
      range.selectNodeContents(t);
      const laid = range.getClientRects().length > 0 && P.textRendered(p);
      const faded = P.faded(p);
      if (!rec && laid && !faded) { rec = P.measure(t); rec.when = samples + 1; rec.at0 = null; }
      if (!laid && /[^ \\t\\n\\f\\r]/.test(t.data)) gone();
      // The node at the read's last instant: where its measurement was taken, if it still stands there; measured again
      // if it moved since (an endless pulse, a tween that settled later, a slide moved on); none if it is not shown now.
      let fin = null;
      const last = rec && laid && !faded ? { t, at: P.where(t), idx: [] } : null;
      if (last) fin = rec.at0 === null || last.at === rec.at0 ? rec : P.measure(t);
      const finByIndex = new Map(fin ? fin.chars.map((c) => [c.i, c]) : []);
      const a = P.linkOf(p);
      let link = -1;
      if (a) { link = linkIndex.get(a); if (link === undefined) { link = hrefs.length; linkIndex.set(a, link); hrefs.push(a.getAttribute('href')); } }
      const byIndex = new Map(rec ? rec.chars.map((c) => [c.i, c]) : []);
      let run = null;
      const flush = () => { if (run) { hidden.push([run.replace(/[ \\t\\n\\f\\r]+/g, ' ').trim(), link >= 0 ? hrefs[link] : null]); run = null; } };
      const data = t.data;
      let m = 0;
      for (let i = 0; i < data.length; ) {
        const w = data.codePointAt(i) > 0xffff ? 2 : 1;
        const c = data.slice(i, i + w);
        let starts = '';
        while (m < ms.length && ms[m][0] <= i && ms[m][2]) starts += ms[m++][1];
        if (SPACE.test(c)) {
          ws++;
          if (spaces.length < 64) spaces.push([t, i]);
          if (pre && c === '\\n') breaks++;
          if (run !== null) run += c;
          if (starts) { if (!laid) unlaid += starts; else run = (run || '') + starts; }
        } else {
          const ch = byIndex.get(i);
          let ends = '';
          while (m < ms.length && ms[m][0] <= i + w && !ms[m][2]) ends += ms[m++][1];
          if (!laid) unlaid += starts + ends;
          else if (seenAt(ch)) {
            flush();
            const f = finByIndex.get(i);
            const now = seenAt(f) ? f : null;
            all.push({ c, starts, ends, box: ch.box, vis: ch.vis, fr: ch.fr, fs: ch.fs, lh: ch.lh, el: p, d: ch.d, bd: ch.bd, id: ch.id, spaces, breaks, ws, link, marquee: rec.marquee, when: rec.when, unseen: rec.unseen === undefined ? Infinity : rec.unseen, left: rec.left === undefined ? Infinity : rec.left, rect: rec.rect, hid: false, cap: capOf(p, c), fin: now ? { box: now.box, vis: now.vis, fr: now.fr } : null, alt: null });
            if (now) last.idx.push([i, all.length - 1]);
            spaces = [];
          } else {
            run = (run || '') + starts + c + ends;
            if (ch && ch.up) unplaced += starts + ends;
            unseen();
          }
        }
        i += w;
      }
      while (m < ms.length) { const x = ms[m++][1]; if (!laid) unlaid += x; else run = (run || '') + x; }
      flush();
      if (last && last.idx.length) lastNodes.push(last);
    };
    // The tree in document order, with an explicit stack (a page may nest elements thousands deep). Counted on the
    // way: the edges of every box that is not part of a line's own flow of text (a block, a flex or grid item, a table
    // cell, a floated or positioned box, and an inline block, a button, an image or a control, laid out as one piece)
    // and forced breaks (breaks); and whitespace (ws).
    // The text a stylesheet adds on an element that shows none of the page's own (see ShownText.generated): the
    // strings of its ::before's and ::after's content, where a style lets them show.
    const generated = [];
    const added = (e) => {
      if (e instanceof SVGElement || e instanceof MathMLElement || P.faded(e)) return;
      let t = '';
      for (const which of ['::before', '::after']) {
        const v = getComputedStyle(e, which).content;
        if (v && v !== 'none' && v !== 'normal') for (const m of v.matchAll(/"((?:[^"\\\\]|\\\\.)*)"/g)) t += m[1].replace(/\\\\(.)/g, '$1');
      }
      t = t.replace(/[ \\t\\n\\f\\r]+/g, ' ').trim();
      if (t) generated.push(t);
    };
    const todo = [{ child: body.firstChild, box: false, el: null, n0: 0 }];
    while (todo.length) {
      const top = todo[todo.length - 1];
      const c = top.child;
      if (!c) {
        todo.pop();
        if (top.box) breaks++;
        if (top.el && all.length === top.n0) added(top.el);
        continue;
      }
      top.child = c.nextSibling;
      if (c.nodeType === 3) { visit(c); continue; }
      if (c.nodeType !== 1) continue;
      const name = c.tagName.toUpperCase();
      // Text not shown as text (a script, a style, a textarea's value, an svg or math title, a template, a noscript), or
      // in an element not laid out: only its line marks are noted, and, for text an element not laid out holds, that
      // text a visitor does not see stands here.
      const skip = SKIP.has(name);
      if (skip && name === 'TEXTAREA' && c.getClientRects().length) breaks += 2;
      const d = skip ? 'none' : style(c).display;
      if (d === 'none') {
        const inner = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
        let text = false;
        for (let t = inner.nextNode(); t; t = inner.nextNode()) {
          const m = marks.get(t);
          if (m && m.data === t.data) for (const x of m.at) unlaid += x[1];
          if (!skip && !P.skipped(t.parentElement) && /[^ \\t\\n\\f\\r]/.test(t.data)) text = true;
        }
        if (text) gone();
        continue;
      }
      if (d === 'contents') { todo.push({ child: c.firstChild, box: false, el: c, n0: all.length }); continue; }
      const boxed = c.getClientRects().length > 0;
      if (name === 'BR') { if (boxed) breaks++; continue; }
      const box = boxed && (!INLINE_FLOW.has(d) || REPLACED.has(name));
      if (box) breaks++;
      todo.push({ child: c.firstChild, box, el: c, n0: all.length });
    }
    // Between two neighbouring shown characters (see ShownText). sepRow: the line break returned stands between two
    // characters on one row (a box's edge parts them there), not between rows. sepMark: the two are read as glued only
    // because the read cannot measure how they sit, and why: TURNED (turned text it cannot measure, see unaligned) or
    // OFFSET (offset across their line, see geom); else ''.
    const TURNED_MARK = ${JSON.stringify(TURNED)}, OFFSET_MARK = ${JSON.stringify(OFFSET)};
    let sepRow = false, sepMark = '';
    // Two nodes' boxes in one place: each overlaps the other by more than half of the smaller one's width and height.
    const onePlace = (p, q) => p !== q && !!p && !!q && Math.min(p.r, q.r) - Math.max(p.l, q.l) > 0.5 * Math.min(p.r - p.l, q.r - q.l) && Math.min(p.b, q.b) - Math.max(p.t, q.t) > 0.5 * Math.min(p.b - p.t, q.b - q.t);
    // The other points of an endless animation's cycle. Each sample holds every endless animation at one of CYCLE points
    // of its cycle, the last sample at base; here each is held at every other point in turn, and each node shown at the
    // read's last instant that such an animation can move (one inside an element it animates, or every node where one
    // animates a property that moves other boxes, as a width) is measured again there if it stands elsewhere, so two
    // neighbours shown at the last instant are judged at every point of the cycle (sep). A motion a script draws itself
    // (a GSAP timeline that repeats) is not such an animation: it is judged at the read's last instant only.
    const OWN_PAINT = /^(transform|translate|rotate|scale|opacity|filter|backdropFilter|clipPath|color|backgroundColor|backgroundPosition|backgroundSize|backgroundImage|boxShadow|textShadow|outlineColor|borderColor|border(Top|Right|Bottom|Left)Color|fill|fillOpacity|stroke|strokeOpacity|strokeDashoffset|visibility|top|left|right|bottom|zIndex)$/;
    const KEYFRAME_KEYS = new Set(['offset', 'computedOffset', 'easing', 'composite']);
    let points = 0;
    {
      const base = (samples - 1 + CYCLE) % CYCLE;
      const endless = [];
      for (const an of document.getAnimations()) {
        let timing = null;
        try { timing = an.effect && an.effect.getComputedTiming(); } catch {}
        if (timing && timing.iterations === Infinity && typeof timing.duration === 'number' && timing.duration > 0) endless.push([an, timing]);
      }
      let everything = false;
      const targets = [];
      for (const [an] of endless) {
        const ef = an.effect;
        if (ef && ef.target) targets.push(ef.target);
        else everything = true;
        let keys = [];
        try { keys = ef.getKeyframes().flatMap((kf) => Object.keys(kf)); } catch { everything = true; }
        if (keys.some((k) => !KEYFRAME_KEYS.has(k) && !OWN_PAINT.test(k))) everything = true;
      }
      const moved = endless.length ? lastNodes.filter((f) => everything || targets.some((tg) => tg.contains(f.t))) : [];
      if (moved.length) {
        points = CYCLE - 1;
        const hold = (k) => {
          for (const [an, timing] of endless) {
            try { an.currentTime = (timing.delay || 0) + timing.duration * (((base + k) % CYCLE) / CYCLE); } catch {}
          }
        };
        for (let k = 1; k < CYCLE; k++) {
          hold(k);
          const Q = pass();
          for (const f of moved) {
            const p = f.t.parentElement;
            const shown = !!p && Q.textRendered(p) && !Q.faded(p);
            const m = shown && Q.where(f.t) !== f.at ? Q.measure(f.t) : null;
            const byI = m ? new Map(m.chars.map((c) => [c.i, c])) : null;
            for (const [i, x] of f.idx) {
              const rec = all[x];
              if (!rec.alt) rec.alt = new Array(CYCLE - 1).fill(rec.fin);
              if (!shown) rec.alt[k - 1] = null;
              else if (byI) {
                const c = byI.get(i);
                rec.alt[k - 1] = seenAt(c) ? { box: c.box, vis: c.vis, fr: c.fr } : null;
              }
            }
          }
        }
        hold(0);
      }
    }
    // Two frames' common axes: u along the line both run along (the mean of theirs), n across it, on the side their
    // blocks run to; null where either is not read, or they run more than 10 degrees apart (text turned against the text
    // beside it) or are mirrored against each other.
    const COS10 = Math.cos(Math.PI / 18);
    const axesOf = (fa, fb) => {
      if (!fa || !fb || !fa.ok || !fb.ok) return null;
      if (fa.uh[0] * fb.uh[0] + fa.uh[1] * fb.uh[1] < COS10 || fa.vh[0] * fb.vh[0] + fa.vh[1] * fb.vh[1] < COS10) return null;
      const ux = fa.uh[0] + fb.uh[0], uy = fa.uh[1] + fb.uh[1], nu = Math.hypot(ux, uy);
      const u = [ux / nu, uy / nu];
      return { u, n: u[0] * fa.vh[1] - u[1] * fa.vh[0] >= 0 ? [-u[1], u[0]] : [u[1], -u[0]] };
    };
    // A character's box, and the part of it a visitor sees, along the axes ax: from its bounding box on the screen and
    // the frame it was measured in; null where its corners cannot be told.
    const kbox = (R, ax) => {
      const box = R.fr ? P.lineBox(R.box, R.fr, ax.u, ax.n) : null;
      if (!box) return null;
      const v = R.vis;
      if (!v || (v.l <= R.box.l + 0.01 && v.r >= R.box.r - 0.01 && v.t <= R.box.t + 0.01 && v.b >= R.box.b - 0.01)) return { box, vis: box };
      const c = P.along([[v.l, v.t], [v.r, v.t], [v.r, v.b], [v.l, v.b]], ax.u, ax.n);
      return { box, vis: { l: Math.max(box.l, c.l), r: Math.min(box.r, c.r), t: Math.max(box.t, c.t), b: Math.min(box.b, c.b) } };
    };
    // The extent on its row of the text of the box character k stands in, walking from it by step (-1 back, 1 on) to the
    // box's edge, with each character's boxes at the instant the pair is judged at (pick: null where it is not shown
    // then), along the axes ax (null: the screen's own), at most 400 of them.
    const PIECE = 400;
    const pieceOf = (k, step, pick, ax) => {
      const e = all[k];
      const at = (x) => {
        const R = pick(x, k);
        if (!R) return null;
        if (!ax) return R.vis || R.box;
        const c = kbox(R, ax);
        return c ? c.vis : null;
      };
      const q0 = at(k);
      if (!q0) return null;
      let l = q0.l, r = q0.r;
      for (let x = k + step, n = 0; x >= 0 && x < all.length && n < PIECE; x += step, n++) {
        const y = all[x];
        if (y.breaks !== e.breaks) break;
        const q = at(x);
        if (!q || Math.min(q.b, q0.b) - Math.max(q.t, q0.t) < 0.5 * Math.min(q.b - q.t, q0.b - q0.t)) break;
        l = Math.min(l, q.l);
        r = Math.max(r, q.r);
      }
      return { l, r };
    };
    // Whether whitespace between characters i and j is laid out wider than tol (a space a visitor sees), as it stands
    // now: across the page, or along the axes ax.
    const wsRange = document.createRange();
    const spaceShows = (i, j, tol, ax) => {
      for (let x = i + 1; x <= j; x++) {
        for (const [t, k] of all[x].spaces) {
          if (k >= t.data.length) continue;
          wsRange.setStart(t, k);
          wsRange.setEnd(t, k + 1);
          const fr = ax && t.parentElement ? P.textFrame(t.parentElement) : null;
          for (const r of wsRange.getClientRects()) {
            if (!ax) {
              if (r.width > tol) return true;
              continue;
            }
            const c = fr ? P.lineBox({ l: r.left, t: r.top, r: r.right, b: r.bottom }, fr, ax.u, ax.n) : null;
            if (c && c.r - c.l > tol) return true;
          }
        }
      }
      return false;
    };
    // The distance between two convex shapes on the screen (lists of corners): 0 where they meet.
    const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
    const within = (pt, poly) => {
      let sign = 0;
      for (let k = 0; k < poly.length; k++) {
        const c = cross(poly[k], poly[(k + 1) % poly.length], pt);
        if (Math.abs(c) < 1e-9) continue;
        if (!sign) sign = Math.sign(c);
        else if (Math.sign(c) !== sign) return false;
      }
      return true;
    };
    const toSegment = (pt, s0, s1) => {
      const dx = s1[0] - s0[0], dy = s1[1] - s0[1], L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((pt[0] - s0[0]) * dx + (pt[1] - s0[1]) * dy) / L)) : 0;
      return Math.hypot(s0[0] + t * dx - pt[0], s0[1] + t * dy - pt[1]);
    };
    const meets = (p0, p1, q0, q1) => cross(p0, p1, q0) * cross(p0, p1, q1) < 0 && cross(q0, q1, p0) * cross(q0, q1, p1) < 0;
    const distance = (P1, P2) => {
      if (P1.some((pt) => within(pt, P2)) || P2.some((pt) => within(pt, P1))) return 0;
      let d = Infinity;
      for (let k = 0; k < P1.length; k++) {
        const p0 = P1[k], p1 = P1[(k + 1) % P1.length];
        for (let x = 0; x < P2.length; x++) if (meets(p0, p1, P2[x], P2[(x + 1) % P2.length])) return 0;
        for (const pt of P2) d = Math.min(d, toSegment(pt, p0, p1));
      }
      for (let x = 0; x < P2.length; x++) for (const pt of P1) d = Math.min(d, toSegment(pt, P2[x], P2[(x + 1) % P2.length]));
      return d;
    };
    // Two characters the read cannot set on one line (their frames run more than 10 degrees apart, as a word turned a
    // quarter turn beside straight text, or a frame it cannot solve): apart where their shapes on the screen stand
    // further apart than the tolerance (their corners where those can be told, else their bounding boxes, which hold
    // them), glued where they meet. Where only the bounding boxes are known and those meet, how the two sit cannot be
    // told: a box's edge between them is never read as parting them (glued, marked so: sepMark TURNED), and in one flow of
    // text they are as the text runs them.
    const unaligned = (A, B, structural, flow, tol) => {
      const qa = A.fr ? P.quadOf(A.box, A.fr) : null, qb = B.fr ? P.quadOf(B.box, B.fr) : null;
      if (qa && qb) return distance(qa, qb) > tol ? (structural ? '\\n' : ' ') : '';
      const va = A.vis || A.box, vb = B.vis || B.box;
      if (Math.max(vb.l - va.r, va.l - vb.r, vb.t - va.b, va.t - vb.b) > tol) return structural ? '\\n' : ' ';
      if (structural) {
        sepMark = TURNED_MARK;
        return '';
      }
      return flow ? ' ' : '';
    };
    // Whether either of two elements stands in a box positioned out of the flow (absolutely or fixed) that the other is
    // not in: below the nearest element holding both.
    const outOfFlow = (x, top) => {
      for (let e = x; e && e !== top; e = e.parentElement) if (/^(absolute|fixed)$/.test(style(e).position)) return true;
      return false;
    };
    const positionedApart = (x, y) => {
      if (!x || !y || x === y) return false;
      let top = x;
      while (top && !top.contains(y)) top = top.parentElement;
      return outOfFlow(x, top) || outOfFlow(y, top);
    };
    // A character's line height across its line, on the screen: its element's line height, scaled as its frame R scales
    // its block direction, or, where that is normal, its glyph's own extent across the line (K: its box as judged).
    const lineHeight = (x, R, K) => (isFinite(x.lh) && R.fr && R.fr.ok ? x.lh * Math.hypot(R.fr.v[0], R.fr.v[1]) : K.box.b - K.box.t);
    // How characters i and j sit, from their boxes A and B ({ box, vis, fr }, at one instant), pick giving the other
    // characters' boxes at that instant (see pieceOf). Text whose frame is not plain (vertical text, or text a transform
    // turns) is judged along the line both run along (axesOf): a row is an overlap across it, a gap a distance along it,
    // so flex items set top to bottom, or turned a quarter turn, with no gap show glued (round 12 judged every pair across
    // the page, so two such items never stood on one row and were read apart). Where the two do not run along one line,
    // or a frame cannot be solved, see unaligned.
    const geom = (i, j, A, B, pick) => {
      const a = all[i], b = all[j];
      const structural = b.breaks > a.breaks;
      const flow = b.ws > a.ws;
      const tol = Math.max(0.5, 0.1 * Math.min(a.fs, b.fs));
      const RA = A, RB = B;
      let ax = null;
      if (!(A.fr && A.fr.plain && B.fr && B.fr.plain)) {
        ax = axesOf(A.fr, B.fr);
        const ka = ax && kbox(A, ax), kb = ax && kbox(B, ax);
        if (!ka || !kb) return unaligned(A, B, structural, flow, tol);
        A = ka;
        B = kb;
        // Two pieces of turned or vertical text across a box's edge, more than four times the font size apart along their
        // line, the second after the first (in its direction), are not one line a visitor reads: apart across boxes. The
        // second before the first is so only where either stands in a box positioned out of the flow (absolutely or fixed)
        // that the other is not in (two side labels turned a quarter turn in one column, sections apart); in one row of one
        // box (a flex row reversed, or an item ordered first) it is judged as on a row below, in the other order where a
        // visitor reads it so (round 13 read every such pair apart, so it stored "Fresh rye" in a vertical row a visitor
        // reads "rye … Fresh").
        if (structural) {
          const far = 4 * Math.max(a.fs, b.fs);
          const back = a.d === 'R' && b.d === 'R';
          if ((back ? A.box.l - B.box.r : B.box.l - A.box.r) > far) return '\\n';
          if ((back ? B.box.l - A.box.r : A.box.l - B.box.r) > far && positionedApart(a.el, b.el)) return '\\n';
        }
      }
      const across = Math.min(A.box.b, B.box.b) - Math.max(A.box.t, B.box.t);
      const row = across >= 0.5 * Math.min(A.box.b - A.box.t, B.box.b - B.box.t);
      // Across a box's edge, offset across the line on one row (an item raised or lowered beside the next: a margin,
      // padding or a relative offset beside align-items: flex-start): not a row by the half overlap, but their boxes
      // overlap across the line, and the text of each one's box on its row stands beside the other's along the line, not
      // over it (blocks one under the next, a line pulled up over the one before by a negative margin, overlap along it).
      // Rows of their own never overlap where their lines are set at their normal height; where a line height is set
      // smaller than the letters (lines set solid, whose letters' boxes overlap the next row's, as flex items wrapped onto
      // the next row), the two must also stand nearer than half their line heights together, which two rows of their own
      // never do (each row is at least its line height tall). Round 12 and 13 read such a pair as on rows of their own,
      // apart across boxes however near they stood, and never in the other order.
      let near = false;
      if (!row && structural && across > 0.5) {
        const solid = isFinite(a.lh) || isFinite(b.lh);
        if (!solid || Math.abs(A.box.t + A.box.b - B.box.t - B.box.b) / 2 < (lineHeight(a, RA, A) + lineHeight(b, RB, B)) / 2 - tol) {
          const pa = pieceOf(i, -1, pick, ax), pb = pieceOf(j, 1, pick, ax);
          near = !!pa && !!pb && Math.min(pa.r, pb.r) - Math.max(pa.l, pb.l) <= tol;
        }
      }
      if (row || near) {
        const ca = (A.box.l + A.box.r) / 2, cb = (B.box.l + B.box.r) / 2;
        const va = A.vis || A.box, vb = B.vis || B.box;
        // Two characters of one direction stand in its order, else a visitor reads them in the other order: except two
        // apart, in a paragraph or box of the other direction, which a visitor reads in that direction's order (left-to-
        // right runs a right-to-left paragraph parts, such as a phone number's groups, or left-to-right boxes in a
        // right-to-left flex row, read right to left; and the other way round).
        const apart = Math.max(vb.l - va.r, va.l - vb.r);
        let gap;
        if (a.d === 'L' && b.d === 'L') {
          if (cb < ca - tol && !(a.bd === 'R' && b.bd === 'R' && apart > tol)) return ${JSON.stringify(REVERSED)};
          gap = cb < ca - tol ? apart : vb.l - va.r;
        } else if (a.d === 'R' && b.d === 'R') {
          if (cb > ca + tol && !(a.bd === 'L' && b.bd === 'L' && apart > tol)) return ${JSON.stringify(REVERSED)};
          gap = cb > ca + tol ? apart : va.l - vb.r;
        } else gap = apart;
        // Where right-to-left text is involved (either character, or the direction either is laid out in: a number or a
        // Latin name in a right-to-left paragraph, a Hebrew word in a left-to-right one), the two characters side by side
        // in the text can stand at the far ends of runs the bidi algorithm reorders. In one flow of text a visitor then
        // sees a space exactly where whitespace between the two is laid out wider than the tolerance, wherever the runs'
        // order puts it, and the runs meet glued where none is; across a box's edge (left-to-right boxes in a
        // right-to-left row), the boxes' text is measured where the boxes meet.
        if (!structural && (a.d === 'R' || b.d === 'R' || a.id === 'R' || b.id === 'R')) gap = flow && spaceShows(i, j, tol, ax) ? Infinity : 0;
        else if (structural && (a.d !== b.d || a.d !== a.id || b.d !== b.id)) {
          const pa = pieceOf(i, -1, pick, ax), pb = pieceOf(j, 1, pick, ax);
          if (pa && pb) gap = Math.max(pb.l - pa.r, pa.l - pb.r);
        }
        if (gap <= tol) {
          // Offset across the line and meeting along it: whether a visitor sees the two apart cannot be told, so a box's
          // edge between them is never read as parting them (glued, marked so: OFFSET).
          if (near) sepMark = OFFSET_MARK;
          return '';
        }
        sepRow = structural;
        return structural ? '\\n' : ' ';
      }
      if (structural) return '\\n';
      return flow ? ' ' : '';
    };
    const sep = (i, j) => {
      const a = all[i], b = all[j];
      sepRow = false;
      sepMark = '';
      const structural = b.breaks > a.breaks;
      const flow = b.ws > a.ws;
      if (a.cap && !b.cap && !structural && !flow) return '';
      // Both shown at the read's last instant: judged there, one instant for both, so an item that keeps moving (an
      // endless pulse, a tween that settled at a later sample) is judged beside its neighbour where both stand.
      const now = !!(a.fin && b.fin);
      // Else where they were measured: if both were shown there at one sample; or, never shown together, if both stood
      // there side by side at one sample, laid out, one of them hidden by a style (a word a script reveals after its
      // neighbour and hides again before the read comes back to it, which a visitor who lingers sees beside it). Else
      // they were never side by side: seen at different moments where they did not stand together (a carousel's track
      // moved on), or in one place (slides stacked and shown in turn), where they stood says nothing of how they sit,
      // so a box's edge between them is apart across boxes, and in one flow of text they are as the text runs them.
      const from = Math.max(a.when, b.when);
      const together = from < Math.min(a.unseen, b.unseen);
      const beside = from < Math.min(a.left, b.left) && !onePlace(a.rect, b.rect);
      if (!now && !together && !beside) return structural ? '\\n' : flow ? ' ' : '';
      if (a.marquee && a.marquee === b.marquee) return structural ? '\\n' : flow ? ' ' : '';
      if (!now) return geom(i, j, a, b, (x, k0) => (all[x].when === all[k0].when ? all[x] : null));
      const s = geom(i, j, a.fin, b.fin, (x) => all[x].fin);
      // At the other points of an endless animation's cycle, where both are shown: glued at any of them, they are glued
      // (round 12 judged a link nudged apart only at the start of its cycle there, and stored a typed space its edge drops
      // for the rest of it).
      if (s === '' || !points || (!a.alt && !b.alt)) return s;
      const row = sepRow, mark = sepMark;
      for (let p = 0; p < points; p++) {
        const A = a.alt ? a.alt[p] : a.fin, B = b.alt ? b.alt[p] : b.fin;
        if (!A || !B || (A === a.fin && B === b.fin)) continue;
        sepRow = false;
        sepMark = '';
        if (geom(i, j, A, B, (x) => (all[x].alt ? all[x].alt[p] : all[x].fin)) === '') return '';
      }
      sepRow = row;
      sepMark = mark;
      return s;
    };
    // The separator before each character, whether it is a line break on one row, and whether glued is unmeasured (its
    // mark).
    const seps = [''], onRow = [false], markAt = [''];
    for (let k = 1; k < all.length; k++) { seps.push(sep(k - 1, k)); onRow.push(sepRow); markAt.push(sepMark); }
    // A character with no glyph (a no-break or other space that is not HTML whitespace, a zero-width or format
    // character) shows nothing of its own: where the visible characters on either side of a run of them stand glued, a
    // visitor sees them glued, whatever the run's own boxes say.
    const GLYPHLESS = /^[\\p{Zs}\\p{Cf}]$/u;
    for (let k = 1; k < all.length; ) {
      if (!GLYPHLESS.test(all[k].c)) { k++; continue; }
      let j = k;
      while (j < all.length && GLYPHLESS.test(all[j].c)) j++;
      if (j < all.length && sep(k - 1, j) === '') for (let x = k; x <= j; x++) { seps[x] = ''; onRow[x] = false; markAt[x] = sepMark; }
      k = j;
    }
    const HID = ${JSON.stringify(HIDDEN_HERE)};
    const GONE = ${JSON.stringify(GONE_HERE)};
    let text = (hidFirst ? HID : '') + (goneFirst ? GONE : '');
    let linked = text;
    let open = -1;
    const rowBreaks = [];
    for (let k = 0; k < all.length; k++) {
      const x = all[k];
      const s = seps[k];
      if (x.link !== open && open >= 0) { linked += ${JSON.stringify(LINK_CLOSE)}; open = -1; }
      if (onRow[k] && s) rowBreaks.push(text.length);
      const between = s || markAt[k];
      text += between;
      linked += between;
      if (x.link !== open) {
        linked += ${JSON.stringify(LINK_OPEN)} + String(x.link).replace(/[0-9]/g, (d) => String.fromCharCode(${LINK_DIGIT_0} + Number(d))) + ${JSON.stringify(LINK_INDEX_END)};
        open = x.link;
      }
      const after = (x.hid ? HID : '') + (x.gone ? GONE : '');
      text += x.starts + x.c + x.ends + after;
      linked += x.starts + x.c + x.ends + after;
    }
    if (open >= 0) linked += ${JSON.stringify(LINK_CLOSE)};
    return { title: pageTitle, text, linked, hrefs, hidden, unlaid, unplaced, generated, rowBreaks };
  };
  Object.defineProperty(window, ${JSON.stringify(READ_KEY)}, { value: { loadAll, scroll, sample, final }, configurable: true });
  return true;
})()`;

/** Playwright's Chromium on this computer, for the Windows fix; undefined when Playwright cannot say. */
function executableOf(chromium: { executablePath(): string } | undefined): { executable?: string } {
  try {
    const executable = chromium?.executablePath();
    return executable ? { executable } : {};
  } catch {
    return {};
  }
}

/**
 * The renderer's Chromium, launched once per call as chromiumLaunchOptions() says, under the person's OS sandbox setting
 * (ADR-0105). It takes nothing else, so nothing can add a flag to the production launch; a test that needs one composes
 * it from chromiumLaunchOptions() in test code. A failure to start is launchFailure's plain message.
 */
export async function launchChromium(setting: LaunchSetting): Promise<Browser> {
  let chromium: typeof import('playwright').chromium | undefined;
  try {
    ({ chromium } = await import('playwright'));
    return await chromium.launch(chromiumLaunchOptions(setting));
  } catch (e) {
    throw launchFailure(e, { osSandbox: setting.osSandbox, ...executableOf(chromium) });
  }
}

/**
 * The readiness check's failure: a launch that failed and a check past its deadline pass as they are (their own plain
 * messages); a test page that could not be drawn says so. With the sandbox on, a failure Chromium tied to the sandbox is
 * the sandbox's message, and any other names the sandbox as one possible cause (ADR-0105).
 */
function readyFailure(err: unknown, osSandbox: boolean, host: SandboxHost | undefined): unknown {
  if (err instanceof StepError) return err;
  if (err instanceof RendererClosed) return new StepError(`byway's test page could not be drawn: ${err.message}.`, { cause: err });
  const advice = () => sandboxAdvice(host ?? sandboxHost(), { error: err });
  if (osSandbox && isSandboxFailure(err)) return new StepError(sandboxFailureMessage(advice()), { cause: err });
  const said = playwrightSaid(firstLine(err)) || 'no reason given';
  if (osSandbox) return new StepError(possibleSandboxCause(said, advice()), { cause: err });
  return new StepError(`The page renderer started but could not draw byway's test page (${said}).`, { cause: err });
}

/** What the start-up check found (RendererCheckRecord without its time, which the store adds). */
export type RendererCheck = Omit<RendererCheckRecord, 'at'>;

export interface RendererCheckOptions {
  /** For tests only: how to launch (PlaywrightPagesOptions.launch). Production passes none, so it is launchChromium(). */
  launch?: (setting: LaunchSetting) => Promise<Browser>;
  /** For tests only: the computer, for the reason given. */
  host?: SandboxHost;
}

/**
 * Whether the renderer can draw a page on this computer under the person's OS sandbox setting, for the "renderer" line
 * byway prints at start-up and for Settings (ADR-0105). It draws byway's own test page, with a script, in a renderer of
 * its own, which it closes again, and never throws: byway keeps running either way, since prose, options and code-diff
 * runs need no renderer unless a lineup forms cards.
 *
 * With the sandbox on and failing for a reason Chromium did not tie to the sandbox, it draws the test page once more
 * without the sandbox: if that works, the sandbox is the cause. With the sandbox off, it draws the test page once more
 * with the sandbox, to say whether the sandbox could start now; Settings then offers to turn it back on. Neither changes
 * the setting, and neither draws anything but byway's own test page.
 */
export async function checkRenderer(setting: LaunchSetting, opts: RendererCheckOptions = {}): Promise<RendererCheck> {
  const host = opts.host ?? sandboxHost();
  /** The test page drawn under `osSandbox`: undefined when it was, else why not. */
  const attempt = async (osSandbox: boolean): Promise<{ error: unknown } | undefined> => {
    const pages = playwrightPages({ osSandbox: () => osSandbox, host, ...(opts.launch ? { launch: opts.launch } : {}) });
    try {
      await pages.ready();
      return undefined;
    } catch (error) {
      return { error };
    } finally {
      await pages.close().catch(() => undefined);
    }
  };
  const plain = (osSandbox: boolean, error: unknown) => (error instanceof StepError ? error : launchFailure(error, { osSandbox, host })).message;
  const sandboxFails = async (error: unknown) => {
    let executable: { executable?: string } = {};
    try {
      executable = executableOf((await import('playwright')).chromium);
    } catch {
      // Playwright itself could not be loaded: the advice names no file.
    }
    const advice = sandboxAdvice(host, { ...executable, error });
    return { sandbox: 'fails' as const, message: sandboxFailureMessage(advice), why: advice.why, fix: advice.fix };
  };

  const first = await attempt(setting.osSandbox);
  if (setting.osSandbox) {
    if (!first) return { osSandbox: true, ready: true, sandbox: 'starts' };
    if (!isSandboxFailure(first.error)) {
      // Whether the sandbox is the cause: the same test page without it.
      const without = await attempt(false);
      if (without) return { osSandbox: true, ready: false, sandbox: 'unknown', message: plain(true, first.error) };
    }
    return { osSandbox: true, ready: false, ...(await sandboxFails(first.error)) };
  }
  if (first) return { osSandbox: false, ready: false, sandbox: 'unknown', message: plain(false, first.error) };
  // Whether the sandbox could start now. Chromium starts without it here, so a failure with it is the sandbox's.
  const probe = await attempt(true);
  return probe ? { osSandbox: false, ready: true, ...(await sandboxFails(probe.error)) } : { osSandbox: false, ready: true, sandbox: 'starts' };
}

/**
 * The start-up check's answer, waited for at most `ms` counted from this call, not from when the check began. byway
 * starts the check while it builds the app and starts the engine; on a busy machine Chromium's launch waits for them
 * (on GitHub's 2-CPU Windows machine it ran past a limit counted from its start, and byway said Chromium could not
 * start although it could), so byway calls this once the app is built (`built`; contributor mode builds nothing first)
 * and the engine is up, just before it prints its `renderer` line, and the message says what the time was counted from.
 * `osSandbox` is the setting the check runs under.
 */
export function rendererCheckWithin(checking: Promise<RendererCheck>, ms: number, { built, osSandbox }: { built: boolean; osSandbox: boolean }): Promise<RendererCheck> {
  const since = built ? 'the app was built and the engine was up' : 'the engine was up';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<RendererCheck>((resolve) => {
    timer = setTimeout(() => resolve({ osSandbox, ready: false, sandbox: 'unknown', message: `Playwright's Chromium had not started ${ms / 1000} s after ${since}.` }), ms);
    timer.unref?.();
  });
  return Promise.race([checking, late]).finally(() => clearTimeout(timer));
}

/**
 * The start-up `renderer` line (scripts/serve.ts) for what the check found: ready or not, the sandbox on or off and,
 * when off, whether it could start now (ADR-0105). scripts/e2e.ts requires "Playwright's Chromium, ready, inside its OS
 * sandbox".
 */
export function rendererLine(check: RendererCheck): string {
  const off = 'with its OS sandbox off (switched off in Settings)';
  if (!check.ready) return check.osSandbox ? `not available: ${check.message}` : `not available, ${off}: ${check.message}`;
  if (check.osSandbox) return "Playwright's Chromium, ready, inside its OS sandbox";
  if (check.sandbox === 'starts') return `Playwright's Chromium, ready, ${off}. The sandbox can start on this computer now: Settings offers to turn it back on.`;
  if (check.sandbox === 'fails') return `Playwright's Chromium, ready, ${off}. The sandbox still cannot start here: ${check.why}`;
  return `Playwright's Chromium, ready, ${off}.`;
}

/**
 * A render's failure as its step sees it. A step failure (the deadline, a Chromium that could not start) and a cancel
 * (its own reason) pass as they are. Anything else is the renderer failing while it drew the page: a Playwright protocol
 * error ("Unable to capture screenshot", seen under load while a page opened dialogs), or a page or browser closed
 * underneath. That reached the step raw, an error the workflow does not know, so Temporal retried it as though it were
 * transient and the run showed Playwright's own words. It is one plain step failure instead, not retried, like the
 * deadline: Playwright's message (its method, the protocol command, its call log) stays on the cause. A browser byway
 * closed itself is named as such ("byway closed the page renderer …", ADR-0106); one closed underneath without that
 * (Playwright's "Target page, context or browser has been closed") went away on its own, as in a crash.
 */
export function drawFailure(err: unknown, signal: AbortSignal | undefined): unknown {
  if (err instanceof StepError) return err;
  if (signal?.aborted) return stopped(signal);
  if (err instanceof RendererClosed) return new StepError(`The page could not be drawn: ${err.message}.`, { cause: err });
  const first = firstLine(err);
  const said = playwrightSaid(first);
  const what = /screenshot/i.test(first) ? 'could not take its screenshot' : 'failed while drawing it';
  return new StepError(`The page could not be drawn: the page renderer ${what}${said ? ` (${said})` : ''}.`, { cause: err });
}

/**
 * A text read's failure as its step sees it (VOICE's arbiter, ADR-0081), as drawFailure is a render's: a step failure
 * (the deadline, a page that navigates away, a Chromium that could not start) and a cancel pass as they are; anything
 * else (a Playwright protocol error, a page or browser closed underneath) is one plain step failure, not retried, with
 * Playwright's message on the cause. A browser byway closed itself is named as such, as drawFailure names it.
 */
export function readFailure(err: unknown, signal: AbortSignal | undefined): unknown {
  if (err instanceof StepError) return err;
  if (signal?.aborted) return stopped(signal);
  if (err instanceof RendererClosed) return new StepError(`The page's text could not be read: ${err.message}.`, { cause: err });
  const said = playwrightSaid(firstLine(err));
  return new StepError(`The page's text could not be read: the page renderer failed while reading it${said ? ` (${said})` : ''}.`, { cause: err });
}

const firstLine = (err: unknown): string => (err instanceof Error ? err.message : String(err)).split(/\r?\n/)[0] ?? '';

/** What Playwright's first line says, without its method or the protocol command. */
const playwrightSaid = (first: string): string =>
  first
    .replace(/^[\w.]+:\s*/, '')
    .replace(/^Protocol error \([^)]*\):\s*/, '')
    .trim()
    .replace(/\.$/, '');

/** The error a cancelled render ends with: the signal's own reason (Temporal's CancelledFailure) when it has one. */
function stopped(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('The render was stopped.');
}
