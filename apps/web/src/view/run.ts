/**
 * The Run and Result screens' small decisions: which question is "Your turn", how often to poll, how each
 * output is previewed, and the "How this was made" account of who did what.
 */
import type { CheckpointRecord, RunRecord, RunStatus } from '@byway/contracts';
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
export function pollDelay(status: RunStatus): number | null {
  if (isEnded(status)) return null;
  if (status === 'paused' || status === 'waiting') return 3000;
  return 1000;
}

/** The question shown in the "Your turn" panel: the oldest one still open. */
export function activeCheckpoint(checkpoints: CheckpointRecord[]): CheckpointRecord | undefined {
  return checkpoints.filter((c) => c.status === 'open').sort((a, b) => a.openedAt.localeCompare(b.openedAt))[0];
}

/**
 * Questions you can still answer: open ones whose run has not ended. Since contracts v4 the runner withdraws a run's
 * open questions when it is cancelled or fails (status 'withdrawn'), so the run filter only matters for runs that
 * ended before that, and for the moment between a run ending and the withdrawal landing.
 */
export function liveQuestions(openCheckpoints: CheckpointRecord[], runs: Pick<RunRecord, 'id' | 'status'>[]): CheckpointRecord[] {
  const live = new Set(runs.filter((r) => !isEnded(r.status)).map((r) => r.id));
  return openCheckpoints.filter((c) => c.status === 'open' && live.has(c.runId));
}

/** Runs waiting for you; one run with two open questions is still one run to visit. */
export function waitingRunCount(openCheckpoints: CheckpointRecord[], runs: Pick<RunRecord, 'id' | 'status'>[]): number {
  return new Set(liveQuestions(openCheckpoints, runs).map((c) => c.runId)).size;
}

export type OutputKind = 'page' | 'image' | 'video' | 'diff' | 'data' | 'text' | 'other';

/** How an output is previewed in a step row or a contact sheet. */
export function outputKind(mediaType: string | undefined): OutputKind {
  const type = mediaType?.split(';')[0]?.trim() ?? '';
  if (type === 'text/html') return 'page';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
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

export interface SkippedStep {
  key: string;
  label: string;
  note?: string;
  /** Only part of this step was skipped; the rest ran (UX-7). */
  part?: boolean;
}

export interface HowItWasMade {
  rows: MadeRow[];
  /** Steps that were skipped, wholly or in part, and why (ADR-0069: the result says what was not done). */
  skipped: SkippedStep[];
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
        skipped.push({ key: s.key, label: s.label, ...(s.note ? { note: s.note } : {}) });
        continue;
      }
      if (s.status !== 'done') continue;
      for (const [i, p] of s.skippedParts.entries()) skipped.push({ key: `${s.key}:part:${i}`, label: s.label, part: true, ...(p.note ? { note: p.note } : {}) });
      rows.push({ key: s.key, label: s.label, stage: s.stage, who: s.who, costUsd: s.costUsd, round: s.round, ...(s.note ? { note: s.note } : {}) });
      byWho[s.who]++;
      total += s.costUsd;
    }
  }
  return { rows, skipped, byWho, totalUsd: Math.round(total * 100) / 100 };
}

export interface SideImage {
  artifactId: string;
  label?: string;
  /** The shown step that made it ("Custom imagery"). */
  step: string;
}

/**
 * Images Custom imagery (ASSET) made in a run whose deliverable cannot hold them: Idea Generator's rough mood boards
 * for the chosen option (UX-8). They are shown beside the options, apart from the decision, and each can be downloaded.
 */
export function sideImages(stages: TimelineStage[]): SideImage[] {
  return stages.flatMap((stage) =>
    stage.steps
      .filter((s) => s.block === 'ASSET')
      .flatMap((s) =>
        s.artifacts
          .filter((a) => outputKind(a.mediaType) === 'image')
          .map((a) => ({ artifactId: a.artifactId, ...(a.label ? { label: a.label } : {}), step: s.label })),
      ),
  );
}
