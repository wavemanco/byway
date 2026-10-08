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
    budgetUsd: 2,
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

describe('demo store: runs', () => {
  it('creates, updates and lists runs, most recently created first, with their budget and intake', async () => {
    const { store, ws, run } = await withRun();
    expect(run).toMatchObject({ status: 'queued', costUsd: 0, budgetUsd: 2 });
    expect(run).not.toHaveProperty('intakeId');
    await new Promise((r) => setTimeout(r, 2));
    const second = await store.createRun({ ...run, id: 'run-2', status: 'running', intakeId: 'intake-1' });
    expect(second).toMatchObject({ status: 'running', intakeId: 'intake-1' });
    const updated = await store.updateRun('run-1', { status: 'done', costUsd: 0.4, outputArtifactId: 'sha256:x', budgetUsd: 3 });
    expect(updated).toMatchObject({ status: 'done', costUsd: 0.4, outputArtifactId: 'sha256:x', budgetUsd: 3 });
    expect((await store.listRuns(ws.id)).map((r) => r.id)).toEqual(['run-2', 'run-1']);
    expect(await store.listRuns(ws.id, { limit: 1 })).toHaveLength(1);
    await expect(store.updateRun('missing', { status: 'done' })).rejects.toThrow(/not found/);
  });

  it('keeps fields a patch leaves undefined, and clears error and output only on null', async () => {
    const { store } = await withRun();
    await store.updateRun('run-1', { status: 'failed', error: 'It broke', outputArtifactId: 'sha256:y' });
    const kept = await store.updateRun('run-1', { title: 'Memo, again' });
    expect(kept).toMatchObject({ status: 'failed', error: 'It broke', outputArtifactId: 'sha256:y', title: 'Memo, again', budgetUsd: 2 });
    const cleared = await store.updateRun('run-1', { status: 'paused', error: null, outputArtifactId: null });
    expect(cleared.status).toBe('paused');
    expect(cleared).not.toHaveProperty('error');
    expect(cleared).not.toHaveProperty('outputArtifactId');
    expect((await store.getRun('run-1'))?.status).toBe('paused');
  });
});

describe('demo store: events', () => {
  it('numbers events per run and reads them after a sequence number', async () => {
    const { store } = await withRun();
    const e1 = await store.appendEvent({ runId: 'run-1', type: 'run-started', data: { recipeId: 'c4', profileId: 'balanced', budgetUsd: 2 } });
    const e2 = await store.appendEvent({ runId: 'run-1', type: 'step-started', stepId: 's', data: {} });
    const other = await store.appendEvent({ runId: 'run-2', type: 'run-started', data: {} });
    expect([e1.seq, e2.seq, other.seq]).toEqual([1, 2, 1]);
    expect((await store.events('run-1')).map((e) => e.seq)).toEqual([1, 2]);
    expect((await store.events('run-1', 1)).map((e) => e.seq)).toEqual([2]);
  });

  it('returns the first event again for a repeated dedupe key, per run', async () => {
    const { store } = await withRun();
    const first = await store.appendEvent({ runId: 'run-1', type: 'run-paused', data: {} }, { dedupeKey: 'pause-1' });
    const again = await store.appendEvent({ runId: 'run-1', type: 'run-paused', data: {} }, { dedupeKey: 'pause-1' });
    expect(again).toEqual(first);
    const otherRun = await store.appendEvent({ runId: 'run-2', type: 'run-paused', data: {} }, { dedupeKey: 'pause-1' });
    expect(otherRun.runId).toBe('run-2');
    const plain = await store.appendEvent({ runId: 'run-1', type: 'run-resumed', data: {} });
    expect(plain.seq).toBe(2);
    expect((await store.events('run-1')).map((e) => e.type)).toEqual(['run-paused', 'run-resumed']);
  });
});

describe('demo store: checkpoints', () => {
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

  it('accepts a pick only when it chooses exactly k listed options', async () => {
    const { store } = await withRun();
    const options = ['a', 'b', 'c'].map((id) => ({ id, label: id.toUpperCase() }));
    await store.openCheckpoint({ id: 'cp-pick', runId: 'run-1', stepId: 'pick', kind: 'pick', prompt: 'Choose two', options, k: 2 });
    await expect(store.resolveCheckpoint({ checkpointId: 'cp-pick', choice: ['a'] })).rejects.toThrow(/exactly 2/);
    await expect(store.resolveCheckpoint({ checkpointId: 'cp-pick', choice: ['a', 'a'] })).rejects.toThrow(/twice/);
    await expect(store.resolveCheckpoint({ checkpointId: 'cp-pick', choice: ['a', 'z'] })).rejects.toThrow(/unknown option/);
    const done = await store.resolveCheckpoint({ checkpointId: 'cp-pick', choice: ['c', 'a'], text: 'ignored' });
    expect(done.resolution).toEqual({ checkpointId: 'cp-pick', choice: ['c', 'a'] });
  });
});

describe('demo store: intakes', () => {
  it('creates, updates and reads intakes', async () => {
    const store = createDemoStore();
    const ws = await store.ensureDefaultWorkspace();
    const intake = await store.createIntake({ id: 'intake-1', workspaceId: ws.id, problem: { text: 'A memo' } });
    expect(intake).toMatchObject({ id: 'intake-1', problem: { text: 'A memo' } });
    expect(intake.createdAt).toBe(intake.updatedAt);
    const answers = [{ questionId: 'decision', answer: false, confidence: 1, rationale: 'No.', setBy: 'user' as const }];
    await new Promise((r) => setTimeout(r, 2));
    const updated = await store.updateIntake('intake-1', { answers });
    expect(updated.answers).toEqual(answers);
    expect(updated.updatedAt > intake.updatedAt).toBe(true);
    expect((await store.getIntake('intake-1'))?.answers).toEqual(answers);
    expect(await store.getIntake('nope')).toBeUndefined();
    await expect(store.updateIntake('nope', { answers })).rejects.toThrow(/not found/);
    await expect(store.createIntake({ id: 'intake-1', workspaceId: ws.id, problem: { text: 'again' } })).rejects.toThrow(/already/);
  });
});

describe('demo store: preferences', () => {
  it('starts from the contract defaults and saves changes per workspace', async () => {
    const store = createDemoStore();
    expect(await store.getPreferences('default')).toEqual({ profileId: 'balanced', demoMode: false, showTechnicalNames: false });
    const next = await store.setPreferences('default', { showTechnicalNames: true, profileId: 'best' });
    expect(next).toEqual({ profileId: 'best', demoMode: false, showTechnicalNames: true });
    expect(await store.getPreferences('default')).toEqual(next);
    expect(await store.getPreferences('other')).toEqual({ profileId: 'balanced', demoMode: false, showTechnicalNames: false });
  });
});
