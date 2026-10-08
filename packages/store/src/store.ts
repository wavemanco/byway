/**
 * The product store (spec §2 "Data", ADR-0066): workspaces, runs, run events, checkpoints, intakes and preferences in
 * one SQLite file, `byway.sqlite`, plus the content-addressed artifact files beside it. The web app and the runner
 * worker each open their own instance on the same data directory; every read-then-write runs in an IMMEDIATE
 * transaction so they agree.
 *
 * node:sqlite is synchronous. The contract is asynchronous so that a remote store could stand in later; here the
 * promises simply settle with the synchronous result (or reject with its error).
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type {
  ArtifactStore,
  CheckpointOption,
  CheckpointRecord,
  CheckpointResolution,
  IntakeRecord,
  Preferences,
  RunEvent,
  RunRecord,
  RunStatus,
  Store,
  Workspace,
} from '@byway/contracts';
import { FileArtifactStore } from './artifacts.ts';
import { assertSafeDataDir, resolveDataDir } from './datadir.ts';
import { openDatabase, writeTransaction } from './db.ts';
import { CheckpointResolvedError, StoreError } from './errors.ts';
import { INTAKE_PATCH_KEYS, intakeFieldJson, toIntake, type IntakeField } from './intakes.ts';
import { migrate } from './migrations.ts';
import { PREFERENCE_KEYS, mergePreferences, toPreferences } from './preferences.ts';
import { prepareQueries, type Queries } from './queries.ts';
import { checkResolution } from './resolution.ts';
import { toCheckpoint, toEvent, toRun, toWorkspace } from './rows.ts';
import {
  CHECKPOINT_KINDS,
  RUN_EVENT_TYPES,
  RUN_STATUSES,
  eventData,
  invalid,
  isPlainObject,
  medium,
  nonEmpty,
  oneOf,
  optionalIndex,
  text,
  usd,
} from './validate.ts';

export const DB_FILENAME = 'byway.sqlite';
export const DEFAULT_WORKSPACE_NAME = 'My workspace';
/** The default workspace's spend cap: enough for a few real runs, small enough that a runaway loop stops early. */
export const DEFAULT_WORKSPACE_BUDGET_USD = 20;

export interface StoreOptions {
  /** Defaults to {@link resolveDataDir} (BYWAY_DATA_DIR or the platform default). */
  dataDir?: string;
  /** Permit a data directory inside OneDrive or a git working tree. */
  allowUnsafeLocation?: boolean;
  /** Clock for every timestamp the store writes; injectable for deterministic tests. */
  now?: () => Date;
  /** How long a write waits for another process's write before failing. */
  busyTimeoutMs?: number;
}

/** Opens (creating and migrating if needed) the store in the data directory. Close it with `close()`. */
export function createStore(options: StoreOptions = {}): SqliteStore {
  let dataDir: string;
  if (options.dataDir === undefined) {
    dataDir = resolveDataDir({ allowUnsafeLocation: options.allowUnsafeLocation ?? false });
  } else {
    dataDir = path.resolve(options.dataDir);
    if (!options.allowUnsafeLocation) assertSafeDataDir(dataDir);
  }
  mkdirSync(dataDir, { recursive: true });
  return new SqliteStore(dataDir, options);
}

type RunInput = Parameters<Store['createRun']>[0];
type RunPatch = Parameters<Store['updateRun']>[1];
type WorkspacePatch = Parameters<Store['updateWorkspace']>[1];
type CheckpointInput = Parameters<Store['openCheckpoint']>[0];
type IntakeInput = Parameters<Store['createIntake']>[0];
type IntakePatch = Parameters<Store['updateIntake']>[1];

const RUN_PATCH_KEYS = ['status', 'outputArtifactId', 'error', 'costUsd', 'title', 'budgetUsd'] as const satisfies readonly (keyof RunPatch)[];
const WORKSPACE_PATCH_KEYS = ['name', 'budgetUsd'] as const satisfies readonly (keyof WorkspacePatch)[];

function onlyKeys(what: string, patch: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!isPlainObject(patch)) throw invalid(`${what} must be a plain object`);
  const extra = Object.keys(patch).filter((k) => !allowed.includes(k));
  if (extra.length > 0) throw invalid(`${what} may only change ${allowed.join(', ')}; got ${extra.join(', ')}`);
  return patch;
}

/** The column value for a patch field that `null` clears: undefined keeps `current`, null clears, anything else is checked. */
function clearable(value: unknown, current: string | undefined, check: (v: unknown) => string): string | null {
  if (value === undefined) return current ?? null;
  return value === null ? null : check(value);
}

export class SqliteStore implements Store {
  readonly dataDir: string;
  readonly dbPath: string;
  readonly artifacts: ArtifactStore;

  readonly #db: DatabaseSync;
  readonly #now: () => Date;
  #closed = false;
  readonly #q: Queries;

  constructor(dataDir: string, options: Omit<StoreOptions, 'dataDir' | 'allowUnsafeLocation'> = {}) {
    this.dataDir = dataDir;
    this.dbPath = path.join(dataDir, DB_FILENAME);
    this.#now = options.now ?? (() => new Date());
    this.#db = openDatabase(this.dbPath, options.busyTimeoutMs === undefined ? {} : { busyTimeoutMs: options.busyTimeoutMs });
    try {
      migrate(this.#db, this.#now);
      this.#q = prepareQueries(this.#db);
      this.artifacts = new FileArtifactStore(dataDir, this.#db, this.#now, () => this.#ensureOpen());
    } catch (e) {
      // A half-built store would hold the file open (and locked, on Windows) with nobody left to close it.
      this.#db.close();
      throw e;
    }
  }

  // Workspaces

  async ensureDefaultWorkspace(): Promise<Workspace> {
    const q = this.#queries();
    const existing = q.defaultWorkspace.get();
    if (existing) return toWorkspace(existing);
    // Re-check under the write lock: another process may have created it since the read above.
    return writeTransaction(this.#db, () => {
      const row = q.defaultWorkspace.get();
      if (row) return toWorkspace(row);
      const ws: Workspace = { id: randomUUID(), name: DEFAULT_WORKSPACE_NAME, budgetUsd: DEFAULT_WORKSPACE_BUDGET_USD, createdAt: this.#stamp() };
      q.insertDefaultWorkspace.run(ws.id, ws.name, ws.budgetUsd, ws.createdAt);
      return ws;
    });
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const row = this.#queries().workspace.get(id);
    return row ? toWorkspace(row) : undefined;
  }

  async updateWorkspace(id: string, patch: WorkspacePatch): Promise<Workspace> {
    const q = this.#queries();
    const p = onlyKeys('a workspace update', patch, WORKSPACE_PATCH_KEYS);
    return writeTransaction(this.#db, () => {
      const row = q.workspace.get(id);
      if (!row) throw new StoreError('not-found', `no workspace ${JSON.stringify(id)}`);
      const ws = toWorkspace(row);
      const name = p.name === undefined ? ws.name : nonEmpty('workspace name', p.name).trim();
      const budgetUsd = p.budgetUsd === undefined ? ws.budgetUsd : usd('workspace budget', p.budgetUsd);
      q.updateWorkspace.run(name, budgetUsd, id);
      return { ...ws, name, budgetUsd };
    });
  }

  // Runs

  async createRun(run: RunInput): Promise<RunRecord> {
    const q = this.#queries();
    if (!isPlainObject(run)) throw invalid('a run must be a plain object');
    const id = nonEmpty('run id', run.id);
    const values = {
      workspaceId: nonEmpty('workspaceId', run.workspaceId),
      recipeId: nonEmpty('recipeId', run.recipeId),
      recipeHash: nonEmpty('recipeHash', run.recipeHash),
      profileId: nonEmpty('profileId', run.profileId),
      title: text('title', run.title),
      problem: text('problem', run.problem),
      medium: medium(run.medium),
      status: run.status === undefined ? 'queued' : oneOf<RunStatus>('run status', run.status, RUN_STATUSES),
      budgetUsd: usd('run budget', run.budgetUsd),
      intakeId: run.intakeId === undefined ? null : nonEmpty('intakeId', run.intakeId),
      outputArtifactId: run.outputArtifactId === undefined ? null : nonEmpty('outputArtifactId', run.outputArtifactId),
      error: run.error === undefined ? null : text('error', run.error),
    };
    return writeTransaction(this.#db, () => {
      if (q.run.get(id)) throw new StoreError('already-exists', `run ${JSON.stringify(id)} already exists`);
      if (!q.workspace.get(values.workspaceId)) throw new StoreError('not-found', `no workspace ${JSON.stringify(values.workspaceId)}`);
      if (values.intakeId !== null) {
        const intake = q.intake.get(values.intakeId);
        if (!intake) throw new StoreError('not-found', `no intake ${JSON.stringify(values.intakeId)}`);
        // A run labelled from another workspace's intake would show that workspace's problem.
        if (intake.workspace_id !== values.workspaceId) throw invalid(`intake ${JSON.stringify(values.intakeId)} belongs to another workspace`);
      }
      this.#requireArtifact(values.outputArtifactId);
      const at = this.#stamp();
      const v = values;
      q.insertRun.run(id, v.workspaceId, v.recipeId, v.recipeHash, v.profileId, v.intakeId, v.title, v.problem, v.medium, v.status, v.outputArtifactId, v.error, v.budgetUsd, at, at);
      return toRun(q.run.get(id)!);
    });
  }

  /** Fields left undefined keep their value; `null` clears `error` or `outputArtifactId` (and only those). */
  async updateRun(id: string, patch: RunPatch): Promise<RunRecord> {
    const q = this.#queries();
    const p = onlyKeys('a run update', patch, RUN_PATCH_KEYS);
    return writeTransaction(this.#db, () => {
      const row = q.run.get(id);
      if (!row) throw new StoreError('not-found', `no run ${JSON.stringify(id)}`);
      const run = toRun(row);
      const status = p.status === undefined ? run.status : oneOf<RunStatus>('run status', p.status, RUN_STATUSES);
      const outputArtifactId = clearable(p.outputArtifactId, run.outputArtifactId, (v) => nonEmpty('outputArtifactId', v));
      const error = clearable(p.error, run.error, (v) => text('error', v));
      const costUsd = p.costUsd === undefined ? run.costUsd : usd('run cost', p.costUsd);
      const title = p.title === undefined ? run.title : text('title', p.title);
      const budgetUsd = p.budgetUsd === undefined ? run.budgetUsd : usd('run budget', p.budgetUsd);
      if (outputArtifactId !== (run.outputArtifactId ?? null)) this.#requireArtifact(outputArtifactId);
      q.updateRun.run(status, outputArtifactId, error, costUsd, title, budgetUsd, this.#stamp(), id);
      return toRun(q.run.get(id)!);
    });
  }

  async getRun(id: string): Promise<RunRecord | undefined> {
    const row = this.#queries().run.get(id);
    return row ? toRun(row) : undefined;
  }

  async listRuns(workspaceId: string, opts: { limit?: number } = {}): Promise<RunRecord[]> {
    const q = this.#queries();
    const limit = opts.limit;
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) throw invalid(`limit must be a positive integer, got ${String(limit)}`);
    // SQLite reads a negative LIMIT as "no limit".
    return q.listRuns.all(workspaceId, limit ?? -1).map(toRun);
  }

  // Events

  /**
   * Appends with the run's next seq. With `dedupeKey`, an append whose key the run already used returns that first event
   * as stored (its seq, time and data) and writes nothing: a retried activity appends its event once. The new event is
   * still validated first, so a malformed retry fails the same way the first attempt would have.
   */
  async appendEvent(event: Omit<RunEvent, 'seq' | 'at'>, opts: { dedupeKey?: string } = {}): Promise<RunEvent> {
    const q = this.#queries();
    if (!isPlainObject(event)) throw invalid('an event must be a plain object');
    if (!isPlainObject(opts)) throw invalid('appendEvent options must be a plain object');
    const runId = nonEmpty('runId', event.runId);
    const type = oneOf('event type', event.type, RUN_EVENT_TYPES);
    const stepId = event.stepId === undefined ? null : nonEmpty('stepId', event.stepId);
    const candidate = optionalIndex('candidate', event.candidate);
    const data = eventData(event.data);
    const dedupeKey = opts.dedupeKey === undefined ? null : nonEmpty('dedupeKey', opts.dedupeKey);
    return writeTransaction(this.#db, () => {
      if (!q.run.get(runId)) throw new StoreError('not-found', `no run ${JSON.stringify(runId)}`);
      // The write lock is already held, so no other connection can append the same key, or take the same seq, between
      // these reads and the insert.
      if (dedupeKey !== null) {
        const first = q.eventByDedupeKey.get(runId, dedupeKey);
        if (first) return toEvent(first);
      }
      const seq = Number(q.nextSeq.get(runId)!.next);
      const at = this.#stamp();
      q.insertEvent.run(runId, seq, at, type, stepId, candidate, data, dedupeKey);
      return toEvent({ run_id: runId, seq, at, type, step_id: stepId, candidate, data });
    });
  }

  async events(runId: string, afterSeq = 0): Promise<RunEvent[]> {
    const q = this.#queries();
    if (!Number.isSafeInteger(afterSeq) || afterSeq < 0) throw invalid(`afterSeq must be a non-negative integer, got ${String(afterSeq)}`);
    return q.events.all(runId, afterSeq).map(toEvent);
  }

  // Checkpoints

  async openCheckpoint(cp: CheckpointInput): Promise<CheckpointRecord> {
    const q = this.#queries();
    // The input type has no resolution, but input that crossed JSON can still carry one: refuse it rather than drop it.
    const raw: unknown = cp;
    if (isPlainObject(raw) && (raw.resolution !== undefined || raw.resolvedAt !== undefined)) {
      throw invalid('a checkpoint is opened without a resolution; answer it with resolveCheckpoint');
    }
    const fields = checkpointFields(cp);
    return writeTransaction(this.#db, () => {
      const existing = q.checkpoint.get(fields.id);
      if (existing) {
        // An activity retried after its first attempt committed: hand back what is stored instead of failing the step.
        const stored = toCheckpoint(existing);
        if (JSON.stringify(checkpointFields(stored)) === JSON.stringify(fields)) return stored;
        throw new StoreError('already-exists', `checkpoint ${JSON.stringify(fields.id)} already exists with different content`);
      }
      if (!q.run.get(fields.runId)) throw new StoreError('not-found', `no run ${JSON.stringify(fields.runId)}`);
      const f = fields;
      const asJson = (v: unknown): string | null => (v === undefined ? null : JSON.stringify(v));
      q.insertCheckpoint.run(f.id, f.runId, f.stepId, f.candidate ?? null, f.kind, f.prompt, asJson(f.options), f.k ?? null, f.initialText ?? null, asJson(f.artifactIds), this.#stamp());
      return toCheckpoint(q.checkpoint.get(f.id)!);
    });
  }

  async resolveCheckpoint(res: CheckpointResolution): Promise<CheckpointRecord> {
    const q = this.#queries();
    if (!isPlainObject(res)) throw invalid('a resolution must be a plain object');
    const id = nonEmpty('checkpointId', res.checkpointId);
    return writeTransaction(this.#db, () => {
      const row = q.checkpoint.get(id);
      if (!row) throw new StoreError('not-found', `no checkpoint ${JSON.stringify(id)}`);
      const cp = toCheckpoint(row);
      if (cp.status !== 'open') throw new CheckpointResolvedError(cp);
      const check = checkResolution(cp, res);
      if (!check.ok) throw invalid(check.problem);
      q.resolveCheckpoint.run(this.#stamp(), JSON.stringify(check.resolution), id);
      return toCheckpoint(q.checkpoint.get(id)!);
    });
  }

  async getCheckpoint(id: string): Promise<CheckpointRecord | undefined> {
    const row = this.#queries().checkpoint.get(id);
    return row ? toCheckpoint(row) : undefined;
  }

  async openCheckpoints(workspaceId: string): Promise<CheckpointRecord[]> {
    return this.#queries().openCheckpoints.all(workspaceId).map(toCheckpoint);
  }

  async checkpointsForRun(runId: string): Promise<CheckpointRecord[]> {
    return this.#queries().runCheckpoints.all(runId).map(toCheckpoint);
  }

  // Intakes

  async createIntake(intake: IntakeInput): Promise<IntakeRecord> {
    const q = this.#queries();
    if (!isPlainObject(intake)) throw invalid('an intake must be a plain object');
    const id = nonEmpty('intake id', intake.id);
    const workspaceId = nonEmpty('workspaceId', intake.workspaceId);
    const problem = intakeFieldJson('problem', intake.problem);
    const optional = (field: Exclude<IntakeField, 'problem'>) => (intake[field] === undefined ? null : intakeFieldJson(field, intake[field]));
    const answers = optional('answers');
    const recommendation = optional('recommendation');
    const composed = optional('composed');
    return writeTransaction(this.#db, () => {
      if (q.intake.get(id)) throw new StoreError('already-exists', `intake ${JSON.stringify(id)} already exists`);
      if (!q.workspace.get(workspaceId)) throw new StoreError('not-found', `no workspace ${JSON.stringify(workspaceId)}`);
      const at = this.#stamp();
      q.insertIntake.run(id, workspaceId, problem, answers, recommendation, composed, at, at);
      return toIntake(q.intake.get(id)!);
    });
  }

  /** Fields left undefined keep their value; the intake's id and workspace never change. */
  async updateIntake(id: string, patch: IntakePatch): Promise<IntakeRecord> {
    const q = this.#queries();
    const p = onlyKeys('an intake update', patch, INTAKE_PATCH_KEYS);
    const json = Object.fromEntries(INTAKE_PATCH_KEYS.map((field) => [field, p[field] === undefined ? undefined : intakeFieldJson(field, p[field])]));
    return writeTransaction(this.#db, () => {
      const row = q.intake.get(id);
      if (!row) throw new StoreError('not-found', `no intake ${JSON.stringify(id)}`);
      const keep = (field: IntakeField) => json[field] ?? (row[field] as string | null);
      q.updateIntake.run(keep('problem'), keep('answers'), keep('recommendation'), keep('composed'), this.#stamp(), id);
      return toIntake(q.intake.get(id)!);
    });
  }

  async getIntake(id: string): Promise<IntakeRecord | undefined> {
    const row = this.#queries().intake.get(id);
    return row ? toIntake(row) : undefined;
  }

  // Preferences

  async getPreferences(workspaceId: string): Promise<Preferences> {
    const q = this.#queries();
    if (!q.workspace.get(workspaceId)) throw new StoreError('not-found', `no workspace ${JSON.stringify(workspaceId)}`);
    return toPreferences(q.preferences.get(workspaceId));
  }

  async setPreferences(workspaceId: string, patch: Partial<Preferences>): Promise<Preferences> {
    const q = this.#queries();
    const p = onlyKeys('a preferences update', patch, PREFERENCE_KEYS);
    return writeTransaction(this.#db, () => {
      if (!q.workspace.get(workspaceId)) throw new StoreError('not-found', `no workspace ${JSON.stringify(workspaceId)}`);
      const next = mergePreferences(toPreferences(q.preferences.get(workspaceId)), p);
      q.upsertPreferences.run(workspaceId, next.profileId, next.demoMode ? 1 : 0, next.showTechnicalNames ? 1 : 0, this.#stamp());
      return next;
    });
  }

  /** Closes the database. Safe to call twice; every later call on the store fails with code 'closed'. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#db.close();
  }

  #ensureOpen(): void {
    if (this.#closed) throw new StoreError('closed', 'the store is closed');
  }

  #queries(): Queries {
    this.#ensureOpen();
    return this.#q;
  }

  #stamp(): string {
    return this.#now().toISOString();
  }

  #requireArtifact(id: string | null): void {
    if (id !== null && !this.#queries().artifactExists.get(id)) throw new StoreError('not-found', `no artifact ${JSON.stringify(id)}`);
  }
}

/**
 * The caller-supplied part of a checkpoint (everything but its status, timestamps and resolution), validated, with
 * unknown keys dropped and keys in a fixed order, so the fields of a new and a stored checkpoint compare as JSON text.
 */
function checkpointFields(cp: CheckpointInput | CheckpointRecord): Omit<CheckpointRecord, 'status' | 'openedAt' | 'resolvedAt' | 'resolution'> {
  if (!isPlainObject(cp)) throw invalid('a checkpoint must be a plain object');
  const id = nonEmpty('checkpoint id', cp.id);
  const options = cp.options === undefined ? undefined : checkpointOptions(cp.options);
  const k = optionalIndex('k', cp.k);
  if (k === 0) throw invalid('k must be at least 1');
  // A pick is answered with exactly k distinct options (checkResolution), so k beyond the list could never be answered.
  if (cp.kind === 'pick' && k !== null && options !== undefined && k > options.length) {
    throw invalid(`pick checkpoint ${JSON.stringify(id)}: k is ${k} but only ${options.length} options are listed`);
  }
  const artifactIds = cp.artifactIds;
  if (artifactIds !== undefined && (!Array.isArray(artifactIds) || !artifactIds.every((a) => typeof a === 'string' && a !== ''))) {
    throw invalid('artifactIds must be a list of artifact ids');
  }
  const candidate = optionalIndex('candidate', cp.candidate);
  return {
    id,
    runId: nonEmpty('runId', cp.runId),
    stepId: nonEmpty('stepId', cp.stepId),
    ...(candidate === null ? {} : { candidate }),
    kind: oneOf('checkpoint kind', cp.kind, CHECKPOINT_KINDS),
    prompt: nonEmpty('prompt', cp.prompt),
    ...(options === undefined ? {} : { options }),
    ...(k === null ? {} : { k }),
    ...(cp.initialText === undefined ? {} : { initialText: text('initialText', cp.initialText) }),
    ...(artifactIds === undefined ? {} : { artifactIds: [...artifactIds] }),
  };
}

function checkpointOptions(value: unknown): CheckpointOption[] {
  if (!Array.isArray(value)) throw invalid('checkpoint options must be a list');
  const options = value.map((o: unknown, i): CheckpointOption => {
    if (!isPlainObject(o)) throw invalid(`checkpoint option ${i} must be an object`);
    return {
      id: nonEmpty(`option ${i} id`, o.id),
      label: text(`option ${i} label`, o.label),
      ...(o.artifactId === undefined ? {} : { artifactId: nonEmpty(`option ${i} artifactId`, o.artifactId) }),
    };
  });
  if (new Set(options.map((o) => o.id)).size !== options.length) throw invalid('checkpoint option ids must be distinct');
  return options;
}
