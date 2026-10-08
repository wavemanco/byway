import type { CheckpointRecord, CheckpointResolution } from '@byway/contracts';
import type { ArtifactInfo } from '../../../view/rundata.ts';

/** What every "Your turn" panel receives. */
export interface PanelProps {
  cp: CheckpointRecord;
  artifacts: Record<string, ArtifactInfo>;
  busy: boolean;
  onSubmit: (resolution: CheckpointResolution) => void;
  /** Id of the question's heading, for aria-describedby on the panel's fields. */
  promptId: string;
}
