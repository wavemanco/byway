import { describe, expect, it } from 'vitest';
import type { Store } from '@byway/contracts';
import { CheckpointResolvedError, CheckpointWithdrawnError, StoreError } from '../src/index.ts';
import { openStore, seedRun, steppingClock } from './helpers.ts';

type OpenInput = Parameters<Store['openCheckpoint']>[0];

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
    const resolved = await store.resolveCheckpoint({ checkpointId: 'cp-pick', choice: ['B', 'C'] });
    const again = store.resolveCheckpoint({ checkpointId: 'cp-pick', choice: ['A', 'B'] });
    await expect(again).rejects.toThrow(CheckpointResolvedError);
    await expect(store.resolveCheckpoint({ checkpointId: 'cp-pick', choice: ['B', 'C'] })).rejects.toMatchObject({ code: 'already-resolved', checkpoint: resolved });
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

  it('refuses a checkpoint for an unknown run, or one that arrives already resolved or withdrawn', async () => {
    const store = openStore();
    await expect(store.openCheckpoint(pick('x', 'no-run'))).rejects.toThrow(/no run "no-run"/);
    await seedRun(store);
    // The contract's input type has no resolution or resolvedAt; data that crossed JSON may still carry them.
    const resolution = { checkpointId: 'cp-pick', choice: ['A', 'B'] };
    await expect(store.openCheckpoint({ ...pick(), resolution } as unknown as OpenInput)).rejects.toThrow(StoreError);
    await expect(store.openCheckpoint({ ...pick(), resolvedAt: '2026-10-07T12:00:00.000Z' } as unknown as OpenInput)).rejects.toThrow(/resolveCheckpoint/);
    // Nor a withdrawal time: a question is withdrawn with withdrawCheckpoints.
    await expect(store.openCheckpoint({ ...pick(), withdrawnAt: '2026-10-07T12:00:00.000Z' } as unknown as OpenInput)).rejects.toThrow(/withdrawCheckpoints/);
    await expect(store.openCheckpoint({ ...pick(), kind: 'vote' as never })).rejects.toThrow(/kind/);
    expect(await store.getCheckpoint('cp-pick')).toBeUndefined();
  });

  it('refuses a pick that could never be answered: k larger than its option list', async () => {
    const store = openStore();
    await seedRun(store);
    await expect(store.openCheckpoint({ ...pick(), k: 4 })).rejects.toThrow(/k is 4 but only 3 options/);
    // Exactly as many as listed is fine, and so is a pick whose options come later (none listed).
    await expect(store.openCheckpoint({ ...pick('all'), k: 3 })).resolves.toMatchObject({ k: 3 });
    const { options: _none, ...unlisted } = pick('unlisted');
    await expect(store.openCheckpoint({ ...unlisted, k: 5 })).resolves.toMatchObject({ k: 5 });
  });

  it('lists open checkpoints per workspace (oldest first) and all checkpoints per run', async () => {
    const store = openStore({ now: steppingClock() });
    await seedRun(store, 'run-1');
    await seedRun(store, 'run-2');
    await store.openCheckpoint(pick('p1', 'run-1'));
    await store.openCheckpoint({ id: 'c2', runId: 'run-2', stepId: 'gate', kind: 'confirm', prompt: 'Use the best version so far?' });
    await store.openCheckpoint({ id: 'r1', runId: 'run-1', stepId: 'vision', kind: 'react', prompt: 'What do you see?' });
    await store.resolveCheckpoint({ checkpointId: 'p1', choice: ['A', 'B'] });
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

  it('pick: exactly k known, distinct option ids', async () => {
    const store = await opened(pick());
    // k is 2: too few, too many, a repeat that only looks like two, and an unknown id are all refused.
    for (const choice of [[], ['C'], ['A', 'B', 'C'], ['A', 'A'], ['A', 'Z'], ['Z']]) {
      await expect(store.resolveCheckpoint({ checkpointId: 'cp-pick', choice })).rejects.toMatchObject({ code: 'invalid' });
    }
    await expect(store.resolveCheckpoint({ checkpointId: 'cp-pick', choice: ['C'] })).rejects.toThrow(/exactly 2/);
    await expect(store.resolveCheckpoint({ checkpointId: 'cp-pick', text: 'A' })).rejects.toThrow(/choice/);
    expect((await store.getCheckpoint('cp-pick'))?.status).toBe('open');
    expect((await store.resolveCheckpoint({ checkpointId: 'cp-pick', choice: ['C', 'A'] })).resolution).toEqual({ checkpointId: 'cp-pick', choice: ['C', 'A'] });
  });

  it('choose and compare: exactly one known option', async () => {
    const compare: OpenInput = { id: 'cmp', runId: 'run-1', stepId: 'tells', kind: 'compare', prompt: 'Keep which?', options: [{ id: 'A', label: 'Before' }, { id: 'B', label: 'After' }] };
    const store = await opened(compare);
    await expect(store.resolveCheckpoint({ checkpointId: 'cmp', choice: ['A', 'B'] })).rejects.toThrow(/exactly one/);
    expect((await store.resolveCheckpoint({ checkpointId: 'cmp', choice: ['B'] })).resolution).toEqual({ checkpointId: 'cmp', choice: ['B'] });
  });

  it('select: any distinct subset of the listed options, possibly empty, stored as given', async () => {
    const hits: OpenInput = {
      id: 'sel',
      runId: 'run-1',
      stepId: 'apply-swaps',
      kind: 'select',
      prompt: 'Which of these should be swapped? Choose any, or none.',
      options: [
        { id: 'hit-1', label: 'Gradient hero — header → a flat brand colour' },
        { id: 'hit-2', label: 'Three feature cards — middle section → one short list' },
      ],
    };
    const store = await opened(hits);
    for (const choice of [['hit-1', 'hit-1'], ['hit-3'], ['hit-1', 'nope']]) {
      await expect(store.resolveCheckpoint({ checkpointId: 'sel', choice })).rejects.toMatchObject({ code: 'invalid' });
    }
    await expect(store.resolveCheckpoint({ checkpointId: 'sel', approved: false })).rejects.toThrow(/choice/);
    expect((await store.getCheckpoint('sel'))?.status).toBe('open');
    expect((await store.resolveCheckpoint({ checkpointId: 'sel', choice: [] })).resolution).toEqual({ checkpointId: 'sel', choice: [] });
    // Another select can choose several.
    await store.openCheckpoint({ ...hits, id: 'sel-2' });
    expect((await store.resolveCheckpoint({ checkpointId: 'sel-2', choice: ['hit-2', 'hit-1'] })).resolution).toEqual({ checkpointId: 'sel-2', choice: ['hit-2', 'hit-1'] });
  });

  it('select ignores k (it is a pick field): the record keeps no k', async () => {
    const store = openStore();
    await seedRun(store);
    const cp = await store.openCheckpoint({ id: 'sel', runId: 'run-1', stepId: 's', kind: 'select', prompt: 'Which?', options: [{ id: 'hit-1', label: 'x' }], k: 1 });
    expect(cp).not.toHaveProperty('k');
    expect((await store.resolveCheckpoint({ checkpointId: 'sel', choice: [] })).status).toBe('resolved');
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

describe('withdrawn checkpoints (a cancelled or failed run)', () => {
  async function twoRuns() {
    const store = openStore({ now: steppingClock() });
    await seedRun(store, 'run-1');
    await seedRun(store, 'run-2');
    await store.openCheckpoint(pick('p1', 'run-1'));
    await store.openCheckpoint({ id: 'r1', runId: 'run-1', stepId: 'vision', kind: 'react', prompt: 'What do you see?' });
    await store.openCheckpoint({ id: 'done', runId: 'run-1', stepId: 'gate', kind: 'confirm', prompt: 'Ship it?' });
    await store.resolveCheckpoint({ checkpointId: 'done', approved: true });
    await store.openCheckpoint({ id: 'c2', runId: 'run-2', stepId: 'gate', kind: 'confirm', prompt: 'Use the best version so far?' });
    return store;
  }

  it("withdraws only the run's open checkpoints and returns how many", async () => {
    const store = await twoRuns();
    const resolved = await store.getCheckpoint('done');
    expect(await store.withdrawCheckpoints('run-1')).toBe(2);
    expect((await store.checkpointsForRun('run-1')).map((c) => [c.id, c.status])).toEqual([
      ['p1', 'withdrawn'],
      ['r1', 'withdrawn'],
      ['done', 'resolved'],
    ]);
    // A withdrawn question was never answered: it has no resolution or resolvedAt, and says when it was withdrawn. The
    // resolved one is untouched, and an open one has no withdrawal time.
    const withdrawn = await store.getCheckpoint('p1');
    expect(withdrawn).not.toHaveProperty('resolution');
    expect(withdrawn).not.toHaveProperty('resolvedAt');
    expect(withdrawn!.withdrawnAt! > withdrawn!.openedAt).toBe(true);
    expect((await store.getCheckpoint('r1'))!.withdrawnAt).toBe(withdrawn!.withdrawnAt);
    expect(await store.getCheckpoint('done')).toEqual(resolved);
    expect(resolved).not.toHaveProperty('withdrawnAt');
    expect(await store.getCheckpoint('c2')).not.toHaveProperty('withdrawnAt');
    // Another run's checkpoint stays open.
    expect((await store.getCheckpoint('c2'))?.status).toBe('open');
  });

  it('is idempotent: a second withdrawal finds nothing open', async () => {
    const store = await twoRuns();
    expect(await store.withdrawCheckpoints('run-1')).toBe(2);
    expect(await store.withdrawCheckpoints('run-1')).toBe(0);
    expect((await store.checkpointsForRun('run-1')).map((c) => c.status)).toEqual(['withdrawn', 'withdrawn', 'resolved']);
  });

  it('returns 0 for a run with no checkpoints and fails with not-found for an unknown run', async () => {
    const store = openStore();
    await seedRun(store);
    expect(await store.withdrawCheckpoints('run-1')).toBe(0);
    await expect(store.withdrawCheckpoints('no-such-run')).rejects.toMatchObject({ code: 'not-found' });
  });

  it('openCheckpoints lists only open ones', async () => {
    const store = await twoRuns();
    const ws = await store.ensureDefaultWorkspace();
    expect((await store.openCheckpoints(ws.id)).map((c) => c.id)).toEqual(['p1', 'r1', 'c2']);
    await store.withdrawCheckpoints('run-1');
    expect((await store.openCheckpoints(ws.id)).map((c) => c.id)).toEqual(['c2']);
  });

  it('resolveCheckpoint refuses a withdrawn checkpoint with its own error, distinct from already-resolved', async () => {
    const store = await twoRuns();
    await store.withdrawCheckpoints('run-1');
    const withdrawn = await store.getCheckpoint('r1');
    const attempt = store.resolveCheckpoint({ checkpointId: 'r1', text: 'Warmer' });
    await expect(attempt).rejects.toThrow(CheckpointWithdrawnError);
    await expect(store.resolveCheckpoint({ checkpointId: 'r1', text: 'Warmer' })).rejects.toMatchObject({ code: 'withdrawn', checkpoint: withdrawn });
    await expect(store.resolveCheckpoint({ checkpointId: 'r1', text: 'Warmer' })).rejects.toThrow(/withdrawn/);
    // A retried runner activity treats CheckpointResolvedError as its own earlier success: a withdrawn one must not look like that.
    await expect(store.resolveCheckpoint({ checkpointId: 'r1', text: 'Warmer' })).rejects.not.toBeInstanceOf(CheckpointResolvedError);
    expect(await store.getCheckpoint('r1')).toEqual(withdrawn);
    // A resolved one still answers with already-resolved.
    await expect(store.resolveCheckpoint({ checkpointId: 'done', approved: false })).rejects.toMatchObject({ code: 'already-resolved' });
  });

  it('re-opening a withdrawn checkpoint with the same content (an activity retry) hands back the stored record', async () => {
    const store = await twoRuns();
    await store.withdrawCheckpoints('run-1');
    expect(await store.openCheckpoint(pick('p1', 'run-1'))).toEqual(await store.getCheckpoint('p1'));
    expect(await store.openCheckpoint(pick('p1', 'run-1'))).toMatchObject({ id: 'p1', status: 'withdrawn', withdrawnAt: expect.any(String) });
  });

  it('a withdrawal is not stamped twice: a second withdrawal leaves the first time', async () => {
    const store = await twoRuns();
    await store.withdrawCheckpoints('run-1');
    const first = await store.checkpointsForRun('run-1');
    await store.withdrawCheckpoints('run-1');
    expect(await store.checkpointsForRun('run-1')).toEqual(first);
  });

  it('refuses withdrawal input that is not a run id', async () => {
    const store = openStore();
    await expect(store.withdrawCheckpoints('' as string)).rejects.toMatchObject({ code: 'invalid' });
    await expect(store.withdrawCheckpoints(42 as unknown as string)).rejects.toMatchObject({ code: 'invalid' });
  });
});
