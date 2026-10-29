/**
 * What an answer to a run's question would cost, said beside the question (UX-4 remainder, B-107). The workflow asks
 * "Run this step?" for an optional, "Is this ready?" (or, at the last planned round, its cap's question) for a loop a
 * person ends, "Use the best version so far?" and "The outside critique is not improving the work. Keep going anyway?"
 * for a critic or check loop, and "It did not pass the final check, even after another try. Use it anyway?" for a gate.
 * Its words say what each answer does, not what it costs: the runner has no estimator, and putting a figure into the
 * workflow's own words would change the workflow bundle (ADR-0078). So the server prices each open question with the
 * advisor's estimator and the run's own profile (Advisor estimateQuestions), sized by the run's problem and by the work
 * beside the question (B-106, B-108; server/api.ts questionCosts), and the Run screen shows the figure in the
 * Recommendation screen's words: "Estimated cost", the low-to-high range and the AI calls, images and clips.
 */
import type { CheckpointRecord } from '@byway/contracts';
import { formatCostRange, formatWorkRange } from './format.ts';

type Range = { low: number; high: number };

/**
 * One question's figure: what Yes runs for an optional (its step, once), No for a person's loop (one more round), the
 * answer that goes on for a critic or check loop (each further round), Yes for a failed gate (the rest of the run).
 */
export interface QuestionCost {
  asks: 'optional' | 'round' | 'cap' | 'gate';
  /** The answer that buys the work the figure is for. */
  answer: 'Yes' | 'No';
  lowUsd: number;
  highUsd: number;
  calls: Range;
  images?: Range;
  clips?: Range;
}

/** Each open question's figure, by its checkpoint's id. */
export type QuestionCosts = Record<string, QuestionCost>;

const WHAT: Record<QuestionCost['asks'], string> = {
  optional: 'Estimated cost',
  round: 'Estimated cost of the next round,',
  cap: 'Estimated cost of each further round,',
  gate: 'Estimated cost of the rest of the run,',
};

/** The sentence beside an open question, or null: only a yes/no question that commits money has one. */
export function questionCost(cp: Pick<CheckpointRecord, 'id' | 'kind'>, costs: QuestionCosts | null | undefined): string | null {
  if (!costs || cp.kind !== 'confirm' || !Object.hasOwn(costs, cp.id)) return null;
  const q = costs[cp.id] as QuestionCost;
  return `${WHAT[q.asks]} if you say ${q.answer}: ${formatCostRange(q.lowUsd, q.highUsd)} (${formatWorkRange(q.calls, q.images, q.clips)}).`;
}
