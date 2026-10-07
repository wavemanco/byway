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
    // The timeout must be in place before journal_mode, which itself needs a lock when another connection is opening.
    db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    db.exec('PRAGMA journal_mode = WAL');
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
