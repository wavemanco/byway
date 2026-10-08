import { describe, expect, it } from 'vitest';
import type { CheckpointRecord } from '@byway/contracts';
import { activeCheckpoint, howItWasMade, isEnded, outputKind, pollDelay, waitingRunCount } from '../src/view/run.ts';
import type { TimelineStage, TimelineStep } from '../src/view/timeline.ts';

const cp = (id: string, runId: string, openedAt: string, status: CheckpointRecord['status'] = 'open'): CheckpointRecord => ({
  id,
  runId,
  stepId: 's',
  kind: 'confirm',
  prompt: 'Yes?',
  status,
  openedAt,
});

const step = (over: Partial<TimelineStep> & Pick<TimelineStep, 'label' | 'who'>): TimelineStep => ({
  key: `${over.label}#1`,
  stepId: over.label,
  round: 1,
  stage: 'Explore',
  status: 'done',
  costUsd: 0,
  artifacts: [],
  iterations: 0,
  candidates: 0,
  checkpointIds: [],
  startedAt: '2026-10-07T10:00:00.000Z',
  ...over,
});

describe('the Run screen', () => {
  it('shows the oldest open question as "Your turn"', () => {
    const list = [cp('b', 'r', '2026-10-07T10:00:02Z'), cp('a', 'r', '2026-10-07T10:00:01Z'), cp('z', 'r', '2026-10-07T10:00:00Z', 'resolved')];
    expect(activeCheckpoint(list)?.id).toBe('a');
    expect(activeCheckpoint([cp('z', 'r', '2026-10-07T10:00:00Z', 'resolved')])).toBeUndefined();
  });

  it('polls quickly while the AI works, slowly while it waits for you, and not at all once the run ended', () => {
    expect(pollDelay('running', false)).toBe(1000);
    expect(pollDelay('queued', false)).toBe(1000);
    expect(pollDelay('waiting', false)).toBeGreaterThan(1000);
    expect(pollDelay('running', true)).toBeGreaterThan(1000);
    for (const status of ['done', 'failed', 'cancelled'] as const) {
      expect(isEnded(status)).toBe(true);
      expect(pollDelay(status, false)).toBeNull();
    }
    expect(isEnded('waiting')).toBe(false);
  });

  it('shows pages as thumbnails, text as excerpts, and diffs and images as themselves', () => {
    expect(outputKind('text/html')).toBe('page');
    expect(outputKind('text/html; charset=utf-8')).toBe('page');
    expect(outputKind('image/svg+xml')).toBe('image');
    expect(outputKind('image/png')).toBe('image');
    expect(outputKind('text/x-diff')).toBe('diff');
    expect(outputKind('application/json')).toBe('data');
    expect(outputKind('text/markdown')).toBe('text');
    expect(outputKind('text/plain')).toBe('text');
    expect(outputKind(undefined)).toBe('other');
  });

  it('counts runs, not questions, in the "waiting for you" badge', () => {
    expect(waitingRunCount([cp('a', 'r1', 'x'), cp('b', 'r1', 'y'), cp('c', 'r2', 'z'), cp('d', 'r3', 'w', 'resolved')])).toBe(2);
    expect(waitingRunCount([])).toBe(0);
  });
});

describe('"How this was made"', () => {
  it('lists who did each step and what it cost, and totals the AI spend and your turns', () => {
    const stages: TimelineStage[] = [
      { stage: 'Explore', steps: [step({ label: 'Random spark', who: 'ai', costUsd: 0.24 }), step({ label: 'Your pick', who: 'you' })] },
      {
        stage: 'Finish',
        steps: [
          step({ label: 'Remove near-duplicates', who: 'tool', stage: 'Finish' }),
          step({ label: 'Motion', who: 'ai', stage: 'Finish', status: 'skipped', note: 'No video key.' }),
          step({ label: 'Your words', who: 'you', stage: 'Finish', round: 2, key: 'Your words#2' }),
          step({ label: 'Final check', who: 'ai', stage: 'Finish', costUsd: 0.02 }),
        ],
      },
    ];
    const made = howItWasMade(stages);
    expect(made.totalUsd).toBeCloseTo(0.26);
    expect(made.byWho).toEqual({ you: 2, ai: 2, tool: 1 });
    expect(made.skipped).toEqual([{ label: 'Motion', note: 'No video key.' }]);
    expect(made.rows.map((r) => r.label)).toEqual(['Random spark', 'Your pick', 'Remove near-duplicates', 'Your words', 'Final check']);
    expect(made.rows[3]?.round).toBe(2);
  });
});
