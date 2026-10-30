import { describe, expect, it } from 'vitest';
import { assumedPricingNote, budgetProblem, exportLabel, formatWhen, ledgerCheckText, workspaceSpend } from '../src/view/history.ts';

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
  it('takes what the spend book says was spent and what is left of the workspace budget', () => {
    expect(workspaceSpend(20, { spentUsd: 1.75 })).toEqual({ spentUsd: 1.75, inFlightUsd: 0, uncertainUsd: 0, remainingUsd: 18.25, capUsd: 20 });
    expect(workspaceSpend(1, { spentUsd: 3 }).remainingUsd).toBe(0);
    expect(workspaceSpend(5, { spentUsd: 0.123456 }).spentUsd).toBe(0.12);
  });

  it('leaves out calls under way and calls that may have been billed, as admission does (ADR-0095)', () => {
    expect(workspaceSpend(10, { spentUsd: 1.2, inFlightUsd: 0.4, uncertainUsd: 0.1 })).toEqual({ spentUsd: 1.2, inFlightUsd: 0.4, uncertainUsd: 0.1, remainingUsd: 8.3, capUsd: 10 });
    expect(workspaceSpend(1, { spentUsd: 0.5, inFlightUsd: 0.3, uncertainUsd: 0.3 }).remainingUsd).toBe(0);
  });

  it('refuses a run budget larger than what is left, with a way out', () => {
    expect(budgetProblem(2, { remainingUsd: 20 })).toBeNull();
    expect(budgetProblem(5, { remainingUsd: 3 })).toBe(
      'This budget ($5.00) is more than what is left of your workspace budget ($3.00). Lower it, or raise the workspace budget in Settings.',
    );
  });
});

describe('Settings: calls recorded on an assumption (F04, ADR-0091, ADR-0095 decision 7)', () => {
  it('says plainly how many calls were counted on an assumption, and every reason one can be, and nothing when there are none', () => {
    expect(assumedPricingNote(undefined)).toBeNull();
    expect(assumedPricingNote({ calls: 0, usd: 0 })).toBeNull();
    expect(assumedPricingNote({ calls: 1, usd: 0.028 })).toBe(
      '1 call was counted on an assumption ($0.03): the provider named a model byway has no price for, named no model, gave no token counts, or reported usage or a cost byway could not use. Your provider’s bill may differ.',
    );
    expect(assumedPricingNote({ calls: 3, usd: 1.2 })).toMatch(/^3 calls were counted on an assumption \(\$1\.20 in all\): /);
  });
});

describe('Settings: checking the spend ledger (ADR-0091, ADR-0094, ADR-0095)', () => {
  const BACKUP = 'To go back to a backup, restore the whole data directory, not ledger.jsonl alone (see "Back up and restore" in the README).';

  it('for a line that is not an entry, says what byway did with it, from its spending records, and that a backup is the whole data directory', () => {
    expect(ledgerCheckText('line:7', { line: 7, book: 'fault' })).toBe(
      `Line 7 of the spend ledger cannot be read as an entry. It is listed under Spending records, and byway makes no paid call until it is acknowledged there. ${BACKUP}`,
    );
    expect(ledgerCheckText('line:7', { line: 7, book: 'acknowledged' })).toBe(
      `Line 7 of the spend ledger cannot be read as an entry. It was acknowledged under Spending records, so the budgets do not count it. ${BACKUP}`,
    );
    expect(ledgerCheckText('line:7', { line: 7, book: 'read-before' })).toBe(
      `Line 7 of the spend ledger cannot be read as an entry. It changed after byway read it: byway's spending records keep what they read there then, and the line as it is now neither counts nor pauses anything. ${BACKUP}`,
    );
    expect(ledgerCheckText('line:7', { line: 7, book: 'blank' })).toBe(
      `Line 7 of the spend ledger cannot be read as an entry. It is blank: byway's spending records skip it, so it neither counts nor pauses anything. ${BACKUP}`,
    );
    expect(ledgerCheckText('line:7', { line: 7, book: 'unread' })).toBe(
      `Line 7 of the spend ledger cannot be read as an entry. byway has not read it into its spending records yet; when it does, it lists it under Spending records and makes no paid call until it is acknowledged there. ${BACKUP}`,
    );
    expect(ledgerCheckText('line:7', { line: 7, book: 'torn' })).toBe(
      `Line 7 of the spend ledger cannot be read as an entry. It is the last line and has no line ending, so a crash probably cut an append short; byway sets it aside the next time it writes to the ledger, and the ledger carries on. ${BACKUP}`,
    );
  });

  it('for a line that is not an entry, without what byway did with it, says each case conditionally and claims no pause', () => {
    const text = ledgerCheckText('line:7');
    expect(text).toBe(
      `Line 7 of the spend ledger cannot be read as an entry. If it is the last line, a crash probably cut it short, and byway sets it aside the next time it writes to the ledger. If byway read it as it is now, it is listed under Spending records, and paid calls wait until it is acknowledged there; if it changed after byway read it, byway keeps what it read there then. ${BACKUP}`,
    );
  });

  it('for a broken chain: the budgets do not depend on the file', () => {
    expect(ledgerCheckText('entry-9')).toMatch(/^The spend ledger fails its check at entry entry-9: .* The budgets count from byway's spending records in its database, not from this file.$/);
  });
});
