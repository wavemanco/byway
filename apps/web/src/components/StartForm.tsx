'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type Ref } from 'react';
import { recipeTitle } from '../view/vocabulary.ts';
import { HELD_KEY_REFUSAL, heldKeyParts, startRefusalNow, type StartRefusal } from '../view/refusals.ts';
import { ActionButton } from './ActionButton.tsx';
import { ApiError, post } from './api.ts';
import { forgetRefusedStart, heldAttachmentKeys, loadStartAttachments, loadStartDraft, saveStartAttachments, saveStartDraft, withheldAfterCheck } from './startDraft.ts';
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

/** The most attachments Start's request takes (server/schemas.ts ProblemInput). */
export const MAX_ATTACHMENTS = 5;

/** What Start says in place of its attach button once five attachments are listed. */
export const ATTACH_LIMIT_NOTE = 'byway takes up to five attachments for one problem.';

/**
 * Start's attach button while another attachment fits; at the limit, a note in its place that says why it went. The note
 * is text, not a control: a disabled button would still be a stop in the Tab order that does nothing (R5,
 * guard-disabled.test.ts), and focus is already in the new attachment's name field.
 */
export function AttachControl({ count, onAttach, buttonRef }: { count: number; onAttach: () => void; buttonRef?: Ref<HTMLButtonElement> }) {
  if (count >= MAX_ATTACHMENTS) return <span className="muted small">{ATTACH_LIMIT_NOTE}</span>;
  return (
    <button type="button" className="button" onClick={onAttach} ref={buttonRef}>
      {count === 0 ? 'Attach a draft or diff' : 'Attach another'}
    </button>
  );
}

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
  // A held-key refusal is kept as it came, and said as the form stands now (startRefusalNow).
  const [refusal, setRefusal] = useState<StartRefusal | null>(null);

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
  // Attachments are kept as you change them; nothing is written until you do, so a restore is never overwritten. One
  // that held a key byway refused (ADR-0088) is shown to be edited but not kept, by its key here, until byway's own
  // check finds no key in it: Start's next request carries it as it is, and is accepted or refused for other parts only
  // (withheldAfterCheck). Editing it is not enough, since a rename leaves the key in its text.
  const attachmentsTouched = useRef(false);
  const [withheld, setWithheld] = useState<ReadonlySet<number>>(() => new Set());
  useEffect(() => {
    if (attachmentsTouched.current) saveStartAttachments(attachments.filter((a) => !withheld.has(a.key)).map(({ name, text: body }) => ({ name, text: body })));
  }, [attachments, withheld]);
  // The attachments as the form holds them now, for an answer that comes back after they were edited.
  const current = useRef(attachments);
  current.current = attachments;

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
    setRefusal(null);
    // An empty attachment is not sent, so the refusal's positions are positions in this list, not on the form.
    const sent = attachments.filter((a) => a.text.trim());
    try {
      const { intakeId } = await post<{ intakeId: string }>('/api/intakes', {
        text,
        attachments: sent.map(({ name, text: body }) => ({ name: name.trim() || 'Attachment', text: body })),
        ...(recipe ? { recipeId: recipe.recipeId } : {}),
      });
      // byway found no key in what was sent: an attachment not kept since an earlier refusal is kept again if it is
      // still as it was sent, so "Change" brings it back.
      setWithheld((keys) => withheldAfterCheck(keys, sent, [], current.current));
      // A library choice travels in the address, so the Recommendation screen shows that recipe instead of choosing.
      router.push(recipe ? `/recommend/${intakeId}?recipe=${encodeURIComponent(recipe.recipeId)}` : `/recommend/${intakeId}`);
      return 'hold';
    } catch (err) {
      // A refused key (ADR-0088): the form keeps everything so the key can be taken out, but the tab's session stops
      // keeping the part that held it (the text, an attachment or both) and keeps the rest. The text is kept again on
      // its next keystroke; an attachment once byway's check finds no key in it (withheldAfterCheck). The refusal names
      // the attachment as this form numbers it, and by the name you gave it.
      if (err instanceof ApiError && err.code === HELD_KEY_REFUSAL) {
        const parts = heldKeyParts(err.body);
        forgetRefusedStart(err.fields);
        attachmentsTouched.current = true;
        const named = heldAttachmentKeys(err.fields, parts, sent.map((a) => a.key));
        setWithheld((keys) => withheldAfterCheck(keys, sent, named, current.current));
        setRefusal({ parts, sent: sent.map((a) => ({ key: a.key, name: a.name })), message: err.message });
        return;
      }
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
    }
  });
  const shownError = error ?? (refusal ? startRefusalNow(refusal, attachments.map((a) => a.key)) : null);
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
        <AttachControl count={attachments.length} onAttach={addAttachment} buttonRef={attachButton} />
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
        {shownError}
      </p>
    </form>
  );
}
