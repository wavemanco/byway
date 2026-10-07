/** Sample storyboard frames (SVG) and storyboard JSON for demo runs of Ad Video Chain. */
import { escapeHtml } from './pages.ts';

export interface Shot {
  shot: number;
  description: string;
  imagePrompt: string;
  durationSec: number;
}

export function shotsFor(subject: string): Shot[] {
  return [
    { shot: 1, description: `Open close on hands unboxing ${subject}; morning light.`, imagePrompt: 'close-up hands, cardboard, morning window light', durationSec: 3 },
    { shot: 2, description: 'The product in use, one continuous movement.', imagePrompt: 'product in motion, shallow depth of field', durationSec: 4 },
    { shot: 3, description: 'A small detail nobody else would show.', imagePrompt: 'macro texture detail, raking light', durationSec: 3 },
    { shot: 4, description: 'Wide: the place where it gets used.', imagePrompt: 'wide establishing shot, quiet street, dusk', durationSec: 4 },
    { shot: 5, description: 'End card with the tagline.', imagePrompt: 'flat colour end card, generous space', durationSec: 2 },
  ];
}

const PALETTES: [string, string, string][] = [
  ['#2d3a2e', '#d9c7a0', '#f2ede2'],
  ['#1f2c46', '#e2884e', '#f5d7b5'],
  ['#3b2f2a', '#c9a27e', '#efe3d3'],
  ['#14262b', '#6aa7a1', '#d8ece8'],
  ['#2a2a2a', '#e8e3d6', '#ffffff'],
];

/** A simple illustrated frame; a regenerated frame gets a fresh composition. */
export function frameSvg(shot: Shot, version = 1): string {
  const [dark, mid, light] = PALETTES[(shot.shot - 1) % PALETTES.length] ?? PALETTES[0]!;
  const offset = version > 1 ? 60 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-label="${escapeHtml(`Frame ${shot.shot}: ${shot.description}`)}">
<rect width="640" height="360" fill="${light}"/>
<rect x="0" y="230" width="640" height="130" fill="${mid}"/>
<circle cx="${180 + shot.shot * 70 + offset}" cy="140" r="${50 + shot.shot * 6}" fill="${dark}" opacity="0.88"/>
<rect x="${80 + offset}" y="${200 - shot.shot * 8}" width="${120 + shot.shot * 20}" height="${60 + shot.shot * 4}" rx="6" fill="${dark}" opacity="0.55"/>
<text x="24" y="340" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="${dark}">Shot ${shot.shot}</text>
</svg>`;
}

export function voiceoverDraft(subject: string): string {
  return `It starts before you notice it.\nA small thing, made carefully: ${subject}.\nThe rest is up to you.`;
}
