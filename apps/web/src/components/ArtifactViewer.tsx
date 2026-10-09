import type { ArtifactInfo } from '../view/rundata.ts';
import { exportLabel } from '../view/history.ts';
import { DOWNLOADED_PAGE } from '../view/pages.ts';
import { outputKind } from '../view/run.ts';
import { artifactUrl } from './api.ts';
import { ArtifactPreview } from './ArtifactPreview.tsx';
import { PageResult } from './result/PageResult.tsx';

/** What the viewer calls an artifact, by what it is: the viewer has the artifact, not the step that made it. */
const NAMES = { page: 'Page', image: 'Image', video: 'Clip', diff: 'Diff', data: 'Data', text: 'Text', other: 'File' } as const;

export function artifactName(mediaType: string): string {
  return NAMES[outputKind(mediaType)];
}

interface Props {
  id: string;
  mediaType: string;
  /** The whole text, for text media. */
  text?: string;
  /** The artifact's size in bytes. */
  bytes: number;
  /** Media types of what a storyboard shows (its frames and clips). */
  media?: Record<string, ArtifactInfo>;
}

/**
 * The whole-artifact viewer (/view/<id>), where every in-app "Open" goes (F05, ADR-0085): a page in a frame with the
 * same per-page scripts switch as everywhere else (off until turned on, for this visit only), text whole and rendered as
 * its kind, and images and clips as themselves.
 */
export function ArtifactViewer({ id, mediaType, text, bytes, media }: Props) {
  const name = artifactName(mediaType);
  const kind = outputKind(mediaType);
  return (
    <article className="result artifact-view">
      <header className="result-head">
        <div>
          <p className="run-recipe">Made in byway</p>
          <h1>{name}</h1>
        </div>
        <div className="result-actions">
          <a className="button" href={artifactUrl(id, name)} download>
            {exportLabel(mediaType)}
          </a>
          {kind === 'page' ? <p className="result-download-note small muted">{DOWNLOADED_PAGE}</p> : null}
        </div>
      </header>
      <section className="result-body" aria-label={name}>
        {kind === 'page' ? (
          <PageResult id={id} title={name} />
        ) : kind === 'image' ? (
          <img className="preview-image" src={artifactUrl(id)} alt={name} />
        ) : kind === 'video' ? (
          <video className="preview-image" src={artifactUrl(id)} controls preload="metadata" aria-label={name} />
        ) : (
          // The whole text, marked as whole: nothing here is an excerpt (F13).
          <ArtifactPreview id={id} info={{ mediaType, ...(text !== undefined ? { excerpt: text, complete: true, bytes } : {}) }} title={name} size="large" {...(media ? { media } : {})} />
        )}
      </section>
    </article>
  );
}
