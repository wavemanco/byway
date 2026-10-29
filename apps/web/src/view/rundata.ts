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
import type { QuestionCosts } from './questions.ts';

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

/**
 * For a run that has ended, what the spend book holds for it: how many of its AI calls are still under way, and its
 * settled cost. The run shows Cancelled or Failed at once, while a call byway does not cut off (Google's text calls, every
 * image call) is still under way; that call's cost is added to the run when it settles, so the screen keeps polling
 * while one is under way and shows the settled cost (ADR-0111).
 */
export interface EndedSpend {
  callsUnderWay: number;
  settledUsd: number;
}

/**
 * An answer of yours that the finished run left unused (F01 (a), view/unused.ts): the question it answered, as you were
 * asked it, and what the Run and Result screens say of it.
 */
export interface UnusedAnswerNote {
  checkpointId: string;
  question: string;
  note: string;
}

export interface RunData {
  view: RunView;
  artifacts: Record<string, ArtifactInfo>;
  /** Only for a run that has ended, and only when the spend book could be read. */
  ended?: EndedSpend;
  /**
   * What an answer to each open question that commits money would cost, by the checkpoint's id (view/questions.ts),
   * priced while it is open on the work beside it (B-108). Absent when the run's recipe is not known.
   */
  questions?: QuestionCosts;
  /** Only for a run that finished, and only when its recipe is known: the answers of yours it left unused (F01 (a)). */
  unused?: UnusedAnswerNote[];
}

/** Folds a poll (events after the last seen seq) into what the screen already has. */
export function mergeRunData(prev: RunData, next: RunData): RunData {
  const seen = new Set(prev.view.events.map((e) => e.seq));
  const events = [...prev.view.events, ...next.view.events.filter((e) => !seen.has(e.seq))].sort((a, b) => a.seq - b.seq);
  return {
    view: { run: next.view.run, checkpoints: next.view.checkpoints, events },
    artifacts: { ...prev.artifacts, ...next.artifacts },
    // What the latest poll said: an older answer about calls under way, or an older question's figure, is not carried forward.
    ...(next.ended ? { ended: next.ended } : {}),
    ...(next.questions ? { questions: next.questions } : {}),
    // Worked out once the run has finished, from all its events; a later poll of the same run says the same.
    ...((next.unused ?? prev.unused) ? { unused: next.unused ?? prev.unused! } : {}),
  };
}

export function lastSeq(data: RunData): number {
  return data.view.events.reduce((max, e) => Math.max(max, e.seq), 0);
}
