/**
 * "Examples you admire" after byway refused one for holding a provider key (ADR-0088, ADR-0082 R1): the tab stops
 * keeping only the example whose text held the key, keeps the rest, and keeps that example again once its text changes.
 * Before, the refused text stayed in sessionStorage, key and all, as Start's paste once did.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { storeExamples, type ExampleEntry } from '../src/components/Examples.tsx';
import { examplesSlot, keepExamples, type KeptExample } from '../src/components/examplesDraft.ts';
import { HELD_KEY_REFUSAL } from '../src/view/refusals.ts';

class MapStorage {
  readonly map = new Map<string, string>();
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
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const HELD = 'A memo I admire. config: sk-ant-unit-test-not-a-key';
const CLEAN = 'A second memo I admire: two lines, the ask first.';
const IMAGE: KeptExample = { kind: 'image', name: 'poster.png', artifactId: `sha256:${'a'.repeat(64)}` };

describe('keepExamples', () => {
  const setup = () => {
    const storage = new MapStorage();
    const source = () => storage as unknown as Storage;
    return { storage, source, load: () => examplesSlot('intake-1', source).load() };
  };

  it('keeps every example but the text byway refused', () => {
    const { source, load } = setup();
    keepExamples('intake-1', [{ kind: 'text', text: HELD }, { kind: 'text', text: CLEAN }, IMAGE], new Set([HELD]), source);
    expect(load()).toEqual([{ kind: 'text', text: CLEAN }, IMAGE]);
  });

  it('keeps that example again once its text is edited', () => {
    const { source, load } = setup();
    keepExamples('intake-1', [{ kind: 'text', text: HELD }], new Set([HELD]), source);
    keepExamples('intake-1', [{ kind: 'text', text: 'A memo I admire.' }], new Set([HELD]), source);
    expect(load()).toEqual([{ kind: 'text', text: 'A memo I admire.' }]);
  });

  it('keeps nothing, and clears what was kept, when only refused text is left', () => {
    const { storage, source } = setup();
    keepExamples('intake-1', [{ kind: 'text', text: HELD }, { kind: 'text', text: CLEAN }], new Set(), source);
    expect([...storage.map.values()].join('')).toContain(HELD);
    keepExamples('intake-1', [{ kind: 'text', text: HELD }], new Set([HELD]), source);
    expect(storage.map.size).toBe(0);
  });
});

describe('storeExamples', () => {
  afterEach(() => vi.unstubAllGlobals());

  const entries: ExampleEntry[] = [
    { key: 1, kind: 'text', text: CLEAN },
    { key: 2, kind: 'text', text: HELD },
    { key: 3, kind: 'text', text: 'Never sent: the refusal stops the rest.' },
  ];

  it('says which example byway refused for holding a key, then fails with the refusal', async () => {
    const sent: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const { text } = JSON.parse(String(init.body)) as { text: string };
      sent.push(text);
      return text === HELD
        ? Response.json({ error: 'This text contains your ANTHROPIC_API_KEY.', code: HELD_KEY_REFUSAL, fields: ['text'] }, { status: 400 })
        : Response.json({ artifactId: `sha256:${'b'.repeat(64)}` }, { status: 201 });
    });
    const refused = vi.fn();
    await expect(storeExamples(entries, refused)).rejects.toMatchObject({ name: 'ApiError', code: HELD_KEY_REFUSAL });
    expect(refused).toHaveBeenCalledExactlyOnceWith(HELD);
    expect(sent).toEqual([CLEAN, HELD]);
  });

  it('names no example for any other refusal', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'Paste an example first.' }, { status: 400 }));
    const refused = vi.fn();
    await expect(storeExamples(entries, refused)).rejects.toThrow('Paste an example first.');
    expect(refused).not.toHaveBeenCalled();
  });
});
