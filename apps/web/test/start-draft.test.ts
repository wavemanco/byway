/**
 * What Start keeps in the tab after a held-key refusal (ADR-0088, ADR-0082 R1): only the part that held the key stops
 * being kept. Before, the refusal dropped the text and the attachments together, and attachments are written only when
 * they change, so fixing the text and reloading brought the text back without them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStartDraft, forgetRefusedStart, loadStartAttachments, loadStartDraft, saveStartAttachments, saveStartDraft } from '../src/components/startDraft.ts';

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

const NOTES = [{ name: 'Class notes', text: 'Spring classes: wheel throwing on Tuesdays.' }];

beforeEach(() => {
  const storage = new MapStorage();
  vi.stubGlobal('sessionStorage', storage);
  vi.stubGlobal('window', { sessionStorage: storage });
  saveStartDraft('A landing page for my pottery studio.');
  saveStartAttachments(NOTES);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('forgetRefusedStart', () => {
  it('stops keeping the text and keeps the attachments when the key was in the text', () => {
    forgetRefusedStart(['text']);
    expect(loadStartDraft()).toBe('');
    expect(loadStartAttachments()).toEqual(NOTES);
  });

  it('stops keeping the attachments and keeps the text when the key was in an attachment', () => {
    forgetRefusedStart(['attachments']);
    expect(loadStartDraft()).toBe('A landing page for my pottery studio.');
    expect(loadStartAttachments()).toEqual([]);
  });

  it('stops keeping both when both held one', () => {
    forgetRefusedStart(['text', 'attachments']);
    expect(loadStartDraft()).toBe('');
    expect(loadStartAttachments()).toEqual([]);
  });

  it('stops keeping both when the refusal does not say where the key was', () => {
    for (const fields of [undefined, []]) {
      saveStartDraft('A landing page for my pottery studio.');
      saveStartAttachments(NOTES);
      forgetRefusedStart(fields);
      expect(loadStartDraft()).toBe('');
      expect(loadStartAttachments()).toEqual([]);
    }
  });

  it('keeps both when the key was in a field Start does not keep', () => {
    forgetRefusedStart(['recipeId']);
    expect(loadStartDraft()).toBe('A landing page for my pottery studio.');
    expect(loadStartAttachments()).toEqual(NOTES);
  });
});

describe('clearStartDraft', () => {
  it('drops the text and the attachments once a run has started', () => {
    clearStartDraft();
    expect(loadStartDraft()).toBe('');
    expect(loadStartAttachments()).toEqual([]);
  });
});
