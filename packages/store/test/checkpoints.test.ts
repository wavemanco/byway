import { describe, expect, it } from 'vitest';
import type { CheckpointRecord } from '@byway/contracts';
import { CheckpointResolvedError, StoreError } from '../src/index.ts';
import { openStore, seedRun, steppingClock } from './helpers.ts';

type OpenInput = Omit<CheckpointRecord, 'status' | 'openedAt'>;

const pick = (id = 'cp-pick', runId = 'run-1'): OpenInput => ({
  id,
  runId,
  stepId: 'pick-1',
  kind: 'pick',
  prompt: 'Which drafts should we refine?',
  options: [
    { id: 'A', label: 'Draft A', artifactId: `sha256:${'1'.repeat(64)}` },
    { id: 'B', label: 'Draft B' },
    { id: 'C', label: 'Draft C' },
  ],
  k: 2,
  artifactIds: [`sha256:${'1'.repeat(64)}`],
});

describe('checkpoint lifecycle', () => {
  it('opens a checkpoint as open with openedAt, and reads it back', async () => {
    const store = openStore({ now: () => new Date('2026-10-07T12:00:00.000Z') });
    await seedRun(store);
    const cp = await store.openCheckpoint(pick());
    expect(cp).toEqual({ ...pick(), status: 'open', openedAt: '2026-10-07T12:00:00.000Z' });
    expect(await store.getCheckpoint('cp-pick')).toEqual(cp);
    expect(await store.getCheckpoint('missing')).toBeUndefined();
  });

  it('keeps optional fields (candidate, initialText) and omits absent ones', async () => {
    const store = openStore();
    await seedRun(store);
    const cp = await store.openCheckpoint({ id: 'w', runId: 'run-1', stepId: 'voice', candidate: 0, kind: 'write', prompt: 'Your words', initialText: 'Fresh bread daily' });
    expect(cp.candidate).toBe(0);
    expect(cp.initialText).toBe('Fresh bread daily');
    expect('options' in cp).toBe(false);
    expect('resolution' in cp).toBe(false);
  });

  it('resolves once, recording the resolution and resolvedAt', async () => {
    const store = openStore({ now: steppingClock() });
    await seedRun(store);
    const opened = await store.openCheckpoint(pick());
    const resolved = await store.resolveCheckpoint({ checkpointId: 'cp-pick', choice: ['A', 'C'] });
    expect(resolved).toEqual({ ...opened, status: 'resolved', resolvedAt: resolved.resolvedAt, resolution: { checkpointId: 'cp-pick', choice: ['A', 'C'] } });
    expect(resolved.resolvedAt! > opened.openedAt).toBe(true);
    expect(await store.getCheckpoint('cp-pick')).toEqual(resolved);
  });

  it('throws when resolving twice, carrying the stored record', async () => {
    const store = openStore();
    await seedRun(store);
    await store.openCheckpoint(pick());
    const resolved = await store.resolveCheckpoint({ checkpointId: 'cp-pick', choice: ['B'] });
    const again = store.resolveCheckpoint({ checkpointId: 'cp-pick', choice: ['A'] });
    await expect(again).rejects.toThrow(CheckpointResolvedError);
    await expect(store.resolveCheckpoint({ checkpointId: 'cp-pick', choice: ['B'] })).rejects.toMatchObject({ code: 'already-resolved', checkpoint: resolved });
    expect(await store.getCheckpoint('cp-pick')).toEqual(resolved);
  });

  it('throws when resolving an unknown checkpoint', async () => {
    const store = openStore();
    await expect(store.resolveCheckpoint({ checkpointId: 'nope', approved: true })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('opening the same checkpoint again is idempotent (activity retries); a different one with the same id throws', async () => {
    const store = openStore({ now: steppingClock() });
    await seedRun(store);
    const first = await store.openCheckpoint(pick());
    expect(await store.openCheckpoint(pick())).toEqual(first);
    await expect(store.openCheckpoint({ ...pick(), prompt: 'Something else' })).rejects.toThrow(/already exists/);
  });

  it('refuses a checkpoint for an unknown run, or one that arrives already resolved', async () => {
    const store = openStore();
    await expect(store.openCheckpoint(pick('x', 'no-run'))).rejects.toThrow(/no run "no-run"/);
    await seedRun(store);
    await expect(store.openCheckpoint({ ...pick(), resolution: { checkpointId: 'cp-pick', choice: ['A'] } })).rejects.toThrow(StoreError);
    await expect(store.openCheckpoint({ ...pick(), kind: 'vote' as never })).rejects.toThrow(/kind/);
  });

  it('lists open checkpoints per workspace (oldest first) and all checkpoints per run', async () => {
    const store = openStore({ now: steppingClock() });
    await seedRun(store, 'run-1');
    await seedRun(store, 'run-2');
    await store.openCheckpoint(pick('p1', 'run-1'));
    await store.openCheckpoint({ id: 'c2', runId: 'run-2', stepId: 'gate', kind: 'confirm', prompt: 'Use the best version so far?' });
    await store.openCheckpoint({ id: 'r1', runId: 'run-1', stepId: 'vision', kind: 'react', prompt: 'What do you see?' });
    await store.resolveCheckpoint({ checkpointId: 'p1', choice: ['A'] });
    const ws = await store.ensureDefaultWorkspace();
    expect((await store.openCheckpoints(ws.id)).map((c) => c.id)).toEqual(['c2', 'r1']);
    expect(await store.openCheckpoints('other-workspace')).toEqual([]);
    expect((await store.checkpointsForRun('run-1')).map((c) => [c.id, c.status])).toEqual([['p1', 'resolved'], ['r1', 'open']]);
    expect(await store.checkpointsForRun('nope')).toEqual([]);
  });
});

describe('resolution validation', () => {
  async function opened(cp: OpenInput) {
    const store = openStore();
    await seedRun(store);
    await store.openCheckpoint(cp);
    return store;
  }

  it('pick: 1..k known, distinct option ids', async () => {
    const store = await opened(pick());
    for (const choice of [[], ['A', 'B', 'C'], ['A', 'A'], ['Z']]) {
      await expect(store.resolveCheckpoint({ checkpointId: 'cp-pick', choice })).rejects.toMatchObject({ code: 'invalid' });
    }
    await expect(store.resolveCheckpoint({ checkpointId: 'cp-pick', text: 'A' })).rejects.toThrow(/choice/);
    expect((await store.resolveCheckpoint({ checkpointId: 'cp-pick', choice: ['C'] })).status).toBe('resolved');
  });

  it('choose and compare: exactly one known option', async () => {
    const compare: OpenInput = { id: 'cmp', runId: 'run-1', stepId: 'tells', kind: 'compare', prompt: 'Keep which?', options: [{ id: 'A', label: 'Before' }, { id: 'B', label: 'After' }] };
    const store = await opened(compare);
    await expect(store.resolveCheckpoint({ checkpointId: 'cmp', choice: ['A', 'B'] })).rejects.toThrow(/exactly one/);
    expect((await store.resolveCheckpoint({ checkpointId: 'cmp', choice: ['B'] })).resolution).toEqual({ checkpointId: 'cmp', choice: ['B'] });
  });

  it('confirm needs approved; text kinds need text; only the field for the kind is stored', async () => {
    const store = openStore();
    await seedRun(store);
    await store.openCheckpoint({ id: 'ok', runId: 'run-1', stepId: 'gate', kind: 'confirm', prompt: 'Raise the budget by $5?' });
    await store.openCheckpoint({ id: 'dir', runId: 'run-1', stepId: 'cut', kind: 'directive', prompt: 'What should go?' });
    await expect(store.resolveCheckpoint({ checkpointId: 'ok', text: 'yes' })).rejects.toThrow(/approved/);
    await expect(store.resolveCheckpoint({ checkpointId: 'dir', approved: true })).rejects.toThrow(/text/);
    expect((await store.resolveCheckpoint({ checkpointId: 'ok', approved: false, text: 'ignored' })).resolution).toEqual({ checkpointId: 'ok', approved: false });
    expect((await store.resolveCheckpoint({ checkpointId: 'dir', text: '- Remove the testimonials' })).resolution).toEqual({ checkpointId: 'dir', text: '- Remove the testimonials' });
  });
});
