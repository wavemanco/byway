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

  it('reads one key range: every value whose key starts with the prefix, in key order, and only the run’s own', async () => {
    const store = openStore();
    await seedRun(store, 'run-1');
    await seedRun(store, 'run-2');
    // The runner keeps a run's SEED strings under one prefix (P2), beside its other memos.
    await store.setMemo('run-1', 'seed/run-1/b/-/1', 'second');
    await store.setMemo('run-1', 'seed/run-1/a/-/1', 'first');
    await store.setMemo('run-1', 'run-1/a/-/1/complete/abc/1', 'sha256:answer');
    await store.setMemo('run-1', 'run-1/a/-/1/seed', 'not under the prefix');
    await store.setMemo('run-1', 'seeds/x', 'a longer word');
    await store.setMemo('run-1', 'Seed/x', 'another case');
    await store.setMemo('run-1', 'lineup/x', 'sha256:card');
    await store.setMemo('run-2', 'seed/run-2/a/-/1', 'another run');
    expect(await store.memosWithPrefix('run-1', 'seed/')).toEqual(['first', 'second']);
    expect(await store.memosWithPrefix('run-2', 'seed/')).toEqual(['another run']);
    // A prefix that is a whole key reads that key; one no key starts with reads nothing, as does a run with none.
    expect(await store.memosWithPrefix('run-1', 'lineup/x')).toEqual(['sha256:card']);
    expect(await store.memosWithPrefix('run-1', 'seed/run-1/c')).toEqual([]);
    expect(await store.memosWithPrefix('no-run', 'seed/')).toEqual([]);
    // Like and glob characters are characters: nothing in a prefix is a pattern.
    await store.setMemo('run-1', 'a%b/1', 'percent');
    await store.setMemo('run-1', 'axb/1', 'x');
    await store.setMemo('run-1', 'a_b/1', 'underscore');
    await store.setMemo('run-1', 'a*b/1', 'star');
    expect(await store.memosWithPrefix('run-1', 'a%')).toEqual(['percent']);
    expect(await store.memosWithPrefix('run-1', 'a_')).toEqual(['underscore']);
    expect(await store.memosWithPrefix('run-1', 'a*')).toEqual(['star']);
    // An empty prefix would read every memo of the run: it is refused, as an empty key is.
    await expect(store.memosWithPrefix('run-1', '')).rejects.toMatchObject({ code: 'invalid' });
    await expect(store.memosWithPrefix('', 'seed/')).rejects.toMatchObject({ code: 'invalid' });
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
    await expect(store.memosWithPrefix('run-1', 'k')).rejects.toMatchObject({ code: 'closed' });
  });
});
