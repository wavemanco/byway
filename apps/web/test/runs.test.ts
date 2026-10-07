import { describe, expect, it } from 'vitest';
import type { CheckpointRecord, RunRecord, RunStatus } from '@byway/contracts';
import { groupRuns, orderRuns } from '../src/view/runs.ts';
import { budgetMeter } from '../src/view/meter.ts';

const run = (id: string, status: RunStatus, updatedAt: string): RunRecord => ({
  id,
  workspaceId: 'w',
  recipeId: 'c4',
  recipeHash: 'sha256:x',
  profileId: 'balanced',
  title: id,
  problem: 'p',
  medium: 'prose',
  status,
  costUsd: 0,
  createdAt: '2026-10-07T09:00:00.000Z',
  updatedAt,
});

const open = (runId: string, openedAt: string): CheckpointRecord => ({
  id: `cp-${runId}`,
  runId,
  stepId: 's',
  kind: 'write',
  prompt: 'Write it',
  status: 'open',
  openedAt,
});

describe('ordering runs', () => {
  const runs = [
    run('done-new', 'done', '2026-10-07T12:00:00.000Z'),
    run('running', 'running', '2026-10-07T11:00:00.000Z'),
    run('wait-old', 'waiting', '2026-10-07T08:00:00.000Z'),
    run('failed', 'failed', '2026-10-07T13:00:00.000Z'),
    run('wait-new', 'waiting', '2026-10-07T10:00:00.000Z'),
  ];
  const checkpoints = [open('wait-old', '2026-10-07T08:00:00.000Z'), open('wait-new', '2026-10-07T10:00:00.000Z')];

  it('puts runs waiting for you first, then working runs, then the rest by recency', () => {
    expect(orderRuns(runs, checkpoints).map((r) => r.run.id)).toEqual(['wait-new', 'wait-old', 'running', 'failed', 'done-new']);
  });

  it('attaches the open checkpoint so the list can say what is waiting', () => {
    const [first] = orderRuns(runs, checkpoints);
    expect(first?.openCheckpoint?.id).toBe('cp-wait-new');
  });

  it('treats a run with an open checkpoint as yours even before its status catches up', () => {
    const late = [run('r', 'running', '2026-10-07T11:00:00.000Z'), run('x', 'running', '2026-10-07T12:00:00.000Z')];
    expect(orderRuns(late, [open('r', '2026-10-07T11:00:00.000Z')]).map((r) => r.run.id)).toEqual(['r', 'x']);
  });

  it('groups runs for the history screen', () => {
    const groups = groupRuns(runs, checkpoints);
    expect(groups.yourTurn.map((r) => r.run.id)).toEqual(['wait-new', 'wait-old']);
    expect(groups.working.map((r) => r.run.id)).toEqual(['running']);
    expect(groups.finished.map((r) => r.run.id)).toEqual(['failed', 'done-new']);
  });
});

describe('budget meter', () => {
  it('reports spend against the budget', () => {
    expect(budgetMeter(0.5, 2)).toEqual({ fraction: 0.25, tone: 'ok', spent: '$0.50', budget: '$2.00' });
  });
  it('warns near the budget and flags going over', () => {
    expect(budgetMeter(1.7, 2).tone).toBe('near');
    expect(budgetMeter(2.1, 2)).toMatchObject({ fraction: 1, tone: 'over' });
  });
  it('works without a known budget', () => {
    expect(budgetMeter(0.5, undefined)).toEqual({ fraction: null, tone: 'ok', spent: '$0.50', budget: null });
  });
});
