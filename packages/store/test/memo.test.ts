import { describe, expect, it } from 'vitest';
import { MAX_MEMO_VALUE_BYTES } from '../src/index.ts';
import { openStore, seedRun, tempDir } from './helpers.ts';

/**
 * Store.getMemo/setMemo (contracts v5): an idempotency memo for at-least-once activities (ENG-3, ENG-12). A retried
 * model, image or video activity looks up its call key and reuses what the first attempt bought instead of paying again.
 */
describe('memo', () => {
  it('reads back what was set, by run and key; an unknown key reads undefined', async () => {
    const store = openStore();
    await seedRun(store);
    expect(await store.getMemo('run-1', 'call:framings:0')).toBeUndefined();
    expect(await store.setMemo('run-1', 'call:framings:0', 'sha256:abc')).toBe('sha256:abc');
    expect(await store.getMemo('run-1', 'call:framings:0')).toBe('sha256:abc');
    expect(await store.getMemo('run-1', 'call:framings:1')).toBeUndefined();
  });

  it('is first-write-wins: a second set keeps the first value and returns it', async () => {
    const store = openStore();
    await seedRun(store);
    await store.setMemo('run-1', 'k', 'first');
    // A retried attempt that raced the first one must reuse what the first one recorded, not replace it.
    expect(await store.setMemo('run-1', 'k', 'second')).toBe('first');
    expect(await store.getMemo('run-1', 'k')).toBe('first');
  });

  it('is scoped by run: the same key in two runs holds two values', async () => {
    const store = openStore();
    await seedRun(store, 'run-1');
    await seedRun(store, 'run-2');
    await store.setMemo('run-1', 'k', 'one');
    await store.setMemo('run-2', 'k', 'two');
    expect(await store.getMemo('run-1', 'k')).toBe('one');
    expect(await store.getMemo('run-2', 'k')).toBe('two');
  });

  it('refuses a memo for a run that does not exist, and reads nothing for one', async () => {
    const store = openStore();
    await expect(store.setMemo('no-run', 'k', 'v')).rejects.toMatchObject({ code: 'not-found' });
    expect(await store.getMemo('no-run', 'k')).toBeUndefined();
  });

  it('checks its input: non-empty run id and key, a string value, and a small one', async () => {
    const store = openStore();
    await seedRun(store);
    await expect(store.setMemo('', 'k', 'v')).rejects.toMatchObject({ code: 'invalid' });
    await expect(store.setMemo('run-1', '', 'v')).rejects.toMatchObject({ code: 'invalid' });
    await expect(store.setMemo('run-1', 'k', 42 as unknown as string)).rejects.toMatchObject({ code: 'invalid' });
    await expect(store.getMemo('run-1', '')).rejects.toMatchObject({ code: 'invalid' });
    // A memo holds a reference (an artifact id, a small JSON summary); content belongs in the artifact store.
    await expect(store.setMemo('run-1', 'big', 'x'.repeat(MAX_MEMO_VALUE_BYTES + 1))).rejects.toThrow(/artifact/);
    expect(await store.getMemo('run-1', 'big')).toBeUndefined();
    // The empty string is a value like any other.
    expect(await store.setMemo('run-1', 'empty', '')).toBe('');
    expect(await store.getMemo('run-1', 'empty')).toBe('');
  });

  it('is shared by two store instances on one data directory (the web app and the worker)', async () => {
    const dataDir = tempDir();
    const a = openStore({ dataDir });
    const b = openStore({ dataDir });
    await seedRun(a);
    const results = await Promise.all([a.setMemo('run-1', 'k', 'from-a'), b.setMemo('run-1', 'k', 'from-b')]);
    // Whichever wrote first, both callers are told the one stored value.
    expect(results[0]).toBe(results[1]);
    expect(await b.getMemo('run-1', 'k')).toBe(results[0]);
  });

  it('fails with code closed after close()', async () => {
    const store = openStore();
    await seedRun(store);
    store.close();
    await expect(store.getMemo('run-1', 'k')).rejects.toMatchObject({ code: 'closed' });
    await expect(store.setMemo('run-1', 'k', 'v')).rejects.toMatchObject({ code: 'closed' });
  });
});
