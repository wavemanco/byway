/**
 * Versioned schema migrations. Each migration is an ordered SQL string, applied once and recorded in `schema_version`
 * with a checksum; applied migrations are immutable (change the schema with a new migration, never by editing an old
 * one — the checksum turns an edit into a loud error instead of a silently diverged database).
 *
 * Enumerations that the contracts own (run status, event type, checkpoint kind, medium) are checked in TypeScript, not
 * with CHECK constraints: SQLite cannot alter a CHECK without rebuilding the table, and those lists will grow. The
 * CHECKs below are invariants that will not change.
 */
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { writeTransaction } from './db.ts';
import { StoreError } from './errors.ts';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial',
    sql: `
CREATE TABLE workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  budget_usd  REAL NOT NULL CHECK (budget_usd >= 0),
  is_default  INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at  TEXT NOT NULL
) STRICT;
-- At most one default workspace, even when two processes race to create it.
CREATE UNIQUE INDEX workspaces_single_default ON workspaces (is_default) WHERE is_default = 1;

CREATE TABLE artifacts (
  id          TEXT PRIMARY KEY CHECK (id GLOB 'sha256:*'),
  media_type  TEXT NOT NULL,
  bytes       INTEGER NOT NULL CHECK (bytes >= 0),
  created_at  TEXT NOT NULL
) STRICT;

CREATE TABLE runs (
  id                  TEXT PRIMARY KEY,
  workspace_id        TEXT NOT NULL REFERENCES workspaces (id),
  recipe_id           TEXT NOT NULL,
  recipe_hash         TEXT NOT NULL,
  profile_id          TEXT NOT NULL,
  title               TEXT NOT NULL,
  problem             TEXT NOT NULL,
  medium              TEXT NOT NULL,
  status              TEXT NOT NULL,
  output_artifact_id  TEXT REFERENCES artifacts (id),
  error               TEXT,
  cost_usd            REAL NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
) STRICT;
CREATE INDEX runs_by_workspace ON runs (workspace_id, created_at);

CREATE TABLE events (
  run_id     TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL CHECK (seq >= 1),
  at         TEXT NOT NULL,
  type       TEXT NOT NULL,
  step_id    TEXT,
  candidate  INTEGER CHECK (candidate >= 0),
  data       TEXT NOT NULL CHECK (json_valid(data)),
  PRIMARY KEY (run_id, seq)
) STRICT, WITHOUT ROWID;

CREATE TABLE checkpoints (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  step_id       TEXT NOT NULL,
  candidate     INTEGER CHECK (candidate >= 0),
  kind          TEXT NOT NULL,
  prompt        TEXT NOT NULL,
  options       TEXT CHECK (options IS NULL OR json_valid(options)),
  k             INTEGER CHECK (k >= 1),
  initial_text  TEXT,
  artifact_ids  TEXT CHECK (artifact_ids IS NULL OR json_valid(artifact_ids)),
  status        TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  opened_at     TEXT NOT NULL,
  resolved_at   TEXT,
  resolution    TEXT CHECK (resolution IS NULL OR json_valid(resolution)),
  CHECK ((status = 'resolved') = (resolution IS NOT NULL AND resolved_at IS NOT NULL))
) STRICT;
CREATE INDEX checkpoints_by_run ON checkpoints (run_id, opened_at);
CREATE INDEX checkpoints_open ON checkpoints (run_id) WHERE status = 'open';
`,
  },
  {
    version: 2,
    name: 'run-budget-and-event-dedupe',
    sql: `
-- Each run's spend cap (RunRecord.budgetUsd), raised when the user accepts a "Raise the budget" checkpoint. ADD COLUMN
-- needs a default for NOT NULL; every insert names the column, so the 0 only exists for the instant before the backfill.
ALTER TABLE runs ADD COLUMN budget_usd REAL NOT NULL DEFAULT 0 CHECK (budget_usd >= 0);
-- Runs from before this migration had no cap of their own, only their workspace's; they keep running under that.
UPDATE runs SET budget_usd = COALESCE((SELECT w.budget_usd FROM workspaces w WHERE w.id = runs.workspace_id), 0);

-- appendEvent's optional dedupe key: an activity that runs twice appends its event once (Temporal is at-least-once).
ALTER TABLE events ADD COLUMN dedupe_key TEXT CHECK (dedupe_key IS NULL OR dedupe_key <> '');
CREATE UNIQUE INDEX events_dedupe ON events (run_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
`,
  },
];

/** The schema version this build writes. */
export const SCHEMA_VERSION = MIGRATIONS.length;

function checksum(m: Migration): string {
  return `sha256:${createHash('sha256').update(m.sql, 'utf8').digest('hex')}`;
}

/**
 * Brings `db` to {@link SCHEMA_VERSION} and returns the versions it applied (empty when already current). All pending
 * migrations run in one write transaction, so concurrent openers apply them exactly once and a failure leaves the
 * database at its previous version. Refuses a database from a newer build or one whose history differs from this one.
 */
export function migrate(db: DatabaseSync, now: () => Date = () => new Date()): number[] {
  return writeTransaction(db, () => {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
  version     INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  checksum    TEXT NOT NULL,
  applied_at  TEXT NOT NULL
) STRICT`);
    const applied = db.prepare('SELECT version, name, checksum FROM schema_version ORDER BY version').all();
    const newest = applied.at(-1);
    if (newest && Number(newest.version) > SCHEMA_VERSION) {
      throw new StoreError(
        'schema',
        `the database has schema version ${Number(newest.version)}, newer than this build of byway knows (${SCHEMA_VERSION}); update byway or point BYWAY_DATA_DIR elsewhere`,
      );
    }
    applied.forEach((row, i) => {
      const m = MIGRATIONS[i];
      if (!m || Number(row.version) !== m.version) {
        throw new StoreError('schema', `the database's migration history has a gap at version ${i + 1}`);
      }
      if (row.checksum !== checksum(m)) {
        throw new StoreError(
          'schema',
          `migration ${m.version} ("${m.name}") differs from the one applied to this database; applied migrations must never be edited`,
        );
      }
    });
    const record = db.prepare('INSERT INTO schema_version (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)');
    const ran: number[] = [];
    for (const m of MIGRATIONS.slice(applied.length)) {
      db.exec(m.sql);
      record.run(m.version, m.name, checksum(m), now().toISOString());
      ran.push(m.version);
    }
    return ran;
  });
}
