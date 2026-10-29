/**
 * settleLostRun beside another end of the same run (backlog row B-017). The lost-run pass and a Cancel on a run whose
 * workflow Temporal no longer has both call it; a run that one of them ends between the other's read and its write
 * keeps the end written first, and its History shows only that end.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Store } from '@byway/contracts';
import { createStore, type SqliteStore } from '@byway/store';
import { LOST_RUN_MESSAGE, settleLostRun } from '../src/lost-runs.ts';

const open: { store: SqliteStore; dir: string }[] = [];
afterEach(() => {
  for (const { store, dir } of open.splice(0)) {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

async function storeWithRun(): Promise<SqliteStore> {
  const dir = mkdtempSync(path.join(tmpdir(), 'byway-settle-'));
  const store = createStore({ dataDir: dir });
  open.push({ store, dir });
  const ws = await store.ensureDefaultWorkspace();
  await store.createRun({ id: 'run-1', workspaceId: ws.id, recipeId: 'c4', recipeHash: 'h', profileId: 'demo', title: 't', problem: 'p', medium: 'prose', budgetUsd: 1, status: 'running' });
  return store;
}

/** The store, except that the first read of the run is followed at once by `meanwhile` (the other end landing). */
function endedAfterRead(store: SqliteStore, meanwhile: () => Promise<unknown>): Store {
  let first = true;
  return new Proxy(store, {
    get(target, prop) {
      if (prop === 'getRun')
        return async (id: string) => {
          const run = await target.getRun(id);
          if (first) {
            first = false;
            await meanwhile();
          }
          return run;
        };
      const v = Reflect.get(target, prop, target) as unknown;
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

describe('settleLostRun', () => {
  it('leaves a run that a Cancel ended after its read cancelled, with one end in its History', async () => {
    const store = await storeWithRun();
    const racing = endedAfterRead(store, () => settleLostRun(store, 'run-1', { status: 'cancelled' }));
    expect(await settleLostRun(racing, 'run-1', { status: 'failed', error: LOST_RUN_MESSAGE })).toBe(false);
    expect(await store.getRun('run-1')).toMatchObject({ status: 'cancelled' });
    expect((await store.events('run-1')).map((e) => e.type)).toEqual(['run-cancelled']);
  });

  it('leaves a run that the pass failed after a Cancel read it failed, with one end in its History', async () => {
    const store = await storeWithRun();
    const racing = endedAfterRead(store, () => settleLostRun(store, 'run-1', { status: 'failed', error: LOST_RUN_MESSAGE }));
    expect(await settleLostRun(racing, 'run-1', { status: 'cancelled' })).toBe(false);
    expect(await store.getRun('run-1')).toMatchObject({ status: 'failed', error: LOST_RUN_MESSAGE });
    expect((await store.events('run-1')).map((e) => e.type)).toEqual(['run-failed']);
  });

  it('closes a going run once, and withdraws its questions', async () => {
    const store = await storeWithRun();
    await store.openCheckpoint({ id: 'cp-1', runId: 'run-1', stepId: 's', kind: 'choose', prompt: 'Pick one', options: [] } as never);
    expect(await settleLostRun(store, 'run-1', { status: 'failed', error: LOST_RUN_MESSAGE })).toBe(true);
    expect(await settleLostRun(store, 'run-1', { status: 'failed', error: LOST_RUN_MESSAGE })).toBe(false);
    expect(await store.getRun('run-1')).toMatchObject({ status: 'failed', error: LOST_RUN_MESSAGE });
    expect((await store.getCheckpoint('cp-1'))?.status).toBe('withdrawn');
    expect((await store.events('run-1')).map((e) => e.type)).toEqual(['run-failed']);
    expect(await settleLostRun(store, 'missing', { status: 'cancelled' })).toBe(false);
  });
});
