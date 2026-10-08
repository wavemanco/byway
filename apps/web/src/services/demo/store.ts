/**
 * An in-memory Store for demo mode. It mirrors what @byway/store will do on SQLite (content-addressed
 * artifacts, per-run event sequence numbers, checkpoints resolved exactly once) so the UI can be built and
 * tested against the same behaviour before the real store is wired in.
 */
import { createHash } from 'node:crypto';
import type {
  ArtifactRecord,
  ArtifactStore,
  CheckpointRecord,
  CheckpointResolution,
  RunEvent,
  RunRecord,
  Store,
  Workspace,
} from '@byway/contracts';

const DEFAULT_WORKSPACE_ID = 'default';
const DEFAULT_BUDGET_USD = 20;

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
  const checkpoints = new Map<string, CheckpointRecord>();

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
      const next = { ...ws, ...patch };
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
      const run = { ...requireRun(id), ...patch, updatedAt: now() };
      runs.set(id, run);
      return run;
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

    async appendEvent(input) {
      const list = events.get(input.runId) ?? [];
      const event: RunEvent = { ...input, seq: list.length + 1, at: now() };
      list.push(event);
      events.set(input.runId, list);
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

    async resolveCheckpoint(res: CheckpointResolution) {
      const cp = checkpoints.get(res.checkpointId);
      if (!cp) throw notFound('checkpoint', res.checkpointId);
      if (cp.status === 'resolved') throw new Error(`checkpoint ${cp.id} is already resolved`);
      const done: CheckpointRecord = { ...cp, status: 'resolved', resolvedAt: now(), resolution: res };
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

    close() {
      runs.clear();
      events.clear();
      checkpoints.clear();
    },
  };
}
