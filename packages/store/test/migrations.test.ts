import { createHash } from 'node:crypto';
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

/** Pinned when migration 3 was written; it must never change. */
const MIGRATION_3_CHECKSUM = 'sha256:ca2c930d144a72d26638620f9b9aa2e98acc2088e97facd4c9f1d79883d3a4b2';
/** Pinned when migration 4 was written; it must never change. */
const MIGRATION_4_CHECKSUM = 'sha256:f1f0c656cb2df7b091d1c67e0a4a71114206771feeb788b5f387cb625865b125';
/** Pinned when migration 5 was written; it must never change. */
const MIGRATION_5_CHECKSUM = 'sha256:9a63b55748772581a7a23f8f9eef1ef9c85100cffc88ee7a5412c0685c140729';
/** Pinned when migration 6 (the spend book, ADR-0095) was written; it must never change. */
const MIGRATION_6_CHECKSUM = 'sha256:8a6190b9d3d2443dc74679922806992d357242034ca7d56766d045ee89abb1f0';
const MIGRATION_7_CHECKSUM = 'sha256:43d25171342abea916e9cdec341e2871557be594609c277f44369d45ba70113a';
const MIGRATION_8_CHECKSUM = 'sha256:c0bf1a83fdc56c0292a686df508e44e5a8075f9d18692d96defab8a1e762444c';

const checksumOf = (sql: string): string => `sha256:${createHash('sha256').update(sql, 'utf8').digest('hex')}`;

/**
 * Writes a data directory exactly as a build that knew only migration 1 left it: the v1 schema, its schema_version row,
 * a default workspace (budget $30), a second workspace (budget $7.50), a run in each, events and an open checkpoint.
 */
function writeVersion1Database(dataDir: string): void {
  const db = openDatabase(join(dataDir, 'byway.sqlite'));
  try {
    const v1 = MIGRATIONS[0]!;
    db.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT');
    db.exec(v1.sql);
    db.prepare('INSERT INTO schema_version VALUES (?, ?, ?, ?)').run(1, v1.name, checksumOf(v1.sql), '2026-10-01T00:00:00.000Z');
    const at = '2026-10-01T09:00:00.000Z';
    db.prepare('INSERT INTO workspaces (id, name, budget_usd, is_default, created_at) VALUES (?, ?, ?, ?, ?)').run('ws-default', 'My workspace', 30, 1, at);
    db.prepare('INSERT INTO workspaces (id, name, budget_usd, is_default, created_at) VALUES (?, ?, ?, ?, ?)').run('ws-other', 'Side project', 7.5, 0, at);
    const run = db.prepare(`INSERT INTO runs (id, workspace_id, recipe_id, recipe_hash, profile_id, title, problem, medium, status,
      output_artifact_id, error, cost_usd, created_at, updated_at) VALUES (?, ?, 'c1', ?, 'demo', ?, ?, 'prose', ?, NULL, ?, ?, ?, ?)`);
    run.run('old-run', 'ws-default', `sha256:${'a'.repeat(64)}`, 'Memo', 'Write a memo', 'waiting', null, 1.25, at, at);
    run.run('other-run', 'ws-other', `sha256:${'a'.repeat(64)}`, 'Page', 'Make a page', 'failed', 'budget-exceeded', 0, at, at);
    const event = db.prepare('INSERT INTO events (run_id, seq, at, type, step_id, candidate, data) VALUES (?, ?, ?, ?, NULL, NULL, ?)');
    event.run('old-run', 1, at, 'run-started', '{"recipe":"c1"}');
    event.run('old-run', 2, at, 'checkpoint-opened', '{"checkpointId":"cp-old"}');
    db.prepare(`INSERT INTO checkpoints (id, run_id, step_id, kind, prompt, options, k, status, opened_at)
      VALUES ('cp-old', 'old-run', 'pick', 'pick', 'Which?', '[{"id":"A","label":"A"},{"id":"B","label":"B"}]', 1, 'open', ?)`).run(at);
  } finally {
    db.close();
  }
}

/**
 * Writes a data directory exactly as a build that knew migrations 1 and 2 left it: both schemas and their
 * schema_version rows, a default workspace, a run with a budget, keyed events, a resolved checkpoint and an artifact.
 */
function writeVersion2Database(dataDir: string): void {
  const db = openDatabase(join(dataDir, 'byway.sqlite'));
  try {
    db.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT');
    for (const m of MIGRATIONS.slice(0, 2)) {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_version VALUES (?, ?, ?, ?)').run(m.version, m.name, checksumOf(m.sql), '2026-10-05T00:00:00.000Z');
    }
    const at = '2026-10-05T09:00:00.000Z';
    db.prepare('INSERT INTO workspaces (id, name, budget_usd, is_default, created_at) VALUES (?, ?, ?, ?, ?)').run('ws', 'Studio', 25, 1, at);
    db.prepare('INSERT INTO artifacts (id, media_type, bytes, created_at) VALUES (?, ?, ?, ?)').run(`sha256:${'c'.repeat(64)}`, 'text/markdown', 10, at);
    db.prepare(`INSERT INTO runs (id, workspace_id, recipe_id, recipe_hash, profile_id, title, problem, medium, status,
      output_artifact_id, error, cost_usd, budget_usd, created_at, updated_at) VALUES (?, 'ws', 'c4', ?, 'balanced', 'Memo', 'Write a memo', 'prose', 'done', ?, NULL, 0.5, 8, ?, ?)`)
      .run('v2-run', `sha256:${'a'.repeat(64)}`, `sha256:${'c'.repeat(64)}`, at, at);
    const event = db.prepare('INSERT INTO events (run_id, seq, at, type, step_id, candidate, data, dedupe_key) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)');
    event.run('v2-run', 1, at, 'run-started', null, '{"recipeId":"c4","profileId":"balanced","budgetUsd":8}', 'start');
    event.run('v2-run', 2, at, 'run-finished', null, '{"outputArtifactId":"x","costUsd":0.5}', null);
    db.prepare(`INSERT INTO checkpoints (id, run_id, step_id, kind, prompt, status, opened_at, resolved_at, resolution)
      VALUES ('cp', 'v2-run', 'voice', 'write', 'Your words', 'resolved', ?, ?, '{"checkpointId":"cp","text":"Mine."}')`).run(at, at);
  } finally {
    db.close();
  }
}

/**
 * Writes a data directory exactly as a build that knew migrations 1 to 3 left it: a default workspace, a run with an
 * intake, and three checkpoints (two open, one resolved), so the checkpoints table rebuild of migration 4 has rows to keep.
 */
function writeVersion3Database(dataDir: string): void {
  const db = openDatabase(join(dataDir, 'byway.sqlite'));
  try {
    db.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT');
    for (const m of MIGRATIONS.slice(0, 3)) {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_version VALUES (?, ?, ?, ?)').run(m.version, m.name, checksumOf(m.sql), '2026-10-06T00:00:00.000Z');
    }
    const at = '2026-10-06T09:00:00.000Z';
    db.prepare('INSERT INTO workspaces (id, name, budget_usd, is_default, created_at) VALUES (?, ?, ?, ?, ?)').run('ws', 'Studio', 25, 1, at);
    db.prepare(`INSERT INTO intakes (id, workspace_id, problem, created_at, updated_at) VALUES ('in', 'ws', '{"text":"A page"}', ?, ?)`).run(at, at);
    db.prepare(`INSERT INTO runs (id, workspace_id, recipe_id, recipe_hash, profile_id, intake_id, title, problem, medium, status,
      output_artifact_id, error, cost_usd, budget_usd, created_at, updated_at) VALUES ('v3-run', 'ws', 'c1', ?, 'demo', 'in', 'Page', 'A page', 'web-page', 'waiting', NULL, NULL, 0, 5, ?, ?)`)
      .run(`sha256:${'a'.repeat(64)}`, at, at);
    const cp = db.prepare(`INSERT INTO checkpoints (id, run_id, step_id, candidate, kind, prompt, options, k, initial_text, artifact_ids, status, opened_at, resolved_at, resolution)
      VALUES (?, 'v3-run', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    cp.run('cp-pick', 'pick', 0, 'pick', 'Which?', '[{"id":"A","label":"A"},{"id":"B","label":"B"}]', 1, null, `["sha256:${'b'.repeat(64)}"]`, 'open', '2026-10-06T09:00:01.000Z', null, null);
    cp.run('cp-voice', 'voice', null, 'write', 'Your words', null, null, 'Fresh bread', null, 'open', '2026-10-06T09:00:02.000Z', null, null);
    cp.run('cp-done', 'gate', null, 'confirm', 'Ship it?', null, null, null, null, 'resolved', '2026-10-06T09:00:00.500Z', '2026-10-06T09:00:03.000Z', '{"checkpointId":"cp-done","approved":true}');
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

  it('pin the checksum of every migration: an applied migration is never edited, only followed by a new one', () => {
    expect(MIGRATIONS.map((m) => [m.version, m.name, checksumOf(m.sql)])).toEqual([
      [1, 'initial', 'sha256:bc605de33d2e74a5c2e2c7a66665f9dbc57f81348749ff5e7e5ca1ceda1345f6'],
      [2, 'run-budget-and-event-dedupe', 'sha256:ca45698760fd568f816708307e9d1861550b0fb8ddbac710768c565913c126ec'],
      [3, 'intakes-preferences-run-intake', MIGRATION_3_CHECKSUM],
      [4, 'checkpoint-withdrawn', MIGRATION_4_CHECKSUM],
      [5, 'memos', MIGRATION_5_CHECKSUM],
      [6, 'spend-book', MIGRATION_6_CHECKSUM],
      [7, 'operation-keys', MIGRATION_7_CHECKSUM],
      [8, 'renderer-settings', MIGRATION_8_CHECKSUM],
    ]);
  });

  it('upgrade an existing version-1 database file in place, keeping every row', async () => {
    const dataDir = tempDir();
    writeVersion1Database(dataDir);
    expect(versions(join(dataDir, 'byway.sqlite'))).toEqual([1]);
    const store = openStore({ dataDir });
    expect(versions(store.dbPath)).toEqual(MIGRATIONS.map((m) => m.version));
    // Existing runs take their workspace's budget: before this migration that was the only cap they ran under.
    expect(await store.getRun('old-run')).toEqual({
      id: 'old-run',
      workspaceId: 'ws-default',
      recipeId: 'c1',
      recipeHash: `sha256:${'a'.repeat(64)}`,
      profileId: 'demo',
      title: 'Memo',
      problem: 'Write a memo',
      medium: 'prose',
      status: 'waiting',
      budgetUsd: 30,
      costUsd: 1.25,
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: '2026-10-01T09:00:00.000Z',
    });
    expect(await store.getRun('other-run')).toMatchObject({ budgetUsd: 7.5, status: 'failed', error: 'budget-exceeded' });
    expect((await store.events('old-run')).map((e) => [e.seq, e.type])).toEqual([[1, 'run-started'], [2, 'checkpoint-opened']]);
    expect(await store.getCheckpoint('cp-old')).toMatchObject({ status: 'open', k: 1 });
    // The upgraded file takes the new columns: a budget change, keyed appends and the old rows' seq continue.
    expect((await store.updateRun('old-run', { budgetUsd: 40, error: null })).budgetUsd).toBe(40);
    const keyed = await store.appendEvent({ runId: 'old-run', type: 'checkpoint-resolved', data: {} }, { dedupeKey: 'cp-old:resolved' });
    expect(keyed.seq).toBe(3);
    expect(await store.appendEvent({ runId: 'old-run', type: 'checkpoint-resolved', data: { again: true } }, { dedupeKey: 'cp-old:resolved' })).toEqual(keyed);
    expect((await store.resolveCheckpoint({ checkpointId: 'cp-old', choice: ['B'] })).status).toBe('resolved');
    expect(await store.listRuns('ws-default')).toHaveLength(1);
  });

  it('upgrade an existing version-2 database file in place, keeping every row and adding intakes and preferences', async () => {
    const dataDir = tempDir();
    writeVersion2Database(dataDir);
    expect(versions(join(dataDir, 'byway.sqlite'))).toEqual([1, 2]);
    const store = openStore({ dataDir });
    expect(versions(store.dbPath)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(await store.getRun('v2-run')).toEqual({
      id: 'v2-run',
      workspaceId: 'ws',
      recipeId: 'c4',
      recipeHash: `sha256:${'a'.repeat(64)}`,
      profileId: 'balanced',
      title: 'Memo',
      problem: 'Write a memo',
      medium: 'prose',
      status: 'done',
      budgetUsd: 8,
      outputArtifactId: `sha256:${'c'.repeat(64)}`,
      costUsd: 0.5,
      createdAt: '2026-10-05T09:00:00.000Z',
      updatedAt: '2026-10-05T09:00:00.000Z',
    });
    expect((await store.events('v2-run')).map((e) => [e.seq, e.type])).toEqual([[1, 'run-started'], [2, 'run-finished']]);
    // The old dedupe keys still hold.
    expect((await store.appendEvent({ runId: 'v2-run', type: 'run-started', data: {} }, { dedupeKey: 'start' })).seq).toBe(1);
    expect(await store.getCheckpoint('cp')).toMatchObject({ status: 'resolved', resolution: { checkpointId: 'cp', text: 'Mine.' } });
    expect(await store.getWorkspace('ws')).toMatchObject({ name: 'Studio', budgetUsd: 25 });
    // The new tables and column work on the upgraded file.
    expect(await store.getPreferences('ws')).toEqual({ profileId: 'balanced', demoMode: false, showTechnicalNames: false });
    await store.createIntake({ id: 'in', workspaceId: 'ws', problem: { text: 'Another memo' } });
    const run = await store.createRun({ id: 'v3-run', workspaceId: 'ws', recipeId: 'c4', recipeHash: `sha256:${'a'.repeat(64)}`, profileId: 'balanced', intakeId: 'in', title: 't', problem: 'p', medium: 'prose', budgetUsd: 3, status: 'paused' });
    expect(run).toMatchObject({ intakeId: 'in', status: 'paused' });
    expect((await store.appendEvent({ runId: 'v3-run', type: 'run-paused', data: {} })).seq).toBe(1);
  });

  it('upgrade an existing version-3 database file in place, keeping every checkpoint and allowing withdrawal', async () => {
    const dataDir = tempDir();
    writeVersion3Database(dataDir);
    expect(versions(join(dataDir, 'byway.sqlite'))).toEqual([1, 2, 3]);
    const store = openStore({ dataDir, now: () => new Date('2026-10-07T10:00:00.000Z') });
    expect(versions(store.dbPath)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(await store.checkpointsForRun('v3-run')).toEqual([
      { id: 'cp-done', runId: 'v3-run', stepId: 'gate', kind: 'confirm', prompt: 'Ship it?', status: 'resolved', openedAt: '2026-10-06T09:00:00.500Z', resolvedAt: '2026-10-06T09:00:03.000Z', resolution: { checkpointId: 'cp-done', approved: true } },
      { id: 'cp-pick', runId: 'v3-run', stepId: 'pick', candidate: 0, kind: 'pick', prompt: 'Which?', options: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }], k: 1, artifactIds: [`sha256:${'b'.repeat(64)}`], status: 'open', openedAt: '2026-10-06T09:00:01.000Z' },
      { id: 'cp-voice', runId: 'v3-run', stepId: 'voice', kind: 'write', prompt: 'Your words', initialText: 'Fresh bread', status: 'open', openedAt: '2026-10-06T09:00:02.000Z' },
    ]);
    expect((await store.openCheckpoints('ws')).map((c) => c.id)).toEqual(['cp-pick', 'cp-voice']);
    expect(await store.withdrawCheckpoints('v3-run')).toBe(2);
    expect((await store.checkpointsForRun('v3-run')).map((c) => [c.id, c.status, c.withdrawnAt])).toEqual([
      ['cp-done', 'resolved', undefined],
      ['cp-pick', 'withdrawn', '2026-10-07T10:00:00.000Z'],
      ['cp-voice', 'withdrawn', '2026-10-07T10:00:00.000Z'],
    ]);
    expect(await store.openCheckpoints('ws')).toEqual([]);
    // The indexes survive the rebuild.
    const db = new DatabaseSync(store.dbPath);
    try {
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'checkpoints' ORDER BY name").all().map((r) => r.name);
      expect(indexes).toEqual(expect.arrayContaining(['checkpoints_by_run', 'checkpoints_open']));
    } finally {
      db.close();
    }
  });

  it('upgrade an existing version-4 database file in place, adding memos that go with their run', async () => {
    const dataDir = tempDir();
    const db = openDatabase(join(dataDir, 'byway.sqlite'));
    try {
      db.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT');
      for (const m of MIGRATIONS.slice(0, 4)) {
        db.exec(m.sql);
        db.prepare('INSERT INTO schema_version VALUES (?, ?, ?, ?)').run(m.version, m.name, checksumOf(m.sql), '2026-10-07T00:00:00.000Z');
      }
      const at = '2026-10-07T09:00:00.000Z';
      db.prepare('INSERT INTO workspaces (id, name, budget_usd, is_default, created_at) VALUES (?, ?, ?, ?, ?)').run('ws', 'Studio', 25, 1, at);
      db.prepare(`INSERT INTO runs (id, workspace_id, recipe_id, recipe_hash, profile_id, title, problem, medium, status, cost_usd, budget_usd, created_at, updated_at)
        VALUES ('v4-run', 'ws', 'c4', ?, 'demo', 'Memo', 'A memo', 'prose', 'running', 0, 5, ?, ?)`).run(`sha256:${'a'.repeat(64)}`, at, at);
    } finally {
      db.close();
    }
    expect(versions(join(dataDir, 'byway.sqlite'))).toEqual([1, 2, 3, 4]);
    const store = openStore({ dataDir });
    expect(versions(store.dbPath)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(await store.getMemo('v4-run', 'k')).toBeUndefined();
    expect(await store.setMemo('v4-run', 'k', 'sha256:x')).toBe('sha256:x');
    // A memo belongs to its run: deleting the run (only ever done by hand) takes its memos with it.
    const raw = new DatabaseSync(store.dbPath);
    try {
      raw.exec('PRAGMA foreign_keys = ON');
      raw.prepare('DELETE FROM runs WHERE id = ?').run('v4-run');
      expect(raw.prepare('SELECT COUNT(*) AS n FROM memos').get()?.n).toBe(0);
      expect(() => raw.prepare("INSERT INTO memos (run_id, key, value, created_at) VALUES ('ghost', 'k', 'v', 'now')").run()).toThrow(/FOREIGN KEY/);
    } finally {
      raw.close();
    }
  });

  it('upgrade an existing version-5 database file in place, adding an empty spend book that reads the ledger from its start', async () => {
    const dataDir = tempDir();
    const db = openDatabase(join(dataDir, 'byway.sqlite'));
    try {
      db.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT');
      for (const m of MIGRATIONS.slice(0, 5)) {
        db.exec(m.sql);
        db.prepare('INSERT INTO schema_version VALUES (?, ?, ?, ?)').run(m.version, m.name, checksumOf(m.sql), '2026-10-08T00:00:00.000Z');
      }
      db.prepare('INSERT INTO workspaces (id, name, budget_usd, is_default, created_at) VALUES (?, ?, ?, ?, ?)').run('ws', 'Studio', 25, 1, '2026-10-08T09:00:00.000Z');
    } finally {
      db.close();
    }
    expect(versions(join(dataDir, 'byway.sqlite'))).toEqual([1, 2, 3, 4, 5]);
    const store = openStore({ dataDir });
    expect(versions(store.dbPath)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(await store.getWorkspace('ws')).toMatchObject({ budgetUsd: 25 });
    expect(await store.spendBook.cursor()).toEqual({ offset: 0, tailStart: 0, tailSha256: null });
    expect(await store.spendBook.spend('ws')).toEqual({ spentUsd: 0, byRun: {}, inFlightUsd: 0, uncertainUsd: 0 });
  });

  it('hold a paid operation to its contract states and a settled cost at the schema level', () => {
    const db = new DatabaseSync(':memory:');
    try {
      migrate(db);
      const insert = db.prepare(`INSERT INTO paid_operations (id, workspace_id, purpose, kind, provider, model, paid, reserved_usd, state, lease_until,
        settled_usd, created_at, updated_at) VALUES (?, 'w', 'p', 'completion', 'mock', 'm', 0, 0, ?, 0, ?, 'now', 'now')`);
      insert.run('ok', 'open', null);
      insert.run('done', 'settled', 0.5);
      expect(() => insert.run('odd', 'pending', null)).toThrow(/CHECK/);
      expect(() => insert.run('unpriced', 'settled', null)).toThrow(/CHECK/);
      expect(() => insert.run('priced-open', 'open', 0.1)).toThrow(/CHECK/);
      expect(() => insert.run('negative', 'settled', -1)).toThrow(/CHECK/);
      expect(db.prepare('SELECT ledger_offset FROM spend_book_meta').all()).toEqual([{ ledger_offset: 0 }]);
    } finally {
      db.close();
    }
  });

  it('allow a withdrawn checkpoint at the schema level only with a withdrawal time and without a resolution', () => {
    const db = new DatabaseSync(':memory:');
    try {
      migrate(db);
      db.prepare("INSERT INTO workspaces (id, name, budget_usd, created_at) VALUES ('w', 'W', 1, 'now')").run();
      db.prepare(`INSERT INTO runs (id, workspace_id, recipe_id, recipe_hash, profile_id, title, problem, medium, status,
        budget_usd, created_at, updated_at) VALUES ('r', 'w', 'c1', 'h', 'demo', 't', 'p', 'prose', 'queued', 1, 'now', 'now')`).run();
      const insert = db.prepare(`INSERT INTO checkpoints (id, run_id, step_id, kind, prompt, status, opened_at, resolved_at, resolution, withdrawn_at)
        VALUES (?, 'r', 's', 'confirm', 'q', ?, 'now', ?, ?, ?)`);
      insert.run('ok', 'withdrawn', null, null, 'later');
      expect(() => insert.run('answered', 'withdrawn', 'later', '{"checkpointId":"answered","approved":true}', 'later')).toThrow(/CHECK/);
      expect(() => insert.run('no-time', 'withdrawn', null, null, null)).toThrow(/CHECK/);
      expect(() => insert.run('odd', 'open', null, null, 'later')).toThrow(/CHECK/);
      expect(() => insert.run('bad', 'cancelled', null, null, null)).toThrow(/CHECK/);
    } finally {
      db.close();
    }
  });

  it('refuse a negative run budget at the schema level too', () => {
    const db = new DatabaseSync(':memory:');
    try {
      migrate(db);
      db.prepare("INSERT INTO workspaces (id, name, budget_usd, created_at) VALUES ('w', 'W', 1, 'now')").run();
      const insert = db.prepare(`INSERT INTO runs (id, workspace_id, recipe_id, recipe_hash, profile_id, title, problem, medium, status,
        budget_usd, created_at, updated_at) VALUES (?, 'w', 'c1', 'h', 'demo', 't', 'p', 'prose', 'queued', ?, 'now', 'now')`);
      insert.run('ok', 0);
      expect(() => insert.run('bad', -1)).toThrow(/CHECK/);
    } finally {
      db.close();
    }
  });

  it('refuse events for a run that does not exist', async () => {
    const store = openStore();
    await expect(store.appendEvent({ runId: 'no-such-run', type: 'run-started', data: {} })).rejects.toThrow(/no run "no-such-run"/);
  });
});
