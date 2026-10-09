'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { canSubmit, toResolution } from '../../../view/checkpoints.ts';
import { useShortcuts } from '../../useShortcuts.ts';
import { References } from './References.tsx';
import { TurnFooter } from './TurnFooter.tsx';
import type { PanelProps } from './types.ts';

interface Item {
  key: number;
  text: string;
}

/**
 * directive: a list editor for what to remove (CUT). Enter adds an item below, Backspace in an empty item
 * removes it, and Ctrl+Enter sends the list. The list starts as the Run screen kept it for this question (the starting
 * list until the person edits it), its row keys made once from that, and every change is written through (ADR-0082).
 * Once the list is sent it is read-only, so what it shows stays what was sent, until byway settles the question.
 */
export function DirectivePanel({ cp, artifacts, busy, onSubmit, promptId, draft: seed, onDraft, sent }: PanelProps) {
  const [items, setItemsState] = useState<Item[]>(() => (seed.items.length > 0 ? seed.items : ['']).map((text, key) => ({ key, text })));
  const [nextKey, setNextKey] = useState(items.length);
  const setItems = (next: Item[]) => {
    if (sent) return;
    setItemsState(next);
    onDraft({ ...seed, items: next.map((i) => i.text) });
  };
  // A new object per request, so asking to focus the same item again still moves focus there.
  const [focusRequest, setFocusRequest] = useState<{ key: number } | null>(items[0] ? { key: items[0].key } : null);
  const [hint, setHint] = useState<string | null>(null);
  const fields = useRef(new Map<number, HTMLInputElement>());
  const draft = { choice: [] as string[], text: '', items: items.map((i) => i.text), approved: null };
  const ready = canSubmit(cp, draft);
  const refs = cp.artifactIds ?? [];

  useEffect(() => {
    if (focusRequest) fields.current.get(focusRequest.key)?.focus();
  }, [focusRequest]);

  function insertAfter(index: number) {
    if (sent) return;
    const item = { key: nextKey, text: '' };
    setNextKey((k) => k + 1);
    setItems([...items.slice(0, index + 1), item, ...items.slice(index + 1)]);
    setFocusRequest({ key: item.key });
  }

  function remove(index: number) {
    if (sent) return;
    const next = items.filter((_, i) => i !== index);
    if (next.length === 0) {
      const fresh = { key: nextKey, text: '' };
      setNextKey((k) => k + 1);
      setItems([fresh]);
      setFocusRequest({ key: fresh.key });
      return;
    }
    setItems(next);
    setFocusRequest({ key: (next[Math.max(0, index - 1)] ?? next[0])!.key });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      insertAfter(index);
    } else if (event.key === 'Backspace' && items[index]?.text === '' && items.length > 1) {
      event.preventDefault();
      remove(index);
    }
  }

  function submit() {
    if (busy) return;
    if (!ready) {
      setHint('List at least one thing to remove.');
      return;
    }
    onSubmit(toResolution(cp, draft));
  }

  useShortcuts({ 'Mod+Enter': submit });

  return (
    <>
      <div className={refs.length > 0 ? 'directive directive-with-refs' : 'directive'}>
        <div className="directive-main">
          <ol className="list-editor" aria-describedby={promptId}>
            {items.map((item, i) => (
              <li key={item.key}>
                <span className="list-num" aria-hidden="true">
                  {i + 1}
                </span>
                <input
                  ref={(el) => {
                    if (el) fields.current.set(item.key, el);
                    else fields.current.delete(item.key);
                  }}
                  className="input"
                  aria-label={`Item ${i + 1}`}
                  value={item.text}
                  readOnly={sent}
                  placeholder={i === 0 ? 'Something to remove' : undefined}
                  onChange={(e) => {
                    const text = e.target.value;
                    setItems(items.map((x) => (x.key === item.key ? { ...x, text } : x)));
                    setHint(null);
                  }}
                  onKeyDown={(e) => onKeyDown(e, i)}
                />
                <button type="button" className="icon-button" onClick={() => remove(i)} disabled={sent} aria-label={`Remove item ${i + 1}`}>
                  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="button button-quiet" onClick={() => insertAfter(items.length - 1)} disabled={sent}>
            Add an item
          </button>
          <p className="muted small">Enter adds an item. Only what you list is removed.</p>
        </div>
        <References ids={refs} artifacts={artifacts} />
      </div>
      <p className="turn-hint" role="status">
        {hint}
      </p>
      <TurnFooter kind={cp.kind} ready={ready} busy={busy} onSubmit={submit} sent={sent} status={`${draft.items.filter((t) => t.trim()).length} to remove`} />
    </>
  );
}
