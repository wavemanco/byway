/** Settings' Spending records in words (ADR-0095): what may have been billed, and why; notes that need nothing. */
import { describe, expect, it } from 'vitest';
import type { UncertainCall } from '@byway/contracts';
import { waitedWords } from '@byway/gateway';
import { auditText, callPurpose, clearable, FAULT_ADVICE, inFlightNote, outboxNote, quietNote, setAsideNote, uncertainReason } from '../src/view/spending.ts';

const call = (over: Partial<UncertainCall> = {}): UncertainCall => ({ opId: 'op', purpose: 'build:prose', runId: 'run-12345678-abcd', provider: 'anthropic', model: 'claude-opus-5-5', usd: 0.4, since: '2026-10-08T12:00:00.000Z', reason: 'interrupted', ...over });

describe('Spending records in words', () => {
  it('says what each call was for: recommending and composing belong to no run', () => {
    expect(callPurpose({ purpose: 'advisor.intake' })).toBe('Recommending a recipe');
    expect(callPurpose({ purpose: 'advisor.compose.repair' })).toBe('Building your own recipe');
    expect(callPurpose({ purpose: 'critic:prose', runId: 'run-12345678-abcd' })).toBe('A step of run run-1234');
  });

  it('says why a call may have been billed, and names the provider’s job ids to look up', () => {
    // Widened for a call byway cut off when its run was cancelled or ended (ADR-0111): the database's reason is the same.
    expect(uncertainReason(call())).toBe("byway stopped waiting for Anthropic's answer (its run was cancelled or ended, byway stopped, or it lost its connection), so it never learned the cost.");
    expect(uncertainReason(call({ provider: 'fal', providerJobs: { generation: 'req-7' } }))).toBe(
      "byway stopped waiting for fal.ai's answer (its run was cancelled or ended, byway stopped, or it lost its connection), so it never learned the cost. fal.ai accepted job req-7.",
    );
    expect(uncertainReason(call({ reason: 'failed', provider: 'fal', providerJobs: { generation: 'req-1' } }))).toBe(
      'The request may have reached fal.ai before the connection failed, so fal.ai may have done the work and billed it. fal.ai accepted job req-1.',
    );
    expect(uncertainReason(call({ reason: 'resent' }))).toMatch(/^An earlier attempt may have reached Anthropic .* counted separately\.$/);
  });

  it('says how a call that used the whole of its model’s wait waited, for how long, and where to wait longer (the waits design)', () => {
    const tail = "It may have billed the work. To wait longer, change 'How long to wait for an answer' in Settings.";
    expect(uncertainReason(call({ reason: 'waited', waited: { minutes: 45, how: 'silence' } }))).toBe(
      `Anthropic’s model claude-opus-5-5 sent nothing for 45 minutes, the wait chosen in Settings, so byway stopped waiting. ${tail}`,
    );
    expect(uncertainReason(call({ reason: 'waited', provider: 'google', model: 'gemini-3.1-pro-preview', waited: { minutes: 15, how: 'answer' } }))).toBe(
      `Google’s model gemini-3.1-pro-preview did not answer within 15 minutes, the wait chosen in Settings, so byway stopped waiting. ${tail}`,
    );
    const cancel = 'fal was asked to stop it while it ran (HTTP 202 CANCELLATION_REQUESTED), and it can still finish it';
    expect(uncertainReason(call({ reason: 'waited', provider: 'fal', model: 'fal-ai/kling-video/v3/pro/image-to-video', providerJobs: { generation: 'req-7' }, waited: { minutes: 30, how: 'clip', cancel } }))).toBe(
      `fal.ai’s model fal-ai/kling-video/v3/pro/image-to-video did not finish clip job req-7 within 30 minutes, the wait chosen in Settings, so byway stopped waiting and cancelled it: ${cancel}. ${tail}`,
    );
  });

  it('says of a call that waited what the step’s failure said, word for word (the gateway’s waitedWords)', () => {
    const calls: UncertainCall[] = [
      call({ reason: 'waited', provider: 'openrouter', model: 'anthropic/claude-opus-5.5', waited: { minutes: 60, how: 'silence' } }),
      call({ reason: 'waited', provider: 'openai', model: 'gpt-image-2.5-flare', waited: { minutes: 5, how: 'answer' } }),
      call({ reason: 'waited', provider: 'fal', model: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', providerJobs: { generation: 'req-9' }, waited: { minutes: 75, how: 'clip', cancel: 'byway’s cancel did not go through (no answer)' } }),
    ];
    for (const c of calls) expect(uncertainReason(c)).toBe(waitedWords(c, c.waited!, c.providerJobs?.generation ? { job: c.providerJobs.generation } : {}));
  });

  it('says of a call sent again after a send that used its whole wait that the earlier send went silent, not that its connection failed, and where to wait longer (WEB-1)', () => {
    expect(uncertainReason(call({ reason: 'resent', usd: 0.4, retainedUsd: 0.4, retainedWaited: { minutes: 60, how: 'silence' } }))).toBe(
      "An earlier attempt went unanswered: Anthropic’s model claude-opus-5-5 sent nothing for 60 minutes, the wait chosen in Settings, so byway stopped waiting and sent the call again. That attempt may have billed the work, and this row counts it; the call sent again has its own cost, counted separately. To wait longer, change 'How long to wait for an answer' in Settings.",
    );
    // A send retained for another reason keeps the words it had.
    expect(uncertainReason(call({ reason: 'resent', usd: 0.4, retainedUsd: 0.4 }))).toBe(
      "An earlier attempt may have reached Anthropic before the connection failed; byway sent the call again, and that call's own cost is counted separately.",
    );
  });

  it('says of a call that counts an earlier send as well as its own that it does, and how that send ended (WEB-1)', () => {
    const silence = { minutes: 15, how: 'silence' as const };
    const earlierSilent = 'byway had sent this call before: an earlier attempt went unanswered (Anthropic’s model claude-opus-5-5 sent nothing for 15 minutes, the wait chosen in Settings), so byway sent it again. That attempt may have been billed as well, and this row counts it too.';
    const earlierLost = 'byway had sent this call before: an earlier attempt may have reached Anthropic before its connection failed, so byway sent it again. That attempt may have been billed as well, and this row counts it too.';
    // Both sends went silent: the step's words for the call, then the earlier send.
    const twice = call({ reason: 'waited', waited: silence, usd: 0.8, retainedUsd: 0.4, retainedWaited: silence });
    expect(uncertainReason(twice)).toBe(`${waitedWords(twice, silence)} ${earlierSilent}`);
    expect(uncertainReason(call({ reason: 'failed', usd: 0.8, retainedUsd: 0.4, retainedWaited: silence }))).toBe(
      `The request may have reached Anthropic before the connection failed, so Anthropic may have done the work and billed it. ${earlierSilent}`,
    );
    expect(uncertainReason(call({ reason: 'failed', usd: 0.8, retainedUsd: 0.4 }))).toBe(`The request may have reached Anthropic before the connection failed, so Anthropic may have done the work and billed it. ${earlierLost}`);
    expect(uncertainReason(call({ reason: 'interrupted', usd: 0.8, retainedUsd: 0.4 }))).toBe(
      `byway stopped waiting for Anthropic's answer (its run was cancelled or ended, byway stopped, or it lost its connection), so it never learned the cost. ${earlierLost}`,
    );
    // A call that retained nothing says nothing of an earlier send.
    expect(uncertainReason(call({ reason: 'failed' }))).not.toMatch(/earlier/);
  });

  it('offers Clear only for a listed call that is no longer under way', () => {
    const flying = { opId: 'a', purpose: 'p', provider: 'anthropic' as const, model: 'm', usd: 0.25, since: 'now' };
    expect(clearable({ opId: 'a' }, { inFlight: [flying] })).toBe(false);
    expect(clearable({ opId: 'b' }, { inFlight: [flying] })).toBe(true);
    expect(clearable({ opId: 'a' }, { inFlight: [] })).toBe(true);
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
    expect(auditText({ brokenAt: null, missing: [], pending: 0, openFaults: 0 })).toBe(
      'The spend ledger checks out: every entry is intact and chained to the one before it. Every call byway’s spending records hold as written there is in it, at the same cost.',
    );
    const missing = [
      { opId: 'a', entryId: 'e1', workspaceId: 'ws', runId: 'r', costUsd: 0.05 },
      { opId: 'b', entryId: 'e2', workspaceId: 'ws', costUsd: 0.1 },
    ];
    expect(auditText({ brokenAt: null, missing, pending: 1, openFaults: 0 })).toMatch(/2 calls \(\$0\.15\) that byway's spending records hold are missing from ledger\.jsonl .* The budgets still count them\. 1 settled call is not written to it yet/);
  });

  it('says paid calls are paused only while a line is waiting to be acknowledged, however many there are', () => {
    const broken = { brokenAt: 'line:2', missing: [], pending: 0 };
    expect(auditText({ ...broken, brokenLine: { line: 2, book: 'fault' }, openFaults: 1 })).toMatch(/It is listed under Spending records, and byway makes no paid call until it is acknowledged there\./);
    expect(auditText({ ...broken, brokenLine: { line: 2, book: 'fault' }, openFaults: 3 })).toMatch(/ 3 lines of the spend ledger are listed under Spending records; byway makes no paid call until each is acknowledged there\.$/);
    expect(auditText({ ...broken, brokenLine: { line: 2, book: 'read-before' }, openFaults: 0 })).not.toMatch(/paid call|paused|wait/);
    expect(auditText({ ...broken, brokenLine: { line: 2, book: 'read-before' }, openFaults: 1 })).toMatch(/ 1 line of the spend ledger is listed under Spending records; byway makes no paid call until it is acknowledged there\.$/);
  });

  it('when nothing needs the person, says so without claiming every ledger line can be read', () => {
    expect(quietNote({ faults: [], uncertain: [] })).toBe('Nothing needs you here: no call may have been billed without its cost being known, and no line of the spend ledger is waiting to be acknowledged.');
    expect(quietNote({ faults: [{ id: 1, detail: 'd', createdAt: 'now' }], uncertain: [] })).toBeNull();
    expect(quietNote({ faults: [], uncertain: [call()] })).toBeNull();
    expect(FAULT_ADVICE).not.toMatch(/Acknowledging lets paid calls go on/);
    expect(FAULT_ADVICE).toMatch(/Once every line listed here is acknowledged, paid calls go on without counting them\./);
  });
});
