/**
 * The product's plain vocabulary (spec §5, ADR-0040). Protocol codes stay available behind the
 * "Show technical names" setting so every screen can be traced back to the protocol documents.
 */
import type { BlockCode } from '@byway/protocol';

export type StageName = 'Explore' | 'Refine' | 'Finish';
export type Who = 'you' | 'ai' | 'tool';

export const STAGES: readonly StageName[] = ['Explore', 'Refine', 'Finish'];

const STAGE_CODES: Record<string, StageName> = { D1: 'Explore', D2: 'Refine', D3: 'Finish' };

/** Accepts a chassis code (D1–D3) or a plain stage name; anything else is unknown. */
export function stageFromCode(value: unknown): StageName | undefined {
  if (typeof value !== 'string') return undefined;
  if ((STAGES as readonly string[]).includes(value)) return value as StageName;
  return STAGE_CODES[value];
}

export function stageCode(stage: StageName): string {
  return `D${STAGES.indexOf(stage) + 1}`;
}

export const BLOCK_NAMES: Record<BlockCode, string> = {
  SEED: 'Random spark',
  VISION: 'Your direction',
  CRITIC: 'Outside critique',
  ASSET: 'Custom imagery',
  RELAY: 'Motion',
  CUT: 'Trim',
  TELLS: 'Cliché sweep',
  VOICE: 'Your words',
};

export const RECIPE_NAMES: Record<string, string> = {
  c1: 'Landing Page Studio',
  c2: 'Idea Generator',
  c3: 'Series Writer',
  c4: 'Memo Polish',
  c5: 'Ad Video Chain',
  c6: 'Second Reader',
  c6a: 'Fiction Second Reader',
  c7: 'Lean Code Review',
};

/** Protocol terms the UI renames. */
export const TERMS = {
  checkpoint: { plain: 'Your turn', code: '?H' },
  optionSet: { plain: 'Drafts', code: 'option_set' },
  threshold: { plain: 'Quality bar', code: 'hidden threshold' },
} as const;

/** Protocol codes for step labels that are not plain block names. */
const LABEL_CODES: Record<string, string> = {
  'Your pick': 'pick(H)',
  'Keep or revert': 'TELLS',
  'Trim marks': 'CUT',
  'Cliché flags': 'TELLS',
  'Apply trim': 'CUT',
  'Set your words': 'VOICE',
  'Obvious-idea check': 'vanilla-overlap',
  'Remove near-duplicates': 'dedupe',
  'Final check': 'CRITIC-check',
  'Defect check': 'check',
  'Objective checks': 'check',
  'Your draft': 'VOICE',
  'Your pages': 'VOICE',
  'Done?': '?H',
  'How to start': 'route',
  Draft: 'build',
  Implement: 'build',
  Brief: 'BRIEF',
  Composite: 'RELAY',
  'Voice-over audio': 'ASSET',
  // The catalog's presentations (@byway/catalog PRESENTATIONS).
  'Pick one': 'pick(H)',
  'Pick an angle': 'pick(H)',
  'Pick a concept': 'pick(H)',
  'Pick a premise': 'pick(H)',
  Shortlist: 'pick(H)',
  'First draft': 'build',
  'Option map': 'build',
  Concepts: 'build',
  'Merge near-duplicates': 'dedupe',
  'Obvious-answer check': 'vanilla-overlap',
  'Framings to react to': 'VISION',
  'Angles from your material': 'VISION',
  'Spec interview': 'VISION',
  'Sign off the facts': 'VOICE',
  'Your words: the script': 'VOICE',
  'Outside critique: defect check': 'CRITIC-check',
  'Outside critique: launch check': 'CRITIC',
  'Last cliché read': 'TELLS',
  'Trim the scope': 'CUT',
  'Trim what review added': 'CUT',
};

/** The protocol code behind a plain step label, when there is one. */
export function codeForLabel(label: string): string | undefined {
  const block = (Object.keys(BLOCK_NAMES) as BlockCode[]).find((code) => BLOCK_NAMES[code] === label);
  return block ?? LABEL_CODES[label];
}

/** A step name, with its protocol code in parentheses when technical names are on. */
export function stepTitle(label: string, code: string | undefined, technical: boolean): string {
  return technical && code ? `${label} (${code})` : label;
}

export function recipeTitle(p: { name: string; code: string }, technical: boolean): string {
  return technical && p.code ? `${p.code} ${p.name}` : p.name;
}

export function whoLabel(who: Who): string {
  return who === 'you' ? 'You' : who === 'ai' ? 'AI' : 'Tool';
}
