import type { PortType, TellsDomain } from '@byway/protocol';
import { audit, loop, optional, seq, withHash, type Node, type Recipe } from '@byway/recipe';
import { authorWrites, critic, cutByModel, humanGate, humanVision, modelVision, render, tellsSweep, voice } from './parts.ts';

/**
 * 03 sets no cap on the author's loop ("you decide when it's done"). The IR needs a bound so a run ends; at it the
 * person decides as at any cap (02 §2, ADR-0093): they keep the draft or allow as many rounds again, once, and at that
 * raised cap keep it or stop the run. The run budget bounds cost before that.
 */
export const AUTHOR_ROUNDS = 10;

/**
 * The inverted loop shared by C6 and C6a: you write or revise every sentence, then three auditors read the same draft
 * in parallel and only point (CUT marks, TELLS flags, a critic's rank among strong examples with its top 3
 * weaknesses). Nothing is edited for you, so their order does not matter (the C6/C6a rule 7 exception).
 */
export function authorLoop(config: 'c6' | 'c6a', writeConsumes: PortType[], domain: TellsDomain): Node {
  return loop(
    'author-loop',
    seq(
      authorWrites('write', writeConsumes),
      render('render'),
      audit('audit', [
        { name: 'cut', body: cutByModel(config, 'cut-marks') },
        { name: 'tells', body: tellsSweep(config, 'tells-flags', [domain]) },
        // A family that never touched the draft; with fewer than 4 exemplars the output is advisory (03).
        { name: 'critic', body: critic(config, 'critic', { mode: 'GREAT', refs: 4, family: 'other', shuffle: true }) },
      ]),
    ),
    humanGate(AUTHOR_ROUNDS),
  );
}

/**
 * C6 Sounding Board (03 C6): you write it; the blocks only point.
 *
 *   D1:: VISION?(angles mined from your own CV, notes and stories; broad, not deep) > ?H react
 *   D2:: ( ?H draft/revise > {{ CUT(mark) ‖ TELLS(flag formula) ‖ @critic:big[a family that never touched the draft]
 *        (view in a pile of N exemplars → rank + top 3 weaknesses) }} )*[H: until you decide it's done]
 *   D3:: VOICE = the whole document (already yours)
 *
 * Exemplars are published winning examples or your own past documents, never other people's private documents.
 */
export const c6: Recipe = withHash({
  schema: 'byway.recipe/1',
  id: 'c6',
  title: 'C6 Sounding Board',
  kind: 'protocol-config',
  family: 'C6',
  channel: 'protocol',
  medium: 'prose',
  inputs: ['intent', 'refs', 'tells'],
  stages: [
    {
      stage: 'D1',
      body: optional(
        'angles-if-wanted',
        'you want angles mined from your own material first',
        seq(modelVision('c6', 'angles', ['intent']), humanVision('react', ['brief'], ['taste'])),
      ),
    },
    { stage: 'D2', body: authorLoop('c6', ['intent'], 'application') },
    { stage: 'D3', body: voice('voice') },
  ],
  sitsOut: [
    { block: 'SEED', reason: 'Distinctiveness must come from true facts about the sender, not randomness (03 C6)' },
    { block: 'ASSET', reason: 'A written document has no asset slot; portfolios go to C1 (03 C6)' },
    { block: 'RELAY', reason: 'No media; portfolios go to C1 (03 C6)' },
  ],
  exceptions: ['C6-DR4', 'C6-DR7'],
  bank: true,
});
