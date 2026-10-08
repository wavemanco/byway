import type { ChooserAnswer, ChooserQuestion } from '@byway/contracts';

/**
 * Deterministic routing over the chooser (product spec §4; 03 "Choosing a configuration"). The intake model only
 * proposes answers; which recipe they lead to is decided here, in code, so the user can flip any answer and get the
 * same result every time.
 */

/** The deciding answer's confidence at or above which the fit is strong (spec §4). */
export const STRONG_FIT = 0.7;

/** How many later "yes" answers are offered as alternatives (spec §4). */
export const MAX_ALTERNATIVES = 2;

export interface RoutedAnswer {
  question: ChooserQuestion;
  answer: ChooserAnswer;
}

export interface Routed {
  recipeId: string;
  fit: 'strong' | 'partial';
  /** The first yes, which decided; undefined when nothing was answered yes. */
  deciding?: RoutedAnswer;
  /** Later yes answers that lead to other recipes, in chooser order. */
  alternatives: RoutedAnswer[];
  /** True when no question was answered yes and the recipe is 03's fallback. */
  fallback: boolean;
}

/**
 * The first yes, in chooser order (order is meaning: 03 asks about option sets before visual work), decides. Answers
 * to unknown questions are ignored. With no yes at all, 03's flowchart ends at its fallback (C4), which the spec makes
 * a partial fit with composing suggested alongside.
 */
export function route(questions: readonly ChooserQuestion[], answers: readonly ChooserAnswer[], fallbackId: string): Routed {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  const yeses: RoutedAnswer[] = [];
  for (const question of questions) {
    const answer = byId.get(question.id);
    if (answer?.answer === true) yeses.push({ question, answer });
  }
  const [deciding, ...later] = yeses;
  if (!deciding) return { recipeId: fallbackId, fit: 'partial', alternatives: [], fallback: true };

  const alternatives: RoutedAnswer[] = [];
  const seen = new Set([deciding.question.routesTo]);
  for (const y of later) {
    if (alternatives.length === MAX_ALTERNATIVES) break;
    if (seen.has(y.question.routesTo)) continue;
    seen.add(y.question.routesTo);
    alternatives.push(y);
  }
  return {
    recipeId: deciding.question.routesTo,
    fit: deciding.answer.confidence >= STRONG_FIT ? 'strong' : 'partial',
    deciding,
    alternatives,
    fallback: false,
  };
}
