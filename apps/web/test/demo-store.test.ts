import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createDemoStore } from '../src/services/demo/store.ts';

const sha = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`;

async function withRun() {
  const store = createDemoStore();
  const ws = await store.ensureDefaultWorkspace();
  const run = await store.createRun({
    id: 'run-1',
    workspaceId: ws.id,
    recipeId: 'c4',
    recipeHash: 'sha256:abc',
    profileId: 'balanced',
    title: 'Memo',
    problem: 'Write a memo',
    medium: 'prose',
  });
  return { store, ws, run };
}

describe('demo store: workspaces', () => {
  it('creates the default workspace once and lets its budget change', async () => {
    const store = createDemoStore();
    const a = await store.ensureDefaultWorkspace();
    const b = await store.ensureDefaultWorkspace();
    expect(b).toEqual(a);
    expect(a.budgetUsd).toBeGreaterThan(0);
    const updated = await store.updateWorkspace(a.id, { budgetUsd: 42 });
    expect(updated.budgetUsd).toBe(42);
    expect((await store.getWorkspace(a.id))?.budgetUsd).toBe(42);
    expect(await store.getWorkspace('nope')).toBeUndefined();
  });
});

describe('demo store: artifacts are content-addressed', () => {
  it('stores text under the hash of its bytes and dedupes', async () => {
    const store = createDemoStore();
    const a = await store.artifacts.putText('# Hello', 'text/markdown');
    const b = await store.artifacts.putText('# Hello', 'text/markdown');
    expect(a.id).toBe(sha('# Hello'));
    expect(b).toEqual(a);
    expect(a.bytes).toBe(7);
    expect(await store.artifacts.getText(a.id)).toBe('# Hello');
    expect(await store.artifacts.has(a.id)).toBe(true);
    const got = await store.artifacts.get(a.id);
    expect(got.record.mediaType).toBe('text/markdown');
    expect(new TextDecoder().decode(got.bytes)).toBe('# Hello');
  });

  it('refuses unknown artifacts', async () => {
    const store = createDemoStore();
    expect(await store.artifacts.has(sha('x'))).toBe(false);
    await expect(store.artifacts.get(sha('x'))).rejects.toThrow(/not found/);
  });
});

describe('demo store: runs, events and checkpoints', () => {
  it('creates, updates and lists runs, most recently created first', async () => {
    const { store, ws, run } = await withRun();
    expect(run).toMatchObject({ status: 'queued', costUsd: 0 });
    await new Promise((r) => setTimeout(r, 2));
    const second = await store.createRun({ ...run, id: 'run-2', status: 'running' });
    expect(second.status).toBe('running');
    const updated = await store.updateRun('run-1', { status: 'done', costUsd: 0.4, outputArtifactId: 'sha256:x' });
    expect(updated).toMatchObject({ status: 'done', costUsd: 0.4, outputArtifactId: 'sha256:x' });
    expect((await store.listRuns(ws.id)).map((r) => r.id)).toEqual(['run-2', 'run-1']);
    expect(await store.listRuns(ws.id, { limit: 1 })).toHaveLength(1);
    await expect(store.updateRun('missing', { status: 'done' })).rejects.toThrow(/not found/);
  });

  it('numbers events per run and reads them after a sequence number', async () => {
    const { store } = await withRun();
    const e1 = await store.appendEvent({ runId: 'run-1', type: 'run-started', data: {} });
    const e2 = await store.appendEvent({ runId: 'run-1', type: 'step-started', stepId: 's', data: {} });
    const other = await store.appendEvent({ runId: 'run-2', type: 'run-started', data: {} });
    expect([e1.seq, e2.seq, other.seq]).toEqual([1, 2, 1]);
    expect((await store.events('run-1')).map((e) => e.seq)).toEqual([1, 2]);
    expect((await store.events('run-1', 1)).map((e) => e.seq)).toEqual([2]);
  });

  it('opens and resolves checkpoints once', async () => {
    const { store, ws } = await withRun();
    const cp = await store.openCheckpoint({ id: 'cp-1', runId: 'run-1', stepId: 'cut', kind: 'directive', prompt: 'What goes?' });
    expect(cp.status).toBe('open');
    expect((await store.openCheckpoints(ws.id)).map((c) => c.id)).toEqual(['cp-1']);
    const done = await store.resolveCheckpoint({ checkpointId: 'cp-1', text: 'Remove the FAQ' });
    expect(done).toMatchObject({ status: 'resolved', resolution: { checkpointId: 'cp-1', text: 'Remove the FAQ' } });
    expect(done.resolvedAt).toBeDefined();
    expect(await store.openCheckpoints(ws.id)).toEqual([]);
    expect((await store.checkpointsForRun('run-1')).map((c) => c.id)).toEqual(['cp-1']);
    await expect(store.resolveCheckpoint({ checkpointId: 'cp-1', text: 'again' })).rejects.toThrow(/already resolved/);
    await expect(store.resolveCheckpoint({ checkpointId: 'nope' })).rejects.toThrow(/not found/);
  });
});
