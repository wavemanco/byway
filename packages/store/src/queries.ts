/** Every statement the record store runs, prepared once per connection. */
import type { DatabaseSync } from 'node:sqlite';

export type Queries = ReturnType<typeof prepareQueries>;

export function prepareQueries(db: DatabaseSync) {
  const p = (sql: string) => db.prepare(sql);
  return {
    defaultWorkspace: p('SELECT * FROM workspaces WHERE is_default = 1'),
    workspace: p('SELECT * FROM workspaces WHERE id = ?'),
    insertDefaultWorkspace: p('INSERT INTO workspaces (id, name, budget_usd, is_default, created_at) VALUES (?, ?, ?, 1, ?)'),
    updateWorkspace: p('UPDATE workspaces SET name = ?, budget_usd = ? WHERE id = ?'),

    run: p('SELECT * FROM runs WHERE id = ?'),
    insertRun: p(`INSERT INTO runs (id, workspace_id, recipe_id, recipe_hash, profile_id, intake_id, title, problem, medium, status,
      output_artifact_id, error, budget_usd, cost_usd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`),
    updateRun: p('UPDATE runs SET status = ?, output_artifact_id = ?, error = ?, cost_usd = ?, title = ?, budget_usd = ?, updated_at = ? WHERE id = ?'),
    // rowid breaks ties between runs created in the same millisecond, in creation order. A negative LIMIT is no limit.
    listRuns: p('SELECT * FROM runs WHERE workspace_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?'),
    artifactExists: p('SELECT 1 FROM artifacts WHERE id = ?'),

    nextSeq: p('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM events WHERE run_id = ?'),
    insertEvent: p('INSERT INTO events (run_id, seq, at, type, step_id, candidate, data, dedupe_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    eventByDedupeKey: p('SELECT * FROM events WHERE run_id = ? AND dedupe_key = ?'),
    events: p('SELECT * FROM events WHERE run_id = ? AND seq > ? ORDER BY seq'),

    checkpoint: p('SELECT * FROM checkpoints WHERE id = ?'),
    insertCheckpoint: p(`INSERT INTO checkpoints (id, run_id, step_id, candidate, kind, prompt, options, k, initial_text,
      artifact_ids, status, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`),
    resolveCheckpoint: p(`UPDATE checkpoints SET status = 'resolved', resolved_at = ?, resolution = ? WHERE id = ? AND status = 'open'`),
    withdrawCheckpoints: p(`UPDATE checkpoints SET status = 'withdrawn', withdrawn_at = ? WHERE run_id = ? AND status = 'open'`),
    openCheckpoints: p(`SELECT c.* FROM checkpoints c JOIN runs r ON r.id = c.run_id
      WHERE r.workspace_id = ? AND c.status = 'open' ORDER BY c.opened_at, c.rowid`),
    runCheckpoints: p('SELECT * FROM checkpoints WHERE run_id = ? ORDER BY opened_at, rowid'),

    intake: p('SELECT * FROM intakes WHERE id = ?'),
    insertIntake: p(`INSERT INTO intakes (id, workspace_id, problem, answers, recommendation, composed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    updateIntake: p('UPDATE intakes SET problem = ?, answers = ?, recommendation = ?, composed = ?, updated_at = ? WHERE id = ?'),

    preferences: p('SELECT * FROM preferences WHERE workspace_id = ?'),
    upsertPreferences: p(`INSERT INTO preferences (workspace_id, profile_id, demo_mode, show_technical_names, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (workspace_id) DO UPDATE SET profile_id = excluded.profile_id, demo_mode = excluded.demo_mode,
      show_technical_names = excluded.show_technical_names, updated_at = excluded.updated_at`),
  };
}
