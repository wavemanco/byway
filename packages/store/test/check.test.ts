/**
 * checkStore (R4; ADR-0096): a read-only look at the store's own files, for the report byway prints at start. After a
 * partial restore (a backup of byway.sqlite without its artifact files, or a copy cut short) a missing page, document
 * or image used to be found only when something opened it. The check names each recorded artifact whose file is gone
 * or not the recorded size, and the runs whose records use it, and passes on what SQLite's quick_check finds. It never
 * writes: the records and the database file are the same after it.
 */
import { existsSync, openSync, closeSync, readFileSync, rmSync, statSync, truncateSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { artifactPath, checkStore, DB_FILENAME, StoreError } from '../src/index.ts';
import { openStore, seedRun, tempDir } from './helpers.ts';

/** A store with three runs that use artifacts in each kind of record that can name one. */
async function storeWithRuns() {
  const store = openStore();
  const page = await store.artifacts.putText('<p>the page</p>', 'text/html');
  const shot = await store.artifacts.put(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), 'image/png');
  const draft = await store.artifacts.putText('# A draft', 'text/markdown');
  const unused = await store.artifacts.putText('nobody uses this', 'text/plain');
  // run-1: the page is its output; its timeline shows the screenshot.
  await seedRun(store, 'run-1');
  await store.updateRun('run-1', { outputArtifactId: page.id });
  await store.appendEvent({ runId: 'run-1', type: 'artifact', data: { artifactId: shot.id, mediaType: 'image/png', label: 'Desktop' } });
  // run-2: a question shows the screenshot; a memo keeps the draft.
  await seedRun(store, 'run-2');
  await store.openCheckpoint({ id: 'run-2/cp', runId: 'run-2', stepId: 'pick', kind: 'react', prompt: 'What do you think?', artifactIds: [shot.id] });
  await store.setMemo('run-2', 'call/1', JSON.stringify({ artifactId: draft.id }));
  // run-3 uses none of them.
  await seedRun(store, 'run-3');
  return { store, page, shot, draft, unused };
}

describe('checkStore (R4)', () => {
  it('reports nothing for a sound store, and counts the artifact files it looked for', async () => {
    const { store } = await storeWithRuns();
    expect(await checkStore(store.dataDir)).toEqual({ database: [], artifacts: 4, missing: [] });
  });

  it('names a missing artifact file and every run whose records use it', async () => {
    const { store, shot, page, unused } = await storeWithRuns();
    rmSync(artifactPath(store.dataDir, shot.id));
    rmSync(artifactPath(store.dataDir, unused.id));
    const check = await checkStore(store.dataDir);
    expect(check.database).toEqual([]);
    expect(check.artifacts).toBe(4);
    expect(check.missing).toEqual(
      [
        { id: shot.id, problem: 'missing', runIds: ['run-1', 'run-2'] },
        { id: unused.id, problem: 'missing', runIds: [] },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
    // The page is still there, and the check did not touch the records.
    expect(await store.artifacts.getText(page.id)).toBe('<p>the page</p>');
    expect((await store.getRun('run-1'))?.outputArtifactId).toBe(page.id);
  });

  it('finds the runs through outputs, timeline events, questions and memos', async () => {
    const { store, page, draft } = await storeWithRuns();
    rmSync(artifactPath(store.dataDir, page.id));
    rmSync(artifactPath(store.dataDir, draft.id));
    const byId = Object.fromEntries((await checkStore(store.dataDir)).missing.map((m) => [m.id, m.runIds]));
    expect(byId).toEqual({ [page.id]: ['run-1'], [draft.id]: ['run-2'] });
  });

  it('names a file that is not the size the store recorded (a copy cut short)', async () => {
    const { store, page } = await storeWithRuns();
    truncateSync(artifactPath(store.dataDir, page.id), 3);
    expect((await checkStore(store.dataDir)).missing).toEqual([{ id: page.id, problem: 'wrong-size', runIds: ['run-1'] }]);
  });

  it('passes on what SQLite finds in a damaged database file, without throwing', async () => {
    const store = openStore();
    await seedRun(store, 'run-1');
    for (let i = 0; i < 400; i++) await store.appendEvent({ runId: 'run-1', type: 'step-failed', data: { error: `attempt ${i} ${'x'.repeat(200)}`, retryable: true } });
    const file = join(store.dataDir, DB_FILENAME);
    store.close();
    // Overwrite the database's last page (a table or index page; the header on page 1 stays readable).
    const pages = statSync(file).size / 4096;
    const fd = openSync(file, 'r+');
    try {
      writeSync(fd, Buffer.alloc(4096, 0xab), 0, 4096, (pages - 1) * 4096);
    } finally {
      closeSync(fd);
    }
    const check = await checkStore(store.dataDir);
    expect(check.database.length).toBeGreaterThan(0);
    // SQLite's own words: a page it cannot read, or a file it calls malformed.
    expect(check.database.join('\n')).toMatch(/malformed|page|index|tree/i);
  });

  it('only reads: the database bytes are unchanged after a check of a closed store', async () => {
    const { store } = await storeWithRuns();
    const file = join(store.dataDir, DB_FILENAME);
    store.close();
    const before = readFileSync(file);
    await checkStore(store.dataDir);
    expect(readFileSync(file).equals(before)).toBe(true);
  });

  it('refuses a folder with no database rather than creating one', async () => {
    const dir = tempDir();
    await expect(checkStore(dir)).rejects.toBeInstanceOf(StoreError);
    expect(existsSync(join(dir, DB_FILENAME))).toBe(false);
  });
});
