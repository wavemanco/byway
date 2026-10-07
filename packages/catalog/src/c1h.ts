import { critiqueSelf, each, leaveOneOut, loop, replicate, seq, withHash, type Recipe } from '@byway/recipe';
import { c1 } from './c1.ts';
import {
  applyDirective,
  asset,
  critic,
  criticFix,
  criticGate,
  cutByProxy,
  render,
  seedBuild,
  tellsCompareByProxy,
  tellsSweep,
} from './steps.ts';

/**
 * C1-H: headless C1, the Study 1 treatment arm (protocol v1.1 §3.2). Every human checkpoint is bound
 * to a preregistered rule or a labelled AI proxy, copy comes from a fixed human deck, and every
 * candidate is evaluated (no pick). CRITIC-check (C1 amendment 9) sits out: it needs a human to route failures
 * (Study 1 S1-BIND).
 */
export const c1h: Recipe = withHash({
  schema: 'byway.recipe/1',
  id: 'c1h',
  title: 'C1-H (headless C1, Study 1 treatment arm)',
  kind: 'variant',
  family: 'C1',
  channel: 'research-frozen',
  parent: { hash: c1.hash!, derivation: { transform: 'binding', version: 1, map: 'S1-BIND' } },
  inputs: ['intent', 'voice', 'tells'],
  stages: [
    { stage: 'D1', body: replicate('seeded-x4', 4, seedBuild('seed-build', ['intent', 'voice'], false)) },
    {
      stage: 'D2',
      body: each(
        'each-candidate',
        seq(
          loop(
            'critic-loop',
            // One desktop render (Study 1 §5.4, deviation 14); the worker writes the critic prompt, locked at the first call.
            seq(render('render'), critic('critic', { renders: ['desktop'], prompt: 'study1.A.CRIT-C', calibration: false }), criticFix('critic-fix')),
            criticGate('policy'),
          ),
          // The article's ASSET prompt, always on, without the protocol's slot policy (Study 1 §5.4).
          asset('asset'),
          render('asset-verify'),
        ),
      ),
    },
    {
      stage: 'D3',
      body: each(
        'each-candidate-d3',
        seq(
          render('cut-render'),
          cutByProxy('cut'),
          applyDirective('apply-cut', 'study1.A10'),
          render('tells-render'),
          tellsSweep('tells-sweep', 'study1.A11'),
          applyDirective('apply-swaps', 'study1.A12'),
          render('compare-render'),
          tellsCompareByProxy('tells-compare'),
        ),
      ),
    },
  ],
  sitsOut: [
    { block: 'VISION', reason: 'Study 1 uses the seed entry only; human taste is tested in Study 1b' },
    { block: 'RELAY', reason: 'Raters see static renders; motion is not evaluated in Study 1' },
    { block: 'VOICE', reason: 'Copy is held constant by a fixed human copy deck in every arm (SM-6)' },
  ],
  exceptions: ['C1-DR2', 'SM-1', 'SM-2', 'SM-3', 'SM-4', 'SM-6'],
  bank: false,
});

/** Study 1 leave-one-out ablations and the CRITIC-self manipulation, all derived from C1-H. */
export const c1hAblations: Recipe[] = [
  withHash(leaveOneOut(c1h, 'SEED')),
  withHash(leaveOneOut(c1h, 'CRITIC')),
  withHash(leaveOneOut(c1h, 'ASSET')),
  withHash(leaveOneOut(c1h, 'D3')),
  withHash(critiqueSelf(c1h)),
];
