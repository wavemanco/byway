/**
 * How generated content is let into the app's own screens (SEC-4). A generated page's CSP blocks every network write
 * except one it cannot block: a page with scripts may navigate itself to any address, carrying whatever it holds in
 * the URL. So pages shown inside byway run their scripts only after the person turns them on for that page, for as
 * long as the screen shows it (never a remembered setting), and Markdown shows images only from byway's own artifact
 * routes (an image from elsewhere would be fetched the moment it is shown).
 *
 * The consent is in the response too (F05, ADR-0085): a page's own address is inert, and only a same-origin frame that
 * asks with `?scripts=1` gets its scripts. People open artifacts in the viewer (/view/<id>, openHref), never there.
 */

/**
 * The iframe sandbox for a generated page: never same-origin; scripts only when asked for. The server decides too: the
 * page's own address is inert unless the frame asks with `?scripts=1` (pageFrameUrl), so this is a second layer.
 */
export function frameSandbox(scripts: boolean): string {
  return scripts ? 'allow-scripts' : '';
}

/**
 * Said beside a page's download (F05): byway's sandbox and CSP come with the page only while byway serves it. Opened from
 * a file, a page runs its scripts like any web page.
 */
export const DOWNLOADED_PAGE = 'A downloaded page runs its scripts when you open it from your computer.';

/**
 * Said under a large page preview (a compare, a reference, a step's detail, a finished run). The preview is a picture of
 * the page's first screen, at desktop width, that cannot be scrolled, so a view people decide in says it is not the
 * whole page (F13, ADR-0086's rule for text, kept for pages). The whole page is in the viewer, one Open away (ADR-0085).
 */
export const FIRST_SCREEN_ONLY = 'Only the first screen of the page shows here, at desktop width.';

/** What a large page preview's picture is called for assistive technology (its frame is hidden from it). */
export function firstScreenName(title: string): string {
  return `${title}: the first screen of the page`;
}

const OWN_ARTIFACT = /^\/(?:api\/)?artifacts\/sha256(?::|%3A)[0-9a-f]{64}$/i;

/** True for a same-origin address of one stored artifact (`/artifacts/<id>` or `/api/artifacts/<id>`), nothing else. */
export function isOwnArtifactUrl(src: string | undefined): boolean {
  return typeof src === 'string' && OWN_ARTIFACT.test(src);
}

/** The artifact id in one of byway's own artifact addresses (isOwnArtifactUrl), or undefined for any other address. */
export function artifactIdOf(src: string | undefined): string | undefined {
  if (!isOwnArtifactUrl(src)) return undefined;
  const last = (src as string).split('/').pop() ?? '';
  return decodeURIComponent(last).toLowerCase();
}

/** The host an outside address points at, to say where an image that was not loaded would have come from. */
export function hostOf(src: string | undefined): string | undefined {
  if (!src) return undefined;
  try {
    return new URL(src, 'http://byway.invalid').host.replace(/^byway\.invalid$/, '') || undefined;
  } catch {
    return undefined;
  }
}
