import { describe, expect, it } from 'vitest';
import type { CheckpointRecord, RunEvent, RunRecord, RunStatus } from '@byway/contracts';
import { groupRuns, orderRuns } from '../src/view/runs.ts';
import { budgetMeter, runMeter, runSpend } from '../src/view/meter.ts';

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
  budgetUsd: 2,
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

  it('keeps a paused run with the working ones, and never offers a cancelled run’s leftover question', () => {
    const list = [run('paused', 'paused', '2026-10-07T11:00:00.000Z'), run('gone', 'cancelled', '2026-10-07T12:00:00.000Z')];
    const groups = groupRuns(list, [open('gone', '2026-10-07T11:30:00.000Z')]);
    expect(groups.yourTurn).toEqual([]);
    expect(groups.working.map((r) => r.run.id)).toEqual(['paused']);
    expect(groups.finished.map((r) => r.run.id)).toEqual(['gone']);
    expect(groups.finished[0]?.openCheckpoint).toBeUndefined();
  });
});

describe('cost meter from cost events', () => {
  const cost = (seq: number, totalUsd: number, budgetUsd: number): RunEvent => ({ runId: 'r', seq, at: '2026-10-07T10:00:00.000Z', type: 'cost', data: { totalUsd, budgetUsd } });
  const record = { costUsd: 0.2, budgetUsd: 2 };

  it('reads spend and budget from the latest cost event, including a raised budget', () => {
    expect(runSpend(record, [cost(3, 0.4, 2), cost(9, 1.1, 3), cost(5, 0.7, 2)])).toEqual({ costUsd: 1.1, budgetUsd: 3 });
    expect(runMeter(record, [cost(9, 1.5, 3)])).toEqual({ fraction: 0.5, tone: 'ok', spent: '$1.50', budget: '$3.00' });
  });

  it('falls back to the run record, and never steps backwards when the record is ahead', () => {
    expect(runSpend(record, [])).toEqual({ costUsd: 0.2, budgetUsd: 2 });
    expect(runSpend({ costUsd: 0.6, budgetUsd: 4 }, [cost(2, 0.4, 2)])).toEqual({ costUsd: 0.6, budgetUsd: 4 });
  });

  // RS-5: a call that settles after its run stopped is in the spend book's settled cost for the run before the run
  // record catches up; the meter of an ended run shows it.
  it("takes in an ended run's settled cost from the spend book, and never steps backwards from it", () => {
    expect(runSpend(record, [cost(9, 1.1, 3)], 1.5)).toEqual({ costUsd: 1.5, budgetUsd: 3 });
    expect(runMeter(record, [cost(9, 1.1, 3)], 1.5)).toEqual({ fraction: 0.5, tone: 'ok', spent: '$1.50', budget: '$3.00' });
    expect(runSpend(record, [cost(9, 1.1, 3)], 0.4)).toEqual({ costUsd: 1.1, budgetUsd: 3 });
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
