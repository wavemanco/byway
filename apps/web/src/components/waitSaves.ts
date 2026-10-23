/**
 * How Settings' "How long to wait for an answer" saves a choice (AnswerWaits.tsx; WEB-2 of block 2's check). A change
 * saves at once, and a keyboard user stepping a select changes it once per step: arrowing from 15 to 60 is three
 * changes. Sent side by side, those saves could be kept by the server in one order and answered in another, and a
 * section that applied whichever answer came last, or went back on a failure to what it showed when that change began,
 * could end showing and announcing a wait the gateway is not using.
 *
 * So each model's saves go one after another. While one is under way, a newer choice is only shown; once the save under
 * way has its answer, the newest choice is sent (the ones between are never sent), and the server keeps a row's saves
 * in the order they were sent. Only the row's last save decides what it shows and what is said: its answer, the minutes
 * the server kept, or on a failure the last minutes the server kept for it (as the page loaded them, until a save of
 * this section's is kept) with the failure's words. A failed save that a newer choice follows is passed over, since the
 * newer one is sent next. Different models' saves do not wait for each other.
 */
import type { AnswerWait } from '@byway/contracts';
import type { AnswerWaitRow } from '../view/waits.ts';

/** One save: the body of PATCH /api/waits. */
export type WaitChoice = Pick<AnswerWait, 'provider' | 'model' | 'minutes'>;

/** What a row shows: its minutes, and whether someone chose them. */
export type WaitShown = Pick<AnswerWaitRow, 'minutes' | 'chosen'>;

export interface WaitSavesDeps {
  /** Sends one save; resolves with the wait as the server kept it, or rejects with words to show. */
  save: (choice: WaitChoice) => Promise<AnswerWait>;
  /** Shows a row's minutes. */
  show: (provider: string, model: string, shown: WaitShown) => void;
  /** Puts words in the section's live region, or clears it. */
  said: (words: string | null) => void;
  /** Shows why a save failed, or clears it. */
  failed: (words: string | null) => void;
}

/** One model's saves. */
interface RowSaves {
  /** What the server last kept for the model: as the page loaded it, then each save of this section's it kept. */
  kept: WaitShown;
  /** A save is under way. */
  sending: boolean;
  /** The newest choice not sent yet, sent once the save under way has its answer. */
  next: number | undefined;
}

/**
 * The section's choose(row, minutes), called with the row as the section shows it. Its promise settles once the save it
 * started, and every choice made meanwhile, has its answer; a choice made while a save is under way settles at once.
 */
export function waitSaves(deps: WaitSavesDeps): (row: AnswerWaitRow, minutes: number) => Promise<void> {
  const rows = new Map<string, RowSaves>();
  return async (row, minutes) => {
    const key = `${row.provider}\u0000${row.model}`;
    let saves = rows.get(key);
    if (!saves) {
      saves = { kept: { minutes: row.minutes, chosen: row.chosen }, sending: false, next: undefined };
      rows.set(key, saves);
    }
    deps.failed(null);
    deps.said(null);
    deps.show(row.provider, row.model, { minutes, chosen: true });
    saves.next = minutes;
    // The save under way sends this choice once it has its answer.
    if (saves.sending) return;
    saves.sending = true;
    try {
      while (saves.next !== undefined) {
        const sent = saves.next;
        saves.next = undefined;
        try {
          const kept = await deps.save({ provider: row.provider, model: row.model, minutes: sent });
          saves.kept = { minutes: kept.minutes, chosen: true };
          if (saves.next === undefined) {
            deps.show(row.provider, row.model, saves.kept);
            deps.said(`${row.model} now waits ${kept.minutes} minutes, from its next call.`);
          }
        } catch (err) {
          if (saves.next === undefined) {
            deps.show(row.provider, row.model, saves.kept);
            deps.failed(err instanceof Error ? err.message : 'That was not saved. Try again.');
          }
        }
      }
    } finally {
      saves.sending = false;
    }
  };
}
