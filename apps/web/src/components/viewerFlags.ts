'use client';

/**
 * Switches that belong to this browser, not to the workspace: whether single-key shortcuts answer a Your turn (UX-1,
 * WCAG 2.1.4). They live in localStorage, which may be missing or refuse (private windows, blocked site data), so every
 * read and write falls back to memory and the default; the server always renders the default.
 *
 * Running a generated page's scripts is deliberately not one of these (SEC-4): a remembered switch would run every
 * later page's scripts the moment it is shown. It is a per-page action (usePageScripts in ScriptsToggle.tsx).
 */
import { useSyncExternalStore } from 'react';

export interface FlagStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ViewerFlag {
  get(): boolean;
  set(on: boolean): void;
  subscribe(listener: () => void): () => void;
  readonly fallback: boolean;
}

const browserStorage = (): FlagStorage | undefined => (typeof window === 'undefined' ? undefined : window.localStorage);

export function createViewerFlag(key: string, fallback: boolean, storage: () => FlagStorage | undefined = browserStorage): ViewerFlag {
  let memory: boolean | undefined;
  const listeners = new Set<() => void>();
  const read = (): boolean | undefined => {
    try {
      const raw = storage()?.getItem(key);
      return raw === '1' ? true : raw === '0' ? false : undefined;
    } catch {
      return undefined;
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === key) for (const l of listeners) l();
  };
  return {
    fallback,
    get: () => read() ?? memory ?? fallback,
    set(on: boolean) {
      memory = on;
      try {
        storage()?.setItem(key, on ? '1' : '0');
      } catch {
        // Kept in memory for this page instead.
      }
      for (const l of listeners) l();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      // Another tab changed it.
      if (listeners.size === 1 && typeof window !== 'undefined') window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
      };
    },
  };
}

export function useViewerFlag(flag: ViewerFlag): [boolean, (on: boolean) => void] {
  const value = useSyncExternalStore(flag.subscribe, flag.get, () => flag.fallback);
  return [value, flag.set];
}

/** Single-key shortcuts (Y/N, J/K, Space, Enter) on a Your turn; on by default, and can be turned off (WCAG 2.1.4). */
export const SINGLE_KEY_SHORTCUTS = createViewerFlag('byway.singleKeyShortcuts', true);
