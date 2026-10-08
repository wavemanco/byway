'use client';

import { useShortcuts } from '../../useShortcuts.ts';
import { References } from './References.tsx';
import type { PanelProps } from './types.ts';

/**
 * confirm: a clear yes or no. The question says what each answer does; neither button is styled as the
 * expected answer, because both are yours to give.
 */
export function ConfirmPanel({ cp, artifacts, busy, onSubmit, promptId }: PanelProps) {
  const answer = (approved: boolean) => {
    if (!busy) onSubmit({ checkpointId: cp.id, approved });
  };
  useShortcuts({ Y: () => answer(true), N: () => answer(false) });

  return (
    <>
      <References ids={cp.artifactIds ?? []} artifacts={artifacts} />
      <div className="yes-no" role="group" aria-describedby={promptId}>
        <button type="button" className="button button-large yes-no-button" onClick={() => answer(true)} disabled={busy}>
          Yes <kbd aria-hidden="true">Y</kbd>
        </button>
        <button type="button" className="button button-large yes-no-button" onClick={() => answer(false)} disabled={busy}>
          No <kbd aria-hidden="true">N</kbd>
        </button>
        {busy ? (
          <span className="muted" role="status">
            Sending…
          </span>
        ) : null}
      </div>
    </>
  );
}
