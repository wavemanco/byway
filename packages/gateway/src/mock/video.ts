import { escapeHtml } from './extract.ts';
import { mockImage } from './png.ts';
import { rng } from './seed.ts';

/**
 * Demo-mode relay clips (ADR-0069: "the mock provider returns a labelled placeholder clip"). The clip is an animated
 * SVG that says what it is, "Sample clip — shot N", so nobody mistakes it for generated video, and the last frame is a
 * small PNG from the same seed. Static markup only: no scripts, links or event handlers, so it is safe to show inline.
 */

/** The shot a relay prompt is for ("Shot 3: …", as the demo's relay answers write it), if it names one. */
export function shotNumber(prompt: string): number | undefined {
  const m = /\bshot\s+(\d{1,3})\b/i.exec(prompt);
  return m ? Number(m[1]) : undefined;
}

export function placeholderClip(o: { seed: number; shot: number; durationSec: number; prompt: string }): string {
  const rand = rng(o.seed);
  const hue = Math.floor(rand() * 360);
  const from = `hsl(${hue} 45% 30%)`;
  const to = `hsl(${(hue + 40) % 360} 50% 18%)`;
  const caption = escapeHtml(o.prompt.replace(/\s+/g, ' ').trim().slice(0, 90));
  const dur = `${Math.max(1, Math.round(o.durationSec))}s`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720" role="img" aria-label="Sample clip — shot ${o.shot}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
<rect width="1280" height="720" fill="url(#bg)"/>
<circle cx="200" cy="360" r="140" fill="#ffffff" opacity="0.08"><animate attributeName="cx" values="200;1080;200" dur="${dur}" repeatCount="indefinite"/></circle>
<rect x="0" y="690" width="0" height="8" fill="#ffffff" opacity="0.7"><animate attributeName="width" from="0" to="1280" dur="${dur}" repeatCount="indefinite"/></rect>
<text x="640" y="350" text-anchor="middle" font-family="system-ui, sans-serif" font-size="64" font-weight="600" fill="#ffffff">Sample clip — shot ${o.shot}</text>
<text x="640" y="420" text-anchor="middle" font-family="system-ui, sans-serif" font-size="26" fill="#ffffff" opacity="0.8">${caption}</text>
<text x="640" y="470" text-anchor="middle" font-family="system-ui, sans-serif" font-size="22" fill="#ffffff" opacity="0.6">Demo mode: no video was generated</text>
</svg>
`;
}

/** The clip's last frame: a small 16:9 PNG, the anchor the next demo link starts from. */
export function placeholderFrame(seed: number): Uint8Array {
  return mockImage(seed, 96, 54);
}
