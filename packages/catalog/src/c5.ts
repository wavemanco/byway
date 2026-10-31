import { OPTION_SET } from '@byway/protocol';
import { audit, each, loop, oneShotGate, pick, relay, replicate, seq, step, withHash, type Recipe } from '@byway/recipe';
import {
  asset,
  build,
  checkCleanGate,
  critic,
  dedupe,
  distill,
  humanVision,
  objectiveCheck,
  productPrompt,
  render,
  renderPool,
  seedCard,
  vanillaOverlapLens,
  voice,
} from './parts.ts';

/** Every machine write after the VO script is locked keeps human copy verbatim (port rule 6). */
const KEEP = { keepsVoice: true } as const;

/**
 * The relay chain's links (03 C5: chains of 3–4 segments). C5's anchor step reads it too (the runner's asset step and the
 * estimate): with a video model it makes shot 1's still, where the chain starts, and a still for each shot past the
 * chain, which the protocol's storyboard may add "for frames" (the owner's "Stills past the chain", 2026-10-31,
 * F12 (b)). Its prompt says "the first four"; a test holds them equal.
 */
export const C5_CHAIN_LINKS = 4;

/**
 * C5 Media Relay (03 C5): specialist models are the production medium, and continuity comes from the handoff.
 *
 *   D1:: C2 > territories > ?H VISION(creative director: brief + shot list + style frames) > pick(H,1) concept
 *        > ?H VOICE-early(VO script and spoken claims; locked)
 *   D2:: RELAY[ ASSET(anchor frames · product plates · style frames) > each[ scene: clip(start frame) ~> clip(final
 *        frame seeds the next) ] > render-in-scene > matte > VO audio from the locked script ]
 *        each[ shot: objective defect → regenerate, naming the defect | anything else → re-roll, new seed, same prompt ]
 *   D3:: ?H[ CUT(one message) > TELLS(stylistic sweep; A/B swaps) ] > ?H VOICE(tagline, headline, captions, on-screen)
 *        > RENDER(served size, in a feed mock) > gate[ @critic:big(view, refs = best-in-category; 2 fixed shuffles
 *        averaged) ranks at or above the median · !hidden ] else ↺ D2 (once, automatic, same brief), then ?H
 *
 * Modelling notes:
 * - "C2 > territories" is C2 used as a block, which the IR cannot nest yet. Its lite form is inlined (seeded
 *   territories, dedupe, the vanilla-overlap flag, no critic annotation), and the creative director shortlists up to
 *   three territories (C2's "1–3 briefs") before concepts are built from them under their direction.
 * - The scenes become one relay chain over the storyboard's shots (up to 4 links, 03: chains of 3–4 segments); each
 *   link is checked for objective defects and regenerated at most twice. Re-rolls never paste tell names.
 * - D3 CUT may drop whole VO lines only with the owner's sign-off: the apply step keeps human copy verbatim, and the
 *   owner drops lines in the late VOICE step. In v1 the late VOICE edits only the on-screen copy (headline, tagline and
 *   captions; spec §3.3), so the voice-over stays as locked and dropping its lines is not offered.
 * - The gate's lineup is 4 best-in-category references plus ours, so "at or above the median" is rank 3.
 * - Without a video provider the runner stops after the storyboard and images and says so (product spec §1).
 * - EXTERNAL, not modelled: live A/B results recalibrating the gate.
 */
export const c5: Recipe = withHash({
  schema: 'byway.recipe/1',
  id: 'c5',
  title: 'C5 Media Relay (C2 front end inlined in its lite form)',
  kind: 'protocol-config',
  family: 'C5',
  channel: 'protocol',
  medium: 'media',
  inputs: ['intent', 'refs', 'tells'],
  stages: [
    {
      stage: 'D1',
      body: seq(
        replicate('seeded-territories', 8, seedCard('c5', 'seed-territory')),
        dedupe('c5', 'dedupe'),
        renderPool('territories-render'),
        audit('vanilla-check', [vanillaOverlapLens('c5')]),
        pick('shortlist', 'H', 3, 'human'),
        humanVision('direction', [OPTION_SET], ['taste']),
        each('concepts', build('c5', 'concept', ['artifact', 'taste'])),
        pick('pick-concept', 'H', 1, 'human'),
        voice('vo-script', 'every-line', { variant: 'VOICE-early' }),
      ),
    },
    {
      stage: 'D2',
      body: seq(
        asset('c5', 'anchor-frames', ['artifact'], ['artifact', 'anchor'], { writes: true, ...KEEP }),
        relay(
          'shot-chain',
          C5_CHAIN_LINKS,
          seq(
            step({
              id: 'clip',
              role: 'relay',
              block: 'RELAY',
              actor: 'model',
              tier: 'mid',
              prompt: productPrompt('c5', 'clip'),
              consumes: ['anchor', 'artifact'],
              produces: ['artifact', 'anchor'],
              writes: true,
              knobs: { effect: 'transition-B1' },
              ...KEEP,
            }),
            loop(
              'shot-repair',
              seq(
                render('shot-render'),
                objectiveCheck('c5', 'shot-check'),
                step({
                  id: 'regenerate',
                  role: 'relay',
                  block: 'RELAY',
                  actor: 'model',
                  tier: 'mid',
                  prompt: productPrompt('c5', 'regenerate'),
                  consumes: ['critique', 'artifact'],
                  produces: ['artifact', 'anchor'],
                  writes: true,
                  ...KEEP,
                }),
              ),
              checkCleanGate(3),
            ),
          ),
        ),
        step({
          id: 'render-in-scene',
          role: 'relay',
          block: 'RELAY',
          actor: 'model',
          tier: 'mid',
          prompt: productPrompt('c5', 'render-in-scene'),
          consumes: ['artifact'],
          produces: ['artifact'],
          writes: true,
          knobs: { effect: 'graphic' },
          ...KEEP,
        }),
        step({ id: 'matte', role: 'relay', block: 'RELAY', actor: 'tool', consumes: ['artifact'], produces: ['artifact'], writes: true, ...KEEP }),
        asset('c5', 'vo-audio', ['voice', 'artifact'], ['artifact'], { writes: true, ...KEEP }),
      ),
    },
    {
      stage: 'D3',
      body: seq(
        ...distill('c5', ['media-style'], true),
        voice('voice'),
        render('feed-render'),
        oneShotGate(
          'launch-gate',
          critic('c5', 'gate-critic', { mode: 'GREAT', refs: 4, shuffle: true, shuffles: 2 }),
          { metric: 'critic-rank', threshold: 3, hidden: true, holder: 'harness' },
          { stage: 'D2', times: 1 },
        ),
      ),
    },
  ],
  sitsOut: [],
  exceptions: ['C5-DR7'],
  bank: true,
});
