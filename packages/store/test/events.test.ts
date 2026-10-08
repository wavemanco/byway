import { describe, expect, it } from 'vitest';
import { MAX_EVENT_DATA_BYTES } from '../src/index.ts';
import { openStore, seedRun } from './helpers.ts';

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

  it('does not consume a seq when an append fails', async () => {
    const store = openStore();
    await seedRun(store, 'a');
    await store.appendEvent({ runId: 'a', type: 'cost', data: {} });
    await expect(store.appendEvent({ runId: 'a', type: 'cost', data: { n: 1n } as never })).rejects.toThrow();
    expect((await store.appendEvent({ runId: 'a', type: 'cost', data: {} })).seq).toBe(2);
  });
});
