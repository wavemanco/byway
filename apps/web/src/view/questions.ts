/**
 * What an answer to a run's question would cost, said beside the question (UX-4 remainder). The workflow asks "Run this
 * step?" for an optional and "Is this ready?" (or, at the last planned round, its cap's question) for a loop a person
 * ends, and its words say what each answer does, not what it costs: the runner has no estimator, and putting a figure
 * into the workflow's own words would change the workflow bundle (ADR-0078). So the server prices each such question
 * with the advisor's estimator and the run's own profile (Advisor estimateQuestions), and the Run screen shows the
 * figure in the Recommendation screen's words: "Estimated cost", the low-to-high range and the AI calls.
 */
import type { CheckpointRecord } from '@byway/contracts';
import { formatCallRange, formatCostRange } from './format.ts';

/** One question's figure: what Yes runs for an optional (its step, once), or No for a person's loop (one more round). */
export interface QuestionCost {
  asks: 'optional' | 'round';
  lowUsd: number;
  highUsd: number;
  calls: { low: number; high: number };
}

/** Each question's figure by the id of the optional or loop that asks it, which is the stepId its checkpoints carry. */
export type QuestionCosts = Record<string, QuestionCost>;

/**
 * The sentence beside an open question, or null: only a yes/no question an optional or a person's loop asks has one.
 * The loop's figure is one round's: No to "Is this ready?" starts one, and No at the cap allows more, each asked again.
 */
export function questionCost(cp: Pick<CheckpointRecord, 'stepId' | 'kind'>, costs: QuestionCosts | null | undefined): string | null {
  if (!costs || cp.kind !== 'confirm' || !Object.hasOwn(costs, cp.stepId)) return null;
  const q = costs[cp.stepId] as QuestionCost;
  const figure = `${formatCostRange(q.lowUsd, q.highUsd)} (${formatCallRange(q.calls)})`;
  return q.asks === 'optional' ? `Estimated cost if you say Yes: ${figure}.` : `Estimated cost of the next round, if you say No: ${figure}.`;
}
