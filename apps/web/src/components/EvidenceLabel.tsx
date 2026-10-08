import type { EvidenceLabel as Label } from '@byway/contracts';
import { evidenceHeadline } from '../view/labels.ts';

/** A computed evidence label (CR11), shown as plainly as it is. */
export function EvidenceLabel({ label, withSummary = false }: { label: Label; withSummary?: boolean }) {
  return (
    <span className="evidence-wrap">
      <span className="evidence">{evidenceHeadline(label)}</span>
      {withSummary && label.summary ? <span className="evidence-summary">{label.summary}</span> : null}
    </span>
  );
}
