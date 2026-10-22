import type { Metadata } from 'next';
import Link from 'next/link';
import { RecommendationView, type RecipeOption } from '../../../src/components/RecommendationView.tsx';
import { composeView, workspaceRemaining } from '../../../src/server/api.ts';
import { getDeps } from '../../../src/server/deps.ts';
import { takesRefs } from '../../../src/view/refs.ts';

export const metadata: Metadata = { title: 'Recommendation' };

/**
 * Recommendation (spec §5, screen 2): the recommended recipe, the chooser answers, alternatives, Build my own.
 * `?recipe=` is a recipe chosen from the Library, shown instead of running the chooser.
 *
 * The render reads what is stored and calls no model, so the page can be rendered again freely. The first
 * recommendation is asked for by the screen once it is shown (RecommendationView; POST /recommend { ensure: true }),
 * and a model error is shown there with a way forward (UX-2).
 */
export default async function RecommendPage({ params, searchParams }: PageProps<'/recommend/[intakeId]'>) {
  const { intakeId } = await params;
  const chosen = (await searchParams).recipe;
  const deps = await getDeps();
  const { services, profileId } = deps;
  const intake = await services.store.getIntake(intakeId);
  const chosenRecipeId = typeof chosen === 'string' && services.advisor.recipe(chosen) ? chosen : null;
  if (!intake || intake.workspaceId !== deps.workspaceId) {
    return (
      <div className="page">
        <div className="empty">
          <h1>This problem is not here</h1>
          <p>byway could not find it. Describe it again to get a recommendation.</p>
          <Link className="button button-primary" href="/">
            Go to Start
          </Link>
        </div>
      </div>
    );
  }

  const options: Record<string, RecipeOption> = {};
  for (const presentation of services.advisor.catalog()) {
    const recipe = services.advisor.recipe(presentation.recipeId);
    if (!recipe) continue;
    options[presentation.recipeId] = {
      presentation,
      label: services.advisor.label(recipe),
      estimate: services.advisor.estimate(recipe, profileId),
      takesRefs: takesRefs(recipe),
    };
  }
  const recommendation = chosenRecipeId ? null : (intake.recommendation ?? null);
  // The composed recipe stays on the server; the page gets what it shows.
  const composed = intake.composed ? composeView(intake.composed) : null;
  const spend = await workspaceRemaining(deps);

  return (
    <div className="page">
      {/* Keyed by what its state belongs to (ADR-0082): constant while the screen is shown, so it is never re-seeded. */}
      <RecommendationView
        key={`${intakeId}:${chosenRecipeId ?? ''}`}
        intakeId={intakeId}
        problem={intake.problem.text}
        attachments={intake.problem.attachments?.map((a) => a.name) ?? []}
        recommendation={recommendation}
        chosenRecipeId={chosenRecipeId}
        questions={services.advisor.questions()}
        options={options}
        composed={composed}
        remainingUsd={spend.remainingUsd}
        demo={services.mode === 'demo'}
      />
    </div>
  );
}
