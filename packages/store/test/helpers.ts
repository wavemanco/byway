import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import type { RunRecord } from '@byway/contracts';
import { createStore, type SqliteStore, type StoreOptions } from '../src/index.ts';

const cleanups: (() => void)[] = [];

afterEach(() => {
  // Close stores before deleting their folders: Windows will not delete an open SQLite file.
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** A fresh folder under the OS temp directory, removed after the test. */
export function tempDir(prefix = 'byway-store-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.unshift(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Opens a store on `dataDir` (a new temp folder by default) and closes it after the test. */
export function openStore(options: Partial<StoreOptions> = {}): SqliteStore {
  const store = createStore({ ...options, dataDir: options.dataDir ?? tempDir() });
  cleanups.push(() => store.close());
  return store;
}

/** A clock that advances one second per reading, so ordering by time is deterministic. */
export function steppingClock(start = '2026-10-07T12:00:00.000Z'): () => Date {
  let t = Date.parse(start);
  return () => new Date((t += 1000) - 1000);
}

/** The spend cap {@link seedRun} gives a run unless told otherwise. */
export const SEED_RUN_BUDGET_USD = 5;

/** A minimal run in the store's default workspace. */
export async function seedRun(store: SqliteStore, id = 'run-1', extra: Partial<RunRecord> = {}): Promise<RunRecord> {
  const ws = await store.ensureDefaultWorkspace();
  return store.createRun({
    id,
    workspaceId: ws.id,
    recipeId: 'c1',
    recipeHash: `sha256:${'a'.repeat(64)}`,
    profileId: 'demo',
    title: 'A landing page',
    problem: 'I need a landing page for a bakery',
    medium: 'web-page',
    budgetUsd: SEED_RUN_BUDGET_USD,
    ...extra,
  });
}
