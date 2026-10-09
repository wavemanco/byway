/** Settings' Spending records in words (ADR-0095): what may have been billed, and why; notes that need nothing. */
import { describe, expect, it } from 'vitest';
import type { UncertainCall } from '@byway/contracts';
import { auditText, callPurpose, inFlightNote, outboxNote, setAsideNote, uncertainReason } from '../src/view/spending.ts';

const call = (over: Partial<UncertainCall> = {}): UncertainCall => ({ opId: 'op', purpose: 'build:prose', runId: 'run-12345678-abcd', provider: 'anthropic', model: 'claude-opus-5-5', usd: 0.4, since: '2026-10-08T12:00:00.000Z', reason: 'interrupted', ...over });

describe('Spending records in words', () => {
  it('says what each call was for: recommending and composing belong to no run', () => {
    expect(callPurpose({ purpose: 'advisor.intake' })).toBe('Recommending a recipe');
    expect(callPurpose({ purpose: 'advisor.compose.repair' })).toBe('Building your own recipe');
    expect(callPurpose({ purpose: 'critic:prose', runId: 'run-12345678-abcd' })).toBe('A step of run run-1234');
  });

  it('says why a call may have been billed, and names the provider’s job ids to look up', () => {
    expect(uncertainReason(call())).toBe("byway stopped, or lost its connection, while waiting for Anthropic's answer, so it never learned the cost.");
    expect(uncertainReason(call({ reason: 'failed', provider: 'fal', providerJobs: { generation: 'req-1' } }))).toBe(
      'The request may have reached fal.ai before the connection failed, so fal.ai may have done the work and billed it. fal.ai accepted job req-1.',
    );
    expect(uncertainReason(call({ reason: 'resent' }))).toMatch(/^An earlier attempt may have reached Anthropic .* counted separately\.$/);
  });

  it('notes calls under way, calls not yet written to the ledger, and set-aside tails, and nothing when there are none', () => {
    expect(inFlightNote({ inFlight: [] })).toBeNull();
    expect(inFlightNote({ inFlight: [{ opId: 'a', purpose: 'p', provider: 'anthropic', model: 'm', usd: 0.25, since: 'now' }] })).toBe('1 call is under way, counted at $0.25 until it settles.');
    expect(outboxNote({ notInAuditFile: 0 })).toBeNull();
    expect(outboxNote({ notInAuditFile: 2 })).toBe('2 settled calls are counted but not yet written to ledger.jsonl, the audit file; byway writes them shortly.');
    expect(setAsideNote([])).toBeNull();
    expect(setAsideNote(['ledger.jsonl.damaged-1-2'])).toMatch(/set the torn end of ledger\.jsonl aside as ledger\.jsonl\.damaged-1-2\. It is kept for you to inspect; nothing is blocked\.$/);
  });

  it('checks the ledger against the records: missing calls are named with what they cost, and the budgets still count them', () => {
    expect(auditText({ brokenAt: null, missing: [], pending: 0 })).toBe(
      'The spend ledger checks out: every entry is intact and chained to the one before it. Every call byway’s spending records hold as written there is in it, at the same cost.',
    );
    const missing = [
      { opId: 'a', entryId: 'e1', workspaceId: 'ws', runId: 'r', costUsd: 0.05 },
      { opId: 'b', entryId: 'e2', workspaceId: 'ws', costUsd: 0.1 },
    ];
    expect(auditText({ brokenAt: null, missing, pending: 1 })).toMatch(/2 calls \(\$0\.15\) that byway's spending records hold are missing from ledger\.jsonl .* The budgets still count them\. 1 settled call is not written to it yet/);
  });
});
