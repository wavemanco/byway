/**
 * Label text. Evidence labels are computed by the advisor from the study registry (CR11); the UI only words
 * them, and never more strongly than the verdict allows.
 */
import type { ChooserAnswer, EvidenceLabel, Recommendation, RunStatus } from '@byway/contracts';

const SCOPE_TEXT: Record<EvidenceLabel['scope'], string> = {
  Exact: 'this exact recipe',
  'Derived-from-studied': 'derived from a studied recipe',
  Composed: 'composed',
  Experimental: 'experimental',
  None: '',
};

export function evidenceHeadline(label: EvidenceLabel): string {
  // A composed recipe never inherits its blocks' labels.
  if (label.scope === 'Composed') return 'Composed — not tested';
  if (label.verdict === 'Untested') return 'Untested — not yet studied';
  const scope = SCOPE_TEXT[label.scope];
  return scope ? `${label.verdict} (${scope})` : label.verdict;
}

const STATUS_TEXT: Record<RunStatus, string> = {
  queued: 'Queued',
  running: 'Working',
  waiting: 'Your turn',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function runStatusLabel(status: RunStatus): string {
  return STATUS_TEXT[status];
}

export function fitText(fit: Recommendation['fit']): string {
  return fit === 'strong' ? 'Strong fit' : fit === 'partial' ? 'Partial fit' : 'No clear fit';
}

/** The recommender itself is unstudied (CR11); every recommendation says so. */
export const ROUTING_NOTE = 'How byway picks a recipe has not been tested yet. Treat it as a starting point.';

/** Under each chooser question: why it is answered as it is, and whether a person or the intake model said so. */
export function answerNote(answer: ChooserAnswer): string {
  if (answer.setBy === 'user') return 'You set this.';
  const sure = answer.confidence >= 0.85 ? 'sure' : answer.confidence >= 0.7 ? 'fairly sure' : 'unsure';
  return `${answer.rationale} (AI read, ${sure})`;
}

/** The chooser's rule (spec §4): answers are in question order and the first yes decides. */
export function decidingQuestion(answers: ChooserAnswer[]): string | undefined {
  return answers.find((a) => a.answer)?.questionId;
}
