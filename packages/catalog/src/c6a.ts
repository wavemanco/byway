import { audit, loop, optional, pick, replicate, seq, withHash, type Recipe } from '@byway/recipe';
import { authorLoop } from './c6.ts';
import { humanGate, humanVision, modelVision, render, renderPool, seedCard, tellsSweep, vanillaOverlapLens, voice } from './parts.ts';

/**
 * C6a Fiction Sounding Board (03 C6a): seeded premises, your prose, critics that only point.
 *
 *   D1:: x6[ SEED > premise/form card ] > {{ vanilla-overlap(x3[ plain "write a story about [theme]" ]) }}
 *        > ?H VISION[ react > sharpen 1–2 > story brief (for you) ]
 *   D2:: ( ?H you write / revise > {{ CUT(mark) ‖ TELLS(flag fiction tells) ‖ @critic:big[a family that never touched
 *        the text](view = clean pages, refs = 4+ published passages, shuffled → rank + top 3 weaknesses) }} )*[H]
 *   D3:: VOICE = the whole text (already yours) > ?H final TELLS read (optional)
 *
 * Modelling notes: the runbook has you pick 1–2 cards; one pick closes the pool (a second favourite can be named in
 * your reaction). The final TELLS read is a flags-only lens you read on the result. Not modelled: the `engine` entry
 * route (C2 as the front end) and the cross-collection read of the last 5 pieces.
 * Every sentence is yours: no model step writes the text. Exemplars are published passages only.
 */
export const c6a: Recipe = withHash({
  schema: 'byway.recipe/1',
  id: 'c6a',
  title: 'C6a Fiction Sounding Board (seed entry)',
  kind: 'protocol-config',
  family: 'C6a',
  channel: 'protocol',
  medium: 'prose',
  inputs: ['intent', 'refs', 'tells'],
  stages: [
    {
      stage: 'D1',
      body: seq(
        replicate('seeded-cards', 6, seedCard('c6a', 'seed-card')),
        renderPool('cards-render'),
        audit('vanilla-check', [vanillaOverlapLens('c6a')]),
        pick('pick-card', 'H', 1, 'human'),
        // React (what pulls you, what feels tacky, what to avoid), then the AI sharpens a brief for you, up to 2 rounds.
        loop('vision', seq(humanVision('react', ['artifact'], ['taste']), modelVision('c6a', 'sharpen', ['taste', 'artifact'])), humanGate(2)),
      ),
    },
    { stage: 'D2', body: authorLoop('c6a', ['intent', 'brief'], 'fiction') },
    {
      stage: 'D3',
      body: seq(
        voice('voice'),
        optional(
          'final-tells-read',
          'you want a last read for fiction tells',
          audit('final-read', [{ name: 'tells', body: seq(render('final-render'), tellsSweep('c6a', 'final-tells-flags', ['fiction'])) }]),
        ),
      ),
    },
  ],
  sitsOut: [
    { block: 'ASSET', reason: 'Cover art and illustration are a separate job (C5 Still mode) (03 C6a)' },
    { block: 'RELAY', reason: 'No media (03 C6a)' },
  ],
  exceptions: ['C6a-DR4', 'C6a-DR7'],
  bank: true,
});
