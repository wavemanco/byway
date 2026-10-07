/**
 * Compact fixtures for the operators added with C2–C7: parallel audit, one-shot gate with retry and relay chain.
 * Each mirrors the shape of one 03 configuration and must validate with exactly that configuration's exceptions.
 */
import { OPTION_SET } from '@byway/protocol';
import { audit, loop, oneShotGate, optional, pick, relay, replicate, seq, step, type Gate, type Recipe, type Step } from '@byway/recipe';

export const humanGate = (max = 5): Gate => ({
  metric: 'human',
  hidden: false,
  holder: 'human',
  probe: 1,
  max,
  onCap: 'human',
  onNoConverge: 'recalibrate-human',
});

export const rankGate = (): Gate => ({
  metric: 'critic-rank',
  threshold: 3,
  hidden: true,
  holder: 'worker',
  probe: 1,
  max: 3,
  plateau: { minGain: 1, window: 2 },
  onCap: 'human',
  onNoConverge: 'recalibrate-human',
});

export const checkCleanGate = (): Gate => ({
  metric: 'check-clean',
  hidden: false,
  holder: 'harness',
  probe: 1,
  max: 3,
  onCap: 'human',
  onNoConverge: 'recalibrate-human',
});

export const render = (id: string, consumes: Step['consumes'] = ['artifact']): Step =>
  step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes, produces: ['view'] });
export const fix = (id: string, keepsVoice = false): Step =>
  step({ id, role: 'fix', actor: 'model', tier: 'mid', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true, ...(keepsVoice ? { keepsVoice } : {}) });
export const critic = (id: string): Step =>
  step({ id, role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, consumes: ['view', 'refs'], produces: ['critique', 'score'], knobs: { mode: 'GREAT', refs: 4 } });
export const seedStep = (id: string): Step =>
  step({ id, role: 'seed', block: 'SEED', actor: 'model', tier: 'mid', consumes: ['intent'], produces: ['artifact'], writes: true });
export const humanWrite = (id: string): Step =>
  step({ id, role: 'build', actor: 'human', consumes: ['intent'], produces: ['artifact'], writes: true });
export const voice = (id: string, extra: Partial<Step> = {}): Step =>
  step({ id, role: 'voice', block: 'VOICE', actor: 'human', consumes: ['artifact'], produces: ['voice', 'artifact'], writes: true, knobs: { scope: 'every-line' }, ...extra });
export const cutMarks = (id: string): Step =>
  step({ id, role: 'cut', block: 'CUT', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, consumes: ['view'], produces: ['critique'] });
export const cutByHuman = (id: string): Step => step({ id, role: 'cut', block: 'CUT', actor: 'human', consumes: ['view'], produces: ['critique'] });
export const tellsSweep = (id: string): Step =>
  step({ id, role: 'tells-sweep', block: 'TELLS', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, consumes: ['view', 'tells'], produces: ['critique'] });
export const tellsCompare = (id: string): Step => step({ id, role: 'tells-compare', block: 'TELLS', actor: 'human', consumes: ['view'], produces: ['taste'] });
export const check = (id: string): Step =>
  step({ id, role: 'check', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, consumes: ['view'], produces: ['critique'] });
export const vanillaLens = (prefix = '') => ({
  name: 'vanilla-overlap',
  body: seq(
    replicate(`${prefix}vanilla-x3`, 3, step({ id: `${prefix}vanilla-build`, role: 'build', actor: 'model', tier: 'mid', consumes: ['intent'], produces: ['artifact'] })),
    step({ id: `${prefix}vanilla-flag`, role: 'overlap', actor: 'model', tier: 'mid', isolated: true, consumes: ['view', OPTION_SET], produces: ['critique'] }),
  ),
});

const base = (id: string, family: string, medium: Recipe['medium']): Omit<Recipe, 'stages' | 'sitsOut' | 'exceptions' | 'inputs'> => ({
  schema: 'byway.recipe/1',
  id,
  title: `${family} fixture`,
  kind: 'protocol-config',
  family,
  channel: 'protocol',
  medium,
  bank: true,
});

/** C6 shape: the human writes in a loop, three annotation-only lenses audit each draft, VOICE is the whole document. */
export function secondReader(): Recipe {
  return {
    ...base('reader-fixture', 'C6', 'prose'),
    inputs: ['intent', 'refs', 'tells'],
    stages: [
      {
        stage: 'D2',
        body: loop(
          'author-loop',
          seq(
            humanWrite('write'),
            render('render'),
            audit('audit', [
              { name: 'cut', body: cutMarks('cut-marks') },
              { name: 'tells', body: tellsSweep('tells-flags') },
              { name: 'critic', body: critic('critic') },
            ]),
          ),
          humanGate(10),
        ),
      },
      { stage: 'D3', body: voice('voice') },
    ],
    sitsOut: [
      { block: 'SEED', reason: 'facts, not randomness' },
      { block: 'VISION', reason: 'not in the fixture' },
      { block: 'ASSET', reason: 'text only' },
      { block: 'RELAY', reason: 'no media' },
    ],
    exceptions: ['C6-DR4', 'C6-DR7'],
  };
}

/** C2 shape: seeded pool, dedupe, annotation-only audit (vanilla overlap ‖ critic), human direction, VOICE in D1. */
export function ideas(): Recipe {
  return {
    ...base('ideas-fixture', 'C2', 'options'),
    inputs: ['intent', 'refs'],
    stages: [
      {
        stage: 'D1',
        body: seq(
          replicate('seeded', 8, seedStep('seed-option')),
          step({ id: 'dedupe', role: 'dedupe', glue: 'dedupe', actor: 'model', tier: 'mid', consumes: [OPTION_SET], produces: [OPTION_SET] }),
          render('pool-render', [OPTION_SET]),
          audit('annotate', [vanillaLens(), { name: 'critic', body: critic('critic-annotate') }]),
          loop(
            'vision',
            seq(
              step({ id: 'react', role: 'vision', block: 'VISION', actor: 'human', consumes: ['view', 'critique'], produces: ['taste'] }),
              step({ id: 'sharpen', role: 'vision', block: 'VISION', actor: 'model', tier: 'mid', consumes: ['taste', OPTION_SET], produces: ['brief'] }),
            ),
            humanGate(3),
          ),
          step({ id: 'option-map', role: 'build', glue: 'BRIEF', actor: 'model', tier: 'mid', consumes: [OPTION_SET, 'brief', 'critique'], produces: ['artifact'], writes: true }),
          voice('voice'),
          optional('mood', 'mood boards wanted', step({ id: 'mood-boards', role: 'asset', block: 'ASSET', actor: 'model', tier: 'mid', consumes: ['artifact'], produces: ['asset'] })),
        ),
      },
    ],
    sitsOut: [
      { block: 'CUT', reason: 'wrong stage' },
      { block: 'TELLS', reason: 'wrong stage' },
      { block: 'RELAY', reason: 'no media' },
    ],
    exceptions: ['C2-DR4', 'C2-DR7'],
  };
}

/** C5 shape: VOICE-early in D1, a relay chain with per-shot defect repair, D3 Distill, then a one-shot gate with retry. */
export function mediaRelay(): Recipe {
  return {
    ...base('relay-fixture', 'C5', 'media'),
    inputs: ['intent', 'refs', 'tells'],
    stages: [
      {
        stage: 'D1',
        body: seq(
          replicate('concepts', 2, seedStep('seed-concept')),
          pick('pick-concept', 'H', 1, 'human'),
          voice('vo-script', { variant: 'VOICE-early' }),
        ),
      },
      {
        stage: 'D2',
        body: seq(
          step({ id: 'anchor-frames', role: 'asset', block: 'ASSET', actor: 'model', tier: 'mid', consumes: ['artifact'], produces: ['artifact', 'anchor'], writes: true, keepsVoice: true }),
          relay(
            'chain',
            4,
            seq(
              step({ id: 'clip', role: 'relay', block: 'RELAY', actor: 'model', tier: 'mid', consumes: ['anchor', 'artifact'], produces: ['artifact', 'anchor'], writes: true, keepsVoice: true }),
              loop('shot-repair', seq(render('shot-render'), check('shot-check'), fix('regenerate', true)), checkCleanGate()),
            ),
          ),
        ),
      },
      {
        stage: 'D3',
        body: seq(
          render('cut-render'),
          cutByHuman('cut'),
          fix('apply-cut', true),
          render('tells-render'),
          tellsSweep('tells-sweep'),
          fix('apply-swaps', true),
          render('compare-render'),
          tellsCompare('tells-compare'),
          voice('voice'),
          render('feed-render'),
          oneShotGate('launch-gate', critic('gate-critic'), { metric: 'critic-rank', threshold: 3, hidden: true, holder: 'harness' }, { stage: 'D2', times: 1 }),
        ),
      },
    ],
    sitsOut: [{ block: 'VISION', reason: 'not in the fixture' }],
    exceptions: ['C5-DR7'],
  };
}

/** C7 shape: code-diff medium, model CUT on both sides of a review loop in D2, human TELLS and VOICE in D3. */
export function leanDiff(): Recipe {
  return {
    ...base('diff-fixture', 'C7', 'code-diff'),
    inputs: ['intent', 'refs', 'tells'],
    stages: [
      {
        stage: 'D2',
        body: seq(
          step({ id: 'implement', role: 'build', actor: 'model', tier: 'mid', consumes: ['intent'], produces: ['artifact'], writes: true }),
          render('defect-render'),
          check('defect-check'),
          fix('fix-defects'),
          render('scope-render'),
          cutMarks('scope-cut'),
          fix('apply-scope-cut'),
          loop('review-loop', seq(render('review-render'), critic('reviewer'), fix('review-fix')), rankGate()),
          render('bloat-render'),
          cutMarks('bloat-cut'),
          fix('apply-bloat-cut'),
        ),
      },
      {
        stage: 'D3',
        body: seq(render('tells-render'), tellsSweep('tells-sweep'), fix('apply-swaps'), render('compare-render'), tellsCompare('tells-compare'), voice('voice')),
      },
    ],
    sitsOut: [
      { block: 'SEED', reason: 'convergence is the goal' },
      { block: 'VISION', reason: 'not in the fixture' },
      { block: 'ASSET', reason: 'no asset slots' },
      { block: 'RELAY', reason: 'no media' },
    ],
    exceptions: ['C7-PR1', 'C7-DR7'],
  };
}
