import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { artifactUrl } from '../../../src/components/api.ts';
import { ArtifactViewer, artifactName } from '../../../src/components/ArtifactViewer.tsx';
import { isArtifactId } from '../../../src/server/artifacts.ts';
import { getDeps } from '../../../src/server/deps.ts';
import { artifactInfo } from '../../../src/server/run-data.ts';
import { parseStoryboard, storyboardArtifacts } from '../../../src/view/result.ts';
import { outputKind } from '../../../src/view/run.ts';

/** The id as asked for: a link encodes it (openHref), a typed address may not. */
function idOf(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: PageProps<'/view/[id]'>): Promise<Metadata> {
  const id = idOf((await params).id);
  if (!isArtifactId(id)) return { title: 'Not found' };
  const { services } = await getDeps();
  if (!(await services.store.artifacts.has(id))) return { title: 'Not found' };
  const { record } = await services.store.artifacts.get(id);
  return { title: artifactName(record.mediaType) };
}

/**
 * The whole-artifact viewer (F05, F13; ADR-0085): every in-app "Open" lands here. It is an app screen, so the app's CSP
 * applies, and a page is shown in a frame whose scripts are off until the person turns them on for this visit. Text is
 * read whole from the store, never the Run screen's excerpt. A type it cannot show goes to the raw address, which
 * serves it inert.
 */
export default async function ViewPage({ params }: PageProps<'/view/[id]'>) {
  const id = idOf((await params).id);
  if (!isArtifactId(id)) notFound();
  const { services } = await getDeps();
  if (!(await services.store.artifacts.has(id))) notFound();
  const { record, bytes } = await services.store.artifacts.get(id);
  const mediaType = record.mediaType.split(';')[0]?.trim() ?? 'application/octet-stream';
  const kind = outputKind(mediaType);
  if (kind === 'other') redirect(artifactUrl(id));
  const text = kind === 'text' || kind === 'diff' || kind === 'data' ? new TextDecoder().decode(bytes) : undefined;
  // A storyboard shows frames and clips; each is shown by its media type, as on the Result screen.
  const board = kind === 'data' && text !== undefined ? parseStoryboard(text) : null;
  const media = board ? await artifactInfo(services, storyboardArtifacts(board)) : undefined;
  return (
    <div className="page page-result">
      <ArtifactViewer id={id} mediaType={mediaType} bytes={bytes.length} {...(text !== undefined ? { text } : {})} {...(media ? { media } : {})} />
    </div>
  );
}
