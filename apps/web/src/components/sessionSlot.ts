/**
 * The one guarded way to keep what a person entered and has not sent yet for this tab's session (ADR-0082, R1):
 * checkpoint drafts, Recommendation examples and Start attachments. sessionStorage may be missing (a server render),
 * blocked (site data off), full, or hold anything, so every access is guarded and everything read back is decoded.
 * A value that cannot be kept stays in memory with its owner; nothing here may break a screen.
 *
 * Values sit in a versioned envelope, { v: 1, value }, so a later format can tell an old value from a new one instead of
 * misreading it.
 */

const VERSION = 1;

export type StorageSource = () => Storage | undefined;

const browserSession: StorageSource = () => (typeof window === 'undefined' ? undefined : window.sessionStorage);

function storageOf(source: StorageSource): Storage | undefined {
  try {
    return source();
  } catch {
    return undefined;
  }
}

export interface SessionSlot<T> {
  /** The kept value, or null when there is none or it cannot be read as one. */
  load(): T | null;
  /** Keeps the value; false when it could not be kept (no storage, or storage full). */
  save(value: T): boolean;
  clear(): void;
}

export function sessionSlot<T>(key: string, decode: (raw: unknown) => T | null, source: StorageSource = browserSession): SessionSlot<T> {
  return {
    load() {
      try {
        const raw = storageOf(source)?.getItem(key);
        if (!raw) return null;
        const envelope = JSON.parse(raw) as { v?: unknown; value?: unknown } | null;
        if (typeof envelope !== 'object' || envelope === null || envelope.v !== VERSION) return null;
        return decode(envelope.value);
      } catch {
        return null;
      }
    },
    save(value) {
      try {
        const storage = storageOf(source);
        if (!storage) return false;
        storage.setItem(key, JSON.stringify({ v: VERSION, value }));
        return true;
      } catch {
        // Full or refused: the owner still has it in memory.
        return false;
      }
    },
    clear() {
      try {
        storageOf(source)?.removeItem(key);
      } catch {
        // Nothing to clear.
      }
    },
  };
}

/** Every key that starts with `prefix` (a run's checkpoint drafts). */
export function keysWithPrefix(prefix: string, source: StorageSource = browserSession): string[] {
  try {
    const storage = storageOf(source);
    if (!storage) return [];
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k !== null && k.startsWith(prefix)) keys.push(k);
    }
    return keys;
  } catch {
    return [];
  }
}
