'use client';

/**
 * "Examples you admire" (ADR-0071): optional references for a recipe that takes them. Pasted text stays in the
 * page until the run starts; an image is stored as soon as it is added, so a bad file is refused while you are
 * still here. Each becomes an artifact, passed to the run as StartRunInput.inputs.refs.
 */
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { focusAfterRemoval } from '../view/focus.ts';
import { MAX_REF_IMAGE_BYTES, MAX_REF_TEXT, MAX_REFS, REF_IMAGE_TYPES, REFS_NOTE, refsStatus, type RefImageType } from '../view/refs.ts';
import { exampleHeldKeyRefusal, HELD_KEY_REFUSAL } from '../view/refusals.ts';
import { ApiError, artifactUrl, post } from './api.ts';
import { actionAttributes, blockActivation, useAction } from './useAction.ts';

export type ExampleEntry = { key: number; kind: 'text'; text: string } | { key: number; kind: 'image'; name: string; artifactId: string };

/** How many examples will actually be sent: images, and text that is not blank. */
export function exampleCount(entries: ExampleEntry[]): number {
  return entries.filter((e) => e.kind === 'image' || e.text.trim().length > 0).length;
}

/**
 * Stores the pasted examples and returns every example's artifact id, in the order you added them. When byway refuses a
 * pasted example because it holds one of byway's provider keys (ADR-0088), `onHeldKey` is given that example's text, so
 * the screen stops keeping it in the tab, and the refusal is thrown on, naming the example as the screen numbers it
 * ("Example 2 contains your …"); nothing after it is sent.
 */
export async function storeExamples(entries: ExampleEntry[], onHeldKey?: (text: string) => void): Promise<string[]> {
  const ids: string[] = [];
  for (const [i, e] of entries.entries()) {
    if (e.kind === 'image') ids.push(e.artifactId);
    else if (e.text.trim()) {
      try {
        ids.push((await post<{ artifactId: string }>('/api/refs', { text: e.text })).artifactId);
      } catch (err) {
        if (!(err instanceof ApiError) || err.code !== HELD_KEY_REFUSAL) throw err;
        onHeldKey?.(e.text);
        throw new ApiError(exampleHeldKeyRefusal(i + 1, err.heldKey, err.message), err.code, err.fields, err.heldKey);
      }
    }
  }
  return ids;
}

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const isRefImage = (type: string): type is RefImageType => (REF_IMAGE_TYPES as readonly string[]).includes(type);

interface Props {
  entries: ExampleEntry[];
  onChange: (update: (entries: ExampleEntry[]) => ExampleEntry[]) => void;
  disabled?: boolean;
}

export function Examples({ entries, onChange, disabled = false }: Props) {
  const id = useId();
  const lastKey = useRef(0);
  // A new entry's key comes after every key in use, kept ones restored from this tab included (ADR-0082), and after any
  // handed out earlier in a loop that has not re-rendered yet.
  const newKey = () => (lastKey.current = Math.max(lastKey.current, ...entries.map((e) => e.key)) + 1);
  const [error, setError] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const fields = useRef(new Map<number, HTMLTextAreaElement>());
  const removeButtons = useRef(new Map<number, HTMLButtonElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  // After a removal: the Remove button of the item that takes its place, or the Add button (UX-2). Undefined: none.
  const [refocus, setRefocus] = useState<{ key: number | null } | undefined>(undefined);
  const full = entries.length >= MAX_REFS;

  useEffect(() => {
    if (!refocus) return;
    (refocus.key === null ? addButton.current : removeButtons.current.get(refocus.key))?.focus();
    setRefocus(undefined);
  }, [refocus]);

  function remove(key: number) {
    setRefocus({ key: focusAfterRemoval(entries.map((x) => x.key), key) });
    onChange((list) => list.filter((x) => x.key !== key));
  }

  // A newly added text example gets the focus, so you can paste straight away.
  useEffect(() => {
    if (focusKey === null) return;
    fields.current.get(focusKey)?.focus();
    setFocusKey(null);
  }, [focusKey]);

  function addText() {
    const key = newKey();
    onChange((list) => [...list, { key, kind: 'text', text: '' }]);
    setFocusKey(key);
  }

  // Adding images is one action in flight (R5): while it runs, the file input keeps focus but opens no picker.
  const adding = useAction(async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length === 0) return;
    setError(null);
    const room = MAX_REFS - entries.length;
    if (files.length > room) setError(`You can add ${room} more ${room === 1 ? 'example' : 'examples'}; the rest were left out.`);
    try {
      for (const file of files.slice(0, Math.max(0, room))) {
        if (!isRefImage(file.type)) {
          setError(`${file.name} is not a PNG, JPEG or WebP image.`);
          continue;
        }
        if (file.size > MAX_REF_IMAGE_BYTES) {
          setError(`${file.name} is larger than 5 MB. Use a smaller one.`);
          continue;
        }
        const stored = await post<{ artifactId: string }>('/api/refs', { image: { mediaType: file.type, base64: await toBase64(file) } });
        const key = newKey();
        onChange((list) => [...list, { key, kind: 'image', name: file.name, artifactId: stored.artifactId }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That image was not added. Try again.');
    }
  });
  // Full or adding: the input says so and opens no picker, but keeps focus (a native disabled input would drop it).
  const fileState = { busy: adding.busy, unavailable: full };

  return (
    <fieldset className="ref-examples" aria-describedby={`${id}-note`} disabled={disabled}>
      <legend className="ref-examples-title">Examples you admire</legend>
      <p id={`${id}-note`} className="ref-examples-note">
        {REFS_NOTE}
      </p>
      {entries.length > 0 ? (
        <ol className="ref-example-list">
          {entries.map((e, i) => (
            <li key={e.key} className="ref-example" data-kind={e.kind}>
              {e.kind === 'text' ? (
                <>
                  <label htmlFor={`${id}-${e.key}`} className="field-label">
                    Example {i + 1}
                  </label>
                  <textarea
                    id={`${id}-${e.key}`}
                    ref={(el) => {
                      if (el) fields.current.set(e.key, el);
                      else fields.current.delete(e.key);
                    }}
                    className="textarea"
                    rows={3}
                    value={e.text}
                    maxLength={MAX_REF_TEXT}
                    placeholder="Paste a piece you admire"
                    onChange={(ev) => {
                      const text = ev.target.value;
                      onChange((list) => list.map((x) => (x.key === e.key && x.kind === 'text' ? { ...x, text } : x)));
                    }}
                  />
                </>
              ) : (
                <figure className="ref-example-image">
                  <img src={artifactUrl(e.artifactId)} alt={`Example ${i + 1}: ${e.name}`} />
                  <figcaption>{e.name}</figcaption>
                </figure>
              )}
              <button
                type="button"
                className="link-button ref-example-remove"
                ref={(el) => {
                  if (el) removeButtons.current.set(e.key, el);
                  else removeButtons.current.delete(e.key);
                }}
                onClick={() => remove(e.key)}
              >
                Remove<span className="sr-only"> example {i + 1}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="ref-example-actions">
        <button type="button" className="button" onClick={addText} disabled={full} ref={addButton}>
          Paste an example
        </button>
        <label className="button file-button" data-disabled={full || adding.busy ? 'true' : undefined}>
          {adding.busy ? 'Adding…' : 'Add images'}
          <input
            type="file"
            className="sr-only"
            accept={REF_IMAGE_TYPES.join(',')}
            multiple
            {...actionAttributes(fileState)}
            onClick={(ev) => blockActivation(ev, fileState)}
            onChange={(ev) => void adding.run(ev)}
          />
        </label>
      </div>
      <p className="ref-examples-status" role="status">
        {refsStatus(exampleCount(entries))}
      </p>
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
