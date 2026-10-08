/**
 * The demo-mode stand-in for a video clip (contracts VideoResult): an animated SVG that says plainly it is a
 * placeholder, so nothing in a demo run can be mistaken for generated video (ADR-0069: nothing is faked). It holds
 * no script; the motion is CSS, and it stops for people who ask for reduced motion.
 */
import { escapeHtml } from './pages.ts';

/** Characters that fit on one line of the 640-wide frame at the prompt's size. */
const LINE = 56;

/** The prompt in at most two lines, broken between words, with an ellipsis when it runs longer. */
function promptLines(text: string): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return ['A clip'];
  const lines = [''];
  let cut = false;
  for (const whole of words) {
    const word = whole.slice(0, LINE);
    if (word !== whole) cut = true;
    const last = lines.length - 1;
    const next = lines[last] ? `${lines[last]} ${word}` : word;
    if (next.length <= LINE) lines[last] = next;
    else if (lines.length < 2) lines.push(word);
    else {
      cut = true;
      break;
    }
  }
  if (cut) lines[lines.length - 1] = `${(lines.at(-1) ?? '').slice(0, LINE - 1)}…`;
  return lines;
}

export function placeholderClipSvg(prompt: string, durationSec: number): string {
  const lines = promptLines(prompt).map(escapeHtml);
  const line = lines.join(' ');
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
${lines.map((l, i) => `<text x="40" y="${188 + i * 26}" font-family="Helvetica, Arial, sans-serif" font-size="17" fill="#f4f1ea">${l}</text>`).join('\n')}
<text x="40" y="276" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#c9c4b8">${seconds} s</text>
</svg>`;
}
