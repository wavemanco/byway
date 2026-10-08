import { describe, expect, it } from 'vitest';
import type { RunRecord } from '@byway/contracts';
import { budgetProblem, exportLabel, formatWhen, workspaceSpend } from '../src/view/history.ts';

const NOW = new Date('2026-10-07T15:00:00.000Z');

const run = (costUsd: number): RunRecord => ({
  id: `r${costUsd}`,
  workspaceId: 'w',
  recipeId: 'c4',
  recipeHash: 'h',
  profileId: 'balanced',
  title: 'Memo',
  problem: 'A memo',
  medium: 'prose',
  status: 'done',
  costUsd,
  budgetUsd: 5,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
});

describe('History', () => {
  it('says when a run last changed, in words for recent times and as a date after that', () => {
    expect(formatWhen('2026-10-07T14:59:40.000Z', NOW)).toBe('Just now');
    expect(formatWhen('2026-10-07T14:55:00.000Z', NOW)).toBe('5 min ago');
    expect(formatWhen('2026-10-07T12:00:00.000Z', NOW)).toBe('3 h ago');
    expect(formatWhen('2026-10-06T12:00:00.000Z', NOW)).toBe('Yesterday');
    expect(formatWhen('2026-10-01T12:00:00.000Z', NOW)).toBe('Oct 1');
    expect(formatWhen('2025-12-24T12:00:00.000Z', NOW)).toBe('Dec 24, 2025');
    // A clock skewed into the future still reads sensibly.
    expect(formatWhen('2026-10-07T15:00:30.000Z', NOW)).toBe('Just now');
  });

  it('names the export by its format', () => {
    expect(exportLabel('text/html')).toBe('Download HTML');
    expect(exportLabel('text/markdown')).toBe('Download Markdown');
    expect(exportLabel('application/json')).toBe('Download JSON');
    expect(exportLabel('text/x-diff')).toBe('Download patch');
    expect(exportLabel('image/png')).toBe('Download file');
  });
});

describe('workspace spend', () => {
  it('adds up what runs have spent and what is left of the workspace budget', () => {
    expect(workspaceSpend(20, [run(1.25), run(0.5)])).toEqual({ spentUsd: 1.75, remainingUsd: 18.25, capUsd: 20 });
    expect(workspaceSpend(1, [run(3)]).remainingUsd).toBe(0);
  });

  it('refuses a run budget larger than what is left, with a way out', () => {
    expect(budgetProblem(2, { spentUsd: 0, remainingUsd: 20, capUsd: 20 })).toBeNull();
    expect(budgetProblem(5, { spentUsd: 17, remainingUsd: 3, capUsd: 20 })).toBe(
      'This budget ($5.00) is more than what is left of your workspace budget ($3.00). Lower it, or raise the workspace budget in Settings.',
    );
  });
});
