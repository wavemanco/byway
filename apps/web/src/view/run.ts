/**
 * The Run and Result screens' small decisions: which question is "Your turn", how often to poll, how each
 * output is previewed, and the "How this was made" account of who did what.
 */
import type { CheckpointRecord, RunStatus } from '@byway/contracts';
import type { TimelineStage } from './timeline.ts';
import type { StageName, Who } from './vocabulary.ts';

const ENDED: readonly RunStatus[] = ['done', 'failed', 'cancelled'];

export function isEnded(status: RunStatus): boolean {
  return ENDED.includes(status);
}

/**
 * Polling interval in milliseconds, or null to stop. A working run is polled briskly so steps appear as they
 * finish; a run waiting for you, or paused, changes only when you act, so it is polled lazily.
 */
export function pollDelay(status: RunStatus, paused: boolean): number | null {
  if (isEnded(status)) return null;
  if (paused || status === 'waiting') return 3000;
  return 1000;
}

/** The question shown in the "Your turn" panel: the oldest one still open. */
export function activeCheckpoint(checkpoints: CheckpointRecord[]): CheckpointRecord | undefined {
  return checkpoints.filter((c) => c.status === 'open').sort((a, b) => a.openedAt.localeCompare(b.openedAt))[0];
}

/** Runs waiting for you; one run with two open questions is still one run to visit. */
export function waitingRunCount(openCheckpoints: CheckpointRecord[]): number {
  return new Set(openCheckpoints.filter((c) => c.status === 'open').map((c) => c.runId)).size;
}

export type OutputKind = 'page' | 'image' | 'diff' | 'data' | 'text' | 'other';

/** How an output is previewed in a step row or a contact sheet. */
export function outputKind(mediaType: string | undefined): OutputKind {
  const type = mediaType?.split(';')[0]?.trim() ?? '';
  if (type === 'text/html') return 'page';
  if (type.startsWith('image/')) return 'image';
  if (type === 'text/x-diff') return 'diff';
  if (type === 'application/json') return 'data';
  if (type === 'text/markdown' || type === 'text/plain') return 'text';
  return 'other';
}

export interface MadeRow {
  key: string;
  label: string;
  stage: StageName;
  who: Who;
  costUsd: number;
  round: number;
  note?: string;
}

export interface HowItWasMade {
  rows: MadeRow[];
  /** Steps that did not run, and why. */
  skipped: { label: string; note?: string }[];
  byWho: Record<Who, number>;
  totalUsd: number;
}

/** The Result screen's account of the run: the steps that ran, who did each, and the cost (spec §5). */
export function howItWasMade(stages: TimelineStage[]): HowItWasMade {
  const rows: MadeRow[] = [];
  const skipped: HowItWasMade['skipped'] = [];
  const byWho: Record<Who, number> = { you: 0, ai: 0, tool: 0 };
  let total = 0;
  for (const stage of stages) {
    for (const s of stage.steps) {
      if (s.status === 'skipped') {
        skipped.push({ label: s.label, ...(s.note ? { note: s.note } : {}) });
        continue;
      }
      if (s.status !== 'done') continue;
      rows.push({ key: s.key, label: s.label, stage: s.stage, who: s.who, costUsd: s.costUsd, round: s.round, ...(s.note ? { note: s.note } : {}) });
      byWho[s.who]++;
      total += s.costUsd;
    }
  }
  return { rows, skipped, byWho, totalUsd: Math.round(total * 100) / 100 };
}
