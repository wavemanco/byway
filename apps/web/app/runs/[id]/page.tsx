import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RunScreen } from '../../../src/components/run/RunScreen.tsx';
import { questionCosts, recipeForRun, unusedAnswersOf } from '../../../src/server/api.ts';
import { getDeps } from '../../../src/server/deps.ts';
import { getRunData } from '../../../src/server/run-data.ts';

export async function generateMetadata({ params }: PageProps<'/runs/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const { services } = await getDeps();
  const run = await services.store.getRun(id);
  return { title: run ? run.title : 'Run not found' };
}

/** Run (spec §5, screen 3): the timeline, the "Your turn" panel, the cost meter, Pause and Cancel. */
export default async function RunPage({ params }: PageProps<'/runs/[id]'>) {
  const { id } = await params;
  const deps = await getDeps();
  const run = await deps.services.store.getRun(id);
  if (!run) notFound();
  // With what each open question would cost, priced on the work beside it (api.ts questionCosts), and a finished run's
  // unused answers (api.ts unusedAnswersOf), as every poll has them.
  const initial = await getRunData(deps.services, id, 0, (r, cps) => questionCosts(deps, r, cps), (r) => unusedAnswersOf(deps, r));
  const { presentation, label, steps } = await recipeForRun(deps, run);
  // Keyed by the run: the screen owns per-run state (its refresher and the person's drafts, ADR-0082).
  return <RunScreen key={id} initial={initial} presentation={presentation ?? null} label={label ?? null} steps={steps ?? null} />;
}
