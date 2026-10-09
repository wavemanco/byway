import { describe, expect, it } from 'vitest';
import { assumedPricingNote, budgetProblem, exportLabel, formatWhen, workspaceSpend } from '../src/view/history.ts';

const NOW = new Date('2026-10-07T15:00:00.000Z');

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
  it('takes what the ledger says was spent and what is left of the workspace budget', () => {
    expect(workspaceSpend(20, 1.75)).toEqual({ spentUsd: 1.75, remainingUsd: 18.25, capUsd: 20 });
    expect(workspaceSpend(1, 3).remainingUsd).toBe(0);
    expect(workspaceSpend(5, 0.123456).spentUsd).toBe(0.12);
  });

  it('refuses a run budget larger than what is left, with a way out', () => {
    expect(budgetProblem(2, { spentUsd: 0, remainingUsd: 20, capUsd: 20 })).toBeNull();
    expect(budgetProblem(5, { spentUsd: 17, remainingUsd: 3, capUsd: 20 })).toBe(
      'This budget ($5.00) is more than what is left of your workspace budget ($3.00). Lower it, or raise the workspace budget in Settings.',
    );
  });
});

describe('Settings: calls settled at an assumed price (F04, ADR-0091)', () => {
  it('says plainly how many calls were counted at the requested model’s price, and nothing when there are none', () => {
    expect(assumedPricingNote(undefined)).toBeNull();
    expect(assumedPricingNote({ calls: 0, usd: 0 })).toBeNull();
    expect(assumedPricingNote({ calls: 1, usd: 0.028 })).toBe(
      '1 call was answered by a model byway has no price for, so it was counted at the price of the model byway asked for ($0.03). Your provider’s bill may differ.',
    );
    expect(assumedPricingNote({ calls: 3, usd: 1.2 })).toMatch(/^3 calls were answered .* so they were counted .* \(\$1\.20 in all\)\./);
  });
});
