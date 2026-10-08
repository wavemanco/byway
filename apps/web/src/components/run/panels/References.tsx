'use client';

import { outputKind } from '../../../view/run.ts';
import type { ArtifactInfo } from '../../../view/rundata.ts';
import { artifactUrl } from '../../api.ts';
import { ArtifactPreview } from '../../ArtifactPreview.tsx';

/** What a question is about, shown beside it: the drafts, the page, the frames or the latest notes. */
export function References({ ids, artifacts, title = 'For reference' }: { ids: string[]; artifacts: Record<string, ArtifactInfo>; title?: string }) {
  if (ids.length === 0) return null;
  const visual = ids.every((id) => {
    const kind = outputKind(artifacts[id]?.mediaType);
    return kind === 'page' || kind === 'image';
  });
  return (
    <section className="refs" aria-label={title}>
      <h3 className="refs-title">{title}</h3>
      <ul className={visual && ids.length > 1 ? 'refs-grid' : 'refs-list'}>
        {ids.map((id, i) => {
          const name = ids.length > 1 ? `Reference ${i + 1}` : 'Reference';
          return (
            <li key={`${id}-${i}`} className="refs-item">
              <ArtifactPreview id={id} info={artifacts[id]} title={name} size={visual && ids.length > 1 ? 'thumb' : 'large'} />
              {outputKind(artifacts[id]?.mediaType) === 'page' ? (
                <a className="refs-open" href={artifactUrl(id)} target="_blank" rel="noopener noreferrer">
                  Open<span className="sr-only"> {name} in a new tab</span>
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
