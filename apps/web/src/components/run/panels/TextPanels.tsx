'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { canSubmit, toResolution, type CheckpointDraft } from '../../../view/checkpoints.ts';
import { fieldName, parseOnScreenCopy, serializeOnScreenCopy, type CopyField } from '../../../view/onscreen.ts';
import { useShortcuts } from '../../useShortcuts.ts';
import { References } from './References.tsx';
import { TurnFooter } from './TurnFooter.tsx';
import type { PanelProps } from './types.ts';

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Shared by write and react: one text field, sent with the primary button or Ctrl+Enter. It starts from the draft the
 * Run screen kept for this question (the model's starting text only when the person has not typed), and every change
 * is written through to it (F06, ADR-0082). Once the answer is sent the field is read-only, so what it shows stays what
 * was sent, until byway settles the question.
 */
function useTextDraft(props: PanelProps) {
  const { cp, busy, onSubmit, onDraft, sent } = props;
  const [draft, setDraftState] = useState(props.draft);
  const [hint, setHint] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const ready = canSubmit(cp, draft);

  useEffect(() => field.current?.focus(), []);

  function setDraft(next: CheckpointDraft) {
    if (sent) return;
    setDraftState(next);
    onDraft(next);
  }

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

/** The fields as the person left them: labels and separators from the starting text, values from the kept draft. */
function seedFields(initial: CopyField[], kept: string[]): CopyField[] {
  return kept.length === initial.length ? initial.map((f, i) => ({ ...f, value: kept[i] ?? f.value })) : initial;
}

/**
 * The words shown on screen in an ad (C4): one labelled field per line of copy, sent back in the lines they came in.
 * The voice-over was settled earlier, so it is not here.
 */
function OnScreenCopyPanel(props: PanelProps & { initial: CopyField[] }) {
  const { cp, artifacts, busy, onSubmit, onDraft, promptId, initial, sent } = props;
  const [fields, setFieldsState] = useState(() => seedFields(initial, props.draft.items));
  const first = useRef<HTMLInputElement>(null);
  const id = useId();
  const refs = cp.artifactIds ?? [];
  const text = serializeOnScreenCopy(fields);
  const changed = text !== serializeOnScreenCopy(initial);

  useEffect(() => first.current?.focus(), []);

  function setFields(next: CopyField[]) {
    if (sent) return;
    setFieldsState(next);
    onDraft({ ...props.draft, items: next.map((f) => f.value), text: serializeOnScreenCopy(next) });
  }

  function submit() {
    if (!busy) onSubmit(toResolution(cp, { ...props.draft, text }));
  }

  useShortcuts({ 'Mod+Enter': submit });

  return (
    <>
      <div className={refs.length > 0 ? 'write write-with-refs' : 'write'}>
        <div className="write-main onscreen-copy" aria-describedby={promptId}>
          <p className="muted small">The words shown on screen. Edit any of them; the voice-over is already set.</p>
          {fields.map((f, i) => (
            <div key={`${f.label}-${i}`} className="field">
              <label htmlFor={`${id}-${i}`}>{fieldName(f.label)}</label>
              <input
                ref={i === 0 ? first : undefined}
                id={`${id}-${i}`}
                className="input"
                value={f.value}
                readOnly={sent}
                spellCheck
                onChange={(e) => {
                  const value = e.target.value;
                  setFields(fields.map((x, j) => (j === i ? { ...x, value } : x)));
                }}
              />
            </div>
          ))}
          {changed && !sent ? (
            <p className="write-meta">
              <button type="button" className="link-button" onClick={() => setFields(initial)}>
                Go back to the starting text
              </button>
            </p>
          ) : null}
        </div>
        <References ids={refs} artifacts={artifacts} />
      </div>
      <TurnFooter kind={cp.kind} ready busy={busy} onSubmit={submit} sent={sent} />
    </>
  );
}

/** write: a focused editor for your own words (VOICE; the author's draft in Second Reader). */
export function WritePanel(props: PanelProps) {
  const copy = parseOnScreenCopy(props.cp.initialText);
  return copy ? <OnScreenCopyPanel {...props} initial={copy} /> : <TextWritePanel {...props} />;
}

function TextWritePanel(props: PanelProps) {
  const { cp, artifacts, busy, promptId, sent } = props;
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
            readOnly={sent}
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
            {changed && cp.initialText && !sent ? (
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
      <TurnFooter kind={cp.kind} ready={ready} busy={busy} onSubmit={submit} sent={sent} />
    </>
  );
}

/** react: a short free-text reaction or direction (VISION), next to what it reacts to. */
export function ReactPanel(props: PanelProps) {
  const { cp, artifacts, busy, promptId, sent } = props;
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
            readOnly={sent}
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
      <TurnFooter kind={cp.kind} ready={ready} busy={busy} onSubmit={submit} sent={sent} />
    </>
  );
}
