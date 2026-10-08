import { describe, expect, it } from 'vitest';
import { MAX_EVENT_DATA_BYTES, RUN_EVENT_TYPES } from '../src/index.ts';
import { openStore, seedRun, steppingClock } from './helpers.ts';

describe('events', () => {
  it('appends with seq 1, 2, 3… per run and the store clock', async () => {
    const store = openStore({ now: () => new Date('2026-10-07T12:00:00.000Z') });
    await seedRun(store, 'a');
    await seedRun(store, 'b');
    const e1 = await store.appendEvent({ runId: 'a', type: 'run-started', data: { recipe: 'c1' } });
    const e2 = await store.appendEvent({ runId: 'a', type: 'step-started', stepId: 'build', candidate: 2, data: {} });
    const f1 = await store.appendEvent({ runId: 'b', type: 'run-started', data: {} });
    expect(e1).toEqual({ runId: 'a', seq: 1, at: '2026-10-07T12:00:00.000Z', type: 'run-started', data: { recipe: 'c1' } });
    expect(e2).toEqual({ runId: 'a', seq: 2, at: '2026-10-07T12:00:00.000Z', type: 'step-started', stepId: 'build', candidate: 2, data: {} });
    expect(f1.seq).toBe(1);
  });

  it('returns events in ascending seq, optionally after a seq', async () => {
    const store = openStore();
    await seedRun(store, 'a');
    for (let i = 0; i < 5; i++) await store.appendEvent({ runId: 'a', type: 'cost', data: { i } });
    expect((await store.events('a')).map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
    expect((await store.events('a', 3)).map((e) => e.data.i)).toEqual([3, 4]);
    expect(await store.events('a', 5)).toEqual([]);
    expect(await store.events('unknown')).toEqual([]);
  });

  it('accepts every event type of the contract, run-paused and run-resumed included', async () => {
    const store = openStore();
    await seedRun(store, 'a');
    const paused = await store.appendEvent({ runId: 'a', type: 'run-paused', data: {} }, { dedupeKey: 'pause:1' });
    const resumed = await store.appendEvent({ runId: 'a', type: 'run-resumed', data: {} }, { dedupeKey: 'resume:1' });
    expect([paused.type, paused.seq, resumed.type, resumed.seq]).toEqual(['run-paused', 1, 'run-resumed', 2]);
    expect((await store.events('a')).map((e) => e.type)).toEqual(['run-paused', 'run-resumed']);
    expect(RUN_EVENT_TYPES).toEqual(expect.arrayContaining(['run-paused', 'run-resumed']));
  });

  it('round-trips nested JSON data', async () => {
    const store = openStore();
    await seedRun(store, 'a');
    const data = { cost: { usd: 0.0123, tokens: [1, 2] }, note: 'naïve “quotes” ✓', ok: true, none: null };
    await store.appendEvent({ runId: 'a', type: 'step-finished', stepId: 's', data });
    expect((await store.events('a'))[0]?.data).toEqual(data);
  });

  it('keeps seq gap-free and strictly increasing under rapid concurrent appends', async () => {
    const store = openStore();
    await seedRun(store, 'a');
    const appended = await Promise.all(Array.from({ length: 300 }, (_, i) => store.appendEvent({ runId: 'a', type: 'cost', data: { i } })));
    expect(appended.map((e) => e.seq).sort((x, y) => x - y)).toEqual(Array.from({ length: 300 }, (_, i) => i + 1));
    const seqs = (await store.events('a')).map((e) => e.seq);
    expect(seqs).toEqual(Array.from({ length: 300 }, (_, i) => i + 1));
  });

  it('rejects an unknown event type, a non-object payload, a bad candidate and an oversized payload', async () => {
    const store = openStore();
    await seedRun(store, 'a');
    await expect(store.appendEvent({ runId: 'a', type: 'exploded' as never, data: {} })).rejects.toThrow(/event type/);
    await expect(store.appendEvent({ runId: 'a', type: 'cost', data: [] as never })).rejects.toThrow(/plain object/);
    await expect(store.appendEvent({ runId: 'a', type: 'cost', candidate: -1, data: {} })).rejects.toThrow(/candidate/);
    await expect(store.appendEvent({ runId: 'a', type: 'cost', data: { big: 'x'.repeat(MAX_EVENT_DATA_BYTES) } })).rejects.toThrow(/artifact/);
    expect(await store.events('a')).toEqual([]);
  });

  it('with a dedupe key, a repeated append returns the first event and inserts nothing', async () => {
    const store = openStore({ now: steppingClock() });
    await seedRun(store, 'a');
    const first = await store.appendEvent({ runId: 'a', type: 'step-finished', stepId: 'build', data: { attempt: 1 } }, { dedupeKey: 'build:finished' });
    const other = await store.appendEvent({ runId: 'a', type: 'cost', data: {} });
    // The activity ran again: same key, possibly different content. The first event wins, unchanged.
    const again = await store.appendEvent({ runId: 'a', type: 'step-finished', stepId: 'build', data: { attempt: 2 } }, { dedupeKey: 'build:finished' });
    expect(again).toEqual(first);
    expect(again).toEqual({ runId: 'a', seq: 1, at: first.at, type: 'step-finished', stepId: 'build', data: { attempt: 1 } });
    expect((await store.events('a')).map((e) => e.seq)).toEqual([1, 2]);
    expect(other.seq).toBe(2);
    // The next append still takes the next seq: the deduped call consumed none.
    expect((await store.appendEvent({ runId: 'a', type: 'cost', data: {} }, { dedupeKey: 'cost:3' })).seq).toBe(3);
  });

  it('scopes dedupe keys to their run, and leaves keyless appends alone', async () => {
    const store = openStore();
    await seedRun(store, 'a');
    await seedRun(store, 'b');
    const a = await store.appendEvent({ runId: 'a', type: 'run-started', data: {} }, { dedupeKey: 'start' });
    const b = await store.appendEvent({ runId: 'b', type: 'run-started', data: {} }, { dedupeKey: 'start' });
    expect([a.runId, a.seq, b.runId, b.seq]).toEqual(['a', 1, 'b', 1]);
    for (let i = 0; i < 3; i++) await store.appendEvent({ runId: 'a', type: 'cost', data: { i } });
    await store.appendEvent({ runId: 'a', type: 'cost', data: { i: 3 } }, {});
    expect((await store.events('a')).map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(await store.events('b')).toHaveLength(1);
  });

  it('inserts a keyed event once under rapid concurrent retries', async () => {
    const store = openStore();
    await seedRun(store, 'a');
    const results = await Promise.all(Array.from({ length: 50 }, (_, i) => store.appendEvent({ runId: 'a', type: 'cost', data: { i } }, { dedupeKey: 'once' })));
    expect(new Set(results.map((e) => JSON.stringify(e))).size).toBe(1);
    expect(results[0]?.data).toEqual({ i: 0 });
    expect(await store.events('a')).toHaveLength(1);
  });

  it('still validates a keyed event, and still refuses one for an unknown run', async () => {
    const store = openStore();
    await seedRun(store, 'a');
    await store.appendEvent({ runId: 'a', type: 'cost', data: {} }, { dedupeKey: 'k' });
    await expect(store.appendEvent({ runId: 'a', type: 'exploded' as never, data: {} }, { dedupeKey: 'k' })).rejects.toThrow(/event type/);
    await expect(store.appendEvent({ runId: 'nope', type: 'cost', data: {} }, { dedupeKey: 'k' })).rejects.toThrow(/no run "nope"/);
  });

  it('rejects a blank or non-string dedupe key and malformed options', async () => {
    const store = openStore();
    await seedRun(store, 'a');
    await expect(store.appendEvent({ runId: 'a', type: 'cost', data: {} }, { dedupeKey: '' })).rejects.toThrow(/dedupeKey/);
    await expect(store.appendEvent({ runId: 'a', type: 'cost', data: {} }, { dedupeKey: '  ' })).rejects.toThrow(/dedupeKey/);
    await expect(store.appendEvent({ runId: 'a', type: 'cost', data: {} }, { dedupeKey: 7 as never })).rejects.toMatchObject({ code: 'invalid' });
    await expect(store.appendEvent({ runId: 'a', type: 'cost', data: {} }, 'k' as never)).rejects.toMatchObject({ code: 'invalid' });
    expect(await store.events('a')).toEqual([]);
  });

  it('does not consume a seq when an append fails', async () => {
    const store = openStore();
    await seedRun(store, 'a');
    await store.appendEvent({ runId: 'a', type: 'cost', data: {} });
    await expect(store.appendEvent({ runId: 'a', type: 'cost', data: { n: 1n } as never })).rejects.toThrow();
    expect((await store.appendEvent({ runId: 'a', type: 'cost', data: {} })).seq).toBe(2);
  });
});
