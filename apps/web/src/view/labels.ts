/**
 * Label text. Evidence labels are computed by the advisor from the study registry (CR11); the UI only words
 * them, and never more strongly than the verdict allows.
 */
import type { EvidenceLabel, Recommendation, RunStatus } from '@byway/contracts';

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
