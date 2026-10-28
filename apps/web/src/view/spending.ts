/**
 * The words Settings' "Spending records" uses for the spend book (ADR-0095): calls under way, calls that may have been
 * billed (with what to do about them), lines of the audit file the book could not read, settled calls not yet written
 * to it, and torn tails set aside after a crash. Plain functions, so the server, the client and the tests share them.
 */
import type { LedgerAudit, ProviderId, SpendRecords, UncertainCall, WaitedFor } from '@byway/contracts';
import { formatUsd } from './format.ts';
import { ledgerCheckText } from './history.ts';

const PROVIDER_NAMES: Record<ProviderId, string> = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', openrouter: 'OpenRouter', fal: 'fal.ai', mock: 'sample outputs' };

export const providerName = (id: ProviderId): string => PROVIDER_NAMES[id] ?? id;

/** What a call was for, in words: recommending and composing belong to no run; everything else is a run's step. */
export function callPurpose(call: { purpose: string; runId?: string }): string {
  if (call.purpose.startsWith('advisor.intake')) return 'Recommending a recipe';
  if (call.purpose.startsWith('advisor.compose')) return 'Building your own recipe';
  return call.runId ? `A step of run ${call.runId.slice(0, 8)}` : 'A model call';
}

/**
 * Why a call may have been billed, and where to look. A call byway sent again after a send that may have been billed
 * counts that send too (UncertainCall.retainedUsd), and says how it ended: a send that used the whole of its model's wait
 * says it went silent for the wait chosen in Settings, not that its connection failed (block 2's check, WEB-1).
 */
export function uncertainReason(call: UncertainCall): string {
  const who = providerName(call.provider);
  const jobs = call.providerJobs ? Object.values(call.providerJobs).filter(Boolean) : [];
  const ids = jobs.length > 0 ? ` ${who} accepted ${jobs.length === 1 ? 'job' : 'jobs'} ${jobs.join(' and ')}.` : '';
  switch (call.reason) {
    case 'interrupted':
      // Also a call byway cut off because its run was cancelled or ended (ADR-0111).
      return `byway stopped waiting for ${who}'s answer (its run was cancelled or ended, byway stopped, or it lost its connection), so it never learned the cost.${ids}${earlierSend(call)}`;
    case 'failed':
      return `The request may have reached ${who} before the connection failed, so ${who} may have done the work and billed it.${ids}${earlierSend(call)}`;
    case 'resent':
      // Only what was retained for an earlier send is counted here: the call sent again settled, or was not billed.
      if (call.retainedWaited) {
        return `An earlier attempt went unanswered: ${waitRanOut(call, call.retainedWaited)}, so byway stopped waiting and sent the call again. That attempt may have billed the work, and this row counts it; the call sent again has its own cost, counted separately. ${WAIT_LONGER}${ids}`;
      }
      return `An earlier attempt may have reached ${who} before the connection failed; byway sent the call again, and that call's own cost is counted separately.${ids}`;
    case 'waited':
      return `${waitedText(call)}${earlierSend(call)}`;
  }
}

/**
 * What a row counts beyond its own send, when byway sent the call again after an earlier send that may have been billed
 * (retainedUsd on a row that counts its reservation): that the earlier send is counted too, and how it ended. Empty when
 * nothing was retained.
 */
function earlierSend(call: UncertainCall): string {
  if (!(call.retainedUsd !== undefined && call.retainedUsd > 0)) return '';
  const how = call.retainedWaited ? `went unanswered (${waitRanOut(call, call.retainedWaited)})` : `may have reached ${providerName(call.provider)} before its connection failed`;
  return ` byway had sent this call before: an earlier attempt ${how}, so byway sent it again. That attempt may have been billed as well, and this row counts it too.`;
}

/**
 * How a call used the whole of its model's wait, in the gateway's words (waitedWords) up to "so byway stopped waiting":
 * "{Model} sent nothing for {N} minutes, the wait chosen in Settings", "did not answer within {N} minutes", or, for a fal
 * clip, "did not finish clip job {id} within {N} minutes".
 */
function waitRanOut(call: UncertainCall, waited: WaitedFor): string {
  const model = `${providerName(call.provider)}’s model ${call.model}`;
  const n = waited.minutes;
  if (waited.how === 'silence') return `${model} sent nothing for ${n} minutes, the wait chosen in Settings`;
  if (waited.how === 'answer') return `${model} did not answer within ${n} minutes, the wait chosen in Settings`;
  const job = call.providerJobs?.generation;
  return `${model} did not finish ${job !== undefined ? `clip job ${job}` : 'its clip'} within ${n} minutes, the wait chosen in Settings`;
}

/**
 * A call that used the whole of its model's wait (the reason 'waited'), in the words the step's failure used (the
 * gateway's waitedWords; the waits design of 2026-10-22, section 7): how it waited, for how long, that it may have billed
 * the work, and where to wait longer. A fal clip names its job and what fal answered to byway's cancel.
 */
function waitedText(call: UncertainCall): string {
  const waited = call.waited;
  if (!waited || waited.minutes === undefined) return `${providerName(call.provider)}’s model ${call.model} used the whole of the wait chosen in Settings, so byway stopped waiting. ${WAITED_TAIL}`;
  if (waited.how !== 'clip') return `${waitRanOut(call, waited)}, so byway stopped waiting. ${WAITED_TAIL}`;
  const cancel = waited.cancel !== undefined ? `: ${waited.cancel}` : '';
  return `${waitRanOut(call, waited)}, so byway stopped waiting and cancelled it${cancel}. ${WAITED_TAIL}`;
}

const WAIT_LONGER = "To wait longer, change 'How long to wait for an answer' in Settings.";
const WAITED_TAIL = `It may have billed the work. ${WAIT_LONGER}`;

/**
 * The advice under the list of calls that may have been billed. A row that holds an earlier send as well as its own
 * counts both (its usd includes retainedUsd), so "at its estimate" alone was wrong for it (B-038).
 */
export const UNCERTAIN_ADVICE =
  'Each counts against the workspace budget (not the run’s) at the amount shown, until you clear it: the estimate of each send the row counts, so a row that counts an earlier attempt as well as its own send counts both, about twice the estimate. Look it up in the provider’s own dashboard; clear it once you know whether it was billed.';

/** The advice beside the lines of the audit file the spend book could not read. */
export const FAULT_ADVICE =
  'byway makes no paid call while a line is listed here, because it cannot tell what that line spent. Look at the line in ledger.jsonl first; if the data directory was damaged, restore the whole directory from a backup (see "Back up and restore" in the README). Once every line listed here is acknowledged, paid calls go on without counting them.';

/**
 * The note when nothing in Spending records needs the person, or null. It does not say every ledger line can be read:
 * an acknowledged line still cannot be, and a line that changed after byway read it is not a fault ("Check the spend
 * ledger" says so).
 */
export function quietNote(records: Pick<SpendRecords, 'faults' | 'uncertain'>): string | null {
  if (records.faults.length > 0 || records.uncertain.length > 0) return null;
  return 'Nothing needs you here: no call may have been billed without its cost being known, and no line of the spend ledger is waiting to be acknowledged.';
}

/** Calls under way, or null when there are none. */
export function inFlightNote(records: Pick<SpendRecords, 'inFlight'>): string | null {
  const n = records.inFlight.length;
  if (n === 0) return null;
  const usd = records.inFlight.reduce((sum, c) => sum + c.usd, 0);
  return `${n} ${n === 1 ? 'call is' : 'calls are'} under way, counted at ${formatUsd(usd)} until ${n === 1 ? 'it settles' : 'they settle'}.`;
}

/** Settled calls not yet in ledger.jsonl, or null. */
export function outboxNote(records: Pick<SpendRecords, 'notInAuditFile'>): string | null {
  const n = records.notInAuditFile;
  if (n <= 0) return null;
  return `${n} settled ${n === 1 ? 'call is' : 'calls are'} counted but not yet written to ledger.jsonl, the audit file; byway writes ${n === 1 ? 'it' : 'them'} shortly.`;
}

/** Torn ledger tails set aside after a crash, or null: a note, never a reason to stop (ADR-0091). */
export function setAsideNote(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  return `After a crash cut an append short, byway set the torn end of ledger.jsonl aside as ${names.join(', ')}. ${names.length === 1 ? 'It is' : 'They are'} kept for you to inspect; nothing is blocked.`;
}

/**
 * What Settings' "Check the spend ledger" says: the chain (with what the spend book did with a line that is not an
 * entry), then the audit file against the spend book, then whether lines waiting to be acknowledged pause paid calls.
 */
export function auditText(audit: Pick<LedgerAudit, 'brokenAt' | 'brokenLine' | 'missing' | 'pending' | 'openFaults'>): string {
  const parts = [ledgerCheckText(audit.brokenAt, audit.brokenLine)];
  if (audit.missing.length > 0) {
    const n = audit.missing.length;
    const usd = audit.missing.reduce((sum, c) => sum + c.costUsd, 0);
    parts.push(
      `${n} ${n === 1 ? 'call' : 'calls'} (${formatUsd(usd)}) that byway's spending records hold ${n === 1 ? 'is' : 'are'} missing from ledger.jsonl or recorded there at another cost: an older or missing ledger.jsonl was restored, a crash lost lines, or a line was damaged. The budgets still count ${n === 1 ? 'it' : 'them'}.`,
    );
  } else if (audit.brokenAt === null) {
    parts.push('Every call byway’s spending records hold as written there is in it, at the same cost.');
  }
  if (audit.pending > 0) parts.push(`${audit.pending} settled ${audit.pending === 1 ? 'call is' : 'calls are'} not written to it yet; byway writes ${audit.pending === 1 ? 'it' : 'them'} shortly.`);
  const n = audit.openFaults;
  // The broken line's own words already say it pauses paid calls when it is the only line waiting.
  const saidAlready = n === 1 && audit.brokenLine?.book === 'fault';
  if (n > 0 && !saidAlready) {
    parts.push(`${n === 1 ? '1 line of the spend ledger is' : `${n} lines of the spend ledger are`} listed under Spending records; byway makes no paid call until ${n === 1 ? 'it is' : 'each is'} acknowledged there.`);
  }
  return parts.join(' ');
}
