import { OPTION_SET, type PortType, type TellsDomain } from '@byway/protocol';
import { replicate, seq, step, type Gate, type Json, type Step } from '@byway/recipe';

/**
 * Step factories for the protocol configurations C2–C7 and C6a (03). C1 and the Study 1 arms keep their own
 * factories in steps.ts, so that their recipe hashes never move when these change.
 *
 * Every model step here runs a project prompt named `product.<config>.<step-id>` (registered by @byway/prompts):
 * the article's own prompts are written for landing pages, so none applies verbatim to these media. Human and tool
 * steps have no prompt; the runner phrases their checkpoints by role.
 */

/** The project prompt id of a step: unique, because step ids are unique within a recipe (ST1). */
export const productPrompt = (config: string, stepId: string): string => `product.${config}.${stepId}`;

type Knobs = Record<string, Json>;
const withKnobs = (knobs: Knobs | undefined) => (knobs && Object.keys(knobs).length ? { knobs } : {});

// ---- Gates -------------------------------------------------------------------------------------------------------

/** `*[H]`: a person decides when it is done. No threshold, so nothing to hide; `max` is a bound on rounds. */
export const humanGate = (max: number): Gate => ({
  metric: 'human',
  hidden: false,
  holder: 'human',
  probe: 1,
  max,
  onCap: 'human',
  onNoConverge: 'recalibrate-human',
});

/**
 * A rank gate (02 §2): ours must place at `threshold` or better in a lineup of the references plus ours (refs + 1),
 * hidden from the critic. Plateau for rank gates: the same rank for 2 iterations.
 *
 * The threshold is written for the full lineup, the critic step's `refs` knob plus ours (C3: top 3 of 10; C4, C5 and
 * C7: the middle of 5). A run with fewer references has a smaller lineup, and the runner keeps the bar's share of it:
 * ours passes at rank <= max(1, floor(threshold × lineup / (refs + 1))) (GATE-1, convention C6). So every critic under
 * a rank gate names its `refs` (tested).
 */
export const rankGate = (threshold: number, max: number, probe = 1): Gate => ({
  metric: 'critic-rank',
  threshold,
  hidden: true,
  holder: 'worker',
  probe,
  max,
  plateau: { minGain: 1, window: 2 },
  onCap: 'human',
  onNoConverge: 'recalibrate-human',
});

/** Repeat until a defect check reports no defects, at most `max` checks (03 C5: at most 2 regenerations per shot). */
export const checkCleanGate = (max: number): Gate => ({
  metric: 'check-clean',
  hidden: false,
  holder: 'harness',
  probe: 1,
  max,
  onCap: 'human',
  onNoConverge: 'recalibrate-human',
});

// ---- Diverge ----------------------------------------------------------------------------------------------------

/** One seeded branch: the runner's random string, interpreted into a direction on named axes (01 SEED). */
export const seedCard = (config: string, id: string): Step =>
  step({
    id,
    role: 'seed',
    block: 'SEED',
    actor: 'model',
    tier: 'mid',
    prompt: productPrompt(config, id),
    consumes: ['intent'],
    produces: ['artifact'],
    writes: true,
    knobs: { source: 'shell-string' },
  });

/** The glue dedupe (03 C2): one representative per cluster of near-duplicate options. */
export const dedupe = (config: string, id: string): Step =>
  step({ id, role: 'dedupe', glue: 'dedupe', actor: 'model', tier: 'mid', prompt: productPrompt(config, id), consumes: [OPTION_SET], produces: [OPTION_SET] });

/** RENDER of a whole option set: the drafts side by side, as the human and the annotators see them. */
export const renderPool = (id: string): Step =>
  step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: [OPTION_SET], produces: ['view'] });

/**
 * The vanilla-overlap lens (03 C2, C3, C5, C6a ⟨A⟩): the plain request run 3 times without a seed, then a flag on
 * every option that shares a hook, thesis, premise or form with those runs. The plain runs are a control sample:
 * they stay inside the lens and never become the work, so they do not write.
 */
export const vanillaOverlapLens = (config: string) => ({
  name: 'vanilla-overlap',
  body: seq(
    replicate(
      'vanilla-x3',
      3,
      step({ id: 'vanilla-build', role: 'build', actor: 'model', tier: 'mid', prompt: productPrompt(config, 'vanilla-build'), consumes: ['intent'], produces: ['artifact'] }),
    ),
    step({
      id: 'vanilla-flag',
      role: 'overlap',
      actor: 'model',
      tier: 'mid',
      isolated: true,
      frozenPrompt: true,
      prompt: productPrompt(config, 'vanilla-flag'),
      consumes: ['view', OPTION_SET],
      produces: ['critique'],
    }),
  ),
});

/** VISION, the human part: react to what you see (favourites, what to avoid), or state the direction yourself. */
export const humanVision = (id: string, consumes: PortType[], produces: PortType[], variant?: string): Step =>
  step({ id, role: 'vision', block: 'VISION', actor: 'human', consumes, produces, ...(variant ? { variant } : {}) });

/** VISION, the model part: scatter angles or sharpen your reactions into a brief. It never decides for you. */
export const modelVision = (config: string, id: string, consumes: PortType[], produces: PortType[] = ['brief']): Step =>
  step({ id, role: 'vision', block: 'VISION', actor: 'model', tier: 'mid', prompt: productPrompt(config, id), consumes, produces });

// ---- Build and deepen -------------------------------------------------------------------------------------------

/** A worker build at the mid tier (default rule 5). */
export const build = (config: string, id: string, consumes: PortType[], extra: Partial<Step> = {}): Step =>
  step({ id, role: 'build', actor: 'model', tier: 'mid', prompt: productPrompt(config, id), consumes, produces: ['artifact'], writes: true, ...extra });

/** The author writes or revises the work themselves (C3 "your own draft", C6 and C6a every sentence). */
export const authorWrites = (id: string, consumes: PortType[]): Step =>
  step({ id, role: 'build', actor: 'human', consumes, produces: ['artifact'], writes: true });

export const render = (id: string): Step =>
  step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });

export interface CriticOptions {
  mode: 'OK' | 'GREAT';
  /** Reference count in the lineup (ours is ranked among refs + 1). */
  refs?: number;
  family?: 'same' | 'other';
  shuffle?: boolean;
  shuffles?: number;
}

/** CRITIC: a fresh, isolated, big-tier call that sees only the view and the references, with a frozen prompt. */
export const critic = (config: string, id: string, o: CriticOptions): Step =>
  step({
    id,
    role: 'critic',
    block: 'CRITIC',
    actor: 'model',
    tier: 'big',
    isolated: true,
    frozenPrompt: true,
    prompt: productPrompt(config, id),
    consumes: ['view', 'refs'],
    produces: ['critique', 'score'],
    knobs: { mode: o.mode, ...(o.refs !== undefined ? { refs: o.refs } : {}), ...(o.family ? { family: o.family } : {}), ...(o.shuffle !== undefined ? { shuffle: o.shuffle } : {}), ...(o.shuffles !== undefined ? { shuffles: o.shuffles } : {}) },
  });

/** A worker turn that applies a critique or a directive (critic gaps, CUT removals, TELLS swaps). */
export const fix = (config: string, id: string, extra: Partial<Step> = {}): Step =>
  step({ id, role: 'fix', actor: 'model', tier: 'mid', prompt: productPrompt(config, id), consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true, ...extra });

/** ASSET: generate what the generalist cannot (images, audio). */
export const asset = (config: string, id: string, consumes: PortType[], produces: PortType[], extra: Partial<Step> = {}): Step =>
  step({ id, role: 'asset', block: 'ASSET', actor: 'model', tier: 'mid', prompt: productPrompt(config, id), consumes, produces, ...extra });

/** An objective-defect check (port rule 7 carve-out): defects only, no score, no taste. Not a CRITIC block. */
export const objectiveCheck = (config: string, id: string): Step =>
  step({ id, role: 'check', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: productPrompt(config, id), consumes: ['view'], produces: ['critique'] });

// ---- Distill ----------------------------------------------------------------------------------------------------

export const cutByHuman = (id: string): Step => step({ id, role: 'cut', block: 'CUT', actor: 'human', consumes: ['view'], produces: ['critique'] });

/**
 * A fresh-context CUT pass by a model (01 CUT: an experimental taste owner). Used where 03 has the AI mark or cut:
 * C6/C6a mark candidates in an annotation-only lens; C7 trims scope in D2 on unattended runs.
 */
export const cutByModel = (config: string, id: string): Step =>
  step({ id, role: 'cut', block: 'CUT', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: productPrompt(config, id), consumes: ['view'], produces: ['critique'] });

/** The TELLS sweep: a fresh-context call, so the catalog never enters a worker's context (port rule 7). */
export const tellsSweep = (config: string, id: string, domains: TellsDomain[]): Step =>
  step({
    id,
    role: 'tells-sweep',
    block: 'TELLS',
    actor: 'model',
    tier: 'big',
    isolated: true,
    frozenPrompt: true,
    prompt: productPrompt(config, id),
    consumes: ['view', 'tells'],
    produces: ['critique'],
    knobs: { catalog: 'extended', variants: 'combined', domains },
  });

export const tellsCompareByHuman = (id: string): Step =>
  step({ id, role: 'tells-compare', block: 'TELLS', actor: 'human', consumes: ['view'], produces: ['taste'] });

/** VOICE: the human writes the reader-facing words. `key-lines` is VOICE-lite (C4's declared exception to rule 9). */
export const voice = (id: string, scope: 'every-line' | 'key-lines' = 'every-line', extra: Partial<Step> = {}): Step =>
  step({ id, role: 'voice', block: 'VOICE', actor: 'human', consumes: ['artifact'], produces: ['voice', 'artifact'], writes: true, ...withKnobs({ scope }), ...extra });

/** The standard human-judged Distill (03 C1, C3, C4, C5): CUT, then the TELLS sweep, swaps and a human A/B. */
export function distill(config: string, domains: TellsDomain[], keepsVoice = false): Step[] {
  const kv = keepsVoice ? { keepsVoice: true } : {};
  return [
    render('cut-render'),
    cutByHuman('cut'),
    fix(config, 'apply-cut', kv),
    render('tells-render'),
    tellsSweep(config, 'tells-sweep', domains),
    fix(config, 'apply-swaps', kv),
    render('compare-render'),
    tellsCompareByHuman('tells-compare'),
  ];
}
