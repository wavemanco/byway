'use client';

import { useEffect, useRef } from 'react';

export type ShortcutMap = Partial<Record<string, (event: KeyboardEvent) => void>>;

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Single-key shortcuts for the frequent actions (J/K, Space, Enter, Y/N). They never fire while you type in a
 * field, and never with Ctrl, Cmd or Alt held, so browser and system shortcuts keep working. "Mod+Enter" is
 * the one combination handled, and it works in fields too (send what you wrote).
 */
export function useShortcuts(map: ShortcutMap, enabled = true): void {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        const handler = ref.current['Mod+Enter'];
        if (handler) {
          event.preventDefault();
          handler(event);
        }
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
      const key = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key;
      // A focused button or link already acts on Enter and Space; let it.
      const target = event.target as HTMLElement | null;
      const native = target && (target.tagName === 'BUTTON' || target.tagName === 'A') && !target.dataset.shortcutTarget;
      if (native && (key === 'Enter' || key === 'Space')) return;
      const handler = ref.current[key];
      if (handler) {
        event.preventDefault();
        handler(event);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
