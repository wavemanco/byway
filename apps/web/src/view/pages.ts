/**
 * How generated content is let into the app's own screens (SEC-4). A generated page's CSP blocks every network write
 * except one it cannot block: a page with scripts may navigate itself to any address, carrying whatever it holds in
 * the URL. So pages shown inside byway run their scripts only after the person turns them on for that page, for as
 * long as the screen shows it (never a remembered setting), and Markdown shows images only from byway's own artifact
 * routes (an image from elsewhere would be fetched the moment it is shown).
 */

/** The iframe sandbox for a generated page: never same-origin; scripts only when asked for. */
export function frameSandbox(scripts: boolean): string {
  return scripts ? 'allow-scripts' : '';
}

const OWN_ARTIFACT = /^\/(?:api\/)?artifacts\/sha256(?::|%3A)[0-9a-f]{64}$/i;

/** True for a same-origin address of one stored artifact (`/artifacts/<id>` or `/api/artifacts/<id>`), nothing else. */
export function isOwnArtifactUrl(src: string | undefined): boolean {
  return typeof src === 'string' && OWN_ARTIFACT.test(src);
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
