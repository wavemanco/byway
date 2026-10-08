import { fencedBlocks, outsideFences, subjectOf } from './extract.ts';
import { renderStoryboard } from './structured.ts';

/**
 * Demo-mode answers that read a storyboard (C5): the relay link's clip prompt and the per-shot frame briefs. The
 * storyboard arrives as the artifact, one fenced json block (spec §3.3).
 */

export interface Shot {
  shot: number;
  description: string;
  imagePrompt: string;
  durationSec: number;
}

/** The storyboard in the prompt (the last json block holding one), else the demo's own for the subject. */
export function storyboardIn(prompt: string, seed: number): Shot[] {
  for (const block of fencedBlocks(prompt, ['json']).reverse()) {
    try {
      const parsed = JSON.parse(block) as { storyboard?: unknown };
      if (Array.isArray(parsed.storyboard) && parsed.storyboard.length) {
        return parsed.storyboard
          .filter((s): s is Shot => !!s && typeof s === 'object' && Number.isInteger((s as Shot).shot))
          .map((s) => ({
            shot: s.shot,
            description: String(s.description ?? ''),
            imagePrompt: String(s.imagePrompt ?? s.description ?? ''),
            durationSec: typeof s.durationSec === 'number' && s.durationSec > 0 ? s.durationSec : 5,
          }));
      }
    } catch {
      // Not JSON; try an earlier block.
    }
  }
  return renderStoryboard(seed, subjectOf(prompt)).storyboard;
}

/**
 * relay:media: `{"clipPrompt","durationSec"}` for the link the brief names ("Shot N", outside the storyboard block).
 * The prompt starts "Shot N:" so the demo's placeholder clip can say which shot it stands for.
 */
export function relayLink(seed: number, prompt: string): { clipPrompt: string; durationSec: number } {
  const shots = storyboardIn(prompt, seed);
  const named = /\bshot\s+(\d{1,3})\b/i.exec(outsideFences(prompt));
  const n = named ? Number(named[1]) : (shots[0]?.shot ?? 1);
  const shot = shots.find((s) => s.shot === n) ?? shots[0];
  const what = shot ? `${shot.description} ${shot.imagePrompt}`.trim() : subjectOf(prompt);
  return {
    clipPrompt: `Shot ${n}: ${what}. Continue from the previous frame; keep the product, the light and the camera height consistent.`,
    durationSec: shot?.durationSec ?? 5,
  };
}
