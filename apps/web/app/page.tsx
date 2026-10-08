import Link from 'next/link';
import { StartForm } from '../src/components/StartForm.tsx';
import { getContext } from '../src/services/index.ts';
import { groupRuns } from '../src/view/runs.ts';

/** Start (spec §5, screen 1): one large field, a few examples, and attachments. */
export default async function StartPage({ searchParams }: PageProps<'/'>) {
  const { services, workspaceId } = await getContext();
  const recipeParam = (await searchParams).recipe;
  const recipeId = typeof recipeParam === 'string' ? recipeParam : undefined;
  const recipe = recipeId ? services.advisor.catalog().find((p) => p.recipeId === recipeId) : undefined;
  const runs = await services.store.listRuns(workspaceId, { limit: 50 });
  const { yourTurn } = groupRuns(runs, await services.store.openCheckpoints(workspaceId));

  return (
    <div className="page page-start">
      <StartForm recipe={recipe ? { recipeId: recipe.recipeId, name: recipe.name, code: recipe.code } : undefined} />
      {yourTurn.length > 0 ? (
        <section className="start-waiting" aria-labelledby="waiting-title">
          <h2 id="waiting-title">Waiting for you</h2>
          <ul className="plain-list">
            {yourTurn.slice(0, 3).map(({ run, openCheckpoint }) => (
              <li key={run.id}>
                <Link href={`/runs/${run.id}`}>{run.title}</Link>
                {openCheckpoint ? <span className="muted"> {openCheckpoint.prompt}</span> : null}
              </li>
            ))}
          </ul>
          {yourTurn.length > 3 ? (
            <p className="small">
              <Link href="/history">See all {yourTurn.length} in History</Link>
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
