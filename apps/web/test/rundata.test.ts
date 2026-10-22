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
  budgetUsd: 2,
  createdAt: '2026-10-07T10:00:00.000Z',
  updatedAt: '2026-10-07T10:00:00.000Z',
});

const event = (seq: number, type: RunEvent['type'] = 'step-started'): RunEvent => ({ runId: 'r1', seq, at: `2026-10-07T10:00:0${seq}.000Z`, type, data: {} });

const data = (over: Partial<RunData> & { events?: RunEvent[]; status?: RunRecord['status'] }): RunData => ({
  view: { run: run(over.status ?? 'running'), events: over.events ?? [], checkpoints: [] },
  artifacts: over.artifacts ?? {},
});

describe('polling the Run screen', () => {
  it('appends only new events, in order, and takes the latest run record', () => {
    const prev = data({ events: [event(1), event(2)], artifacts: { a: { mediaType: 'text/markdown', excerpt: 'A', complete: true, bytes: 1 } } });
    const next = data({ events: [event(2), event(4), event(3)], status: 'paused', artifacts: { b: { mediaType: 'text/html' } } });
    const merged = mergeRunData(prev, next);
    expect(merged.view.events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(merged.view.run.status).toBe('paused');
    expect(Object.keys(merged.artifacts).sort()).toEqual(['a', 'b']);
  });

  // RS-5: an ended run's calls still under way, from the spend book. The latest poll says how many are left; an older
  // answer is not carried forward, so the screen stops polling once a poll says none, or cannot say.
  it("takes what the latest poll says of an ended run's calls under way, and nothing older", () => {
    const cancelled = data({ status: 'cancelled' });
    const under = mergeRunData(data({}), { ...cancelled, ended: { callsUnderWay: 2, settledUsd: 0.4 } });
    expect(under.ended).toEqual({ callsUnderWay: 2, settledUsd: 0.4 });
    expect(mergeRunData(under, { ...cancelled, ended: { callsUnderWay: 0, settledUsd: 0.8 } }).ended).toEqual({ callsUnderWay: 0, settledUsd: 0.8 });
    expect(mergeRunData(under, cancelled).ended).toBeUndefined();
  });

  it('asks for events after the highest sequence number seen', () => {
    expect(lastSeq(data({}))).toBe(0);
    expect(lastSeq(data({ events: [event(3), event(7), event(5)] }))).toBe(7);
  });
});
