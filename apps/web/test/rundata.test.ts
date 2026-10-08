import { describe, expect, it } from 'vitest';
import type { RunEvent, RunRecord } from '@byway/contracts';
import { lastSeq, mergeRunData, type RunData } from '../src/view/rundata.ts';

const run = (status: RunRecord['status'], costUsd = 0): RunRecord => ({
  id: 'r1',
  workspaceId: 'w',
  recipeId: 'c4',
  recipeHash: 'h',
  profileId: 'balanced',
  title: 'Memo',
  problem: 'A memo',
  medium: 'prose',
  status,
  costUsd,
  createdAt: '2026-10-07T10:00:00.000Z',
  updatedAt: '2026-10-07T10:00:00.000Z',
});

const event = (seq: number, type: RunEvent['type'] = 'step-started'): RunEvent => ({ runId: 'r1', seq, at: `2026-10-07T10:00:0${seq}.000Z`, type, data: {} });

const data = (over: Partial<RunData> & { events?: RunEvent[]; status?: RunRecord['status'] }): RunData => ({
  view: { run: run(over.status ?? 'running'), events: over.events ?? [], checkpoints: [] },
  paused: over.paused ?? false,
  canPause: true,
  artifacts: over.artifacts ?? {},
  ...(over.budgetUsd !== undefined ? { budgetUsd: over.budgetUsd } : {}),
});

describe('polling the Run screen', () => {
  it('appends only new events, in order, and takes the latest run record', () => {
    const prev = data({ events: [event(1), event(2)], budgetUsd: 2, artifacts: { a: { mediaType: 'text/markdown', text: 'A' } } });
    const next = data({ events: [event(2), event(4), event(3)], status: 'waiting', artifacts: { b: { mediaType: 'text/html' } } });
    const merged = mergeRunData(prev, next);
    expect(merged.view.events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(merged.view.run.status).toBe('waiting');
    // A poll that does not repeat the budget keeps the one already known.
    expect(merged.budgetUsd).toBe(2);
    expect(Object.keys(merged.artifacts).sort()).toEqual(['a', 'b']);
  });

  it('asks for events after the highest sequence number seen', () => {
    expect(lastSeq(data({}))).toBe(0);
    expect(lastSeq(data({ events: [event(3), event(7), event(5)] }))).toBe(7);
  });
});
