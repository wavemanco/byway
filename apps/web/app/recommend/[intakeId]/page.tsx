import type { Metadata } from 'next';
import Link from 'next/link';
import { RecommendationView, type RecipeOption } from '../../../src/components/RecommendationView.tsx';
import { recommendIntake } from '../../../src/server/api.ts';
import { getDeps } from '../../../src/server/deps.ts';
import { workspaceSpend } from '../../../src/view/history.ts';

export const metadata: Metadata = { title: 'Recommendation' };

/** Recommendation (spec §5, screen 2): the recommended recipe, the chooser answers, alternatives, Build my own. */
export default async function RecommendPage({ params }: PageProps<'/recommend/[intakeId]'>) {
  const { intakeId } = await params;
  const deps = await getDeps();
  const intake = deps.intakes.get(intakeId);
  if (!intake) {
    return (
      <div className="page">
        <div className="empty">
          <h1>This problem is no longer here</h1>
          <p>byway keeps a problem in memory until you start a run, and it may have restarted since. Describe it again to get a recommendation.</p>
          <Link className="button button-primary" href="/">
            Go to Start
          </Link>
        </div>
      </div>
    );
  }

  const { services, profileId } = deps;
  const options: Record<string, RecipeOption> = {};
  for (const presentation of services.advisor.catalog()) {
    const recipe = services.recipes.get(presentation.recipeId);
    if (!recipe) continue;
    options[presentation.recipeId] = { presentation, label: services.advisor.label(recipe), estimate: services.advisor.estimate(recipe, profileId) };
  }
  const recommendation = intake.recipeId ? null : await recommendIntake(deps, intakeId);
  // The composed recipe stays on the server; the page gets what it shows.
  const composed = intake.composed ? (({ recipe: _recipe, ...view }) => view)(intake.composed) : null;
  const workspace = await services.store.ensureDefaultWorkspace();
  const spend = workspaceSpend(workspace.budgetUsd, await services.store.listRuns(workspace.id));

  return (
    <div className="page">
      <RecommendationView
        intakeId={intakeId}
        problem={intake.problem.text}
        attachments={intake.problem.attachments?.map((a) => a.name) ?? []}
        recommendation={recommendation}
        chosenRecipeId={intake.recipeId ?? null}
        questions={services.advisor.questions()}
        options={options}
        composed={composed}
        remainingUsd={spend.remainingUsd}
        demo={services.mode === 'demo'}
      />
    </div>
  );
}
