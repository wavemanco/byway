import type { Medium } from '@byway/contracts';
import { labelsIn } from './extract.ts';
import { int, pick, rng, sample, seedOf } from './seed.ts';

/**
 * Demo-mode judges. Outputs follow the spec §3.3 contracts exactly. The critic's score rises by one per iteration of
 * the same loop (the gateway counts calls per run, step and purpose), so a demo loop reaches its hidden threshold in a
 * few rounds instead of running to the cap every time.
 */

const GAPS: Record<Medium, string[]> = {
  'web-page': [
    'The headline states a category, not a reason to care; lead with the outcome a visitor gets.',
    'The primary action competes with the navigation; give it the only filled button above the fold.',
    'Section spacing is uniform, so nothing reads as more important; widen the gap before the closing section.',
    'Body copy runs past a comfortable measure on wide screens; cap the line length.',
    'The illustration is decorative only; tie it to what the product does.',
  ],
  prose: [
    'The ask arrives in the third paragraph; move it to the first two lines.',
    'Two paragraphs restate the context; keep the one with the number in it.',
    'The risks are listed without owners; name who watches each one.',
    'The ending summarises instead of saying what happens next.',
    'Several sentences hedge a point the evidence supports; state it plainly.',
  ],
  options: [
    'Three options differ only in channel; replace two with genuinely different bets.',
    'Pitches describe features, not why someone would choose them.',
    'One rationale argues against its own option; rewrite it or drop the option.',
    'No option is cheap to test this month.',
  ],
  media: [
    'Shot 2 explains instead of showing; cut the line and let the image carry it.',
    'The voiceover repeats the on-screen text; keep one.',
    'Durations are even, so nothing lands; hold the payoff shot longer.',
    'The closing frame has no clear next step for the viewer.',
  ],
  'code-diff': [
    'The diff renames variables the change does not need; revert them to shrink the review.',
    'A new helper is used once; inline it.',
    'The "why" explains what changed, not the reason; say what breaks without it.',
    'Tests assert implementation details; assert the output instead.',
  ],
};

const INTENTS: Record<Medium, string[]> = {
  'web-page': ['a calm, exact page that gets a visitor to act', 'a warm, direct page that earns trust quickly', 'a quietly confident page that lets one idea lead'],
  prose: ['one clear case the reader can act on, leaving them confident', 'a frank account that leaves the reader trusting the writer', 'a sharp argument that leaves the reader with one new idea'],
  options: ['a spread of genuinely different bets, leaving the reader curious', 'a short list of cheap tests, leaving the reader ready to start'],
  media: ['one feeling landed in a few shots, leaving the viewer wanting the product', 'a small story with a clear payoff'],
  'code-diff': ['a smaller change that keeps behaviour and reads at a glance', 'the same fix with less for a reviewer to hold in mind'],
};

export interface CriticInput {
  seed: number;
  medium: Medium;
  iteration: number;
}

/** OK mode: the gaps, then `Score: N/10`, rising by one per iteration of the same loop. */
export function critique(o: CriticInput): string {
  const rand = rng(o.seed);
  const gaps = sample(rand, GAPS[o.medium], Math.max(1, 3 - Math.min(2, o.iteration)));
  const bullets = gaps.map((g) => `- ${g}`).join('\n');
  const start = int(rand, 6, 7);
  return `${bullets}\nScore: ${Math.min(10, start + o.iteration)}/10`;
}

export interface GreatCriticInput {
  medium: Medium;
  /** Each item in lineup order: its label and what it looks like (seeds its critique). */
  items: readonly { label: string; look: string }[];
  /** Every label once, best first (lineup.ts blindRanking). */
  ranking: readonly string[];
}

/**
 * GREAT mode (ADR-0072): the critic is not told which item is ours, so it critiques every item under its "### X"
 * heading (what it is going for, then its biggest gaps) and ends with `Ranking: C, A, E, B, D`, every label once,
 * best first. The runner finds our place in the ranking and keeps only our item's section for the fix.
 */
export function greatCritique(o: GreatCriticInput): string {
  const sections = o.items.map((item) => {
    const rand = rng(seedOf(`${item.label}\n${item.look}`));
    const gaps = sample(rand, GAPS[o.medium], 2).map((g) => `- ${g}`);
    return [`### ${item.label}`, `- Intent: ${pick(rand, INTENTS[o.medium])}.`, ...gaps].join('\n');
  });
  return `${sections.join('\n\n')}\n\nRanking: ${o.ranking.join(', ')}`;
}

/** judge, select and rerank: short reasoning, then `Choice: <label>`. */
export function choose(seed: number, prompt: string, images: number): string {
  const rand = rng(seed);
  let labels = labelsIn(prompt);
  if (labels.length < 2 && images > 1) labels = Array.from({ length: Math.min(images, 26) }, (_, i) => String.fromCharCode(65 + i));
  if (labels.length === 0) labels = ['A'];
  const choice = pick(rand, labels);
  return `${choice} holds together best: the hierarchy is clear at a glance and nothing competes with the main action.\nChoice: ${choice}`;
}

/** check: a defect list, or exactly `No defects.` */
export function defects(prompt: string): string {
  const found: string[] = [];
  if (/lorem ipsum/i.test(prompt)) found.push('- Placeholder "lorem ipsum" text is still present.');
  if (/\bTODO\b|\bTBD\b/.test(prompt)) found.push('- An unresolved TODO/TBD marker is visible.');
  if (/\[placeholder\]|\{\{\s*\w+\s*\}\}/i.test(prompt)) found.push('- A template placeholder was never filled in.');
  return found.length ? found.join('\n') : 'No defects.';
}

const CUTS: Record<Medium, string[]> = {
  'web-page': ['Remove the second call to action in the hero.', 'Drop the navigation link that repeats the footer.', 'Delete the decorative divider above the closing section.', 'Merge the two short feature points into one.'],
  prose: ['Remove the opening paragraph that restates the title.', 'Delete the sentence that repeats the ask.', 'Drop the hedge in the bottom line.', 'Merge the two risk bullets about staffing.'],
  options: ['Remove the option that is a smaller version of another.', 'Drop the rationale sentence that restates the pitch.', 'Merge the two partnership options.'],
  media: ['Remove the establishing shot; open on the frustration.', 'Drop the voiceover line that names the product twice.', 'Merge shots 3 and 4.'],
  'code-diff': ['Remove the unused import the change introduced.', 'Delete the comment that restates the code.', 'Drop the renamed variable; keep the original name.', 'Merge the two guard clauses.'],
};

/** A model CUT directive: removal-verb bullets only. */
export function cutDirective(seed: number, medium: Medium): string {
  return sample(rng(seed), CUTS[medium], 3)
    .map((c) => `- ${c}`)
    .join('\n');
}

/** Phrases the demo sweep can spot in text views, with a plainer alternative. */
const TEXT_TELLS: { re: RegExp; pattern: string; alternative: string }[] = [
  { re: /\bdelve\b/i, pattern: 'delve', alternative: 'look at' },
  { re: /in today's fast-paced world/i, pattern: "In today's fast-paced world", alternative: 'Cut the scene-setting; start with the point.' },
  { re: /\bseamless(ly)?\b/i, pattern: 'seamless', alternative: 'Say what actually happens: "it syncs in the background".' },
  { re: /\bunlock\b/i, pattern: 'unlock', alternative: 'Name the concrete benefit.' },
  { re: /\belevate\b/i, pattern: 'elevate', alternative: 'improve' },
  { re: /\bgame[- ]changer\b/i, pattern: 'game-changer', alternative: 'State the measurable difference.' },
  { re: /not just .{1,40}, but/i, pattern: '"not just X, but Y"', alternative: 'Say Y directly.' },
  { re: /—/, pattern: 'em dash used as a reflex', alternative: 'Use a full stop or a comma.' },
];

const VISUAL_TELLS = [
  { pattern: 'Centered hero over a soft gradient', where: 'Hero', alternative: 'Left-align the headline and let the image carry the colour.' },
  { pattern: 'Three identical feature tiles', where: 'Features', alternative: 'Give the most important point more room than the others.' },
  { pattern: 'Small uppercase label above every heading', where: 'Section headings', alternative: 'Drop the labels; the headings already say it.' },
];

/** The TELLS sweep: hits found in text views, or a seeded visual tell for screenshot views. */
export function tellsSweep(seed: number, medium: Medium, prompt: string): { hits: { pattern: string; where: string; alternative: string }[] } {
  if (medium === 'web-page' || medium === 'media') {
    return { hits: sample(rng(seed), VISUAL_TELLS, 1 + (seed % 2)) };
  }
  const hits = TEXT_TELLS.filter((t) => t.re.test(prompt)).map((t) => ({ pattern: t.pattern, where: 'Body text', alternative: t.alternative }));
  return { hits: hits.slice(0, 5) };
}

/** A model TELLS compare: optional reasoning, then `Keep: A` or `Keep: B`. */
export function keep(seed: number): string {
  const choice = seed % 3 === 0 ? 'A' : 'B';
  return `${choice === 'B' ? 'The swapped version reads as more specific without losing anything.' : 'The swaps flatten the voice; the original is stronger.'}\nKeep: ${choice}`;
}

/** A model VISION turn: a plain-text direction. */
export function vision(seed: number, subject: string): string {
  const rand = rng(seed);
  const feel = pick(rand, ['calm and exact', 'warm and direct', 'quietly confident', 'plain-spoken and bright']);
  return `Direction: make it feel ${feel}. Lead with what changes for the reader of "${subject.slice(0, 80)}", show one concrete example early, and keep everything else in service of that.`;
}

export interface ImageBrief {
  slot: string;
  prompt: string;
  alt: string;
  size: '1024x1024' | '1536x1024' | '1024x1536';
}

/** ASSET briefs: up to the slot count the prompt asks for (default 3), each with a size the image models accept. */
export function assetBriefs(seed: number, subject: string, prompt: string): { images: ImageBrief[] } {
  const rand = rng(seed);
  const asked = /\bup to (\d+)\b|\bslots?\s*[:=]\s*(\d+)/i.exec(prompt);
  const n = Math.max(1, Math.min(3, Number(asked?.[1] ?? asked?.[2] ?? 3)));
  const slots = [...prompt.matchAll(/data-slot="([^"]+)"/g)].map((m) => m[1] as string);
  const names = [...new Set([...slots, 'hero', 'feature', 'detail'])];
  const style = pick(rand, ['soft natural light, muted palette', 'crisp studio light, warm neutrals', 'overcast daylight, gentle contrast']);
  const sizes: ImageBrief['size'][] = ['1536x1024', '1024x1024', '1024x1536'];
  return {
    images: names.slice(0, n).map((slot, i) => ({
      slot,
      prompt: `${subject.slice(0, 120)}: ${['an establishing photograph', 'a close detail', 'people using it'][i % 3]}, ${style}, no text in the image`,
      alt: `${['Establishing view', 'Close detail', 'In use'][i % 3]} for ${subject.slice(0, 60)}`,
      size: sizes[i % 3] as ImageBrief['size'],
    })),
  };
}
