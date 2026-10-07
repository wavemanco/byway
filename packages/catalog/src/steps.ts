import type { PortType } from '@byway/protocol';
import { step, type Gate, type Step } from '@byway/recipe';

/**
 * Step factories shared by the C1 family and the Study 1 arms. Prompt ids name templates:
 * "article.*" are the article's prompts (to be transcribed verbatim, Study 1 D2), "project.*" are
 * project-written prompts (Study 1 protocol, Appendix A).
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

export const critic = (id: string): Step =>
  step({
    id,
    role: 'critic',
    block: 'CRITIC',
    actor: 'model',
    tier: 'big',
    isolated: true,
    frozenPrompt: true,
    prompt: 'project.critic-ok',
    consumes: ['view'],
    produces: ['critique', 'score'],
    knobs: { mode: 'OK', renders: ['desktop', 'mobile', 'fold'] },
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

export const asset = (id: string): Step =>
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
    knobs: { slots: 3, triesPerSlot: 3 },
  });

export const cutByHuman = (id: string): Step =>
  step({ id, role: 'cut', block: 'CUT', actor: 'human', consumes: ['view'], produces: ['critique'] });

/** D3-auto CUT: a fresh-context reviewer issues an itemized removal directive (Study 1 SM-3). */
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
    prompt: 'project.cut-directive',
    consumes: ['view'],
    produces: ['critique'],
    knobs: { rounds: 2 },
  });

export const tellsSweep = (id: string): Step =>
  step({
    id,
    role: 'tells-sweep',
    block: 'TELLS',
    actor: 'model',
    tier: 'mid',
    prompt: 'project.tells-sweep',
    consumes: ['view', 'tells'],
    produces: ['critique'],
    knobs: { catalog: 'article-4row', variants: 'combined' },
  });

export const tellsCompareByHuman = (id: string): Step =>
  step({ id, role: 'tells-compare', block: 'TELLS', actor: 'human', consumes: ['view'], produces: ['taste'] });

/** D3-auto TELLS: a blind keep-or-revert call that never sees the catalog (Study 1 SM-4). */
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
    prompt: 'project.tells-keep-or-revert',
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

/** CRITIC-check: a score-free, defect-only check after Distill (03 C1 amendment 9). */
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
    prompt: 'project.defect-check',
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
