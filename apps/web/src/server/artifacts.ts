/**
 * Response headers for the artifact routes. Generated pages are untrusted content, and consent to run their scripts
 * lives in the response, not only in the frame that shows it (F05, ADR-0085):
 *
 * - `/artifacts/<id>` is inert. Its CSP ends in a bare `sandbox`: an opaque origin, no scripts, no forms, no popups and
 *   no automatic features (a meta refresh cannot carry the page away either). Every top-level open of a page (a link,
 *   a typed address, history) gets this answer, so it never depends on request headers and may be cached for good.
 * - `/artifacts/<id>?scripts=1` adds `allow-scripts` only when a same-origin iframe asks for it (Fetch Metadata,
 *   pageScriptsGranted). Only the app's two page frames ask, and only after the person turned scripts on for that page
 *   (ScriptsToggle). That answer is never cached. A browser that sends no Fetch Metadata gets the inert page.
 *
 * The CSP blocks requests either way (no connect, no forms, images only from byway). No CSP stops a page with scripts
 * from navigating itself, which is why scripts are a per-page choice (SEC-4) and why the app's own CSP lets its frames
 * show only byway's addresses (frame-src 'self', next.config.ts). Only the CDNs the renderer allows (spec §3.2) may
 * supply fonts, styles and scripts, so a page looks as it did to the critic.
 */
import { exportFileName } from '../view/text.ts';

const ARTIFACT_ID = /^sha256:[0-9a-f]{64}$/;

export function isArtifactId(value: string): boolean {
  return ARTIFACT_ID.test(value);
}

const CDNS = 'https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com';

/**
 * Whether this request may have a page's scripts (F05): it asked for them (`?scripts=1`, never with a download), and the
 * browser says a same-origin iframe asked. A top-level navigation (dest document), a fetch, another site, a frame that
 * navigated itself (an opaque origin is cross-site) and a browser without Fetch Metadata all get the inert page.
 */
export function pageScriptsGranted(url: URL, headers: Headers): boolean {
  return (
    url.searchParams.get('scripts') === '1' &&
    url.searchParams.get('download') !== '1' &&
    headers.get('sec-fetch-dest') === 'iframe' &&
    headers.get('sec-fetch-site') === 'same-origin'
  );
}

/**
 * A generated page's CSP. Its own images and clips come from the artifact route and `/api/artifacts/<id>`, the address
 * the runner gives the model for generated images (spec §3.3 `images` slot). `scripts` adds `allow-scripts` to the
 * sandbox; without it the sandbox is bare, which also blocks automatic features such as a meta refresh.
 */
function pageCsp(origin: string, scripts: boolean): string {
  const own = `${origin}/artifacts/ ${origin}/api/artifacts/`;
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${CDNS}`,
    `style-src 'unsafe-inline' https://fonts.googleapis.com ${CDNS}`,
    `font-src https://fonts.gstatic.com ${CDNS} data:`,
    `img-src ${own} data: blob:`,
    `media-src ${own} data: blob:`,
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    scripts ? 'sandbox allow-scripts' : 'sandbox',
  ].join('; ');
}

/** Non-page media never run scripts; SVG keeps inline styles. */
const INERT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; sandbox";

/** Raster images, video and audio: what `/api/artifacts/<id>` exists for. */
const PLAIN_MEDIA = /^(image\/(png|jpeg|webp|gif|avif)|video\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+)$/;

/**
 * How `/api/artifacts/<id>` serves a type: media inline; SVG as a download (an <img> still shows it, but opened on its
 * own it never runs as a document); anything else not at all. A page reachable there would be one a generated page
 * could navigate itself to (CSP sandboxing does not follow a navigation), so pages are only ever at /artifacts.
 */
export function mediaServing(mediaType: string): 'inline' | 'attachment' | 'refuse' {
  const type = mediaType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (PLAIN_MEDIA.test(type)) return 'inline';
  return type === 'image/svg+xml' ? 'attachment' : 'refuse';
}

/** Whether a request asked for a page's scripts, and whether pageScriptsGranted gave them. */
export interface ScriptsAsk {
  asked: boolean;
  granted: boolean;
}

export function artifactHeaders(mediaType: string, origin: string, downloadTitle?: string, scripts?: ScriptsAsk): Record<string, string> {
  const type = mediaType.split(';')[0]?.trim() ?? 'application/octet-stream';
  const textual = type.startsWith('text/') || type === 'application/json' || type === 'image/svg+xml';
  const headers: Record<string, string> = {
    'Content-Type': textual ? `${type}; charset=utf-8` : type,
    'Content-Security-Policy': type === 'text/html' ? pageCsp(origin, scripts?.granted === true) : INERT_CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    // Content-addressed: the bytes behind an id never change, and the default answer never depends on the request. An
    // ask for scripts is answered per request (who asked decides), so it is never cached: a cached scriptable copy
    // could otherwise be reused for a request that would not get one.
    'Cache-Control': scripts?.asked ? 'no-store' : 'private, max-age=31536000, immutable',
  };
  if (downloadTitle !== undefined) headers['Content-Disposition'] = `attachment; filename="${exportFileName(downloadTitle, type)}"`;
  return headers;
}
