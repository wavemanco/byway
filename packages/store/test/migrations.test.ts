import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, SCHEMA_VERSION, StoreError, createStore, migrate, openDatabase } from '../src/index.ts';
import { openStore, tempDir } from './helpers.ts';

function versions(dbPath: string): number[] {
  const db = new DatabaseSync(dbPath);
  try {
    return db.prepare('SELECT version FROM schema_version ORDER BY version').all().map((r) => Number(r.version));
  } finally {
    db.close();
  }
}

describe('migrations', () => {
  it('are numbered 1..n in order', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual(MIGRATIONS.map((_, i) => i + 1));
    expect(SCHEMA_VERSION).toBe(MIGRATIONS.length);
  });

  it('bring a new database to the latest version', () => {
    const store = openStore();
    expect(versions(store.dbPath)).toEqual(MIGRATIONS.map((m) => m.version));
  });

  it('are idempotent: reopening and re-running apply nothing new', () => {
    const dataDir = tempDir();
    createStore({ dataDir }).close();
    createStore({ dataDir }).close();
    const db = new DatabaseSync(join(dataDir, 'byway.sqlite'));
    try {
      expect(migrate(db)).toEqual([]);
      expect(migrate(db)).toEqual([]);
    } finally {
      db.close();
    }
    expect(versions(join(dataDir, 'byway.sqlite'))).toEqual(MIGRATIONS.map((m) => m.version));
  });

  it('report the versions they applied on a fresh database', () => {
    const db = new DatabaseSync(':memory:');
    try {
      expect(migrate(db)).toEqual(MIGRATIONS.map((m) => m.version));
    } finally {
      db.close();
    }
  });

  it('keep data across reopen', async () => {
    const dataDir = tempDir();
    const first = createStore({ dataDir });
    const ws = await first.ensureDefaultWorkspace();
    first.close();
    const second = openStore({ dataDir });
    expect(await second.getWorkspace(ws.id)).toEqual(ws);
  });

  it('refuse a database written by a newer schema', () => {
    const dataDir = tempDir();
    createStore({ dataDir }).close();
    const db = new DatabaseSync(join(dataDir, 'byway.sqlite'));
    db.prepare('INSERT INTO schema_version (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)').run(SCHEMA_VERSION + 1, 'future', 'x', '2027-01-01T00:00:00.000Z');
    db.close();
    expect(() => createStore({ dataDir })).toThrow(StoreError);
    expect(() => createStore({ dataDir })).toThrow(/newer/);
  });

  it('refuse a database whose applied migration differs from this build (an edited migration)', () => {
    const dataDir = tempDir();
    createStore({ dataDir }).close();
    const db = new DatabaseSync(join(dataDir, 'byway.sqlite'));
    db.prepare('UPDATE schema_version SET checksum = ? WHERE version = 1').run('sha256:tampered');
    db.close();
    expect(() => createStore({ dataDir })).toThrow(/migration 1/);
  });

  it('run on connections with WAL, foreign keys and a busy timeout', () => {
    const dbPath = join(tempDir(), 'byway.sqlite');
    const db = openDatabase(dbPath, { busyTimeoutMs: 1234 });
    try {
      const pragma = (name: string): unknown => Object.values(db.prepare(`PRAGMA ${name}`).get() ?? {})[0];
      expect(pragma('journal_mode')).toBe('wal');
      expect(pragma('foreign_keys')).toBe(1);
      expect(pragma('busy_timeout')).toBe(1234);
    } finally {
      db.close();
    }
  });

  it('enforce foreign keys in the store', async () => {
    const store = openStore();
    await expect(store.appendEvent({ runId: 'no-such-run', type: 'run-started', data: {} })).rejects.toThrow(/no run "no-such-run"/);
  });
});
