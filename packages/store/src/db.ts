/**
 * SQLite connections through node:sqlite (ADR-0066). Several processes share one file (the web app and the runner
 * worker), so every connection runs in WAL mode (readers never block the writer) with a busy timeout (a writer waits
 * for another writer instead of failing), and enforces foreign keys, which SQLite leaves off unless asked.
 */
import { DatabaseSync } from 'node:sqlite';

export interface OpenDatabaseOptions {
  /** How long a write waits for another connection's write lock before failing. */
  busyTimeoutMs?: number;
}

export const DEFAULT_BUSY_TIMEOUT_MS = 10_000;

export function openDatabase(file: string, opts: OpenDatabaseOptions = {}): DatabaseSync {
  const busyTimeoutMs = opts.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
  if (!Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 0) throw new RangeError(`busyTimeoutMs must be a non-negative integer, got ${busyTimeoutMs}`);
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: true, timeout: busyTimeoutMs });
  try {
    db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    useWal(db, busyTimeoutMs);
    // NORMAL is durable across application crashes in WAL mode; only an OS crash can lose the last commits.
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec('PRAGMA foreign_keys = ON');
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}

/**
 * Puts the file in WAL mode. The mode is stored in the file, so after the first switch this is a read. The switch itself
 * needs an exclusive lock and SQLite answers SQLITE_BUSY at once, without the busy handler, when another connection is
 * opening the same new file at that moment; so it is retried here until the busy timeout runs out.
 */
function useWal(db: DatabaseSync, busyTimeoutMs: number): void {
  const mode = (): unknown => Object.values(db.prepare('PRAGMA journal_mode').get() ?? {})[0];
  const deadline = Date.now() + busyTimeoutMs;
  for (let attempt = 0; ; attempt++) {
    try {
      if (mode() === 'wal') return;
      db.exec('PRAGMA journal_mode = WAL');
      if (mode() === 'wal') return;
      throw new Error(`could not switch ${db.location() ?? 'the database'} to WAL mode`);
    } catch (e) {
      if (!isBusy(e) || Date.now() >= deadline) throw e;
      sleepSync(Math.min(5 * 2 ** Math.min(attempt, 4), 50) + Math.random() * 5);
    }
  }
}

/** SQLITE_BUSY (5), including its extended codes. */
export function isBusy(e: unknown): boolean {
  const errcode = (e as { errcode?: unknown } | null)?.errcode;
  return typeof errcode === 'number' && (errcode & 0xff) === 5;
}

const sleeper = new Int32Array(new SharedArrayBuffer(4));
/** Opening a database is synchronous (node:sqlite is), so the retry pause is too. Only used while opening. */
function sleepSync(ms: number): void {
  Atomics.wait(sleeper, 0, 0, ms);
}

/**
 * Runs `fn` in a write transaction taken up front (BEGIN IMMEDIATE). Taking the write lock before the first read is
 * what makes read-then-write sequences (next event seq, create-if-missing) safe across connections: a plain BEGIN
 * would read under a shared lock and could fail with SQLITE_BUSY on upgrade instead of waiting.
 */
export function writeTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw e;
  }
}
