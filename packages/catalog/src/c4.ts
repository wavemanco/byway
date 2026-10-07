import { loop, optional, seq, step, withHash, type Recipe } from '@byway/recipe';
import { build, critic, distill, fix, humanVision, modelVision, rankGate, render, voice } from './parts.ts';

/**
 * C4 Reader-Ready (03 C4): the ask in the first two lines, and nothing the reader would miss, in minutes.
 *
 *   D1:: ?H VISION-lite(decision or ask + the one point; the AI may offer 5 framings to react to)
 *   D2:: draft:mid > route(length){ ≤ ~300 words: ~~CRITIC~~ | longer: ( RENDER > @recipient:big(view, refs = 4–6
 *        exemplary internal docs) > revise )*[at or above the middle of the lineup · !hidden · max=2] }
 *   D3:: ?H[ CUT(length budget) > TELLS(memo catalog) ] > ?H VOICE-lite > fact-heavy docs: ?H owner sign-off (claim log)
 *
 * Modelling notes: the length route is an optional whose trigger is "longer than about 300 words" (the short branch
 * is empty: CRITIC sits out there). The lineup is 4 references plus ours, so "the middle" is rank 3. The claim log
 * is the owner's sign-off on every number, date, name and causal claim (ownership, not a fact check; 01 VOICE step 6).
 */
export const c4: Recipe = withHash({
  schema: 'byway.recipe/1',
  id: 'c4',
  title: 'C4 Reader-Ready',
  kind: 'protocol-config',
  family: 'C4',
  channel: 'protocol',
  medium: 'prose',
  inputs: ['intent', 'refs', 'tells'],
  stages: [
    {
      stage: 'D1',
      body: seq(
        optional('framings-if-wanted', 'you want five framings to react to first', modelVision('c4', 'framings', ['intent'])),
        humanVision('vision-lite', ['intent'], ['brief'], 'VISION-lite'),
      ),
    },
    {
      stage: 'D2',
      body: seq(
        build('c4', 'draft', ['intent', 'brief']),
        optional(
          'recipient-critic',
          'the document is longer than about 300 words',
          loop(
            'critic-loop',
            // "Can I act on this in 2 minutes?" Findings are scoped to actionability; wording stays placeholder.
            seq(render('render'), critic('c4', 'recipient', { mode: 'GREAT', refs: 4, shuffle: true }), fix('c4', 'revise')),
            rankGate(3, 2),
          ),
        ),
      ),
    },
    {
      stage: 'D3',
      body: seq(
        ...distill('c4', ['memo']),
        voice('voice', 'key-lines', { variant: 'VOICE-lite' }),
        optional(
          'claim-log',
          'the document is fact-heavy (an RCA, an analytical or a strategy memo)',
          step({ id: 'claim-sign-off', role: 'voice', block: 'VOICE', variant: 'claim-log', actor: 'human', consumes: ['artifact'], produces: ['voice'] }),
        ),
      ),
    },
  ],
  sitsOut: [
    { block: 'SEED', reason: 'The document has one job and no open-ended divergence; nest C2 only when it proposes options (03 C4)' },
    { block: 'ASSET', reason: 'Pure text; the one exception, charts computed from real data, is not in the wiring (03 C4)' },
    { block: 'RELAY', reason: 'Nothing in an internal document has state, sequence or motion (03 C4)' },
  ],
  exceptions: ['C4-DR9'],
  bank: true,
});
