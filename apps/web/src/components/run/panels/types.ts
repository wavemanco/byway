import type { CheckpointRecord, CheckpointResolution } from '@byway/contracts';
import type { CheckpointDraft } from '../../../view/checkpoints.ts';
import type { ArtifactInfo } from '../../../view/rundata.ts';

/** What every "Your turn" panel receives. */
export interface PanelProps {
  cp: CheckpointRecord;
  artifacts: Record<string, ArtifactInfo>;
  busy: boolean;
  onSubmit: (resolution: CheckpointResolution) => void;
  /** Id of the question's heading, for aria-describedby on the panel's fields. */
  promptId: string;
  /**
   * Id of the cost said under the question, when it has one (only a yes/no question an optional or a person's loop
   * asks: view/questions.ts): the answers that would spend it are described by it.
   */
  costId?: string;
  /**
   * What the person had entered for this question when the panel opened, from the Run screen's draft store (F06,
   * ADR-0082). A panel seeds its state from it once and never re-reads it, so nothing changes under the person.
   */
  draft: CheckpointDraft;
  /** Every change, written through to the draft store, so a remount (or a reload) opens the panel as it was left. */
  onDraft: (draft: CheckpointDraft) => void;
  /** The answer was accepted and the screen is waiting for byway to confirm it: the turn stays locked, as sent. */
  sent: boolean;
}
