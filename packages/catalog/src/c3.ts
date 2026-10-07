import { audit, loop, optional, pick, replicate, route, seq, withHash, type Recipe } from '@byway/recipe';
import { asset, authorWrites, build, critic, distill, fix, humanVision, rankGate, render, renderPool, seedCard, vanillaOverlapLens, voice } from './parts.ts';

/**
 * C3 Voice Series (03 C3): every piece one-of-a-kind, every piece in your voice. One turn of the series loop:
 *
 *   D1:: x6[ SEED > angle card ] > {{ vanilla-overlap(x3[plain]) }} > ?H VISION(thesis from your own experience)
 *   D2:: draft:mid or your own draft > ( RENDER > @critic:big[other family](view, refs = 6 best + 3 leaders) > revise:mid )
 *        *[ours in top 3 of 10 · !hidden · probe=1 · max=3] > ASSET?(header image · chart from real data)
 *   D3:: ?H[ CUT > TELLS(prose words + structure + platform) > VOICE(every line) ]
 *
 * Not yet expressible in the IR, so not modelled: the outer series loop `( … )*[until the calendar ends]`, the
 * portfolio review every 5 pieces (which adds recurring patterns to the TELLS catalog and rotates the seed axes), the
 * `engine` entry route (C2 as the front end) and the ghostwriting claim log. One piece is one run.
 */
export const c3: Recipe = withHash({
  schema: 'byway.recipe/1',
  id: 'c3',
  title: 'C3 Voice Series (one piece; seed entry; the series loop is not modelled)',
  kind: 'protocol-config',
  family: 'C3',
  channel: 'protocol',
  medium: 'prose',
  inputs: ['intent', 'refs', 'tells'],
  stages: [
    {
      stage: 'D1',
      body: seq(
        replicate('seeded-angles', 6, seedCard('c3', 'seed-angle')),
        renderPool('cards-render'),
        audit('vanilla-check', [vanillaOverlapLens('c3')]),
        pick('pick-angle', 'H', 1, 'human'),
        // The thesis comes from your own experience, data or classroom, before any draft exists.
        humanVision('thesis', ['artifact'], ['brief']),
      ),
    },
    {
      stage: 'D2',
      body: seq(
        route('draft', 'who writes the first draft', [
          { name: 'ai', body: build('c3', 'ai-draft', ['intent', 'brief']) },
          { name: 'own', body: authorWrites('own-draft', ['brief']) },
        ]),
        loop(
          'critic-loop',
          // Bylines stripped from the lineup; the worker may restructure, but wording stays placeholder until VOICE.
          seq(render('render'), critic('c3', 'critic', { mode: 'GREAT', refs: 9, family: 'other', shuffle: true }), fix('c3', 'revise')),
          rankGate(3, 3),
        ),
        optional('asset-if-wanted', 'you want a header image or a chart computed from real data', asset('c3', 'asset', ['artifact'], ['artifact'], { writes: true, knobs: { slots: 1 } })),
      ),
    },
    { stage: 'D3', body: seq(...distill('c3', ['prose-words', 'prose-structure', 'newsletter', 'social']), voice('voice')) },
  ],
  sitsOut: [{ block: 'RELAY', reason: 'Video repurposing belongs to C5 (03 C3)' }],
  exceptions: [],
  bank: true,
});
