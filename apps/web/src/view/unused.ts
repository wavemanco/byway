/**
 * The answers of yours a finished run left unused (F01 (a); ADR-0098 decision 7, the owner's choice of 2026-10-29: "Tell
 * the person at run time"). A recipe is admitted when some path hands your list on to the work, so a run that goes
 * another way (a route branch it did not take, a gate that ended the round first, an AI list that found nothing) can
 * leave it unapplied. Nothing is refused for it; the Run screen says so plainly, beside the question and with how the run
 * ended, and the Result's steps say it too. Worked out from what ran (@byway/recipe unusedAnswers), on the server, once
 * the run has finished: until then a later step may still take the answer in.
 */
import type { RunView } from '@byway/contracts';
import { unusedAnswers, type Recipe } from '@byway/recipe';
import type { UnusedAnswerNote } from './rundata.ts';

/** What the run says of an answer of yours that no step after it took into the work, naming the question. */
export function unusedAnswerNote(question: string): string {
  return `Your answer to “${question.trim()}” went unused: no step that ran after it took it into the work, so the result does not reflect it.`;
}

/** The finished run's unused answers, each with its note; none for a run that has not finished with its work. */
export function unusedAnswerNotes(recipe: Recipe, view: Pick<RunView, 'run' | 'events' | 'checkpoints'>): UnusedAnswerNote[] {
  if (view.run.status !== 'done') return [];
  return unusedAnswers(recipe, view.events, view.checkpoints).map((u) => ({ checkpointId: u.checkpointId, question: u.question, note: unusedAnswerNote(u.question) }));
}
