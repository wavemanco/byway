import type { Metadata } from 'next';
import Link from 'next/link';
import { recipeForRun } from '../../src/server/api.ts';
import { getDeps } from '../../src/server/deps.ts';
import { technicalNames } from '../../src/server/technical.ts';
import { formatUsd } from '../../src/view/format.ts';
import { formatWhen } from '../../src/view/history.ts';
import { runStatusLabel } from '../../src/view/labels.ts';
import { groupRuns, type RunListItem } from '../../src/view/runs.ts';
import { recipeTitle } from '../../src/view/vocabulary.ts';

export const metadata: Metadata = { title: 'History' };

function Rows({ items, names, now }: { items: RunListItem[]; names: Map<string, string>; now: Date }) {
  return (
    <ul className="history">
      {items.map(({ run, openCheckpoint }) => (
        <li key={run.id} className="history-row">
          <div className="history-main">
            <Link className="history-title" href={run.status === 'done' ? `/runs/${run.id}/result` : `/runs/${run.id}`}>
              {run.title}
            </Link>
            <p className="history-sub">
              {names.get(run.id) ?? 'Your recipe'}
              {openCheckpoint ? <span className="history-ask"> {openCheckpoint.prompt}</span> : null}
              {run.status === 'failed' && run.error ? <span className="error-text"> {run.error}</span> : null}
            </p>
          </div>
          <span className="run-status" data-status={run.status}>
            {runStatusLabel(run.status)}
          </span>
          <span className="history-cost">{formatUsd(run.costUsd)}</span>
          <span className="history-when">{formatWhen(run.updatedAt, now)}</span>
        </li>
      ))}
    </ul>
  );
}

/** History (spec §5, screen 6): past runs with status and cost; runs waiting for you come first. */
export default async function HistoryPage() {
  const deps = await getDeps();
  const { services, workspaceId } = deps;
  const technical = await technicalNames();
  const runs = await services.store.listRuns(workspaceId);
  const names = new Map<string, string>();
  for (const run of runs) {
    const { presentation } = await recipeForRun(deps, run);
    if (presentation) names.set(run.id, recipeTitle(presentation, technical));
  }
  const groups = groupRuns(runs, await services.store.openCheckpoints(workspaceId));
  const now = new Date();

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>History</h1>
          <p>Runs waiting for you come first. A run cannot move on until you take your turn.</p>
        </div>
      </div>
      {runs.length === 0 ? (
        <div className="empty">
          <h2>No runs yet</h2>
          <p>Describe what you are working on and byway suggests a recipe to run. Your runs, and what each one cost, will be listed here.</p>
          <div className="empty-actions">
            <Link className="button button-primary" href="/">
              Start
            </Link>
            <Link className="button" href="/library">
              Browse the Library
            </Link>
          </div>
        </div>
      ) : (
        <>
          {groups.yourTurn.length > 0 ? (
            <section className="section" aria-labelledby="h-turn">
              <h2 id="h-turn">Your turn</h2>
              <Rows items={groups.yourTurn} names={names} now={now} />
            </section>
          ) : null}
          {groups.working.length > 0 ? (
            <section className="section" aria-labelledby="h-working">
              <h2 id="h-working">Working</h2>
              <Rows items={groups.working} names={names} now={now} />
            </section>
          ) : null}
          {groups.finished.length > 0 ? (
            <section className="section" aria-labelledby="h-finished">
              <h2 id="h-finished">Finished</h2>
              <Rows items={groups.finished} names={names} now={now} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
