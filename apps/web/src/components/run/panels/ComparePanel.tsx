'use client';

import { useState } from 'react';
import { moveFocus } from '../../../view/checkpoints.ts';
import { ArtifactPreview } from '../../ArtifactPreview.tsx';
import { ScriptsToggle, usePageScripts } from '../../ScriptsToggle.tsx';
import { outputKind } from '../../../view/run.ts';
import { useShortcuts } from '../../useShortcuts.ts';
import { TurnFooter } from './TurnFooter.tsx';
import type { PanelProps } from './types.ts';

type Mode = 'side' | 'flip';

/**
 * compare: two versions, side by side or flipped in place (flipping is how a small change becomes visible). Space
 * flips, J and K move between versions, and Enter keeps the highlighted one. Nothing is highlighted until you move,
 * flip or click a version, so a stray Enter as the panel opens keeps nothing (UX-1); "Keep this" keeps that version.
 *
 * The highlight is the person's draft: kept by the Run screen while they look at another step, never across a reload
 * (view/drafts.ts persisted, ADR-0082). How the versions are shown (side by side or flipped, which one, and whether the
 * pages' scripts run) is this view's own and starts afresh.
 */
export function ComparePanel({ cp, artifacts, busy, onSubmit, promptId, draft, onDraft, sent }: PanelProps) {
  const options = cp.options ?? [];
  const [mode, setMode] = useState<Mode>('side');
  const kept = options.findIndex((o) => o.id === draft.choice[0]);
  // The version shown in Flip mode, and the one highlighted once you have chosen (null until then).
  const [shown, setShown] = useState(Math.max(0, kept));
  const [chosen, setChosenState] = useState<number | null>(kept >= 0 ? kept : null);
  const setChosen = (index: number) => {
    // Sent: the highlight stays on the version sent until byway settles the question; flipping still shows the other.
    if (sent) return;
    setChosenState(index);
    const option = options[index];
    if (option) onDraft({ ...draft, choice: [option.id] });
  };
  const [hint, setHint] = useState<string | null>(null);
  const current = options[shown];
  const highlighted = chosen === null ? undefined : options[chosen];
  // One switch for the pages compared here, so they are always compared the same way; it covers exactly these pages,
  // and only while this turn shows them (SEC-4).
  const pages = options.flatMap((o) => (o.artifactId && outputKind(artifacts[o.artifactId]?.mediaType) === 'page' ? [o.artifactId] : []));
  const [scripts, setScripts] = usePageScripts(pages.join(' '));

  function show(index: number) {
    setShown(index);
    setChosen(index);
    setHint(null);
  }

  function keep(index: number | null) {
    const option = index === null ? undefined : options[index];
    if (busy) return;
    if (!option) {
      setHint('Choose a version first: J and K move between them, or use Keep this.');
      return;
    }
    onSubmit({ checkpointId: cp.id, choice: [option.id] });
  }

  const flip = () => show(options.length > 0 ? (shown + 1) % options.length : 0);

  useShortcuts({
    Space: flip,
    J: () => show(moveFocus(chosen ?? -1, 1, options.length)),
    K: () => show(moveFocus(chosen ?? options.length, -1, options.length)),
    Enter: () => keep(chosen),
  });

  return (
    <>
      <div className="compare-bar">
        <div className="segmented" role="group" aria-label="How to compare">
          <button type="button" aria-pressed={mode === 'side'} onClick={() => setMode('side')}>
            Side by side
          </button>
          <button type="button" aria-pressed={mode === 'flip'} onClick={() => setMode('flip')}>
            Flip
          </button>
        </div>
        {mode === 'flip' ? (
          <button type="button" className="button" onClick={flip}>
            Flip <kbd aria-hidden="true">Space</kbd>
          </button>
        ) : null}
        {pages.length > 0 ? <ScriptsToggle on={scripts} onChange={setScripts} label={pages.length > 1 ? 'Run the pages’ scripts' : undefined} /> : null}
      </div>

      {mode === 'side' ? (
        <ul className="compare" aria-describedby={promptId}>
          {options.map((o, i) => (
            <li key={o.id} className="compare-col" data-current={chosen === i ? 'true' : undefined}>
              <div className="compare-head">
                <h3>
                  <span className="compare-letter" aria-hidden="true">
                    {o.id}
                  </span>
                  {o.label}
                </h3>
                <button type="button" className="button" onClick={() => keep(i)} disabled={busy}>
                  Keep this<span className="sr-only">: {o.label}</span>
                </button>
              </div>
              <div className="compare-view" onClick={() => show(i)}>
                {o.artifactId ? <ArtifactPreview id={o.artifactId} info={artifacts[o.artifactId]} title={o.label} size="large" scripts={scripts} /> : <p>{o.label}</p>}
              </div>
            </li>
          ))}
        </ul>
      ) : current ? (
        <div className="compare-flip" aria-describedby={promptId}>
          <p className="compare-showing" aria-live="polite">
            Showing{' '}
            <strong>
              {current.id}: {current.label}
            </strong>
          </p>
          {/* Both versions stay mounted so a flip is instant and lands on the same spot. */}
          {options.map((o, i) => (
            <div key={o.id} className="compare-view" hidden={i !== shown}>
              {o.artifactId ? <ArtifactPreview id={o.artifactId} info={artifacts[o.artifactId]} title={o.label} size="large" scripts={scripts} /> : null}
            </div>
          ))}
        </div>
      ) : null}

      <p className="turn-hint" role="status">
        {hint}
      </p>
      <TurnFooter
        kind={cp.kind}
        ready={highlighted !== undefined}
        busy={busy}
        sent={sent}
        onSubmit={() => keep(chosen)}
        action={highlighted ? `Keep “${highlighted.label}”` : undefined}
        status={mode === 'side' ? (highlighted ? `Highlighted: ${highlighted.id}` : 'Nothing highlighted yet.') : undefined}
      />
    </>
  );
}
