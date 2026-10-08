/**
 * An in-memory Store for demo mode. It mirrors what @byway/store does on SQLite (content-addressed artifacts,
 * per-run event sequence numbers with dedupe keys, checkpoints resolved exactly once with a checked answer,
 * intakes and per-workspace preferences) so the UI is built and tested against the same behaviour the real store
 * has. Nothing survives a restart, which is the one thing demo mode is allowed to differ on.
 */
import { createHash } from 'node:crypto';
import type {
  ArtifactRecord,
  ArtifactStore,
  CheckpointRecord,
  IntakeRecord,
  Preferences,
  RunEvent,
  RunRecord,
  Store,
  Workspace,
} from '@byway/contracts';
import { checkResolution } from './resolution.ts';

const DEFAULT_WORKSPACE_ID = 'default';
const DEFAULT_BUDGET_USD = 20;
/** The contract's defaults for a workspace that never saved preferences. */
const DEFAULT_PREFERENCES: Preferences = { profileId: 'balanced', demoMode: false, showTechnicalNames: false };

/** Strictly increasing ISO timestamps, so ordering by time is stable even within one millisecond. */
function clock(): () => string {
  let last = 0;
  return () => {
    const now = Math.max(Date.now(), last + 1);
    last = now;
    return new Date(now).toISOString();
  };
}

function notFound(what: string, id: string): Error {
  return new Error(`${what} ${id} not found`);
}

/** Copies only the fields a patch sets: undefined keeps the current value, as the contract says. */
function defined<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function createArtifactStore(now: () => string): ArtifactStore {
  const records = new Map<string, { record: ArtifactRecord; bytes: Uint8Array }>();
  const encoder = new TextEncoder();

  const put = async (bytes: Uint8Array, mediaType: string): Promise<ArtifactRecord> => {
    const id = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const existing = records.get(id);
    if (existing) return existing.record;
    const record: ArtifactRecord = { id, mediaType, bytes: bytes.byteLength, createdAt: now() };
    records.set(id, { record, bytes: new Uint8Array(bytes) });
    return record;
  };

  const get = async (id: string) => {
    const found = records.get(id);
    if (!found) throw notFound('artifact', id);
    return { record: found.record, bytes: new Uint8Array(found.bytes) };
  };

  return {
    put,
    putText: (text, mediaType) => put(encoder.encode(text), mediaType),
    get,
    getText: async (id) => new TextDecoder().decode((await get(id)).bytes),
    has: async (id) => records.has(id),
  };
}

export function createDemoStore(): Store {
  const now = clock();
  const workspaces = new Map<string, Workspace>();
  const runs = new Map<string, RunRecord>();
  const events = new Map<string, RunEvent[]>();
  /** Per run: dedupe key → the event first appended with it. */
  const dedupe = new Map<string, Map<string, RunEvent>>();
  const checkpoints = new Map<string, CheckpointRecord>();
  const intakes = new Map<string, IntakeRecord>();
  const preferences = new Map<string, Preferences>();

  const requireRun = (id: string): RunRecord => {
    const run = runs.get(id);
    if (!run) throw notFound('run', id);
    return run;
  };

  return {
    artifacts: createArtifactStore(now),

    async ensureDefaultWorkspace() {
      const existing = workspaces.get(DEFAULT_WORKSPACE_ID);
      if (existing) return existing;
      const ws: Workspace = { id: DEFAULT_WORKSPACE_ID, name: 'My workspace', budgetUsd: DEFAULT_BUDGET_USD, createdAt: now() };
      workspaces.set(ws.id, ws);
      return ws;
    },

    async getWorkspace(id) {
      return workspaces.get(id);
    },

    async updateWorkspace(id, patch) {
      const ws = workspaces.get(id);
      if (!ws) throw notFound('workspace', id);
      const next = { ...ws, ...defined(patch) };
      workspaces.set(id, next);
      return next;
    },

    async createRun(input) {
      const at = now();
      const run: RunRecord = { ...input, status: input.status ?? 'queued', costUsd: 0, createdAt: at, updatedAt: at };
      runs.set(run.id, run);
      return run;
    },

    async updateRun(id, patch) {
      const { error, outputArtifactId, ...rest } = patch;
      const next: RunRecord = { ...requireRun(id), ...defined(rest), updatedAt: now() };
      // null clears; a string sets; undefined leaves the field as it was.
      if (error === null) delete next.error;
      else if (error !== undefined) next.error = error;
      if (outputArtifactId === null) delete next.outputArtifactId;
      else if (outputArtifactId !== undefined) next.outputArtifactId = outputArtifactId;
      runs.set(id, next);
      return next;
    },

    async getRun(id) {
      return runs.get(id);
    },

    async listRuns(workspaceId, opts) {
      const list = [...runs.values()]
        .filter((r) => r.workspaceId === workspaceId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return opts?.limit ? list.slice(0, opts.limit) : list;
    },

    async appendEvent(input, opts) {
      const keyed = dedupe.get(input.runId) ?? new Map<string, RunEvent>();
      const first = opts?.dedupeKey !== undefined ? keyed.get(opts.dedupeKey) : undefined;
      if (first) return first;
      const list = events.get(input.runId) ?? [];
      const event: RunEvent = { ...input, seq: list.length + 1, at: now() };
      list.push(event);
      events.set(input.runId, list);
      if (opts?.dedupeKey !== undefined) {
        keyed.set(opts.dedupeKey, event);
        dedupe.set(input.runId, keyed);
      }
      return event;
    },

    async events(runId, afterSeq = 0) {
      return (events.get(runId) ?? []).filter((e) => e.seq > afterSeq);
    },

    async openCheckpoint(input) {
      const cp: CheckpointRecord = { ...input, status: 'open', openedAt: now() };
      checkpoints.set(cp.id, cp);
      return cp;
    },

    async resolveCheckpoint(res) {
      const cp = checkpoints.get(res.checkpointId);
      if (!cp) throw notFound('checkpoint', res.checkpointId);
      if (cp.status === 'resolved') throw new Error(`checkpoint ${cp.id} is already resolved`);
      const done: CheckpointRecord = { ...cp, status: 'resolved', resolvedAt: now(), resolution: checkResolution(cp, res) };
      checkpoints.set(cp.id, done);
      return done;
    },

    async getCheckpoint(id) {
      return checkpoints.get(id);
    },

    async openCheckpoints(workspaceId) {
      return [...checkpoints.values()].filter((c) => c.status === 'open' && runs.get(c.runId)?.workspaceId === workspaceId);
    },

    async checkpointsForRun(runId) {
      return [...checkpoints.values()].filter((c) => c.runId === runId);
    },

    async createIntake(input) {
      if (intakes.has(input.id)) throw new Error(`intake ${input.id} already exists`);
      const at = now();
      const intake: IntakeRecord = { ...input, createdAt: at, updatedAt: at };
      intakes.set(intake.id, intake);
      return intake;
    },

    async updateIntake(id, patch) {
      const intake = intakes.get(id);
      if (!intake) throw notFound('intake', id);
      const next: IntakeRecord = { ...intake, ...defined(patch), updatedAt: now() };
      intakes.set(id, next);
      return next;
    },

    async getIntake(id) {
      return intakes.get(id);
    },

    async getPreferences(workspaceId) {
      return { ...(preferences.get(workspaceId) ?? DEFAULT_PREFERENCES) };
    },

    async setPreferences(workspaceId, patch) {
      const next: Preferences = { ...(preferences.get(workspaceId) ?? DEFAULT_PREFERENCES), ...defined(patch) };
      preferences.set(workspaceId, next);
      return { ...next };
    },

    close() {
      runs.clear();
      events.clear();
      dedupe.clear();
      checkpoints.clear();
      intakes.clear();
      preferences.clear();
    },
  };
}
