/**
 * The demo-mode stand-in for a video clip (contracts VideoResult): an animated SVG that says plainly it is a
 * placeholder, so nothing in a demo run can be mistaken for generated video (ADR-0069: nothing is faked). It holds
 * no script; the motion is CSS, and it stops for people who ask for reduced motion.
 */
import { escapeHtml } from './pages.ts';

const MAX_PROMPT = 90;

function shorten(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_PROMPT ? `${flat.slice(0, MAX_PROMPT - 1)}…` : flat;
}

export function placeholderClipSvg(prompt: string, durationSec: number): string {
  const line = escapeHtml(shorten(prompt) || 'A clip');
  const seconds = Number.isFinite(durationSec) ? Math.round(durationSec * 10) / 10 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-label="Placeholder clip, ${seconds} seconds: ${line}">
<style>
.sweep { animation: sweep ${Math.max(1, seconds)}s linear infinite; }
@keyframes sweep { from { transform: translateX(0); } to { transform: translateX(560px); } }
@media (prefers-reduced-motion: reduce) { .sweep { animation: none; } }
</style>
<rect width="640" height="360" fill="#23262a"/>
<rect x="40" y="300" width="560" height="6" rx="3" fill="#4a4f55"/>
<rect class="sweep" x="40" y="296" width="24" height="14" rx="4" fill="#e8e4da"/>
<text x="40" y="92" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" fill="#f4f1ea">Placeholder clip</text>
<text x="40" y="128" font-family="Helvetica, Arial, sans-serif" font-size="17" fill="#c9c4b8">Demo mode: no video model was called.</text>
<text x="40" y="196" font-family="Helvetica, Arial, sans-serif" font-size="17" fill="#f4f1ea">${line}</text>
<text x="40" y="276" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#c9c4b8">${seconds} s</text>
</svg>`;
}
