/**
 * The Run screen's draft store (F06, ADR-0082) against a stubbed sessionStorage: one key per question, debounced and
 * flushed on pagehide and unmount, loaded once, kept in memory when storage refuses, and alive through StrictMode's
 * setup, cleanup and setup again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckpointKind, CheckpointRecord } from '@byway/contracts';
import { createDraftStore } from '../src/components/run/draftStore.ts';
import { toResolution, type CheckpointDraft } from '../src/view/checkpoints.ts';

class StubStorage {
  readonly map = new Map<string, string>();
  reads = 0;
  writes = 0;
  failWrites = false;
  get length() {
    this.reads++;
    return this.map.size;
  }
  key(i: number) {
    this.reads++;
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    this.reads++;
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new DOMException('quota', 'QuotaExceededError');
    this.writes++;
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

const cp = (n: number, kind: CheckpointKind, extra: Partial<CheckpointRecord> = {}): CheckpointRecord => ({
  id: `run-1/cp${n}-step${n}`,
  runId: 'run-1',
  stepId: `step${n}`,
  kind,
  prompt: 'Question?',
  status: 'open',
  openedAt: '2026-10-08T10:00:00.000Z',
  ...extra,
});
const draft = (over: Partial<CheckpointDraft> = {}): CheckpointDraft => ({ choice: [], text: '', items: [], approved: null, ...over });
const key = (record: CheckpointRecord) => `byway.draft.${record.id}`;

let storage: StubStorage;
const make = () => createDraftStore('run-1', { storage: () => storage as unknown as Storage });

beforeEach(() => {
  vi.useFakeTimers();
  storage = new StubStorage();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the draft store', () => {
  it('reads no storage when created, so the instance StrictMode throws away is harmless', () => {
    make();
    expect(storage.reads).toBe(0);
    expect(storage.writes).toBe(0);
  });

  it('writes one key per question, after a short pause in typing', () => {
    const store = make();
    const a = cp(1, 'write');
    const b = cp(2, 'react');
    store.put(a, draft({ text: 'one' }));
    store.put(a, draft({ text: 'one two' }));
    store.put(b, draft({ text: 'other' }));
    expect(storage.writes).toBe(0);
    vi.advanceTimersByTime(400);
    expect([...storage.map.keys()].sort()).toEqual([key(a), key(b)].sort());
    expect(storage.writes).toBe(2);
    expect(store.get(a).text).toBe('one two');
  });

  it('flush() and pagehide write pending drafts at once', () => {
    const store = make();
    const a = cp(1, 'write');
    store.put(a, draft({ text: 'flushed' }));
    store.flush();
    expect(storage.map.has(key(a))).toBe(true);

    const target = new EventTarget();
    const detach = store.attach(target);
    const b = cp(2, 'write');
    store.put(b, draft({ text: 'on pagehide' }));
    target.dispatchEvent(new Event('pagehide'));
    expect(storage.map.has(key(b))).toBe(true);
    detach();
  });

  it('keeps working after a flush and a re-attach (StrictMode setup, cleanup, setup)', () => {
    const store = make();
    const target = new EventTarget();
    store.load();
    let detach = store.attach(target);
    // StrictMode's simulated unmount: the cleanup flushes and detaches, nothing more.
    store.flush();
    detach();
    store.load();
    detach = store.attach(target);
    const a = cp(1, 'write');
    store.put(a, draft({ text: 'after the remount' }));
    vi.advanceTimersByTime(400);
    expect(storage.map.has(key(a))).toBe(true);
    store.put(a, draft({ text: 'and on pagehide' }));
    target.dispatchEvent(new Event('pagehide'));
    expect(storage.map.get(key(a))).toContain('and on pagehide');
    detach();
  });

  it('loads this run’s drafts once, and only this run’s', () => {
    const first = make();
    const a = cp(1, 'write');
    first.put(a, draft({ text: 'from before the reload' }));
    first.flush();
    storage.map.set('byway.draft.run-2/cp1-x', storage.map.get(key(a)) ?? '');
    storage.map.set('byway.start-draft', 'unrelated');

    const second = make();
    const seen = vi.fn();
    second.subscribe(seen);
    expect(second.isReady()).toBe(false);
    expect(second.get(a).text).toBe('');
    second.load();
    expect(second.isReady()).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(second.get(a).text).toBe('from before the reload');
    const reads = storage.reads;
    second.load();
    expect(storage.reads).toBe(reads);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('keeps drafts in memory when storage refuses them', () => {
    storage.failWrites = true;
    const store = make();
    const a = cp(1, 'write');
    store.put(a, draft({ text: 'kept anyway' }));
    vi.advanceTimersByTime(400);
    store.flush();
    expect(storage.map.size).toBe(0);
    expect(store.get(a).text).toBe('kept anyway');
  });

  it('does not re-render the screen on a keystroke, and does when a draft is sent or settled', () => {
    const store = make();
    const seen = vi.fn();
    store.subscribe(seen);
    const a = cp(1, 'write');
    store.put(a, draft({ text: 'typing' }));
    expect(seen).not.toHaveBeenCalled();
    const version = store.getVersion();
    store.markSent(a);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(store.getVersion()).toBeGreaterThan(version);
    expect(store.isSent(a.id)).toBe(true);
  });

  it('forgets a draft put back to the starting text', () => {
    const store = make();
    const a = cp(1, 'write', { initialText: 'Model text.' });
    store.put(a, draft({ text: 'mine' }));
    store.flush();
    store.put(a, draft({ text: 'Model text.' }));
    store.flush();
    expect(storage.map.has(key(a))).toBe(false);
    expect(store.get(a).text).toBe('Model text.');
  });

  it('keeps compare and choose highlights in memory only (UX-1)', () => {
    const store = make();
    const compare = cp(1, 'compare', { options: [{ id: 'A', label: 'Before' }, { id: 'B', label: 'After' }] });
    store.put(compare, draft({ choice: ['B'] }));
    store.flush();
    expect(storage.map.size).toBe(0);
    expect(store.get(compare).choice).toEqual(['B']);
  });

  it('marks every kind as sent, a yes or no included, and settles it when its question closes', () => {
    const store = make();
    const confirm = cp(1, 'confirm');
    store.markSent(confirm);
    expect(store.isSent(confirm.id)).toBe(true);
    store.settle([{ ...confirm, status: 'resolved', resolution: { checkpointId: confirm.id, approved: true } }], 'running');
    expect(store.isSent(confirm.id)).toBe(false);
  });

  it('a pending write never brings back a draft that was sent, settled or discarded', () => {
    const store = make();
    const a = cp(1, 'write');
    store.put(a, draft({ text: 'discard me' }));
    store.discard(a.id);
    vi.advanceTimersByTime(400);
    expect(storage.map.has(key(a))).toBe(false);

    const b = cp(2, 'write');
    store.put(b, draft({ text: 'sent' }));
    store.markSent(b);
    store.settle([{ ...b, status: 'resolved', resolution: { checkpointId: b.id, text: 'sent' } }], 'running');
    vi.advanceTimersByTime(400);
    expect(storage.map.has(key(b))).toBe(false);
  });

  it('lists words left on a question that closed unsent, until they are discarded', () => {
    const store = make();
    const a = cp(1, 'react');
    store.put(a, draft({ text: 'what I meant to say' }));
    const closed = [{ ...a, status: 'withdrawn' as const }];
    store.settle(closed, 'cancelled');
    expect(store.unsent(closed, 'cancelled')).toEqual([{ cp: closed[0], text: 'what I meant to say' }]);
    store.discard(a.id);
    expect(store.unsent(closed, 'cancelled')).toEqual([]);
  });

  it('keeps a draft, and its stored copy, through a snapshot that predates its question (Back restores such a page)', () => {
    const store = make();
    const a = cp(1, 'react');
    store.put(a, draft({ text: 'typed before going to History' }));
    store.flush();
    store.settle([], 'queued');
    vi.advanceTimersByTime(400);
    expect(storage.map.has(key(a))).toBe(true);
    expect(store.get(a).text).toBe('typed before going to History');
    // Once the run has ended, a question it never listed cannot come: the draft goes.
    store.settle([], 'cancelled');
    expect(storage.map.has(key(a))).toBe(false);
  });

  it('while an answer is sent, changes to it are ignored: it stays sent, as sent, and is never listed as unsent', () => {
    const store = make();
    const a = cp(1, 'react', { initialText: '' });
    store.put(a, draft({ text: 'My answer as sent' }));
    store.markSent(a);
    store.put(a, draft({ text: 'My answer as sent, plus a line typed while waiting' }));
    expect(store.isSent(a.id)).toBe(true);
    expect(store.get(a).text).toBe('My answer as sent');
    // Going back to the starting text does not remove (and so unlock) the sent answer either.
    store.put(a, draft({ text: '' }));
    expect(store.isSent(a.id)).toBe(true);
    vi.advanceTimersByTime(400);
    expect(storage.map.get(key(a))).toContain('My answer as sent');
    const confirmed = [{ ...a, status: 'resolved' as const, resolution: { checkpointId: a.id, text: 'My answer as sent' } }];
    expect(store.unsent(confirmed, 'running')).toEqual([]);
    store.settle(confirmed, 'running');
    expect(store.isSent(a.id)).toBe(false);
    expect(storage.map.has(key(a))).toBe(false);
  });

  it('unlocks a sent draft when the server still shows its question open', () => {
    const store = make();
    const a = cp(1, 'write');
    store.put(a, draft({ text: 'mine' }));
    store.markSent(a);
    store.settle([a], 'waiting');
    expect(store.isSent(a.id)).toBe(false);
    expect(store.get(a).text).toBe('mine');
  });
});

/**
 * An answer byway refused because it held one of byway's provider keys (ADR-0088): the tab stops keeping that question's
 * draft, though the panel still shows it to be edited, and keeps it again once the answer it would send changes. The
 * run's other drafts are untouched. Before, the refused words stayed in sessionStorage, key and all.
 */
describe('an answer refused for holding a provider key (ADR-0088)', () => {
  const HELD = 'Warmer, please. My key is sk-ant-unit-test-not-a-key.';

  it('is no longer kept in the tab, though the panel still shows it; the run’s other drafts stay kept', () => {
    const store = make();
    store.load();
    const a = cp(1, 'react');
    const b = cp(2, 'write');
    store.put(a, draft({ text: HELD }));
    store.put(b, draft({ text: 'other words' }));
    vi.advanceTimersByTime(400);
    expect(storage.map.get(key(a))).toContain(HELD);
    store.withhold(a, toResolution(a, draft({ text: HELD })));
    expect(storage.map.has(key(a))).toBe(false);
    expect(store.get(a).text).toBe(HELD);
    expect(storage.map.get(key(b))).toContain('other words');
    // Neither a flush (pagehide, unmount) nor a later timer writes it back.
    store.flush();
    vi.advanceTimersByTime(1000);
    expect(storage.map.has(key(a))).toBe(false);
  });

  it('a write still pending when the refusal comes never brings it back', () => {
    const store = make();
    const a = cp(1, 'react');
    store.put(a, draft({ text: HELD }));
    store.withhold(a, toResolution(a, draft({ text: HELD })));
    vi.advanceTimersByTime(400);
    store.flush();
    expect(storage.map.has(key(a))).toBe(false);
  });

  it('is kept again once the answer it would send changes, and not for a change that sends the same', () => {
    const store = make();
    const a = cp(1, 'directive');
    store.put(a, draft({ items: ['Cut the second paragraph.', HELD] }));
    store.withhold(a, toResolution(a, draft({ items: ['Cut the second paragraph.', HELD] })));
    // An empty item added: the answer would still be the refused one.
    store.put(a, draft({ items: ['Cut the second paragraph.', HELD, ''] }));
    vi.advanceTimersByTime(400);
    store.flush();
    expect(storage.map.has(key(a))).toBe(false);
    store.put(a, draft({ items: ['Cut the second paragraph.', ''] }));
    vi.advanceTimersByTime(400);
    expect(storage.map.get(key(a))).toContain('Cut the second paragraph.');
    expect(storage.map.get(key(a))).not.toContain('sk-ant-');
    // Typed back in exactly as refused: not kept again.
    store.put(a, draft({ items: ['Cut the second paragraph.', HELD] }));
    vi.advanceTimersByTime(400);
    expect(storage.map.get(key(a)) ?? '').not.toContain('sk-ant-');
  });

  it('after a reload the refused answer is gone and the run’s other drafts come back', () => {
    const first = make();
    const a = cp(1, 'react');
    const b = cp(2, 'write');
    first.put(a, draft({ text: HELD }));
    first.put(b, draft({ text: 'other words' }));
    first.flush();
    first.withhold(a, toResolution(a, draft({ text: HELD })));
    const second = make();
    second.load();
    expect(second.get(a).text).toBe('');
    expect(second.get(b).text).toBe('other words');
  });

  it('settling, a send or an unlock while it is refused never writes the refused words', () => {
    const store = make();
    const a = cp(1, 'react');
    store.put(a, draft({ text: HELD }));
    store.withhold(a, toResolution(a, draft({ text: HELD })));
    store.settle([a], 'waiting');
    store.markSent(a);
    expect(store.isSent(a.id)).toBe(true);
    store.settle([a], 'waiting');
    vi.advanceTimersByTime(400);
    store.flush();
    expect(storage.map.has(key(a))).toBe(false);
  });
});
