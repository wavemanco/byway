/**
 * The figure beside a run's question (UX-4 remainder; view/questions.ts): "Run this step?" says what Yes would cost,
 * and a person's loop's question what No would cost, in the Recommendation screen's words. Any other question says
 * nothing, and so does every question of a run whose recipe is not known. The figures come from the server
 * (api.test.ts, services.test.ts); here, the words and where they go.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CheckpointKind, CheckpointRecord } from '@byway/contracts';
import { YourTurn } from '../src/components/run/YourTurn.tsx';
import { startingDraft } from '../src/view/drafts.ts';
import { questionCost, type QuestionCosts } from '../src/view/questions.ts';

const COSTS: QuestionCosts = {
  'framings-if-wanted': { asks: 'optional', lowUsd: 0.04, highUsd: 0.12, calls: { low: 1, high: 1 } },
  'claim-log': { asks: 'optional', lowUsd: 0, highUsd: 0, calls: { low: 0, high: 0 } },
  'author-loop': { asks: 'round', lowUsd: 0.2, highUsd: 0.65, calls: { low: 3, high: 4 } },
};

const cp = (stepId: string, kind: CheckpointKind = 'confirm', prompt = 'Question?'): CheckpointRecord => ({ id: `r1/cp1-${stepId}`, runId: 'r1', stepId, kind, prompt, status: 'open', openedAt: '2026-10-22T10:00:00.000Z' });

describe('the cost said beside a question', () => {
  it("an optional's: what Yes would cost, as the Recommendation screen says a cost", () => {
    expect(questionCost(cp('framings-if-wanted'), COSTS)).toBe('Estimated cost if you say Yes: $0.04–$0.12 (1 AI call).');
    expect(questionCost(cp('claim-log'), COSTS)).toBe('Estimated cost if you say Yes: $0.00 (0 AI calls).');
  });

  it("a person's loop's: what No would cost, which is one more round", () => {
    expect(questionCost(cp('author-loop'), COSTS)).toBe('Estimated cost of the next round, if you say No: $0.20–$0.65 (3–4 AI calls).');
  });

  it('nothing for any other question, a question that is not yes or no, or a run whose recipe is not known', () => {
    // A model step's id: the budget question a step's refused call asks.
    expect(questionCost(cp('build'), COSTS)).toBeNull();
    // A person's loop also asks its last choice, with options, at its raised cap.
    expect(questionCost(cp('author-loop', 'choose'), COSTS)).toBeNull();
    expect(questionCost(cp('framings-if-wanted'), null)).toBeNull();
    expect(questionCost(cp('constructor'), COSTS)).toBeNull();
  });
});

describe('"Your turn" shows it under the question', () => {
  const shown = (record: CheckpointRecord, cost: string | null) =>
    renderToStaticMarkup(
      createElement(YourTurn, { cp: record, step: undefined, artifacts: {}, busy: false, paused: false, onSubmit: () => undefined, draft: startingDraft(record), onDraft: () => undefined, sent: false, cost }),
    );

  it('as a line of its own after the question, and not at all when there is none', () => {
    const record = cp('framings-if-wanted', 'confirm', 'Run this step? It is meant for when you want framings. Yes runs it; No skips it.');
    const html = shown(record, questionCost(record, COSTS));
    expect(html).toMatch(/Yes runs it; No skips it\.<\/h2><p class="turn-cost">Estimated cost if you say Yes: \$0\.04–\$0\.12 \(1 AI call\)\.<\/p><\/header>/);
    expect(shown(record, null)).not.toContain('turn-cost');
  });
});
