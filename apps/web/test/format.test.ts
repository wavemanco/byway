import { describe, expect, it } from 'vitest';
import {
  formatCallRange,
  formatCostRange,
  formatMinutes,
  formatUsd,
  parseBudgetInput,
  partShown,
  suggestBudget,
} from '../src/view/format.ts';

describe('formatUsd', () => {
  it('shows cents, and never rounds a real cost down to zero', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(0.004)).toBe('<$0.01');
    expect(formatUsd(0.426)).toBe('$0.43');
    expect(formatUsd(12)).toBe('$12.00');
    expect(formatUsd(1234.5)).toBe('$1,234.50');
  });
});

describe('formatCostRange', () => {
  it('joins low and high with an en dash', () => {
    expect(formatCostRange(0.4, 1.2)).toBe('$0.40–$1.20');
  });
  it('collapses a range that rounds to one value', () => {
    expect(formatCostRange(0.401, 0.404)).toBe('$0.40');
  });
  it('says "up to" when the low end is below a cent', () => {
    expect(formatCostRange(0, 0.3)).toBe('up to $0.30');
  });
  it('shows zero when nothing will be spent', () => {
    expect(formatCostRange(0, 0)).toBe('$0.00');
  });
});

describe('formatMinutes', () => {
  it('formats human time as a range', () => {
    expect(formatMinutes({ low: 10, high: 20 })).toBe('10–20 min');
    expect(formatMinutes({ low: 5, high: 5 })).toBe('5 min');
  });
  it('switches to hours for long sessions', () => {
    expect(formatMinutes({ low: 120, high: 180 })).toBe('2–3 h');
    expect(formatMinutes({ low: 45, high: 150 })).toBe('45 min–2.5 h');
  });
  it('says when no time is needed', () => {
    expect(formatMinutes({ low: 0, high: 0 })).toBe('none');
  });
});

describe('formatCallRange', () => {
  it('pluralises', () => {
    expect(formatCallRange({ low: 1, high: 1 })).toBe('1 AI call');
    expect(formatCallRange({ low: 30, high: 60 })).toBe('30–60 AI calls');
  });
});

describe('budgets', () => {
  it('suggests a budget above the high estimate, rounded up to 50 cents', () => {
    expect(suggestBudget({ lowUsd: 0.6, highUsd: 2.4 })).toBe(3);
    expect(suggestBudget({ lowUsd: 0.03, highUsd: 0.15 })).toBe(0.5);
    expect(suggestBudget({ lowUsd: 0, highUsd: 0 })).toBe(1);
  });
  it('parses what people type into the budget field', () => {
    expect(parseBudgetInput('2.50')).toBe(2.5);
    expect(parseBudgetInput(' $3 ')).toBe(3);
    expect(parseBudgetInput('0')).toBeNull();
    expect(parseBudgetInput('-1')).toBeNull();
    expect(parseBudgetInput('abc')).toBeNull();
    expect(parseBudgetInput('5000')).toBeNull();
  });
});

describe('partShown', () => {
  it('names how much of a text is shown, and of how much, in KB', () => {
    expect(partShown(16_000, 23_000)).toBe('the first 16 KB of 23 KB');
    expect(partShown(16_000, 16_500)).toBe('the first 16 KB of 17 KB');
  });

  it('gives bytes when both sizes round to the same KB, so it never reads as if nothing were missing (F13)', () => {
    expect(partShown(16_000, 16_113)).toBe('the first 16,000 of 16,113 bytes');
    expect(partShown(15_999, 16_001)).toBe('the first 15,999 of 16,001 bytes');
    // Every total a 16,000-byte excerpt can have up to 17 KB: the two sizes shown always differ.
    for (let total = 16_001; total <= 17_000; total++) {
      const sizes = /^the first (.+) of (.+)$/.exec(partShown(16_000, total) ?? '');
      expect(sizes, String(total)).not.toBeNull();
      const [shown, whole] = [sizes?.[1] ?? '', (sizes?.[2] ?? '').replace(/ bytes$/, '')];
      expect(shown, String(total)).not.toBe(whole);
    }
  });

  it('says only that it is the opening when the whole size is not known', () => {
    expect(partShown(16_000, undefined)).toBe('the opening');
  });

  it('is null when nothing is missing: a whole text never gets a partial notice', () => {
    expect(partShown(16_113, 16_113)).toBeNull();
    expect(partShown(7, 7)).toBeNull();
    expect(partShown(16_000, 15_000)).toBeNull();
  });
});
