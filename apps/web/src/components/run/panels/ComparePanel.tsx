'use client';

import { useState } from 'react';
import { moveFocus } from '../../../view/checkpoints.ts';
import { ArtifactPreview } from '../../ArtifactPreview.tsx';
import { ScriptsToggle } from '../../ScriptsToggle.tsx';
import { outputKind } from '../../../view/run.ts';
import { useShortcuts } from '../../useShortcuts.ts';
import { TurnFooter } from './TurnFooter.tsx';
import type { PanelProps } from './types.ts';

type Mode = 'side' | 'flip';

/**
 * compare: two versions, side by side or flipped in place (flipping is how a small change becomes visible).
 * The highlighted version is the one Enter keeps; Space flips, J and K move between versions.
 */
export function ComparePanel({ cp, artifacts, busy, onSubmit, promptId }: PanelProps) {
  const options = cp.options ?? [];
  const [mode, setMode] = useState<Mode>('side');
  const [shown, setShown] = useState(0);
  const current = options[shown];

  function keep(index: number) {
    const option = options[index];
    if (!option || busy) return;
    onSubmit({ checkpointId: cp.id, choice: [option.id] });
  }

  const flip = () => setShown((i) => (options.length > 0 ? (i + 1) % options.length : 0));

  useShortcuts({
    Space: flip,
    J: () => setShown((i) => moveFocus(i, 1, options.length)),
    K: () => setShown((i) => moveFocus(i, -1, options.length)),
    Enter: () => keep(shown),
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
        {/* One switch for both versions, so they are always compared the same way. */}
        {options.some((o) => o.artifactId && outputKind(artifacts[o.artifactId]?.mediaType) === 'page') ? <ScriptsToggle /> : null}
      </div>

      {mode === 'side' ? (
        <ul className="compare" aria-describedby={promptId}>
          {options.map((o, i) => (
            <li key={o.id} className="compare-col" data-current={shown === i ? 'true' : undefined}>
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
              <div className="compare-view" onClick={() => setShown(i)}>
                {o.artifactId ? <ArtifactPreview id={o.artifactId} info={artifacts[o.artifactId]} title={o.label} size="large" scriptsToggle={false} /> : <p>{o.label}</p>}
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
              {o.artifactId ? <ArtifactPreview id={o.artifactId} info={artifacts[o.artifactId]} title={o.label} size="large" scriptsToggle={false} /> : null}
            </div>
          ))}
        </div>
      ) : null}

      <TurnFooter
        kind={cp.kind}
        ready={current !== undefined}
        busy={busy}
        onSubmit={() => keep(shown)}
        action={current ? `Keep “${current.label}”` : undefined}
        status={mode === 'side' && current ? `Highlighted: ${current.id}` : undefined}
      />
    </>
  );
}
