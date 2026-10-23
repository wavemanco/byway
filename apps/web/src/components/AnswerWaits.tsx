'use client';

import type { AnswerWait } from '@byway/contracts';
import { useId, useState } from 'react';
import { defaultsSentence, KIND_WORDS, waitOption, type AnswerWaitGroup, type AnswerWaitRow } from '../view/waits.ts';
import { patch } from './api.ts';
import { waitSaves } from './waitSaves.ts';

interface Props {
  /** Every model the profiles use, grouped by provider, with what each waits now (view/waits.ts answerWaitGroups). */
  groups: AnswerWaitGroup[];
}

/** The help under the heading: what a wait is, when a change applies, and what a model no one chose for waits. */
export function waitsNote(groups: readonly AnswerWaitGroup[]): string {
  return (
    'How long byway waits for each model’s answer before it gives up on the call. For text that streams in, this is how long the model may send nothing. ' +
    'A change applies from the model’s next call; a link of an Ad Video Chain already being made keeps the waits it started with. ' +
    `A model no one has chosen a wait for, such as one a profile has just started using, waits its kind’s default: ${defaultsSentence(groups)}.`
  );
}

/** Under a model's name: its kind, and that it waits the default when no one has chosen for it. */
export const rowNote = (row: Pick<AnswerWaitRow, 'kind' | 'chosen'>): string => (row.chosen ? KIND_WORDS[row.kind] : `${KIND_WORDS[row.kind]}. Not chosen yet, so it waits the default.`);

/**
 * Settings' "How long to wait for an answer" (the waits design of 2026-10-22): one choice per model the profiles use,
 * grouped by provider, from the minutes its kind offers (text 15, 30, 45 or 60, images 5, 10, 15 or 20, video 30, 45, 60
 * or 75, the owner's choices). A change saves at once (PATCH /api/waits, which checks it against the model's set) and
 * applies from the model's next call: the gateway reads it on every call. A model's saves go one after another, and the
 * select and its announcement end on what the server kept (waitSaves.ts).
 */
export function AnswerWaits({ groups: initial }: Props) {
  const ids = useId();
  const [groups, setGroups] = useState(initial);
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Made once, so every change of a model meets the saves already under way for it. It only calls state setters.
  const [choose] = useState(() =>
    waitSaves({
      save: (choice) => patch<AnswerWait>('/api/waits', choice),
      show: (provider, model, shown) =>
        setGroups((gs) => gs.map((g) => (g.provider !== provider ? g : { ...g, rows: g.rows.map((r) => (r.model === model ? { ...r, ...shown } : r)) }))),
      said: setSaid,
      failed: setError,
    }),
  );

  return (
    <section className="settings-section" id="waits" aria-labelledby={`${ids}-waits`}>
      <p className="sr-only" role="status" aria-live="polite">
        {said}
      </p>
      <h2 id={`${ids}-waits`}>How long to wait for an answer</h2>
      <p className="section-note">{waitsNote(groups)}</p>
      {error ? (
        <p className="notice notice-danger" role="alert">
          {error}
        </p>
      ) : null}
      {groups.map((g, gi) => (
        <div key={g.provider} className="waits-group">
          <h3 className="waits-provider">{g.name}</h3>
          <ul className="waits">
            {g.rows.map((row, ri) => {
              const id = `${ids}-wait-${gi}-${ri}`;
              return (
                <li key={row.model} className="wait">
                  <div>
                    <label className="wait-model" htmlFor={id}>
                      {row.model}
                    </label>
                    <p id={`${id}-note`} className="muted small">
                      {rowNote(row)}
                    </p>
                  </div>
                  <select id={id} className="wait-choice" value={row.minutes} aria-describedby={`${id}-note`} onChange={(e) => void choose(row, Number(e.target.value))}>
                    {row.choices.map((n) => (
                      <option key={n} value={n}>
                        {waitOption(n, row.defaultMinutes)}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
