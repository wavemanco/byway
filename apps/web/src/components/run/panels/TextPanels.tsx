'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { canSubmit, emptyDraft, toResolution } from '../../../view/checkpoints.ts';
import { useShortcuts } from '../../useShortcuts.ts';
import { References } from './References.tsx';
import { TurnFooter } from './TurnFooter.tsx';
import type { PanelProps } from './types.ts';

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Shared by write and react: one text field, sent with the primary button or Ctrl+Enter. */
function useTextDraft(props: PanelProps) {
  const { cp, busy, onSubmit } = props;
  const [draft, setDraft] = useState(() => emptyDraft(cp));
  const [hint, setHint] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const ready = canSubmit(cp, draft);

  useEffect(() => field.current?.focus(), []);

  function submit() {
    if (busy) return;
    if (!ready) {
      setHint('Write something first.');
      field.current?.focus();
      return;
    }
    onSubmit(toResolution(cp, draft));
  }

  useShortcuts({ 'Mod+Enter': submit });
  return { draft, setDraft, hint, setHint, field, ready, submit };
}

/** write: a focused editor for your own words (VOICE; the author's draft in Second Reader). */
export function WritePanel(props: PanelProps) {
  const { cp, artifacts, busy, promptId } = props;
  const { draft, setDraft, hint, setHint, field, ready, submit } = useTextDraft(props);
  const id = useId();
  const refs = cp.artifactIds ?? [];
  const changed = draft.text !== (cp.initialText ?? '');

  return (
    <>
      <div className={refs.length > 0 ? 'write write-with-refs' : 'write'}>
        <div className="write-main">
          <label htmlFor={id} className="sr-only">
            Your words
          </label>
          <textarea
            ref={field}
            id={id}
            className="editor"
            value={draft.text}
            onChange={(e) => {
              setDraft({ ...draft, text: e.target.value });
              setHint(null);
            }}
            aria-describedby={promptId}
            rows={14}
            spellCheck
          />
          <p className="write-meta">
            <span>{wordCount(draft.text)} words</span>
            {changed && cp.initialText ? (
              <button type="button" className="link-button" onClick={() => setDraft({ ...draft, text: cp.initialText ?? '' })}>
                Go back to the starting text
              </button>
            ) : null}
          </p>
        </div>
        <References ids={refs} artifacts={artifacts} />
      </div>
      <p className="turn-hint" role="status">
        {hint}
      </p>
      <TurnFooter kind={cp.kind} ready={ready} busy={busy} onSubmit={submit} />
    </>
  );
}

/** react: a short free-text reaction or direction (VISION), next to what it reacts to. */
export function ReactPanel(props: PanelProps) {
  const { cp, artifacts, busy, promptId } = props;
  const { draft, setDraft, hint, setHint, field, ready, submit } = useTextDraft(props);
  const id = useId();
  const refs = cp.artifactIds ?? [];

  return (
    <>
      <div className={refs.length > 0 ? 'react-panel react-with-refs' : 'react-panel'}>
        <div className="field">
          <label htmlFor={id} className="sr-only">
            Your reaction
          </label>
          <textarea
            ref={field}
            id={id}
            className="textarea react-field"
            value={draft.text}
            onChange={(e) => {
              setDraft({ ...draft, text: e.target.value });
              setHint(null);
            }}
            aria-describedby={promptId}
            rows={5}
          />
        </div>
        <References ids={refs} artifacts={artifacts} />
      </div>
      <p className="turn-hint" role="status">
        {hint}
      </p>
      <TurnFooter kind={cp.kind} ready={ready} busy={busy} onSubmit={submit} />
    </>
  );
}
