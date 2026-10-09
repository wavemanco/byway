/**
 * The Run screen's data, shared by the route handler that serves it and the client that polls it: the runner's
 * view of the run (whose status says whether it is paused, and whose events carry the budget and spend), plus
 * the media type and a text excerpt of each artifact it shows, so step rows and contact sheets render drafts
 * without fetching each artifact.
 *
 * The excerpt says what it is (F13, ADR-0086): a view that shows it either is a snippet by design (a step row, a pick
 * card, a thumbnail) or says it is partial and loads the whole text (a large preview). Facts a row states about the
 * whole artifact (a diff's size, an option map's titles) are counted on the server from the whole bytes.
 */
import type { RunView } from '@byway/contracts';

export interface ArtifactInfo {
  mediaType: string;
  /**
   * For text media: the opening of the text, at most 16,000 bytes, cut on a character boundary. It is the whole text
   * only when `complete` is true; otherwise a snippet. Which files may read or set it is reviewed
   * (test/evidence.test.ts).
   */
  excerpt?: string;
  /** For text media: whether `excerpt` is the whole text. */
  complete?: boolean;
  /** For text media: the whole artifact's size in bytes. */
  bytes?: number;
  /** For a diff: its files and changed lines, counted from the whole diff. */
  diffstat?: { files: number; additions: number; deletions: number };
  /** For an option map: every option's title, from the whole JSON. */
  titles?: string[];
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
