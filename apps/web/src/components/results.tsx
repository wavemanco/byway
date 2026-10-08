/** Viewers for JSON deliverables: an options list (Idea Generator) and a storyboard (Ad Video Chain). */
import { useId } from 'react';
import type { ArtifactInfo } from '../view/rundata.ts';
import { clipKind, type OptionItem, type StoryboardModel, type StoryboardShot } from '../view/result.ts';
import { artifactUrl } from './api.ts';

export function OptionsList({ options, compact = false }: { options: OptionItem[]; compact?: boolean }) {
  return (
    <ol className={compact ? 'options options-compact' : 'options'}>
      {options.map((o, i) => (
        <li key={`${o.title}-${i}`}>
          <h3>{o.title}</h3>
          <p className="options-pitch">{o.pitch}</p>
          {compact ? null : <p className="options-why">{o.rationale}</p>}
        </li>
      ))}
    </ol>
  );
}

/** A shot's clip: a real clip plays; the demo's placeholder (an image, contracts VideoResult) is shown as an image. */
function Clip({ shot, id, media }: { shot: StoryboardShot; id: string; media: Record<string, ArtifactInfo> }) {
  const kind = clipKind(media[id]?.mediaType);
  const name = `shot ${shot.shot}: ${shot.description}`;
  if (kind === 'video') return <video src={artifactUrl(id)} controls preload="metadata" aria-label={`Clip for ${name}`} />;
  if (kind === 'image') return <img src={artifactUrl(id)} alt={`Placeholder clip for ${name}`} loading="lazy" />;
  return (
    <a href={artifactUrl(id)} target="_blank" rel="noopener noreferrer">
      Open the clip for shot {shot.shot}
    </a>
  );
}

interface StoryboardProps {
  board: StoryboardModel;
  /** Media types of the frames and clips, so each is shown the way it can be. */
  media?: Record<string, ArtifactInfo>;
  /** Steps that did not run, wholly or in part, and why (ADR-0069: the result says what was not made). */
  skipped?: { key: string; label: string; note?: string; part?: boolean }[];
}

export function Storyboard({ board, media = {}, skipped = [] }: StoryboardProps) {
  // Two storyboards can be on screen at once (Compare): each names its own voice-over section (UX-14).
  const voId = useId();
  return (
    <div className="storyboard">
      {board.headline || board.tagline ? (
        <div className="storyboard-copy">
          <p className="storyboard-copy-label">On screen</p>
          {board.headline ? <p className="storyboard-headline">{board.headline}</p> : null}
          {board.tagline ? <p className="storyboard-tagline">{board.tagline}</p> : null}
        </div>
      ) : null}
      {skipped.length > 0 ? (
        <div className="notice small">
          <p>Not made in this run:</p>
          <ul>
            {skipped.map((s) => (
              <li key={s.key}>
                {s.label}
                {s.part ? ' (in part)' : ''}
                {s.note ? `: ${s.note}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ol className="shots">
        {board.shots.map((shot) => (
          <li key={shot.shot} className="shot">
            <div className="shot-media">
              <figure>
                {shot.imageArtifactId ? (
                  <img src={artifactUrl(shot.imageArtifactId)} alt={`Frame for shot ${shot.shot}: ${shot.description}`} loading="lazy" />
                ) : (
                  <div className="shot-empty">No frame yet</div>
                )}
                {shot.clipArtifactId ? <figcaption>Frame</figcaption> : null}
              </figure>
              {shot.clipArtifactId ? (
                <figure>
                  <Clip shot={shot} id={shot.clipArtifactId} media={media} />
                  <figcaption>Clip</figcaption>
                </figure>
              ) : null}
            </div>
            <div className="shot-text">
              <p className="shot-head">
                Shot {shot.shot} <span className="muted">{shot.durationSec}s</span>
              </p>
              <p>{shot.description}</p>
              {shot.caption ? (
                <p className="shot-caption">
                  <span className="muted">On screen: </span>
                  {shot.caption}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      <section className="voiceover" aria-labelledby={voId}>
        <h3 id={voId}>
          Voice-over <span className="muted">{board.totalSec}s in total</span>
        </h3>
        <p>{board.voiceover}</p>
      </section>
    </div>
  );
}
