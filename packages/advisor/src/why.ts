import type { RecipePresentation } from '@byway/contracts';
import type { Routed, RoutedAnswer } from './routing.ts';

/**
 * The "why" lines of a recommendation, in plain words. They say which chooser answer decided and who gave it; they
 * never claim the recipe works (CR11: no "proven", "research-backed", "studies show", "outperforms").
 */

/** A sentence ends with one stop, whatever the model's rationale ended with. */
const sentence = (s: string) => {
  const t = s.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

const source = (a: RoutedAnswer) => (a.answer.setBy === 'user' ? 'You said yes.' : sentence(`The intake read your problem as a yes: ${a.answer.rationale}`));

export function whyRecommended(routed: Routed, presentation: RecipePresentation): string {
  if (!routed.deciding) {
    return `None of the chooser's questions was answered yes, so this is its general recipe for everyday documents, ${presentation.name}. If it does not fit, build your own recipe from the blocks.`;
  }
  const d = routed.deciding;
  const unsure = routed.fit === 'partial' ? ' The intake was not sure about this answer, so check it below.' : '';
  return `${presentation.name} is the recipe for the first question answered yes: "${d.question.text}" ${source(d)}${unsure}`;
}

export function whyAlternative(a: RoutedAnswer): string {
  return `Also answered yes: "${a.question.text}" ${source(a)}`;
}
