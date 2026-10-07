import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKSPACE_BUDGET_USD, DEFAULT_WORKSPACE_NAME, StoreError, createStore } from '../src/index.ts';
import { openStore, seedRun, steppingClock, tempDir } from './helpers.ts';

describe('workspaces', () => {
  it('ensureDefaultWorkspace creates "My workspace" with the default budget once', async () => {
    const store = openStore({ now: () => new Date('2026-10-07T12:00:00.000Z') });
    const first = await store.ensureDefaultWorkspace();
    expect(first).toEqual({ id: first.id, name: DEFAULT_WORKSPACE_NAME, budgetUsd: DEFAULT_WORKSPACE_BUDGET_USD, createdAt: '2026-10-07T12:00:00.000Z' });
    expect(first.name).toBe('My workspace');
    expect(DEFAULT_WORKSPACE_BUDGET_USD).toBe(20);
    expect(await store.ensureDefaultWorkspace()).toEqual(first);
  });

  it('keeps the same default workspace across store instances, even after it is renamed', async () => {
    const dataDir = tempDir();
    const a = openStore({ dataDir });
    const b = openStore({ dataDir });
    const ws = await a.ensureDefaultWorkspace();
    await a.updateWorkspace(ws.id, { name: 'Studio' });
    expect(await b.ensureDefaultWorkspace()).toEqual({ ...ws, name: 'Studio' });
  });

  it('gets and updates a workspace', async () => {
    const store = openStore();
    const ws = await store.ensureDefaultWorkspace();
    expect(await store.getWorkspace(ws.id)).toEqual(ws);
    expect(await store.getWorkspace('missing')).toBeUndefined();
    const updated = await store.updateWorkspace(ws.id, { budgetUsd: 35.5 });
    expect(updated).toEqual({ ...ws, budgetUsd: 35.5 });
    expect(await store.updateWorkspace(ws.id, { name: '  Bakery  ' })).toEqual({ ...ws, budgetUsd: 35.5, name: 'Bakery' });
  });

  it('rejects an unknown workspace, a blank name and a negative or non-finite budget', async () => {
    const store = openStore();
    const ws = await store.ensureDefaultWorkspace();
    await expect(store.updateWorkspace('missing', { name: 'x' })).rejects.toThrow(/no workspace "missing"/);
    await expect(store.updateWorkspace(ws.id, { name: '   ' })).rejects.toThrow(StoreError);
    await expect(store.updateWorkspace(ws.id, { budgetUsd: -1 })).rejects.toThrow(/budget/);
    await expect(store.updateWorkspace(ws.id, { budgetUsd: Number.NaN })).rejects.toThrow(/budget/);
  });
});

describe('runs', () => {
  it('creates a run as queued with zero cost and ISO timestamps', async () => {
    const store = openStore({ now: () => new Date('2026-10-07T12:00:00.000Z') });
    const run = await seedRun(store);
    expect(run).toEqual({
      id: 'run-1',
      workspaceId: run.workspaceId,
      recipeId: 'c1',
      recipeHash: `sha256:${'a'.repeat(64)}`,
      profileId: 'demo',
      title: 'A landing page',
      problem: 'I need a landing page for a bakery',
      medium: 'web-page',
      status: 'queued',
      costUsd: 0,
      createdAt: '2026-10-07T12:00:00.000Z',
      updatedAt: '2026-10-07T12:00:00.000Z',
    });
    expect(await store.getRun('run-1')).toEqual(run);
    expect(await store.getRun('missing')).toBeUndefined();
  });

  it('honours an initial status', async () => {
    const store = openStore();
    expect((await seedRun(store, 'r', { status: 'running' })).status).toBe('running');
  });

  it('rejects a duplicate id, an unknown workspace, an unknown medium and an unknown status', async () => {
    const store = openStore();
    await seedRun(store, 'dup');
    await expect(seedRun(store, 'dup')).rejects.toThrow(/run "dup" already exists/);
    await expect(seedRun(store, 'r2', { workspaceId: 'nope' })).rejects.toThrow(/no workspace "nope"/);
    await expect(seedRun(store, 'r3', { medium: 'hologram' as never })).rejects.toThrow(/medium/);
    await expect(seedRun(store, 'r4', { status: 'paused' as never })).rejects.toThrow(/status/);
  });

  it('updates status, cost, title, error and output, and bumps updatedAt', async () => {
    const store = openStore({ now: steppingClock() });
    const run = await seedRun(store);
    const art = await store.artifacts.putText('<!doctype html><title>x</title>', 'text/html');
    const updated = await store.updateRun(run.id, { status: 'done', costUsd: 0.42, title: 'Bakery page', outputArtifactId: art.id });
    expect(updated).toEqual({ ...run, status: 'done', costUsd: 0.42, title: 'Bakery page', outputArtifactId: art.id, updatedAt: updated.updatedAt });
    expect(updated.updatedAt > run.updatedAt).toBe(true);
    const failed = await store.updateRun(run.id, { status: 'failed', error: 'budget-exceeded' });
    expect(failed.error).toBe('budget-exceeded');
    expect(await store.getRun(run.id)).toEqual(failed);
  });

  it('ignores undefined fields in a patch', async () => {
    const store = openStore();
    const run = await seedRun(store);
    const same = await store.updateRun(run.id, { title: undefined, status: 'running' });
    expect(same.title).toBe(run.title);
    expect(same.status).toBe('running');
  });

  it('rejects updates to an unknown run, an unknown output artifact, a bad status and a negative cost', async () => {
    const store = openStore();
    const run = await seedRun(store);
    await expect(store.updateRun('missing', { status: 'done' })).rejects.toThrow(/no run "missing"/);
    await expect(store.updateRun(run.id, { outputArtifactId: `sha256:${'0'.repeat(64)}` })).rejects.toThrow(/no artifact/);
    await expect(store.updateRun(run.id, { status: 'paused' as never })).rejects.toThrow(/status/);
    await expect(store.updateRun(run.id, { costUsd: -0.01 })).rejects.toThrow(/cost/);
  });

  it('lists runs of a workspace newest first, with an optional limit', async () => {
    const store = openStore({ now: steppingClock() });
    for (const id of ['r1', 'r2', 'r3']) await seedRun(store, id);
    const ws = await store.ensureDefaultWorkspace();
    expect((await store.listRuns(ws.id)).map((r) => r.id)).toEqual(['r3', 'r2', 'r1']);
    expect((await store.listRuns(ws.id, { limit: 2 })).map((r) => r.id)).toEqual(['r3', 'r2']);
    expect(await store.listRuns('other')).toEqual([]);
    await expect(store.listRuns(ws.id, { limit: 0 })).rejects.toThrow(/limit/);
  });

  it('orders runs created in the same millisecond by creation order', async () => {
    const store = openStore({ now: () => new Date('2026-10-07T12:00:00.000Z') });
    for (const id of ['a', 'b', 'c']) await seedRun(store, id);
    const ws = await store.ensureDefaultWorkspace();
    expect((await store.listRuns(ws.id)).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('close', () => {
  it('closes the database; later calls fail and closing twice is harmless', async () => {
    const store = createStore({ dataDir: tempDir() });
    store.close();
    store.close();
    await expect(store.ensureDefaultWorkspace()).rejects.toThrow(/closed/);
  });
});
