'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { recipeTitle } from '../view/vocabulary.ts';
import { HELD_KEY_REFUSAL } from '../view/refusals.ts';
import { ActionButton } from './ActionButton.tsx';
import { ApiError, post } from './api.ts';
import { forgetRefusedStart, loadStartAttachments, loadStartDraft, saveStartAttachments, saveStartDraft } from './startDraft.ts';
import { useTechnicalNames } from './TechNames.tsx';
import { useAction } from './useAction.ts';
import { useShortcuts } from './useShortcuts.ts';
import { focusAfterRemoval } from '../view/focus.ts';

/** Examples that span the eight recipes, so the first visit shows what byway is for. */
const EXAMPLES = [
  'A landing page for the spring classes at my pottery studio',
  'Names for a budgeting app for teenagers',
  'A weekly newsletter about cycling in the city',
  'A 30-second ad for a neighbourhood bakery',
  'A cover letter for a museum education job',
  'A short story I am writing about a lighthouse keeper',
] as const;

interface Attachment {
  key: number;
  name: string;
  text: string;
}

const MAX_ATTACHMENTS = 5;

export function StartForm({ recipe }: { recipe?: { recipeId: string; name: string; code: string } }) {
  const router = useRouter();
  const technical = useTechnicalNames();
  const fieldId = useId();
  const hintId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const removeButtons = useRef(new Map<number, HTMLButtonElement>());
  const attachButton = useRef<HTMLButtonElement>(null);
  // After a removal, focus goes to the Remove button that takes its place, or the Attach button (UX-2).
  const [refocus, setRefocus] = useState<{ key: number | null } | undefined>(undefined);
  useEffect(() => {
    if (!refocus) return;
    (refocus.key === null ? attachButton.current : removeButtons.current.get(refocus.key))?.focus();
    setRefocus(undefined);
  }, [refocus]);

  function removeAttachment(key: number) {
    attachmentsTouched.current = true;
    setRefocus({ key: focusAfterRemoval(attachments.map((a) => a.key), key) });
    setAttachments((list) => list.filter((x) => x.key !== key));
  }
  const [nextKey, setNextKey] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Restore what you wrote, and what you attached, before following "Change" back from the Recommendation screen (after
  // hydration, so the server HTML and the first client render agree; ADR-0082).
  useEffect(() => {
    const draft = loadStartDraft();
    if (draft) setText((current) => current || draft);
    const kept = loadStartAttachments();
    if (kept.length > 0) {
      setAttachments((current) => (current.length > 0 ? current : kept.map((a, i) => ({ key: i + 1, ...a }))));
      setNextKey((k) => Math.max(k, kept.length + 1));
    }
  }, []);
  // Attachments are kept as you change them; nothing is written until you do, so a restore is never overwritten.
  const attachmentsTouched = useRef(false);
  useEffect(() => {
    if (attachmentsTouched.current) saveStartAttachments(attachments.map(({ name, text: body }) => ({ name, text: body })));
  }, [attachments]);

  function edit(next: string) {
    setText(next);
    saveStartDraft(next);
  }

  // Asking for a recommendation is one action in flight (R5): the button, Enter on it and Ctrl+Enter all run it, and a
  // second start while one is on its way does nothing. On success it holds until the next screen replaces this one.
  const submitting = useAction(async () => {
    if (!text.trim()) {
      setError('Describe what you are working on first.');
      field.current?.focus();
      return;
    }
    setError(null);
    try {
      const { intakeId } = await post<{ intakeId: string }>('/api/intakes', {
        text,
        attachments: attachments.filter((a) => a.text.trim()).map(({ name, text: body }) => ({ name: name.trim() || 'Attachment', text: body })),
        ...(recipe ? { recipeId: recipe.recipeId } : {}),
      });
      // A library choice travels in the address, so the Recommendation screen shows that recipe instead of choosing.
      router.push(recipe ? `/recommend/${intakeId}?recipe=${encodeURIComponent(recipe.recipeId)}` : `/recommend/${intakeId}`);
      return 'hold';
    } catch (err) {
      // A refused key (ADR-0088): the form keeps everything so the key can be taken out, but the tab's session stops
      // keeping the part that held it (the text, the attachments or both) and keeps the rest. That part is kept again
      // once it is edited: the text on each keystroke, the attachments on any change to them.
      if (err instanceof ApiError && err.code === HELD_KEY_REFUSAL) forgetRefusedStart(err.fields);
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
    }
  });
  const busy = submitting.busy;
  function submit(event?: FormEvent) {
    event?.preventDefault();
    void submitting.run();
  }

  useShortcuts({ 'Mod+Enter': () => submit() });

  // A new attachment takes the focus in its name field, so you can name it and paste straight away (as a new example
  // does). At the fifth the attach button goes, and focus would otherwise fall to the page with it (R5).
  const nameFields = useRef(new Map<number, HTMLInputElement>());
  const [focusKey, setFocusKey] = useState<number | null>(null);
  useEffect(() => {
    if (focusKey === null) return;
    nameFields.current.get(focusKey)?.focus();
    setFocusKey(null);
  }, [focusKey]);

  function addAttachment() {
    attachmentsTouched.current = true;
    const key = nextKey;
    setAttachments((list) => [...list, { key, name: '', text: '' }]);
    setNextKey((k) => k + 1);
    setFocusKey(key);
  }

  function updateAttachment(key: number, patch: Partial<Attachment>) {
    attachmentsTouched.current = true;
    setAttachments((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  return (
    <form className="start" onSubmit={submit} noValidate>
      <h1 className="start-title">
        <label htmlFor={fieldId}>What are you working on?</label>
      </h1>
      <p id={hintId} className="start-hint">
        Say it in your own words: what it is, who it is for, and what you want to end up with.
      </p>
      <textarea
        ref={field}
        id={fieldId}
        className="textarea start-field"
        rows={5}
        value={text}
        onChange={(e) => edit(e.target.value)}
        aria-describedby={hintId}
        aria-invalid={error !== null && !text.trim() ? true : undefined}
        maxLength={20_000}
        autoFocus
      />

      {text.trim() === '' ? (
        <div className="examples">
          <p className="examples-label">Or try one of these</p>
          <ul>
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  className="example"
                  onClick={() => {
                    edit(example);
                    field.current?.focus();
                  }}
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <ul className="attachments">
          {attachments.map((a, i) => (
            <li key={a.key} className="attachment">
              <div className="attachment-head">
                <label className="sr-only" htmlFor={`${fieldId}-name-${a.key}`}>
                  Name of attachment {i + 1}
                </label>
                <input
                  id={`${fieldId}-name-${a.key}`}
                  ref={(el) => {
                    if (el) nameFields.current.set(a.key, el);
                    else nameFields.current.delete(a.key);
                  }}
                  className="input attachment-name"
                  value={a.name}
                  placeholder="Name, e.g. Current draft"
                  maxLength={200}
                  onChange={(e) => updateAttachment(a.key, { name: e.target.value })}
                />
                <button
                  type="button"
                  className="button button-quiet"
                  ref={(el) => {
                    if (el) removeButtons.current.set(a.key, el);
                    else removeButtons.current.delete(a.key);
                  }}
                  onClick={() => removeAttachment(a.key)}
                >
                  Remove<span className="sr-only"> attachment {i + 1}</span>
                </button>
              </div>
              <label className="sr-only" htmlFor={`${fieldId}-text-${a.key}`}>
                Text of attachment {i + 1}
              </label>
              <textarea
                id={`${fieldId}-text-${a.key}`}
                className="textarea attachment-text"
                rows={8}
                value={a.text}
                placeholder="Paste a draft, notes or a diff"
                maxLength={200_000}
                onChange={(e) => updateAttachment(a.key, { text: e.target.value })}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <div className="start-actions">
        {attachments.length < MAX_ATTACHMENTS ? (
          <button type="button" className="button" onClick={addAttachment} ref={attachButton}>
            {attachments.length === 0 ? 'Attach a draft or diff' : 'Attach another'}
          </button>
        ) : null}
        <span className="start-spacer" />
        {recipe ? (
          <span className="start-recipe">
            Using {recipeTitle(recipe, technical)}.{' '}
            <Link href="/" replace>
              Let byway choose instead
            </Link>
          </span>
        ) : null}
        {/* Busy, it keeps focus and a press does nothing (R5); with nothing written yet, a press says so. */}
        <ActionButton type="submit" className="button button-primary button-large" busy={busy} incomplete={!text.trim()}>
          {busy ? 'Working…' : recipe ? 'Continue' : 'Get a recommendation'}
          <kbd aria-hidden="true">Ctrl ↵</kbd>
        </ActionButton>
      </div>
      <p className="error-text" role="alert">
        {error}
      </p>
    </form>
  );
}
