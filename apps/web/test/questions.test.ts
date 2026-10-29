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

const cp = (stepId: string, kind: CheckpointKind = 'confirm', prompt = 'Question?'): CheckpointRecord => ({ id: `r1/cp1-${stepId}`, runId: 'r1', stepId, kind, prompt, status: 'open', openedAt: '2026-10-22T10:00:00.000Z' });

/** Each open question's figure, by its checkpoint's id (the server prices each one open, on the work beside it). */
const COSTS: QuestionCosts = {
  [cp('framings-if-wanted').id]: { asks: 'optional', answer: 'Yes', lowUsd: 0.04, highUsd: 0.12, calls: { low: 1, high: 1 } },
  [cp('claim-log').id]: { asks: 'optional', answer: 'Yes', lowUsd: 0, highUsd: 0, calls: { low: 0, high: 0 } },
  [cp('author-loop').id]: { asks: 'round', answer: 'No', lowUsd: 0.2, highUsd: 0.65, calls: { low: 3, high: 4 } },
  [cp('critic-loop').id]: { asks: 'cap', answer: 'No', lowUsd: 0.05, highUsd: 0.18, calls: { low: 2, high: 2 } },
  [cp('launch-gate').id]: { asks: 'gate', answer: 'Yes', lowUsd: 0.1, highUsd: 0.4, calls: { low: 2, high: 3 }, images: { low: 1, high: 3 }, clips: { low: 0, high: 0 } },
  [cp('asset-if-plain').id]: { asks: 'optional', answer: 'Yes', lowUsd: 0.12, highUsd: 0.3, calls: { low: 2, high: 2 }, images: { low: 1, high: 3 }, clips: { low: 3, high: 4 } },
};

describe('the cost said beside a question', () => {
  it("an optional's: what Yes would cost, as the Recommendation screen says a cost", () => {
    expect(questionCost(cp('framings-if-wanted'), COSTS)).toBe('Estimated cost if you say Yes: $0.04–$0.12 (1 AI call).');
    expect(questionCost(cp('claim-log'), COSTS)).toBe('Estimated cost if you say Yes: $0.00 (0 AI calls).');
  });

  it("a person's loop's: what No would cost, which is one more round", () => {
    expect(questionCost(cp('author-loop'), COSTS)).toBe('Estimated cost of the next round, if you say No: $0.20–$0.65 (3–4 AI calls).');
  });

  // B-107: the other questions that lead to paid work.
  it("a critic or check loop's: each further round, with the answer that goes on; a failed gate's: the rest of the run", () => {
    expect(questionCost(cp('critic-loop'), COSTS)).toBe('Estimated cost of each further round, if you say No: $0.05–$0.18 (2 AI calls).');
    expect(questionCost(cp('launch-gate'), COSTS)).toBe('Estimated cost of the rest of the run, if you say Yes: $0.10–$0.40 (2–3 AI calls and 1–3 images).');
  });

  // B-109: the dollars include images and clips, so the words count them too.
  it('counts the images and video clips the figure pays for beside the AI calls', () => {
    expect(questionCost(cp('asset-if-plain'), COSTS)).toBe('Estimated cost if you say Yes: $0.12–$0.30 (2 AI calls, 1–3 images and 3–4 video clips).');
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
    expect(html).toMatch(/Yes runs it; No skips it\.<\/h2><p id="[^"]+" class="turn-cost">Estimated cost if you say Yes: \$0\.04–\$0\.12 \(1 AI call\)\.<\/p><\/header>/);
    expect(shown(record, null)).not.toContain('turn-cost');
  });

  // A screen reader hears the cost with the answer that has focus, as the sandbox's turn-off confirmation reads its risk
  // (D2's WEB-1): the question still describes the group, and the cost describes each answer.
  it('describes each answer by it, for a screen reader, and the group by the question', () => {
    const record = cp('author-loop', 'confirm', 'Is this ready? Yes keeps this version and moves on; No starts another round.');
    const html = shown(record, questionCost(record, COSTS));
    const costId = /<p id="([^"]+)" class="turn-cost">/.exec(html)?.[1];
    const promptId = /<h2 id="([^"]+)"/.exec(html)?.[1];
    expect(costId).toBeDefined();
    expect(costId).not.toBe(promptId);
    expect(html).toContain(`<div class="yes-no" role="group" aria-describedby="${promptId}">`);
    const answers = [...html.matchAll(/<button[^>]*>(Yes|No)<\/button>/g)];
    expect(answers.map((m) => m[1])).toEqual(['Yes', 'No']);
    for (const [button] of answers) expect(button).toContain(`aria-describedby="${costId}"`);
    // With no cost, an answer is described by nothing of its own.
    expect([...shown(record, null).matchAll(/<button[^>]*>(?:Yes|No)<\/button>/g)].map(([b]) => b).join('')).not.toContain('aria-describedby');
  });
});
