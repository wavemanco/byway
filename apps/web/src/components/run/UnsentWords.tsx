'use client';

import { useEffect, useId, useState } from 'react';
import type { Unsent } from './draftStore.ts';

/**
 * Words the person typed for a question that closed before they sent them: the run was cancelled or failed, or the
 * question was answered elsewhere (F06, ADR-0082). They are shown so nothing typed is lost, read-only and with no way
 * to send them, because their question no longer takes an answer. Kept for this tab's session until discarded.
 */
export function UnsentWords({ items, onDiscard }: { items: Unsent[]; onDiscard: (checkpointId: string) => void }) {
  const titleId = useId();
  return (
    <section className="unsent" aria-labelledby={titleId}>
      <h2 id={titleId}>Your unsent words</h2>
      <p className="muted">
        {items.length === 1 ? 'This question closed' : 'These questions closed'} before you sent your answer, so it cannot be sent now. Copy what you wrote if you
        want to keep it; it stays here in this tab until you discard it.
      </p>
      <ul className="unsent-list">
        {items.map(({ cp, text }) => (
          <li key={cp.id} className="unsent-item">
            <p className="unsent-prompt">{cp.prompt}</p>
            <label className="sr-only" htmlFor={`${titleId}-${cp.id}`}>
              What you wrote
            </label>
            <textarea id={`${titleId}-${cp.id}`} className="textarea" value={text} readOnly rows={Math.min(8, Math.max(3, text.split('\n').length))} />
            <div className="unsent-actions">
              <CopyText text={text} />
              <button type="button" className="button button-quiet" onClick={() => onDiscard(cp.id)}>
                Discard<span className="sr-only"> what you wrote for: {cp.prompt}</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CopyText({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const t = window.setTimeout(() => setState('idle'), 2000);
    return () => window.clearTimeout(t);
  }, [state]);
  return (
    <button
      type="button"
      className="button"
      aria-live="polite"
      onClick={() => {
        // No clipboard (an insecure context, or a browser that refuses): say so; the text can still be selected.
        (navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('no clipboard'))).then(
          () => setState('copied'),
          () => setState('failed'),
        );
      }}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed: select the text and copy it' : 'Copy'}
    </button>
  );
}
