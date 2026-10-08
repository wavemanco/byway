/**
 * Response headers for the artifact route. Generated pages are untrusted content: they are served with a
 * CSP whose `sandbox allow-scripts` gives them an opaque origin even when opened directly, the iframe that
 * shows them repeats the sandbox, and nothing may send data anywhere (no connect, no forms). Only the CDNs the
 * renderer allows (spec §3.2) may supply fonts, styles and scripts, so a page looks as it did to the critic.
 */
import { exportFileName } from '../view/text.ts';

const ARTIFACT_ID = /^sha256:[0-9a-f]{64}$/;

export function isArtifactId(value: string): boolean {
  return ARTIFACT_ID.test(value);
}

const CDNS = 'https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com';

/**
 * A generated page's own images and clips: the artifact route, and `/api/artifacts/<id>`, the address the runner gives
 * the model for generated images (spec §3.3 `images` slot).
 */
function pageCsp(origin: string): string {
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
    'sandbox allow-scripts',
  ].join('; ');
}

/** Non-page media never run scripts; SVG keeps inline styles. */
const INERT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; sandbox";

export function artifactHeaders(mediaType: string, origin: string, downloadTitle?: string): Record<string, string> {
  const type = mediaType.split(';')[0]?.trim() ?? 'application/octet-stream';
  const textual = type.startsWith('text/') || type === 'application/json' || type === 'image/svg+xml';
  const headers: Record<string, string> = {
    'Content-Type': textual ? `${type}; charset=utf-8` : type,
    'Content-Security-Policy': type === 'text/html' ? pageCsp(origin) : INERT_CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    // Content-addressed: the bytes behind an id never change.
    'Cache-Control': 'private, max-age=31536000, immutable',
  };
  if (downloadTitle !== undefined) headers['Content-Disposition'] = `attachment; filename="${exportFileName(downloadTitle, type)}"`;
  return headers;
}
