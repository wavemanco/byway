'use client';

import { createContext, useContext, useEffect, useRef, type RefObject } from 'react';
import { SINGLE_KEY_SHORTCUTS, useViewerFlag } from './viewerFlags.ts';

export type ShortcutMap = Partial<Record<string, (event: KeyboardEvent) => void>>;

/**
 * The element a panel's single-key shortcuts belong to: the Your turn section. A key pressed while focus is elsewhere
 * on the page (Pause, a timeline row, a link) is not an answer (UX-1).
 */
export const ShortcutScope = createContext<RefObject<HTMLElement | null> | null>(null);

/** A key press as the decision needs it, so the rules are testable without a browser. */
export interface KeyPress {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  composing: boolean;
  defaultPrevented: boolean;
  target: {
    tag: string;
    /** For inputs: their type. */
    type?: string;
    editable: boolean;
    /** Inside the panel's scope, or nowhere in particular (the page body). */
    inScope: boolean;
    /** A button or link that opted in to shortcuts (data-shortcut-target). */
    shortcutTarget: boolean;
  };
}

const CHOICE_INPUTS = new Set(['checkbox', 'radio']);

/**
 * Which entry of the map a key press runs, or null. Ctrl/Cmd+Enter ("Mod+Enter") works anywhere, fields included
 * (send what you wrote). Every other shortcut is a single key: it never fires while you type in a field or with Ctrl,
 * Cmd or Alt held, only when focus is in the panel (or nowhere), and only while single-key shortcuts are on in
 * Settings (WCAG 2.1.4). Escape is not a character key, so it only needs focus to be outside a field.
 */
export function shortcutFor(press: KeyPress, map: ShortcutMap, singleKeys: boolean): string | null {
  if (press.defaultPrevented || press.composing) return null;
  if ((press.ctrl || press.meta) && press.key === 'Enter') return map['Mod+Enter'] ? 'Mod+Enter' : null;
  if (press.ctrl || press.meta || press.alt) return null;
  const { target } = press;
  const choice = target.tag === 'INPUT' && CHOICE_INPUTS.has(target.type ?? '');
  const typing = !choice && (target.editable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tag));
  if (typing) return null;
  const key = press.key === ' ' ? 'Space' : press.key.length === 1 ? press.key.toUpperCase() : press.key;
  if (key !== 'Escape') {
    if (!singleKeys || !target.inScope) return null;
    // A focused button or link already acts on Enter and Space, and a checkbox or radio on Space; let them.
    const native = (target.tag === 'BUTTON' || target.tag === 'A') && !target.shortcutTarget;
    if (native && (key === 'Enter' || key === 'Space')) return null;
    if (key === 'Space' && choice) return null;
  }
  return map[key] ? key : null;
}

function describe(event: KeyboardEvent, scope: HTMLElement | null | undefined): KeyPress {
  const el = event.target instanceof HTMLElement ? event.target : null;
  const inScope = !el || el === document.body || (scope ? scope.contains(el) : true);
  return {
    key: event.key,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    alt: event.altKey,
    composing: event.isComposing,
    defaultPrevented: event.defaultPrevented,
    target: {
      tag: el?.tagName ?? '',
      ...(el instanceof HTMLInputElement ? { type: el.type } : {}),
      editable: el?.isContentEditable ?? false,
      inScope,
      shortcutTarget: el?.dataset.shortcutTarget !== undefined,
    },
  };
}

/** Whether single-key shortcuts are on in this browser (Settings), for panels that list them. */
export function useSingleKeyShortcuts(): boolean {
  return useViewerFlag(SINGLE_KEY_SHORTCUTS)[0];
}

/**
 * Keyboard shortcuts for the frequent actions (J/K, Space, Enter, Y/N, and Ctrl+Enter to send). Single keys act only
 * inside the Your turn panel they belong to (ShortcutScope) and only while turned on in Settings; see shortcutFor.
 */
export function useShortcuts(map: ShortcutMap, enabled = true): void {
  const ref = useRef(map);
  ref.current = map;
  const scope = useContext(ShortcutScope);
  const singleKeys = useSingleKeyShortcuts();
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const name = shortcutFor(describe(event, scope?.current), ref.current, singleKeys);
      const handler = name ? ref.current[name] : undefined;
      if (handler) {
        event.preventDefault();
        handler(event);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, scope, singleKeys]);
}
