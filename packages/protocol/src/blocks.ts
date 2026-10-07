import type { RuleId } from './rules.ts';

export const BLOCK_CODES = ['SEED', 'VISION', 'CRITIC', 'ASSET', 'RELAY', 'CUT', 'TELLS', 'VOICE'] as const;
export type BlockCode = (typeof BLOCK_CODES)[number];

export const GLUE_CODES = ['RENDER', 'BRIEF', 'TIER', 'KEYS', 'BANK', 'dedupe'] as const;
export type GlueCode = (typeof GLUE_CODES)[number];

export type KnobDef =
  | { type: 'enum'; values: readonly string[] }
  /** A non-empty list of distinct values from a fixed set. */
  | { type: 'enum[]'; values: readonly string[] }
  | { type: 'int'; min: number; max: number }
  | { type: 'bool' }
  | { type: 'string' }
  | { type: 'string[]' };

/**
 * Tell catalogs by domain (01 TELLS "Starter catalogs", plus the two 03 names: C6's application formula and C5's
 * stylistic media sweep). Several configurations share the prose medium but sweep different catalogs, so the
 * sweep names its domains and the runner hands it those catalogs.
 */
export const TELLS_DOMAINS = [
  'ui',
  'prose-words',
  'prose-structure',
  'newsletter',
  'social',
  'marketing',
  'memo',
  'slides',
  'code',
  'lesson-plan',
  'fiction',
  'application',
  'media-style',
] as const;
export type TellsDomain = (typeof TELLS_DOMAINS)[number];

export interface BlockDef {
  code: BlockCode;
  /** Default chassis stage (02 §1). */
  stage: 'D1' | 'D2' | 'D3';
  /** 01-blocks one-line purpose. */
  purpose: string;
  knobs: Record<string, KnobDef>;
  /** Registered leave-one-out semantics (ADR-0059): how the block is removed and which default rules that suspends. */
  bypass: { transform: string; suspends: RuleId[] };
}

export const BLOCKS: Record<BlockCode, BlockDef> = {
  SEED: {
    code: 'SEED',
    stage: 'D1',
    purpose: 'Inject variety from outside the model: a random string the model interprets into a direction',
    knobs: {
      source: { type: 'enum', values: ['shell-string', 'model-first-step'] },
      structuralAxis: { type: 'bool' },
    },
    bypass: { transform: 'seed-to-plain-build', suspends: ['DR1'] },
  },
  VISION: {
    code: 'VISION',
    stage: 'D1',
    purpose: 'Bring human taste: scatter, react, sharpen into a brief',
    knobs: {
      route: { type: 'enum', values: ['direct', 'system', 'engine'] },
      functionalAnchor: { type: 'bool' },
    },
    bypass: { transform: 'remove-step', suspends: [] },
  },
  CRITIC: {
    code: 'CRITIC',
    stage: 'D2',
    purpose: 'A fresh-context, bigger model judges the render against a bar it never sees',
    knobs: {
      mode: { type: 'enum', values: ['OK', 'GREAT', 'check'] },
      renders: { type: 'string[]' },
      refs: { type: 'int', min: 0, max: 10 },
      shuffle: { type: 'bool' },
      calibration: { type: 'bool' },
      /** ⟨A⟩ 'other': a model family that did not produce the work (01 CRITIC: self-preference is strongest for prose). */
      family: { type: 'enum', values: ['same', 'other'] },
      /** ⟨A⟩ Fixed reference orders whose ranks are averaged (03 C5 gate: "2 fixed shuffles averaged"). */
      shuffles: { type: 'int', min: 1, max: 4 },
    },
    bypass: { transform: 'remove-critic-loop', suspends: [] },
  },
  ASSET: {
    code: 'ASSET',
    stage: 'D2',
    purpose: 'Generate what the generalist cannot produce natively (images, shaders)',
    knobs: {
      slots: { type: 'int', min: 1, max: 3 },
      triesPerSlot: { type: 'int', min: 1, max: 3 },
      route: { type: 'enum', values: ['builtin', 'codex-cli', 'keys'] },
    },
    bypass: { transform: 'remove-step', suspends: [] },
  },
  RELAY: {
    code: 'RELAY',
    stage: 'D2',
    purpose: 'Chain specialist generators, each starting from the previous end state',
    knobs: {
      effect: { type: 'enum', values: ['graphic', 'transition-B0', 'transition-B1'] },
    },
    bypass: { transform: 'remove-step', suspends: [] },
  },
  CUT: {
    code: 'CUT',
    stage: 'D3',
    purpose: 'Remove elements that add nothing, using removal verbs',
    knobs: {
      rounds: { type: 'int', min: 1, max: 2 },
    },
    bypass: { transform: 'remove-step', suspends: [] },
  },
  TELLS: {
    code: 'TELLS',
    stage: 'D3',
    purpose: 'Sweep for reflexive defaults after generation and swap in alternatives',
    knobs: {
      catalog: { type: 'enum', values: ['article-4row', 'extended'] },
      variants: { type: 'enum', values: ['combined', 'per-row'] },
      /** Which domain catalogs the sweep uses; absent means the article's UI table (`catalog: 'article-4row'`). */
      domains: { type: 'enum[]', values: TELLS_DOMAINS },
    },
    bypass: { transform: 'remove-step', suspends: [] },
  },
  VOICE: {
    code: 'VOICE',
    stage: 'D3',
    purpose: 'A human writes every reader-facing line',
    knobs: {
      scope: { type: 'enum', values: ['every-line', 'key-lines'] },
    },
    bypass: { transform: 'remove-step', suspends: [] },
  },
};

/** Knobs registered for steps that are not blocks (worker calls, selectors). */
export const ROLE_KNOBS: Record<'build' | 'fix' | 'select', Record<string, KnobDef>> = {
  build: {
    skill: { type: 'string' },
    /** An up-front ban list. Registered so that default rule 8 (audit after, never ban before) can flag it. */
    avoid: { type: 'string[]' },
  },
  fix: {
    avoid: { type: 'string[]' },
  },
  select: {
    n: { type: 'int', min: 1, max: 64 },
  },
};
