'use client';

import { useState } from 'react';
import { listedShortcuts } from '../../../view/checkpoints.ts';
import { ActionButton } from '../../ActionButton.tsx';
import { useShortcuts, useSingleKeyShortcuts } from '../../useShortcuts.ts';
import { References } from './References.tsx';
import type { PanelProps } from './types.ts';

/**
 * confirm: a clear yes or no. The question says what each answer does; neither button is styled as the
 * expected answer, because both are yours to give. The answers sit in the sticky footer, so long notes above
 * never push them out of reach. The question describes the group; a cost said under it describes each answer, so a
 * screen reader reads it with the button that has focus, as the sandbox's turn-off confirmation reads its risk.
 */
export function ConfirmPanel({ cp, artifacts, busy, onSubmit, promptId, costId, sent }: PanelProps) {
  // The answer being sent, so that button shows as busy and the other only as unavailable; both keep focus (R5).
  const [given, setGiven] = useState<boolean | null>(null);
  const answer = (approved: boolean) => {
    if (busy) return;
    setGiven(approved);
    onSubmit({ checkpointId: cp.id, approved });
  };
  useShortcuts({ Y: () => answer(true), N: () => answer(false) });
  const refs = cp.artifactIds ?? [];
  const shortcuts = listedShortcuts(cp.kind, useSingleKeyShortcuts());

  return (
    <>
      <References ids={refs} artifacts={artifacts} />
      <div className={refs.length > 0 ? 'turn-foot' : 'turn-foot turn-foot-plain'}>
        <div className="turn-foot-info">
          <ul className="shortcuts" aria-label="Keyboard shortcuts">
            {shortcuts.map((s) => (
              <li key={s.keys}>
                <kbd>{s.keys}</kbd> {s.does}
              </li>
            ))}
          </ul>
        </div>
        <div className="yes-no" role="group" aria-describedby={promptId}>
          {busy ? (
            <span className="muted" role="status">
              {sent ? 'Sent' : 'Sending…'}
            </span>
          ) : null}
          <ActionButton className="button button-large yes-no-button" onClick={() => answer(true)} busy={busy && !sent && given === true} unavailable={busy} aria-describedby={costId}>
            Yes
          </ActionButton>
          <ActionButton className="button button-large yes-no-button" onClick={() => answer(false)} busy={busy && !sent && given === false} unavailable={busy} aria-describedby={costId}>
            No
          </ActionButton>
        </div>
      </div>
    </>
  );
}
