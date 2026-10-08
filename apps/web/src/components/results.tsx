/** Viewers for JSON deliverables: an options list (Idea Generator) and a storyboard (Ad Video Chain). */
import type { OptionItem, StoryboardModel } from '../view/result.ts';
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

export function Storyboard({ board, note }: { board: StoryboardModel; note?: string }) {
  return (
    <div className="storyboard">
      {note ? <p className="notice small">{note}</p> : null}
      <ol className="shots">
        {board.shots.map((shot) => (
          <li key={shot.shot} className="shot">
            {shot.imageArtifactId ? (
              <img src={artifactUrl(shot.imageArtifactId)} alt={`Frame for shot ${shot.shot}: ${shot.description}`} loading="lazy" />
            ) : (
              <div className="shot-empty">No frame yet</div>
            )}
            <div className="shot-text">
              <p className="shot-head">
                Shot {shot.shot} <span className="muted">{shot.durationSec}s</span>
              </p>
              <p>{shot.description}</p>
            </div>
          </li>
        ))}
      </ol>
      <section className="voiceover" aria-labelledby="vo-title">
        <h3 id="vo-title">
          Voice-over <span className="muted">{board.totalSec}s in total</span>
        </h3>
        <p>{board.voiceover}</p>
      </section>
    </div>
  );
}
