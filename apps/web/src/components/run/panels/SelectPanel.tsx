'use client';

import { useId, useRef, useState } from 'react';
import { emptyDraft, hitParts, moveFocus, selectAction, toResolution, toggleChoice } from '../../../view/checkpoints.ts';
import { useShortcuts } from '../../useShortcuts.ts';
import { References } from './References.tsx';
import { TurnFooter } from './TurnFooter.tsx';
import type { PanelProps } from './types.ts';

/**
 * select: a checklist where any number may be chosen, none included (C2: which cliché-sweep hits to swap, decided one
 * by one). Nothing starts ticked, so sending without choosing is a deliberate "swap none", and the button says which.
 * J and K move, Space ticks, Ctrl+Enter sends; sending is never a single key, because it changes the work.
 */
export function SelectPanel({ cp, artifacts, busy, onSubmit, promptId }: PanelProps) {
  const options = cp.options ?? [];
  const [draft, setDraft] = useState(() => emptyDraft(cp));
  const [focus, setFocus] = useState(-1);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const base = useId();
  const refs = cp.artifactIds ?? [];
  const chosen = draft.choice.length;

  const toggle = (id: string) => setDraft((d) => ({ ...d, choice: toggleChoice(d.choice, id, Number.POSITIVE_INFINITY) }));
  const setAll = (all: boolean) => setDraft((d) => ({ ...d, choice: all ? options.map((o) => o.id) : [] }));

  function move(delta: number) {
    const next = moveFocus(focus, delta, options.length);
    setFocus(next);
    inputs.current[next]?.focus();
  }

  function submit() {
    if (!busy) onSubmit(toResolution(cp, draft));
  }

  useShortcuts({
    J: () => move(1),
    K: () => move(-1),
    Space: () => {
      const option = options[focus];
      if (option) toggle(option.id);
    },
    'Mod+Enter': submit,
  });

  return (
    <>
      <References ids={refs} artifacts={artifacts} title="The work these were found in" />
      <fieldset className="checklist" aria-describedby={promptId}>
        <legend className="sr-only">Choose which to swap</legend>
        {options.length > 1 ? (
          <p className="checklist-bulk">
            <button type="button" className="link-button" onClick={() => setAll(true)} disabled={busy || chosen === options.length}>
              Choose all
            </button>
            <button type="button" className="link-button" onClick={() => setAll(false)} disabled={busy || chosen === 0}>
              Clear
            </button>
          </p>
        ) : null}
        <ul className="checklist-items">
          {options.map((o, i) => {
            const checked = draft.choice.includes(o.id);
            const { pattern, where, alternative } = hitParts(o.label);
            return (
              <li key={o.id} className="check-item" data-checked={checked ? 'true' : undefined}>
                <label className="check-hit">
                  <input
                    ref={(el) => {
                      inputs.current[i] = el;
                    }}
                    type="checkbox"
                    name={cp.id}
                    value={o.id}
                    checked={checked}
                    onChange={() => toggle(o.id)}
                    onFocus={() => setFocus(i)}
                    aria-labelledby={`${base}-${i}`}
                    aria-describedby={where || alternative ? `${base}-${i}-more` : undefined}
                  />
                  <span className="check-text">
                    <span id={`${base}-${i}`} className="check-name">
                      {pattern}
                    </span>
                    {where || alternative ? (
                      <span id={`${base}-${i}-more`} className="check-detail">
                        {where ? <span>In {where}</span> : null}
                        {alternative ? <span>Swap for {alternative}</span> : null}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <TurnFooter
        kind={cp.kind}
        ready
        busy={busy}
        onSubmit={submit}
        action={selectAction(chosen)}
        status={chosen === 0 ? 'None chosen: nothing will be swapped.' : `${chosen} of ${options.length} chosen`}
      />
    </>
  );
}
