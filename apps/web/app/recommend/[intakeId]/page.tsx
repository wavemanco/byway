import type { Metadata } from 'next';
import Link from 'next/link';
import { RecommendationView, type RecipeOption } from '../../../src/components/RecommendationView.tsx';
import { composeView, recommendationOrProblem } from '../../../src/server/api.ts';
import { getDeps } from '../../../src/server/deps.ts';
import { workspaceSpend } from '../../../src/view/history.ts';
import { takesRefs } from '../../../src/view/refs.ts';

export const metadata: Metadata = { title: 'Recommendation' };

/**
 * Recommendation (spec §5, screen 2): the recommended recipe, the chooser answers, alternatives, Build my own.
 * `?recipe=` is a recipe chosen from the Library, shown instead of running the chooser.
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
  // A model error (a wrong key, a spent budget, a busy provider) is shown here with a way forward (UX-2).
  const outcome = chosenRecipeId ? null : await recommendationOrProblem(deps, intakeId);
  const recommendation = outcome && 'recommendation' in outcome ? outcome.recommendation : null;
  const recommendProblem = outcome && 'problem' in outcome ? outcome.problem : null;
  // The composed recipe stays on the server; the page gets what it shows.
  const composed = intake.composed ? composeView(intake.composed) : null;
  const workspace = await services.store.ensureDefaultWorkspace();
  const spend = workspaceSpend(workspace.budgetUsd, await services.store.listRuns(workspace.id));

  return (
    <div className="page">
      <RecommendationView
        intakeId={intakeId}
        problem={intake.problem.text}
        attachments={intake.problem.attachments?.map((a) => a.name) ?? []}
        recommendation={recommendation}
        recommendProblem={recommendProblem}
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
