import { loop, optional, seq, withHash, type Recipe } from '@byway/recipe';
import {
  build,
  critic,
  cutByModel,
  fix,
  humanVision,
  modelVision,
  objectiveCheck,
  rankGate,
  render,
  tellsCompareByHuman,
  tellsSweep,
  voice,
} from './parts.ts';

/**
 * C7 Lean Diff (03 C7, adjacent): smaller diffs, reviewed blind, with a human-written "why".
 *
 *   D1:: ~~SEED~~ · VISION-lite(spec interview, only if requirements are vague)
 *   D2:: implement:mid > objective-defect checks (lint, type, format, placeholders, TODOs) > CUT(scope)
 *        > ( RENDER(the diff + CI status) > @reviewer:big[other family](view, refs = exemplary merged PRs) > fix:mid )
 *          *[ranks at or above the median of 4 exemplary merged PRs on reviewability · !hidden · probe=1 · max=3]
 *        > CUT(remove anything the review loop added)
 *   D3:: ?H TELLS(code-style catalog: audit and swap, triage each hit) > ?H VOICE(PR why, tradeoffs, how verified,
 *        user-facing strings, public API names)
 *
 * Modelling notes: the two D2 CUT passes are fresh-context model passes, as 03 runs C7 on unattended agent runs and
 * counts human time only for TELLS and the "why"; they are a declared stage exception (C7-DR7), not Distill. The
 * product has no linter or CI, so the objective-defect check is a model check (defects only, no taste); tests and CI
 * stay EXTERNAL and outside the blocks, and correctness is not judged here. Not modelled: architecture choices
 * through C2 (greenfield only). The reviewer judges reviewability: scope creep, readability, fit with conventions.
 */
export const c7: Recipe = withHash({
  schema: 'byway.recipe/1',
  id: 'c7',
  title: 'C7 Lean Diff',
  kind: 'protocol-config',
  family: 'C7',
  channel: 'protocol',
  medium: 'code-diff',
  inputs: ['intent', 'refs', 'tells'],
  stages: [
    {
      stage: 'D1',
      body: optional(
        'spec-interview',
        'the requirements are vague',
        seq(modelVision('c7', 'interview', ['intent']), humanVision('spec', ['brief'], ['brief'], 'VISION-lite')),
      ),
    },
    {
      stage: 'D2',
      body: seq(
        build('c7', 'implement', ['intent']),
        render('defect-render'),
        objectiveCheck('c7', 'defect-check'),
        fix('c7', 'fix-defects'),
        render('scope-render'),
        cutByModel('c7', 'scope-cut'),
        fix('c7', 'apply-scope-cut'),
        loop(
          'review-loop',
          seq(render('review-render'), critic('c7', 'reviewer', { mode: 'GREAT', refs: 4, family: 'other', shuffle: true }), fix('c7', 'review-fix')),
          rankGate(3, 3),
        ),
        render('bloat-render'),
        cutByModel('c7', 'bloat-cut'),
        fix('c7', 'apply-bloat-cut'),
      ),
    },
    {
      stage: 'D3',
      body: seq(
        render('tells-render'),
        tellsSweep('c7', 'tells-sweep', ['code']),
        fix('c7', 'apply-swaps'),
        render('compare-render'),
        tellsCompareByHuman('tells-compare'),
        voice('voice'),
      ),
    },
  ],
  sitsOut: [
    { block: 'SEED', reason: "Converging on the repo's conventions is the goal (03 C7)" },
    { block: 'ASSET', reason: 'A code change has no asset slots (03 C7)' },
    { block: 'RELAY', reason: 'No media (03 C7)' },
  ],
  exceptions: ['C7-PR1', 'C7-DR7'],
  bank: true,
});
