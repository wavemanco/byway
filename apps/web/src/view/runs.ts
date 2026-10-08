/**
 * Ordering runs for History and the header badge: runs waiting for you come first (spec §5, History), because
 * a run cannot move until you take your turn. A paused run is still in progress; it sits with the working ones.
 */
import type { CheckpointRecord, RunRecord } from '@byway/contracts';
import { isEnded, liveQuestions } from './run.ts';

export interface RunListItem {
  run: RunRecord;
  /** The oldest open checkpoint, when the run is waiting for you. */
  openCheckpoint?: CheckpointRecord;
}

type Group = 'yourTurn' | 'working' | 'finished';

function groupOf(item: RunListItem): Group {
  if (item.openCheckpoint || item.run.status === 'waiting') return 'yourTurn';
  return isEnded(item.run.status) ? 'finished' : 'working';
}

const RANK: Record<Group, number> = { yourTurn: 0, working: 1, finished: 2 };

export function orderRuns(runs: RunRecord[], openCheckpoints: CheckpointRecord[]): RunListItem[] {
  const firstOpen = new Map<string, CheckpointRecord>();
  for (const cp of [...liveQuestions(openCheckpoints, runs)].sort((a, b) => a.openedAt.localeCompare(b.openedAt))) {
    if (!firstOpen.has(cp.runId)) firstOpen.set(cp.runId, cp);
  }
  return runs
    .map((run): RunListItem => {
      const cp = firstOpen.get(run.id);
      return cp ? { run, openCheckpoint: cp } : { run };
    })
    .sort((a, b) => RANK[groupOf(a)] - RANK[groupOf(b)] || b.run.updatedAt.localeCompare(a.run.updatedAt));
}

export function groupRuns(runs: RunRecord[], openCheckpoints: CheckpointRecord[]): Record<Group, RunListItem[]> {
  const groups: Record<Group, RunListItem[]> = { yourTurn: [], working: [], finished: [] };
  for (const item of orderRuns(runs, openCheckpoints)) groups[groupOf(item)].push(item);
  return groups;
}
