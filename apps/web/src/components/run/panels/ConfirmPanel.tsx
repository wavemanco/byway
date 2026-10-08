'use client';

import { panelFor } from '../../../view/checkpoints.ts';
import { useShortcuts } from '../../useShortcuts.ts';
import { References } from './References.tsx';
import type { PanelProps } from './types.ts';

/**
 * confirm: a clear yes or no. The question says what each answer does; neither button is styled as the
 * expected answer, because both are yours to give. The answers sit in the sticky footer, so long notes above
 * never push them out of reach.
 */
export function ConfirmPanel({ cp, artifacts, busy, onSubmit, promptId }: PanelProps) {
  const answer = (approved: boolean) => {
    if (!busy) onSubmit({ checkpointId: cp.id, approved });
  };
  useShortcuts({ Y: () => answer(true), N: () => answer(false) });
  const refs = cp.artifactIds ?? [];

  return (
    <>
      <References ids={refs} artifacts={artifacts} />
      <div className={refs.length > 0 ? 'turn-foot' : 'turn-foot turn-foot-plain'}>
        <div className="turn-foot-info">
          <ul className="shortcuts" aria-label="Keyboard shortcuts">
            {panelFor(cp.kind).shortcuts.map((s) => (
              <li key={s.keys}>
                <kbd>{s.keys}</kbd> {s.does}
              </li>
            ))}
          </ul>
        </div>
        <div className="yes-no" role="group" aria-describedby={promptId}>
          {busy ? (
            <span className="muted" role="status">
              Sending…
            </span>
          ) : null}
          <button type="button" className="button button-large yes-no-button" onClick={() => answer(true)} disabled={busy}>
            Yes
          </button>
          <button type="button" className="button button-large yes-no-button" onClick={() => answer(false)} disabled={busy}>
            No
          </button>
        </div>
      </div>
    </>
  );
}
