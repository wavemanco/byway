import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RunScreen } from '../../../src/components/run/RunScreen.tsx';
import { recipeForRun } from '../../../src/server/api.ts';
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
  const initial = await getRunData(deps.services, id);
  const { presentation, label } = recipeForRun(deps, run);
  return <RunScreen initial={initial} presentation={presentation ?? null} label={label ?? null} />;
}
