/**
 * A read-only check of the store's own files, for the report byway prints at start (R4; ADR-0096). The backup unit is
 * the whole data directory (ADR-0094), but a restore can still mix files: a backup of `byway.sqlite` without its
 * artifact files, or a copy that was cut short. Without this check a missing page, document or image was found only when
 * something opened it, mid-run or mid-review. Here every recorded artifact's file is looked for at start, and each one
 * that is gone, or not the size the store recorded, is named with the runs whose records use it, so the person knows
 * which runs can no longer show their work. SQLite's own quick_check covers the database file itself.
 *
 * It opens its own read-only connection, so it can neither change a record nor create a database: it is safe beside
 * the open store, and on a folder that has none it refuses instead. It is not part of the contracts' Store: only the
 * process that owns the data directory calls it.
 */
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { artifactPath } from './artifacts.ts';
import { DEFAULT_BUSY_TIMEOUT_MS } from './db.ts';
import { StoreError } from './errors.ts';
import { DB_FILENAME } from './store.ts';

/** A recorded artifact whose file cannot serve it. */
export interface MissingArtifact {
  id: string;
  /** `missing`: no file. `wrong-size`: a file that is not the size recorded (a cut-off copy); reads would refuse it. */
  problem: 'missing' | 'wrong-size';
  /** The runs whose records use it (their output, timeline events, questions or memos), in id order. */
  runIds: string[];
}

export interface StoreCheck {
  /** What SQLite's quick_check reports about the database file: empty when it is sound. */
  database: string[];
  /** How many recorded artifacts were looked for. */
  artifacts: number;
  /** Recorded artifacts whose file is gone or the wrong size, in id order. */
  missing: MissingArtifact[];
}

/** At most this many of quick_check's messages: the first few say the file is damaged; the rest add nothing. */
const MAX_DATABASE_MESSAGES = 10;
/** Files looked for at once: enough to be quick on a large store, few enough not to exhaust file handles. */
const STAT_BATCH = 64;
const ARTIFACT_ID = /sha256:[0-9a-f]{64}/g;

export async function checkStore(dataDir: string): Promise<StoreCheck> {
  const file = path.join(dataDir, DB_FILENAME);
  if (!existsSync(file)) throw new StoreError('not-found', `there is no ${DB_FILENAME} in ${dataDir} to check`);
  const db = new DatabaseSync(file, { readOnly: true, timeout: DEFAULT_BUSY_TIMEOUT_MS });
  try {
    const database = quickCheck(db);
    let recorded: { id: string; bytes: number }[];
    try {
      recorded = db.prepare('SELECT id, bytes FROM artifacts ORDER BY id').all().map((r) => ({ id: String(r.id), bytes: Number(r.bytes) }));
    } catch (e) {
      // A database too damaged to list its artifacts has already said so through quick_check, or says so here.
      return { database: [...database, messageOf(e)], artifacts: 0, missing: [] };
    }
    const problems = new Map<string, MissingArtifact['problem']>();
    for (let i = 0; i < recorded.length; i += STAT_BATCH) {
      await Promise.all(
        recorded.slice(i, i + STAT_BATCH).map(async ({ id, bytes }) => {
          const problem = await fileProblem(artifactPath(dataDir, id), bytes);
          if (problem) problems.set(id, problem);
        }),
      );
    }
    const users = problems.size > 0 ? runsUsing(db, new Set(problems.keys())) : new Map<string, Set<string>>();
    const missing = [...problems]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, problem]) => ({ id, problem, runIds: [...(users.get(id) ?? [])].sort() }));
    return { database, artifacts: recorded.length, missing };
  } finally {
    db.close();
  }
}

/** quick_check's messages, or none when it answers "ok". A file too damaged to check at all is itself the message. */
function quickCheck(db: DatabaseSync): string[] {
  try {
    const rows = db.prepare(`PRAGMA quick_check(${MAX_DATABASE_MESSAGES})`).all();
    const messages = rows.map((r) => String(Object.values(r)[0] ?? ''));
    return messages.length === 1 && messages[0] === 'ok' ? [] : messages;
  } catch (e) {
    return [messageOf(e)];
  }
}

async function fileProblem(file: string, bytes: number): Promise<MissingArtifact['problem'] | undefined> {
  try {
    const s = await stat(file);
    return s.isFile() && s.size === bytes ? undefined : 'wrong-size';
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return 'missing';
    throw e;
  }
}

/**
 * Which runs use each of `ids`: one pass over every record that can name an artifact, matching the ids in their text.
 * An id is "sha256:" and 64 hex digits, so a match is that artifact and nothing else.
 */
function runsUsing(db: DatabaseSync, ids: ReadonlySet<string>): Map<string, Set<string>> {
  const users = new Map<string, Set<string>>();
  const note = (runId: unknown, text: unknown) => {
    if (typeof text !== 'string') return;
    for (const m of text.matchAll(ARTIFACT_ID)) {
      if (!ids.has(m[0])) continue;
      const runs = users.get(m[0]) ?? new Set<string>();
      runs.add(String(runId));
      users.set(m[0], runs);
    }
  };
  for (const r of db.prepare('SELECT id, output_artifact_id FROM runs WHERE output_artifact_id IS NOT NULL').iterate()) note(r.id, r.output_artifact_id);
  for (const r of db.prepare('SELECT run_id, data FROM events').iterate()) note(r.run_id, r.data);
  for (const r of db.prepare('SELECT run_id, artifact_ids, options, resolution FROM checkpoints').iterate()) note(r.run_id, `${r.artifact_ids ?? ''} ${r.options ?? ''} ${r.resolution ?? ''}`);
  for (const r of db.prepare('SELECT run_id, value FROM memos').iterate()) note(r.run_id, r.value);
  return users;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
