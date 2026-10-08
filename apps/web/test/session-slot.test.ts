/**
 * The one guarded helper for what a person enters and has not sent yet, kept for the tab session (ADR-0082): checkpoint
 * drafts, Recommendation examples and Start attachments. Storage may be missing, full or hold garbage; none of that may
 * break a screen or restore something malformed.
 */
import { describe, expect, it } from 'vitest';
import { keysWithPrefix, sessionSlot } from '../src/components/sessionSlot.ts';

class MapStorage {
  readonly map = new Map<string, string>();
  full = false;
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.full) throw new DOMException('quota', 'QuotaExceededError');
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const asString = (raw: unknown): string | null => (typeof raw === 'string' ? raw : null);

describe('sessionSlot', () => {
  it('keeps a value in a versioned envelope and reads it back', () => {
    const storage = new MapStorage();
    const slot = sessionSlot('byway.test', asString, () => storage as unknown as Storage);
    expect(slot.save('hello')).toBe(true);
    expect(JSON.parse(storage.map.get('byway.test') ?? '')).toEqual({ v: 1, value: 'hello' });
    expect(slot.load()).toBe('hello');
    slot.clear();
    expect(slot.load()).toBeNull();
  });

  it('reads garbage, another version or a value its decoder refuses as nothing', () => {
    const storage = new MapStorage();
    const slot = sessionSlot('byway.test', asString, () => storage as unknown as Storage);
    for (const raw of ['not json', '{"v":2,"value":"x"}', '{"value":"x"}', '{"v":1,"value":5}', 'null']) {
      storage.map.set('byway.test', raw);
      expect(slot.load(), raw).toBeNull();
    }
  });

  it('says a value was not kept when storage is full, and never throws', () => {
    const storage = new MapStorage();
    storage.full = true;
    const slot = sessionSlot('byway.test', asString, () => storage as unknown as Storage);
    expect(slot.save('too big')).toBe(false);
    expect(slot.load()).toBeNull();
  });

  it('works without storage at all (blocked site data, a server render)', () => {
    const missing = sessionSlot('byway.test', asString, () => undefined);
    expect(missing.save('x')).toBe(false);
    expect(missing.load()).toBeNull();
    missing.clear();
    const throwing = sessionSlot('byway.test', asString, () => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(throwing.save('x')).toBe(false);
    expect(throwing.load()).toBeNull();
    expect(keysWithPrefix('byway.', () => undefined)).toEqual([]);
  });

  it('lists the keys under a prefix', () => {
    const storage = new MapStorage();
    storage.map.set('byway.draft.run-1/cp1-a', '1');
    storage.map.set('byway.draft.run-1/cp2-b', '1');
    storage.map.set('byway.draft.run-2/cp1-a', '1');
    expect(keysWithPrefix('byway.draft.run-1/', () => storage as unknown as Storage).sort()).toEqual(['byway.draft.run-1/cp1-a', 'byway.draft.run-1/cp2-b']);
  });
});

