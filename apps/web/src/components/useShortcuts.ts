'use client';

import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Preferences } from '@byway/contracts';
import { get } from './api.ts';

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

/**
 * Settings' "Single-key shortcuts", a Store preference (Preferences.singleKeyShortcuts) the root layout hands down, so it
 * stays as set when byway starts again at a new address (B-188's re-check 2). On by default (WCAG 2.1.4 lets it be off).
 */
const SingleKeys = createContext<{ on: boolean; set(on: boolean): void }>({ on: true, set: () => undefined });

/**
 * The channel byway's open tabs hear a change of the switch on (B-188's re-check 3): a tab other than the one that saved
 * it would otherwise keep the value it was rendered with, and a stray Y there would still answer a yes/no question. Only
 * pages of byway's own address can use it; a generated page runs in a sandboxed frame of no address at all.
 */
const SETTINGS_CHANNEL = 'byway.settings';

/** Tells byway's other open tabs that the switch changed; the tab that saved it reads it again from the server. */
export function announceSingleKeys(on: boolean): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(SETTINGS_CHANNEL);
  channel.postMessage({ singleKeyShortcuts: on });
  channel.close();
}

export function SingleKeysProvider({ value, children }: { value: boolean; children: ReactNode }) {
  const [on, setOn] = useState(value);
  // A new value from the server (this tab saved it, or navigated) replaces whatever the channel said before.
  useEffect(() => setOn(value), [value]);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(SETTINGS_CHANNEL);
    channel.onmessage = (event: MessageEvent) => {
      const next = (event.data as { singleKeyShortcuts?: unknown } | null)?.singleKeyShortcuts;
      if (typeof next === 'boolean') setOn(next);
    };
    return () => channel.close();
  }, []);
  // And from byway itself, once this page has loaded and whenever it comes back into view (B-188's check 4): a change made
  // while this page was loading reached it by neither its render nor the channel, and a tab in another browser profile
  // or a private window never hears the channel. A read that fails changes nothing.
  useEffect(() => {
    let current = true;
    const reread = () => {
      if (document.visibilityState !== 'visible') return;
      get<Preferences>('/api/settings').then(
        (prefs) => current && typeof prefs.singleKeyShortcuts === 'boolean' && setOn(prefs.singleKeyShortcuts),
        () => undefined,
      );
    };
    reread();
    document.addEventListener('visibilitychange', reread);
    return () => {
      current = false;
      document.removeEventListener('visibilitychange', reread);
    };
  }, []);
  const switchState = useMemo(() => ({ on, set: setOn }), [on]);
  return createElement(SingleKeys, { value: switchState }, children);
}

/** Whether single-key shortcuts are on (Settings), for panels that list them. */
export function useSingleKeyShortcuts(): boolean {
  return useContext(SingleKeys).on;
}

/**
 * Settings' own switch: the value every screen of this tab uses, and `saved(on)`, which a successful save calls so that
 * this tab and byway's others take it at once.
 */
export function useSingleKeysSwitch(): [on: boolean, saved: (on: boolean) => void] {
  const { on, set } = useContext(SingleKeys);
  return [
    on,
    (next) => {
      set(next);
      announceSingleKeys(next);
    },
  ];
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
