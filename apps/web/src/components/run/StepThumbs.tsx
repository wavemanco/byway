'use client';

import { outputKind } from '../../view/run.ts';
import type { ArtifactInfo } from '../../view/rundata.ts';
import { excerpt } from '../../view/text.ts';
import type { TimelineArtifact, TimelineStep } from '../../view/timeline.ts';
import { artifactUrl } from '../api.ts';
import { ScaledPage } from '../ScaledPage.tsx';

const MAX_THUMBS = 4;

/** A row's one line about a text: an option map's titles (from the whole map), or the opening of the text. */
function textOf(a: TimelineArtifact, artifacts: Record<string, ArtifactInfo>): string {
  const info = artifacts[a.artifactId];
  if (info?.titles) return info.titles.join(', ');
  return excerpt(info?.excerpt ?? '', 120);
}

/**
 * A step's outputs at a glance: page and image thumbnails, a text excerpt, or a diff's size. The size is the server's
 * count of the whole diff (F13): counted from the excerpt, a long diff would read as a smaller one.
 */
export function StepThumbs({ step, artifacts }: { step: TimelineStep; artifacts: Record<string, ArtifactInfo> }) {
  const items = step.artifacts;
  const kindOf = (a: TimelineArtifact) => outputKind(artifacts[a.artifactId]?.mediaType ?? a.mediaType);
  const visual = items.filter((a) => kindOf(a) === 'page' || kindOf(a) === 'image' || kindOf(a) === 'video');
  const textual = items.filter((a) => kindOf(a) === 'text' || kindOf(a) === 'data');
  const diffs = items.filter((a) => kindOf(a) === 'diff');

  return (
    <div className="thumbs">
      {visual.length > 0 ? (
        <ul className="thumb-row" aria-label={`${visual.length} ${visual.length === 1 ? 'output' : 'outputs'}`}>
          {visual.slice(0, MAX_THUMBS).map((a, i) => (
            <li key={`${a.artifactId}-${i}`} className="thumb">
              {kindOf(a) === 'page' ? (
                <ScaledPage id={a.artifactId} title={a.label ?? `Page ${i + 1}`} virtualHeight={900} />
              ) : kindOf(a) === 'video' ? (
                <video src={artifactUrl(a.artifactId)} preload="metadata" muted aria-label={a.label ?? `Clip ${i + 1}`} />
              ) : (
                <img src={artifactUrl(a.artifactId)} alt={a.label ?? `Image ${i + 1}`} loading="lazy" />
              )}
            </li>
          ))}
          {visual.length > MAX_THUMBS ? <li className="thumb thumb-more">+{visual.length - MAX_THUMBS}</li> : null}
        </ul>
      ) : null}
      {textual.length > 1 ? (
        <p className="thumb-text">
          {textual.length} {textual.length === 1 ? 'note' : 'cards'}: {textual.map((a) => a.label ?? 'Untitled').join(', ')}
        </p>
      ) : textual[0] ? (
        <p className="thumb-text">{textOf(textual[0], artifacts) || textual[0].label}</p>
      ) : null}
      {diffs.map((a, i) => {
        const stat = artifacts[a.artifactId]?.diffstat;
        if (!stat) return a.label ? <p key={`${a.artifactId}-${i}`} className="thumb-text thumb-diff">{a.label}</p> : null;
        return (
          <p key={`${a.artifactId}-${i}`} className="thumb-text thumb-diff">
            {a.label ? `${a.label}: ` : ''}
            {stat.files} {stat.files === 1 ? 'file' : 'files'}, <span className="diff-plus">+{stat.additions}</span> <span className="diff-minus">−{stat.deletions}</span>
          </p>
        );
      })}
    </div>
  );
}
