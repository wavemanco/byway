'use client';

import type { CheckpointKind } from '@byway/contracts';
import type { ReactNode } from 'react';
import { panelFor } from '../../../view/checkpoints.ts';

interface Props {
  kind: CheckpointKind;
  ready: boolean;
  busy: boolean;
  onSubmit: () => void;
  /** Overrides the panel's action verb, e.g. "Keep After the swaps". */
  action?: string;
  /** Shown left of the button, e.g. "2 of 3 chosen". */
  status?: ReactNode;
}

/** The panel's footer: what you have done so far, the shortcuts, and the one primary action. */
export function TurnFooter({ kind, ready, busy, onSubmit, action, status }: Props) {
  const spec = panelFor(kind);
  return (
    <div className="turn-foot">
      <div className="turn-foot-info">
        {status ? <p className="turn-status">{status}</p> : null}
        <ul className="shortcuts" aria-label="Keyboard shortcuts">
          {spec.shortcuts.map((s) => (
            <li key={s.keys}>
              <kbd>{s.keys}</kbd> {s.does}
            </li>
          ))}
        </ul>
      </div>
      <button type="button" className="button button-primary button-large" onClick={onSubmit} disabled={busy} aria-disabled={!ready || busy}>
        {busy ? 'Sending…' : (action ?? spec.action)}
      </button>
    </div>
  );
}
