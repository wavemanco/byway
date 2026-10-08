import type { Metadata } from 'next';
import Link from 'next/link';
import { EvidenceLabel } from '../../src/components/EvidenceLabel.tsx';
import { Route, RouteLegend } from '../../src/components/Route.tsx';
import { getContext } from '../../src/services/index.ts';
import { technicalNames } from '../../src/server/technical.ts';
import { formatCostRange, formatMinutes } from '../../src/view/format.ts';
import { recipeTitle } from '../../src/view/vocabulary.ts';

export const metadata: Metadata = { title: 'Library' };

function sentenceList(items: string[]): string {
  const lower = items.map((item) => item.charAt(0).toLowerCase() + item.slice(1));
  if (lower.length <= 1) return lower.join('');
  return `${lower.slice(0, -1).join(', ')} and ${lower.at(-1)}`;
}

/** Library (spec §5, screen 5): the eight recipes with their promises and labels; start any directly. */
export default async function LibraryPage() {
  const { services, profileId } = await getContext();
  const technical = await technicalNames();
  const recipes = services.advisor.catalog().flatMap((presentation) => {
    const recipe = services.advisor.recipe(presentation.recipeId);
    return recipe ? [{ presentation, label: services.advisor.label(recipe), estimate: services.advisor.estimate(recipe, profileId) }] : [];
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Library</h1>
          <p>Each recipe is a fixed sequence of steps in three stages. The route shows who does each step.</p>
        </div>
        <RouteLegend />
      </div>
      <ol className="library">
        {recipes.map(({ presentation: p, label, estimate }) => (
          <li key={p.recipeId} className="recipe-row">
            <div className="recipe-main">
              <h2>{recipeTitle(p, technical)}</h2>
              <p className="recipe-promise">{p.promise}</p>
              <p className="recipe-best muted">For {sentenceList(p.bestFor)}.</p>
            </div>
            <div className="recipe-route">
              <Route stages={p.stages} technical={technical} label={`${p.name} steps`} />
            </div>
            <dl className="recipe-facts">
              <div>
                <dt>Your time</dt>
                <dd>{formatMinutes(estimate.humanMinutes)}</dd>
              </div>
              <div>
                <dt>Cost</dt>
                <dd>{formatCostRange(estimate.lowUsd, estimate.highUsd)}</dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd>
                  <EvidenceLabel label={label} />
                </dd>
              </div>
            </dl>
            <div className="recipe-action">
              <Link className="button" href={`/?recipe=${p.recipeId}`}>
                Use this recipe<span className="sr-only">: {p.name}</span>
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
