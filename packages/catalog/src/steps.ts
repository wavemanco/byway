import type { PortType } from '@byway/protocol';
import { step, type Gate, type Step } from '@byway/recipe';

/**
 * Step factories shared by the C1 family and the Study 1 arms.
 *
 * Prompt ids name templates that are registered separately:
 * - `article.*`: the article's own prompts (Study 1 Appendix A: A.B1, A.B2, A.SEED, A.CRIT-W, A.ASSET),
 *   to be transcribed verbatim (Study 1 decision D2).
 * - `study1.*`: Study 1 protocol Appendix A ids (A.9–A.14, A.CRIT-C). `study1.A.CRIT-C` is written by the
 *   worker in each run and locked at the first call, as in the article; it is not a fixed project template.
 * - `runbook.*`: 06-runbook templates used by the protocol configuration C1.
 */

export const seedBuild = (id: string, consumes: PortType[], structuralAxis: boolean): Step =>
  step({
    id,
    role: 'seed',
    block: 'SEED',
    actor: 'model',
    tier: 'mid',
    prompt: 'article.SEED',
    consumes,
    produces: ['artifact'],
    writes: true,
    knobs: { source: 'shell-string', structuralAxis },
  });

export const plainBuild = (id: string, prompt: string, consumes: PortType[], knobs?: Step['knobs']): Step =>
  step({
    id,
    role: 'build',
    actor: 'model',
    tier: 'mid',
    prompt,
    consumes,
    produces: ['artifact'],
    writes: true,
    ...(knobs ? { knobs } : {}),
  });

export const render = (id: string): Step =>
  step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });

export interface CriticOptions {
  /** Render views the critic receives. */
  renders: string[];
  /** Prompt id: a fixed template for C1, the worker-written locked prompt for C1-H. */
  prompt: string;
  /** C1 amendment 6: check the critic orders good and generic references correctly before the probe. */
  calibration: boolean;
}

export const critic = (id: string, o: CriticOptions): Step =>
  step({
    id,
    role: 'critic',
    block: 'CRITIC',
    actor: 'model',
    tier: 'big',
    isolated: true,
    frozenPrompt: true,
    prompt: o.prompt,
    consumes: ['view'],
    produces: ['critique', 'score'],
    knobs: { mode: 'OK', renders: o.renders, calibration: o.calibration },
  });

/** The worker's fix turn inside the critic loop, driven by the article's critic-loop worker prompt. */
export const criticFix = (id: string): Step =>
  step({
    id,
    role: 'fix',
    actor: 'model',
    tier: 'mid',
    prompt: 'article.CRIT-W',
    consumes: ['critique', 'artifact'],
    produces: ['artifact'],
    writes: true,
  });

/** A worker turn that carries out a directive (CUT removals, TELLS swaps). */
export const applyDirective = (id: string, prompt: string): Step =>
  step({ id, role: 'fix', actor: 'model', tier: 'mid', prompt, consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true });

/** ASSET with optional slot policy knobs (C1 amendment 8). Study 1 uses the article's prompt without them. */
export const asset = (id: string, knobs?: Step['knobs']): Step =>
  step({
    id,
    role: 'asset',
    block: 'ASSET',
    actor: 'model',
    tier: 'mid',
    prompt: 'article.ASSET',
    consumes: ['artifact'],
    produces: ['artifact'],
    writes: true,
    ...(knobs ? { knobs } : {}),
  });

export const cutByHuman = (id: string): Step =>
  step({ id, role: 'cut', block: 'CUT', actor: 'human', consumes: ['view'], produces: ['critique'] });

/** D3-auto CUT: a fresh-context reviewer issues an itemized removal directive (Study 1 A.9, SM-3). */
export const cutByProxy = (id: string): Step =>
  step({
    id,
    role: 'cut',
    block: 'CUT',
    actor: 'model',
    tier: 'big',
    isolated: true,
    frozenPrompt: true,
    proxyFor: 'human',
    prompt: 'study1.A9',
    consumes: ['view'],
    produces: ['critique'],
    knobs: { rounds: 2 },
  });

/** The TELLS sweep: a fresh-context, big-tier call, so the catalog never enters the worker's context (port rule 7). */
export const tellsSweep = (id: string, prompt: string): Step =>
  step({
    id,
    role: 'tells-sweep',
    block: 'TELLS',
    actor: 'model',
    tier: 'big',
    isolated: true,
    frozenPrompt: true,
    prompt,
    consumes: ['view', 'tells'],
    produces: ['critique'],
    knobs: { catalog: 'article-4row', variants: 'combined' },
  });

export const tellsCompareByHuman = (id: string): Step =>
  step({ id, role: 'tells-compare', block: 'TELLS', actor: 'human', consumes: ['view'], produces: ['taste'] });

/** D3-auto TELLS: a blind keep-or-revert call that never sees the catalog (Study 1 A.13, SM-4). */
export const tellsCompareByProxy = (id: string): Step =>
  step({
    id,
    role: 'tells-compare',
    block: 'TELLS',
    actor: 'model',
    tier: 'big',
    isolated: true,
    frozenPrompt: true,
    proxyFor: 'human',
    prompt: 'study1.A13',
    consumes: ['view'],
    produces: ['taste'],
  });

export const voiceByHuman = (id: string): Step =>
  step({
    id,
    role: 'voice',
    block: 'VOICE',
    actor: 'human',
    consumes: ['artifact'],
    produces: ['voice', 'artifact'],
    writes: true,
    knobs: { scope: 'every-line' },
  });

/** CRITIC-check: a score-free, defect-only check after Distill (03 C1 amendment 9). Not used in Study 1. */
export const defectCheck = (id: string): Step =>
  step({
    id,
    role: 'check',
    block: 'CRITIC',
    variant: 'CRITIC-check',
    actor: 'model',
    tier: 'big',
    isolated: true,
    frozenPrompt: true,
    prompt: 'runbook.defect-check',
    consumes: ['view'],
    produces: ['critique'],
    knobs: { mode: 'check' },
  });

/** The article's gate: the critic's independent 9/10, hidden from it; probe 2, ⟨A⟩ cap 5 and plateau rule. */
export function criticGate(handling: 'human' | 'policy'): Gate {
  return {
    metric: 'critic-score',
    threshold: 9,
    hidden: true,
    holder: 'worker',
    probe: 2,
    max: 5,
    plateau: { minGain: 0.5, window: 2 },
    onCap: handling === 'human' ? 'human' : 'policy-best-snapshot',
    onNoConverge: handling === 'human' ? 'recalibrate-human' : 'continue',
  };
}
