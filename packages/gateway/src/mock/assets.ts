import type { Medium } from '@byway/contracts';
import { fencedBlocks, labelledItems, labelsIn, outsideFences, titleFrom } from './extract.ts';
import { assetBriefs, type ImageBrief } from './judging.ts';
import { storyboardIn } from './media.ts';
import { pick, rng } from './seed.ts';

/**
 * Demo-mode ASSET helpers beyond the web page (spec §3.3 `asset.briefs:<medium>`, `asset.integrate:prose`):
 * - options: one rough mood image per option, slot = the option's label;
 * - media: one frame per storyboard shot, slot = the shot number;
 * - prose: one illustration, placed where the text first pauses.
 */

const STYLES = ['soft natural light, muted palette', 'overcast daylight, gentle contrast', 'warm late light, film grain'];

export function briefsFor(medium: Medium, seed: number, subject: string, prompt: string): { images: ImageBrief[] } {
  const style = pick(rng(seed), STYLES);
  switch (medium) {
    case 'options': {
      const items = labelledItems(prompt);
      const options = items.length ? items : labelsIn(prompt).map((label) => ({ label, text: '' }));
      return {
        images: (options.length ? options : [{ label: 'A', text: '' }]).map((o) => {
          const title = o.text.split('\n')[0]?.trim() || subject.slice(0, 80);
          // Rough on purpose: mood images inform the choice and never become the deliverable (03 C2).
          return { slot: o.label, prompt: `Rough mood board for "${title}": loose collage, ${style}, no text in the image`, alt: `Mood board for option ${o.label}`, size: '1024x1024' };
        }),
      };
    }
    case 'media':
      return {
        images: storyboardIn(prompt, seed).map((s) => ({ slot: String(s.shot), prompt: s.imagePrompt, alt: s.description || `Frame for shot ${s.shot}`, size: '1536x1024' })),
      };
    case 'prose': {
      const doc = documentIn(prompt);
      const title = /^#\s+(.+)$/m.exec(doc ?? '')?.[1] ?? titleFrom(subject, 'the piece');
      return { images: [{ slot: 'illustration-1', prompt: `An editorial illustration for "${title}": one clear idea, ${style}, no text in the image`, alt: `Illustration for ${title}`, size: '1536x1024' }] };
    }
    default:
      return assetBriefs(seed, subject, prompt);
  }
}

const IMAGE_LINE = /!\[[^\]\n]*\]\([^)\s]+\)/g;

/** The Markdown document in the prompt: the last markdown block with more in it than image lines. */
export function documentIn(prompt: string): string | undefined {
  return fencedBlocks(prompt, ['markdown', 'md'])
    .reverse()
    .find((block) => block.replace(IMAGE_LINE, '').trim() !== '');
}

/**
 * asset.integrate:prose: the document with the given image lines (`![alt](/api/artifacts/<id>)`, from the images slot)
 * placed after the opening paragraph, each on its own, in the order given. Lines already in the document stay put.
 */
export function integrateProse(markdown: string, prompt: string): string {
  const lines = [...new Set(outsideFences(prompt).match(IMAGE_LINE) ?? [])].filter((l) => !markdown.includes(l));
  if (!lines.length) return markdown;
  const blocks = markdown.trim().split(/\n{2,}/);
  // After the title and the first paragraph of body text, or at the end of a short document.
  const firstBody = blocks.findIndex((b) => !/^#/.test(b));
  const at = firstBody < 0 ? blocks.length : firstBody + 1;
  blocks.splice(at, 0, ...lines);
  return `${blocks.join('\n\n')}\n`;
}
