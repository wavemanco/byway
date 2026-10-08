import type { ChooserAnswer, ChooserQuestion } from '@byway/contracts';

/**
 * Merging chooser answers from the intake model and from the caller (product spec §4: "the user can flip any answer
 * and the routing re-runs deterministically").
 *
 * Precedence, per question: an answer the user set, then the fresh intake's answer, then an earlier intake answer the
 * caller passed back. A question nobody answered counts as an unanswered "no" (confidence 0), so the UI can still show
 * it as a toggle and routing never treats silence as a yes.
 */

/** Last answer per known question id; answers to unknown questions are dropped. */
function byQuestion(questions: readonly ChooserQuestion[], answers: readonly ChooserAnswer[] | undefined): Map<string, ChooserAnswer> {
  const known = new Set(questions.map((q) => q.id));
  const out = new Map<string, ChooserAnswer>();
  for (const a of answers ?? []) if (known.has(a.questionId)) out.set(a.questionId, a);
  return out;
}

/**
 * Whether the intake model has to be asked: only when some question has no answer from the caller. When the caller
 * passes back a full set (the user flipped one answer on the recommendation screen), routing re-runs without a model
 * call, so it is deterministic and free.
 */
export function needsIntake(questions: readonly ChooserQuestion[], provided: readonly ChooserAnswer[] | undefined): boolean {
  const given = byQuestion(questions, provided);
  return questions.some((q) => !given.has(q.id));
}

/** One answer per question, in chooser order. User answers carry confidence 1 (the contract's rule). */
export function mergeAnswers(
  questions: readonly ChooserQuestion[],
  intake: readonly ChooserAnswer[] | undefined,
  provided: readonly ChooserAnswer[] | undefined,
): ChooserAnswer[] {
  const fresh = byQuestion(questions, intake);
  const given = byQuestion(questions, provided);
  return questions.map((q): ChooserAnswer => {
    const g = given.get(q.id);
    if (g?.setBy === 'user') return { ...g, confidence: 1 };
    const f = fresh.get(q.id);
    if (f) return f;
    if (g) return g;
    return { questionId: q.id, answer: false, confidence: 0, rationale: 'Not answered.', setBy: 'intake' };
  });
}
