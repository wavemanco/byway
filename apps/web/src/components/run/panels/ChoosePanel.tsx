'use client';

import { useRef, useState } from 'react';
import { moveFocus } from '../../../view/checkpoints.ts';
import { useShortcuts } from '../../useShortcuts.ts';
import { TurnFooter } from './TurnFooter.tsx';
import type { PanelProps } from './types.ts';

/** Splits "Random spark: four drafts from…" into a name and its explanation, when written that way. */
function parts(label: string): { name: string; detail?: string } {
  const at = label.indexOf(': ');
  if (at <= 0) return { name: label };
  const detail = label.slice(at + 2);
  return { name: label.slice(0, at), detail: detail.charAt(0).toUpperCase() + detail.slice(1) };
}

/**
 * choose: the branches of a route as a radio list; J and K move, Enter goes the chosen way. Nothing is chosen at
 * first, so a stray Enter cannot send the run down the first branch (UX-1). The choice is kept by the Run screen while
 * the person looks at another step, never across a reload (view/drafts.ts persisted, ADR-0082).
 */
export function ChoosePanel({ cp, busy, onSubmit, promptId, draft, onDraft, sent }: PanelProps) {
  const options = cp.options ?? [];
  const kept = options.findIndex((o) => o.id === draft.choice[0]);
  const [chosen, setChosen] = useState<number | null>(kept >= 0 ? kept : null);
  const [hint, setHint] = useState<string | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  function choose(index: number) {
    setChosen(index);
    setHint(null);
    const option = options[index];
    if (option) onDraft({ ...draft, choice: [option.id] });
  }

  function move(delta: number) {
    const next = moveFocus(chosen ?? -1, delta, options.length);
    choose(next);
    inputs.current[next]?.focus();
  }

  function submit() {
    if (busy) return;
    const option = chosen === null ? undefined : options[chosen];
    if (!option) {
      setHint('Choose a way first.');
      return;
    }
    onSubmit({ checkpointId: cp.id, choice: [option.id] });
  }

  useShortcuts({ J: () => move(1), K: () => move(-1), Enter: submit });

  return (
    <>
      <fieldset className="branches" aria-describedby={promptId}>
        <legend className="sr-only">Choose one way</legend>
        {options.map((o, i) => {
          const { name, detail } = parts(o.label);
          return (
            <label key={o.id} className="branch" data-checked={chosen === i ? 'true' : undefined}>
              <input
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                type="radio"
                name={cp.id}
                value={o.id}
                checked={chosen === i}
                onChange={() => choose(i)}
              />
              <span className="branch-text">
                <span className="branch-name">{name}</span>
                {detail ? <span className="branch-detail">{detail}</span> : null}
              </span>
            </label>
          );
        })}
      </fieldset>
      <p className="turn-hint" role="status">
        {hint}
      </p>
      <TurnFooter kind={cp.kind} ready={chosen !== null} busy={busy} onSubmit={submit} sent={sent} />
    </>
  );
}
