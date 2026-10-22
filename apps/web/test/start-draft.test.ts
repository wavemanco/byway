/**
 * What Start keeps in the tab after a held-key refusal (ADR-0088, ADR-0082 R1): only the part that held the key stops
 * being kept. Before, the refusal dropped the text and the attachments together, and attachments are written only when
 * they change, so fixing the text and reloading brought the text back without them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStartDraft, forgetRefusedStart, heldAttachmentKeys, loadStartAttachments, loadStartDraft, saveStartAttachments, saveStartDraft } from '../src/components/startDraft.ts';

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

/**
 * Which attachments Start stops keeping, one by one (ADR-0088 follow-up). Before, a key in one attachment dropped them
 * all, and any edit to any of them kept them all again, the one with the key included. Keys here are the form's keys;
 * the refusal's positions are in the list as sent, which leaves out empty attachments.
 */
describe('heldAttachmentKeys', () => {
  const inAttachments = (...items: { index: number; fields: string[] }[]) => [{ field: 'attachments', key: 'FAL_KEY', items: items.map((i) => ({ ...i, key: 'FAL_KEY' })) }];

  it('names only the attachments that held a key, by their keys on the form', () => {
    // Form keys 1, 2, 4 were sent (3 was empty); the second and third sent held a key.
    expect(heldAttachmentKeys(['attachments'], inAttachments({ index: 1, fields: ['text'] }, { index: 2, fields: ['name'] }), [1, 2, 4])).toEqual([2, 4]);
  });

  it('names none when the key was only in the text', () => {
    expect(heldAttachmentKeys(['text'], [{ field: 'text', key: 'FAL_KEY' }], [1, 2])).toEqual([]);
  });

  it('names every one sent when the refusal does not say which, or names one that was not sent', () => {
    for (const fields of [undefined, []]) expect(heldAttachmentKeys(fields, undefined, [1, 2])).toEqual([1, 2]);
    expect(heldAttachmentKeys(['attachments'], undefined, [1, 2])).toEqual([1, 2]);
    expect(heldAttachmentKeys(['attachments'], [{ field: 'attachments', key: 'FAL_KEY' }], [1, 2])).toEqual([1, 2]);
    expect(heldAttachmentKeys(['attachments'], inAttachments({ index: 2, fields: ['text'] }), [1, 2])).toEqual([1, 2]);
  });
});

describe('clearStartDraft', () => {
  it('drops the text and the attachments once a run has started', () => {
    clearStartDraft();
    expect(loadStartDraft()).toBe('');
    expect(loadStartAttachments()).toEqual([]);
  });
});
