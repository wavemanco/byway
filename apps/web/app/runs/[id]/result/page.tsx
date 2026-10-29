import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ResultView } from '../../../../src/components/result/ResultView.tsx';
import { recipeForRun, unusedAnswersOf } from '../../../../src/server/api.ts';
import { getDeps } from '../../../../src/server/deps.ts';
import { artifactInfo } from '../../../../src/server/run-data.ts';
import { parseStoryboard, storyboardArtifacts } from '../../../../src/view/result.ts';
import { howItWasMade, resultImages } from '../../../../src/view/run.ts';
import { buildTimeline } from '../../../../src/view/timeline.ts';

export async function generateMetadata({ params }: PageProps<'/runs/[id]/result'>): Promise<Metadata> {
  const { id } = await params;
  const { services } = await getDeps();
  const run = await services.store.getRun(id);
  return { title: run ? `Result: ${run.title}` : 'Result not found' };
}

/** Result (spec §5, screen 4): the deliverable in its own viewer, export, and how it was made. */
export default async function ResultPage({ params }: PageProps<'/runs/[id]/result'>) {
  const { id } = await params;
  const deps = await getDeps();
  const { services } = deps;
  const run = await services.store.getRun(id);
  if (!run) notFound();

  if (run.status !== 'done' || !run.outputArtifactId || !(await services.store.artifacts.has(run.outputArtifactId))) {
    return (
      <div className="page">
        <div className="empty">
          <h1>No result yet</h1>
          <p>{run.status === 'done' ? 'This run finished without a deliverable.' : 'This run has not finished. Its result appears here when it does.'}</p>
          <Link className="button button-primary" href={`/runs/${run.id}`}>
            Go to the run
          </Link>
        </div>
      </div>
    );
  }

  const view = await services.runner.view(run.id);
  const { presentation, label, steps } = await recipeForRun(deps, run);
  // An answer of yours the run left unused is said with its step (F01 (a)).
  const unused = await unusedAnswersOf(deps, run);
  const timeline = buildTimeline(view.events, view.checkpoints, run.status, steps, unused);
  const made = howItWasMade(timeline);
  const { record, bytes } = await services.store.artifacts.get(run.outputArtifactId);
  const mediaType = record.mediaType.split(';')[0]?.trim() ?? 'text/plain';
  const held = mediaType.startsWith('image/') ? '' : new TextDecoder().decode(bytes);
  const text = mediaType === 'text/html' || mediaType.startsWith('image/') ? null : held;
  // What Custom imagery made that the deliverable does not hold is shown beside it (UX-8, B-047).
  const images = resultImages(run.medium, timeline, held);
  // A storyboard shows frames and clips; each is shown by its media type (a real clip plays, a placeholder is an image).
  const board = run.medium === 'media' && text !== null ? parseStoryboard(text) : null;
  const media = board ? await artifactInfo(services, storyboardArtifacts(board)) : {};

  return (
    <div className="page page-result">
      <ResultView
        run={run}
        artifactId={run.outputArtifactId}
        mediaType={mediaType}
        text={text}
        made={made}
        media={media}
        images={images}
        presentation={presentation ?? null}
        label={label ?? null}
      />
    </div>
  );
}
