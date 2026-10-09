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
  {
    version: 3,
    name: 'intakes-preferences-run-intake',
    sql: `
-- What the user brought before a run (IntakeRecord): the problem, the chooser answers, the advisor's recommendation and
-- a composed recipe. They are the advisor's structures, stored whole as JSON and checked by the store on write and read.
CREATE TABLE intakes (
  id              TEXT PRIMARY KEY CHECK (id <> ''),
  workspace_id    TEXT NOT NULL REFERENCES workspaces (id),
  problem         TEXT NOT NULL CHECK (json_valid(problem)),
  answers         TEXT CHECK (answers IS NULL OR json_valid(answers)),
  recommendation  TEXT CHECK (recommendation IS NULL OR json_valid(recommendation)),
  composed        TEXT CHECK (composed IS NULL OR json_valid(composed)),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
) STRICT;
CREATE INDEX intakes_by_workspace ON intakes (workspace_id, created_at);

-- Settings per workspace (Preferences). No row means "never set", and the store answers with the defaults, so a new
-- default can ship without rewriting rows.
CREATE TABLE preferences (
  workspace_id          TEXT PRIMARY KEY REFERENCES workspaces (id),
  profile_id            TEXT NOT NULL CHECK (profile_id <> ''),
  demo_mode             INTEGER NOT NULL CHECK (demo_mode IN (0, 1)),
  show_technical_names  INTEGER NOT NULL CHECK (show_technical_names IN (0, 1)),
  updated_at            TEXT NOT NULL
) STRICT;

-- The intake a run started from (RunRecord.intakeId), for labels and presentation after a restart. SQLite allows a
-- REFERENCES clause on an added column only with a NULL default, which is what runs from before this migration have.
ALTER TABLE runs ADD COLUMN intake_id TEXT REFERENCES intakes (id);

-- The 'paused' run status and the run-paused/run-resumed events need no schema change: statuses and event types are
-- checked in TypeScript (see the header of migrations.ts), never by a CHECK, so no table is rebuilt.
`,
  },
  {
    version: 4,
    name: 'checkpoint-withdrawn',
    sql: `
-- A checkpoint becomes 'withdrawn' when its run is cancelled or fails while the question is open (contracts v4,
-- Store.withdrawCheckpoints). Migration 1 pinned the status to ('open', 'resolved') with a CHECK, and SQLite cannot alter
-- a CHECK, so the table is rebuilt (SQLite's documented create-copy-drop-rename procedure). Nothing references
-- checkpoints, so dropping the old table cascades nowhere; rowids are copied so ties in opened_at keep their order.
-- withdrawn_at records when the question was withdrawn; the record does not expose it (the contract has no field for
-- it), but it keeps the row honest about when it stopped being answerable.
CREATE TABLE checkpoints_v4 (
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
  status        TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'withdrawn')),
  opened_at     TEXT NOT NULL,
  resolved_at   TEXT,
  resolution    TEXT CHECK (resolution IS NULL OR json_valid(resolution)),
  withdrawn_at  TEXT,
  CHECK ((status = 'resolved') = (resolution IS NOT NULL AND resolved_at IS NOT NULL)),
  CHECK ((status = 'withdrawn') = (withdrawn_at IS NOT NULL))
) STRICT;
INSERT INTO checkpoints_v4 (rowid, id, run_id, step_id, candidate, kind, prompt, options, k, initial_text, artifact_ids, status,
  opened_at, resolved_at, resolution, withdrawn_at)
  SELECT rowid, id, run_id, step_id, candidate, kind, prompt, options, k, initial_text, artifact_ids, status,
  opened_at, resolved_at, resolution, NULL FROM checkpoints;
DROP TABLE checkpoints;
ALTER TABLE checkpoints_v4 RENAME TO checkpoints;
CREATE INDEX checkpoints_by_run ON checkpoints (run_id, opened_at);
CREATE INDEX checkpoints_open ON checkpoints (run_id) WHERE status = 'open';
`,
  },
  {
    version: 5,
    name: 'memos',
    sql: `
-- Store.getMemo/setMemo (contracts v5): an idempotency memo for at-least-once activities. Temporal may run an activity
-- again after it bought a model, image or video call; the runner records each call's result here by a stable key, and
-- the retry reuses it instead of paying twice. The primary key makes the first write win: a later insert of the same
-- key does nothing. Memos belong to their run and go with it.
CREATE TABLE memos (
  run_id      TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  key         TEXT NOT NULL CHECK (key <> ''),
  value       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (run_id, key)
) STRICT, WITHOUT ROWID;

-- The 'select' checkpoint kind (choose any number of options, none included) needs no schema change: kinds are checked
-- in TypeScript, never by a CHECK (see the header of migrations.ts).
`,
  },
  {
    version: 6,
    name: 'spend-book',
    sql: `
-- The spend book (contracts v6, SpendBook; ADR-0095): every paid call from admission to settlement, shared by the web
-- process and the worker, and the authority the spend caps are checked against. ledger.jsonl stays the hash-chained
-- audit record, written from here through an outbox (entry, ledger_entry_id, ledgered_seq) and read back in by one
-- idempotent step (absorb). A row's state is one of the contract's six, which will not grow, so it has a CHECK.
-- workspace_id has no REFERENCES: entries absorbed from an older ledger may name workspaces this database never had.
-- lease_until is in milliseconds since the epoch: a row is live (its caller is still waiting on the provider) while it
-- is in the future. reserved_usd is the call's planning estimate; retained_usd counts earlier attempts that may have
-- been billed. settle_seq orders the outbox by settlement, whatever the clocks of the processes said.
CREATE TABLE paid_operations (
  id                TEXT PRIMARY KEY CHECK (id <> ''),
  workspace_id      TEXT NOT NULL CHECK (workspace_id <> ''),
  run_id            TEXT,
  step_id           TEXT,
  purpose           TEXT NOT NULL,
  kind              TEXT NOT NULL,
  provider          TEXT NOT NULL,
  model             TEXT NOT NULL,
  paid              INTEGER NOT NULL CHECK (paid IN (0, 1)),
  reserved_usd      REAL NOT NULL CHECK (reserved_usd >= 0),
  retained_usd      REAL NOT NULL DEFAULT 0 CHECK (retained_usd >= 0),
  state             TEXT NOT NULL CHECK (state IN ('open', 'sent', 'accepted', 'settled', 'released', 'uncertain')),
  uncertain_reason  TEXT CHECK (uncertain_reason IS NULL OR uncertain_reason IN ('interrupted', 'failed')),
  provider_jobs     TEXT CHECK (provider_jobs IS NULL OR json_valid(provider_jobs)),
  owner             TEXT,
  lease_until       INTEGER NOT NULL,
  sent_at           TEXT,
  settled_at        TEXT,
  settle_seq        INTEGER UNIQUE,
  settled_usd       REAL CHECK (settled_usd IS NULL OR settled_usd >= 0),
  served_model      TEXT,
  price_basis       TEXT,
  entry             TEXT CHECK (entry IS NULL OR json_valid(entry)),
  ledger_entry_id   TEXT UNIQUE,
  ledgered_seq      INTEGER,
  cleared_at        TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  CHECK ((state = 'settled') = (settled_usd IS NOT NULL))
) STRICT;
CREATE INDEX paid_operations_by_workspace ON paid_operations (workspace_id, state);
CREATE INDEX paid_operations_by_run ON paid_operations (run_id, state) WHERE run_id IS NOT NULL;
CREATE INDEX paid_operations_live ON paid_operations (lease_until) WHERE state IN ('open', 'sent', 'accepted');
CREATE INDEX paid_operations_outbox ON paid_operations (settle_seq) WHERE state = 'settled' AND ledgered_seq IS NULL;

-- Lines of ledger.jsonl the book could not read as entries. Each blocks paid calls until the person acknowledges it in
-- Settings; one line is recorded once, by where it is and what it holds, however often the file is read again.
CREATE TABLE spend_faults (
  id               INTEGER PRIMARY KEY,
  ledger_offset    INTEGER NOT NULL CHECK (ledger_offset >= 0),
  line_sha256      TEXT NOT NULL,
  detail           TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  acknowledged_at  TEXT,
  UNIQUE (ledger_offset, line_sha256)
) STRICT;

-- How far the book has read ledger.jsonl (LedgerCursor): one row.
CREATE TABLE spend_book_meta (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  ledger_offset       INTEGER NOT NULL CHECK (ledger_offset >= 0),
  ledger_tail_start   INTEGER NOT NULL CHECK (ledger_tail_start >= 0),
  ledger_tail_sha256  TEXT
) STRICT;
INSERT INTO spend_book_meta (id, ledger_offset, ledger_tail_start, ledger_tail_sha256) VALUES (1, 0, 0, NULL);
`,
  },
  {
    version: 7,
    name: 'operation-keys',
    sql: `
-- Stage 3 of the spend book (ADR-0099): a paid call's identity across Temporal's attempts of its step. op_key is the
-- runner's run and memo key for the call; one row holds a key at a time (the unique index), and a row gives it up to
-- a later attempt by moving it to released_key, which keeps the history. Rows from before this migration, the
-- advisor's calls and absorbed ledger entries have no key.
ALTER TABLE paid_operations ADD COLUMN op_key TEXT CHECK (op_key IS NULL OR op_key <> '');
ALTER TABLE paid_operations ADD COLUMN released_key TEXT;
CREATE UNIQUE INDEX paid_operations_by_key ON paid_operations (op_key) WHERE op_key IS NOT NULL;
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
