import { OPTION_SET } from '@byway/protocol';
import { audit, loop, optional, replicate, seq, step, withHash, type Recipe } from '@byway/recipe';
import { asset, critic, dedupe, humanGate, humanVision, modelVision, productPrompt, renderPool, seedCard, vanillaOverlapLens, voice } from './parts.ts';

/** Seeded branches: 03 C2 says 8–20; 12 is the product default (lite profile: 8). */
export const C2_BRANCHES = 12;

/**
 * C2 Divergence Engine (03 C2): widen first, then let a human choose. It ends in a decision, an option map with
 * 1–3 briefs, and is D1-only.
 *
 *   D1:: xN[ SEED > options:low-detail ] > dedupe > {{ vanilla-overlap(x3[plain]) ‖ @critic:big(cards, refs = prior art) }}
 *        > ?H VISION[ react > sharpen 2–3 > BRIEF ] > ?H VOICE(name + one-line pitch) > ASSET?(rough mood boards)
 *
 * Modelling notes:
 * - The human sees the full deduplicated pool with its annotations and reacts (favourites and what to avoid); that
 *   reaction is the choice, so there is no separate pick operator. "sharpen 2–3" is up to 3 react → sharpen rounds.
 * - BRIEF compiles the option map: every deduplicated option with its annotations, the chosen 1–3 with their briefs.
 * - Mood boards are a separate `asset`, kept rough, and never written into the decision.
 * - Not modelled: the re-roll when fewer than ~60% of options survive dedupe or most are flagged vanilla; the
 *   architecture mode; feeding C1, C3 or C5 as their front end (configuration as block).
 */
export const c2: Recipe = withHash({
  schema: 'byway.recipe/1',
  id: 'c2',
  title: 'C2 Divergence Engine',
  kind: 'protocol-config',
  family: 'C2',
  channel: 'protocol',
  medium: 'options',
  inputs: ['intent', 'refs'],
  stages: [
    {
      stage: 'D1',
      body: seq(
        replicate('seeded-options', C2_BRANCHES, seedCard('c2', 'seed-option')),
        dedupe('c2', 'dedupe'),
        renderPool('pool-render'),
        audit('annotate', [
          vanillaOverlapLens('c2'),
          // Advisory rank against prior art, as an annotation only: nothing is cut on its say-so (C2-DR4).
          { name: 'critic', body: critic('c2', 'critic', { mode: 'GREAT', shuffle: true }) },
        ]),
        loop(
          'vision',
          seq(humanVision('react', ['view', 'critique'], ['taste']), modelVision('c2', 'sharpen', ['taste', OPTION_SET])),
          humanGate(3),
        ),
        step({
          id: 'option-map',
          role: 'build',
          glue: 'BRIEF',
          actor: 'model',
          tier: 'mid',
          prompt: productPrompt('c2', 'option-map'),
          consumes: [OPTION_SET, 'brief', 'critique'],
          produces: ['artifact'],
          writes: true,
        }),
        // The chosen option's name and one-line pitch are its only reader-facing words, so this is every line.
        voice('voice'),
        optional('mood-boards-if-wanted', 'you want rough mood boards for the chosen option', asset('c2', 'mood-boards', ['artifact'], ['asset'])),
      ),
    },
  ],
  sitsOut: [
    { block: 'CUT', reason: 'Wrong stage: C2 ends in a decision in D1; dedupe and the vanilla-overlap flag are glue (03 C2)' },
    { block: 'TELLS', reason: 'Wrong stage: C2 ends in a decision in D1, before any work exists to sweep (03 C2)' },
    { block: 'RELAY', reason: 'No media at the ideation stage (03 C2)' },
  ],
  exceptions: ['C2-DR4', 'C2-DR7'],
  bank: true,
});
