/**
 * The Run screen's data, shared by the route handler that serves it and the client that polls it: the runner's
 * view of the run (whose status says whether it is paused, and whose events carry the budget and spend), plus
 * the media type and a text excerpt of each artifact it shows, so step rows and contact sheets render drafts
 * without fetching each artifact.
 */
import type { RunView } from '@byway/contracts';

export interface ArtifactInfo {
  mediaType: string;
  /** For text media: the beginning of the text. */
  text?: string;
}

export interface RunData {
  view: RunView;
  artifacts: Record<string, ArtifactInfo>;
}

/** Folds a poll (events after the last seen seq) into what the screen already has. */
export function mergeRunData(prev: RunData, next: RunData): RunData {
  const seen = new Set(prev.view.events.map((e) => e.seq));
  const events = [...prev.view.events, ...next.view.events.filter((e) => !seen.has(e.seq))].sort((a, b) => a.seq - b.seq);
  return {
    view: { run: next.view.run, checkpoints: next.view.checkpoints, events },
    artifacts: { ...prev.artifacts, ...next.artifacts },
  };
}

export function lastSeq(data: RunData): number {
  return data.view.events.reduce((max, e) => Math.max(max, e.seq), 0);
}
