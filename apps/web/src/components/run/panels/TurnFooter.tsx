'use client';

import type { CheckpointKind } from '@byway/contracts';
import type { ReactNode } from 'react';
import { listedShortcuts, panelFor } from '../../../view/checkpoints.ts';
import { ActionButton } from '../../ActionButton.tsx';
import { useSingleKeyShortcuts } from '../../useShortcuts.ts';

interface Props {
  kind: CheckpointKind;
  ready: boolean;
  /** True while the answer is being sent and once it is sent (YourTurn passes busy or sent); only sending shows as busy. */
  busy: boolean;
  onSubmit: () => void;
  /** Overrides the panel's action verb, e.g. "Keep After the swaps". */
  action?: string;
  /** Shown left of the button, e.g. "2 of 3 chosen". */
  status?: ReactNode;
  /** The answer was accepted; the button says so until byway confirms it and the turn moves on (ADR-0082). */
  sent?: boolean;
}

/** The panel's footer: what you have done so far, the shortcuts, and the one primary action. */
export function TurnFooter({ kind, ready, busy, onSubmit, action, status, sent = false }: Props) {
  const spec = panelFor(kind);
  const shortcuts = listedShortcuts(kind, useSingleKeyShortcuts());
  return (
    <div className="turn-foot">
      <div className="turn-foot-info">
        {status ? <p className="turn-status">{status}</p> : null}
        <ul className="shortcuts" aria-label="Keyboard shortcuts">
          {shortcuts.map((s) => (
            <li key={s.keys}>
              <kbd>{s.keys}</kbd> {s.does}
            </li>
          ))}
        </ul>
      </div>
      {/* Busy and Sent keep focus here (R5): a press then does nothing; not ready, a press says what is missing. */}
      <ActionButton className="button button-primary button-large" onClick={onSubmit} busy={busy && !sent} unavailable={sent} incomplete={!ready}>
        {sent ? 'Sent' : busy ? 'Sending…' : (action ?? spec.action)}
      </ActionButton>
    </div>
  );
}
