/**
 * A person's unsent answers to "Your turn" questions (F06, ADR-0082). The answer being typed belongs to its question,
 * not to the panel that happens to show it: looking at an earlier step, a reload, Back, the run ending or a stale
 * snapshot all unmount the panel, and a draft kept in the panel's own state was silently replaced by the model's
 * starting text, which one Ctrl+Enter could then send as the person's words.
 *
 * These are the pure rules; components/run/draftStore.ts applies them.
 * - One definition of what an untouched panel holds (startingDraft), so "is this the person's work?" (isDirty) has
 *   one answer, compared as the resolution it would send.
 * - Which drafts outlive a reload (persisted): typed text and deliberate ticks. Compare and Choose highlights are set
 *   by moving or flipping; restored after a reload they would let a stray Enter keep a version the person only looked
 *   at (UX-1), so they live only in memory.
 * - A stored draft restores only into the same question and kind, and only with options that question offers.
 * - A draft is settled only by server state (settle): never by a component unmounting, and never ended by a snapshot
 *   that merely does not list its question.
 * - Whether a question can be answered is read from the whole snapshot (answerable): the server can return a run
 *   whose terminal status was written before its open questions were withdrawn.
 */
import type { CheckpointKind, CheckpointRecord, CheckpointResolution, RunStatus } from '@byway/contracts';
import { CHECKPOINT_KINDS, emptyDraft, picksNeeded, toResolution, type CheckpointDraft } from './checkpoints.ts';
import { parseOnScreenCopy, serializeOnScreenCopy } from './onscreen.ts';
import { isEnded } from './run.ts';

/** What an untouched panel holds: the checkpoint's starting state, with on-screen copy (C4) as its labelled fields. */
export function startingDraft(cp: CheckpointRecord): CheckpointDraft {
  const draft = emptyDraft(cp);
  if (cp.kind !== 'write') return draft;
  const fields = parseOnScreenCopy(cp.initialText);
  return fields ? { ...draft, items: fields.map((f) => f.value), text: serializeOnScreenCopy(fields) } : draft;
}

export function sameResolution(a: CheckpointResolution, b: CheckpointResolution): boolean {
  const choice = (r: CheckpointResolution) => JSON.stringify(r.choice ?? null);
  return a.checkpointId === b.checkpointId && choice(a) === choice(b) && (a.text ?? null) === (b.text ?? null) && (a.approved ?? null) === (b.approved ?? null);
}

/** Whether the draft is the person's work: it would send something other than the untouched panel would. */
export function isDirty(cp: CheckpointRecord, draft: CheckpointDraft): boolean {
  return !sameResolution(toResolution(cp, draft), toResolution(cp, startingDraft(cp)));
}

/** R3: a question can be answered while it is open and its run has not ended. */
export function answerable(cp: CheckpointRecord, runStatus: RunStatus): boolean {
  return cp.status === 'open' && !isEnded(runStatus);
}

const PERSISTED: ReadonlySet<CheckpointKind> = new Set(['write', 'react', 'directive', 'pick', 'select']);
const TEXT_KINDS: ReadonlySet<CheckpointKind> = new Set(['write', 'react', 'directive']);

/** Whether a kind's draft is kept across a reload in this tab (sessionStorage), not just in memory. */
export function persisted(kind: CheckpointKind): boolean {
  return PERSISTED.has(kind);
}

/** A draft as the store keeps it: for which question, of which kind, and whether it has been sent. */
export interface StoredDraft {
  id: string;
  kind: CheckpointKind;
  draft: CheckpointDraft;
  /** Sent and accepted, waiting for a snapshot that shows the question closed. */
  sent?: true;
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** A stored draft read back from storage, or null for anything malformed. */
export function decodeStoredDraft(raw: unknown): StoredDraft | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !(CHECKPOINT_KINDS as readonly unknown[]).includes(r.kind)) return null;
  if (r.sent !== undefined && r.sent !== true) return null;
  const d = r.draft as Record<string, unknown> | null;
  if (typeof d !== 'object' || d === null) return null;
  if (!isStrings(d.choice) || typeof d.text !== 'string' || !isStrings(d.items)) return null;
  if (d.approved !== null && typeof d.approved !== 'boolean') return null;
  const draft: CheckpointDraft = { choice: d.choice, text: d.text, items: d.items, approved: d.approved };
  return { id: r.id, kind: r.kind as CheckpointKind, draft, ...(r.sent ? { sent: true } : {}) };
}

/**
 * The draft to restore into this question, or null when the stored one belongs to another question or kind. Choices
 * keep only options the question offers, without repeats, and at most k for a pick.
 */
export function sanitize(cp: CheckpointRecord, stored: StoredDraft): CheckpointDraft | null {
  if (stored.id !== cp.id || stored.kind !== cp.kind) return null;
  const offered = new Set((cp.options ?? []).map((o) => o.id));
  let choice = [...new Set(stored.draft.choice)].filter((c) => offered.has(c));
  if (cp.kind === 'pick') choice = choice.slice(0, picksNeeded(cp));
  return { ...stored.draft, choice, items: [...stored.draft.items] };
}

/**
 * What server state means for a draft:
 * - 'keep': its question can still be answered, and it has not been sent; or the snapshot does not list its question
 *   while the run goes on, because a snapshot can predate the question (Back shows the Next.js router cache's copy of the
 *   page, rendered before the question opened), and only a listed, closed question may end a draft;
 * - 'unlock': it was sent, but the server still shows the question open (server state wins: answer again);
 * - 'drop': it was sent and its question closed, its answer landed (the stored resolution is the draft, after a lost
 *   response or a reload mid-send), it is not the person's work, or the run has ended without listing its question
 *   (a question cannot open after its run ended);
 * - 'unsent': text left on a question that closed unanswered (withdrawn, answered elsewhere, or its run ended); it is
 *   shown read-only so it can be copied, and it can never be sent.
 */
export type Settlement = 'keep' | 'unlock' | 'drop' | 'unsent';

export function settle(entry: StoredDraft, cp: CheckpointRecord | undefined, runStatus: RunStatus): Settlement {
  if (!cp) return isEnded(runStatus) ? 'drop' : 'keep';
  if (cp.kind !== entry.kind) return 'drop';
  if (answerable(cp, runStatus)) return entry.sent ? 'unlock' : 'keep';
  if (entry.sent) return 'drop';
  if (cp.status === 'resolved' && cp.resolution && sameResolution(cp.resolution, toResolution(cp, entry.draft))) return 'drop';
  return TEXT_KINDS.has(cp.kind) && isDirty(cp, entry.draft) ? 'unsent' : 'drop';
}

/** Unsent words as they would have been sent. */
export function unsentText(cp: CheckpointRecord, draft: CheckpointDraft): string {
  return toResolution(cp, draft).text ?? '';
}
