/**
 * The words Settings' "Spending records" uses for the spend book (ADR-0095): calls under way, calls that may have been
 * billed (with what to do about them), lines of the audit file the book could not read, settled calls not yet written
 * to it, and torn tails set aside after a crash. Plain functions, so the server, the client and the tests share them.
 */
import type { LedgerAudit, ProviderId, SpendRecords, UncertainCall } from '@byway/contracts';
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

/** Why a call may have been billed, and where to look. */
export function uncertainReason(call: UncertainCall): string {
  const who = providerName(call.provider);
  const jobs = call.providerJobs ? Object.values(call.providerJobs).filter(Boolean) : [];
  const ids = jobs.length > 0 ? ` ${who} accepted ${jobs.length === 1 ? 'job' : 'jobs'} ${jobs.join(' and ')}.` : '';
  switch (call.reason) {
    case 'interrupted':
      return `byway stopped, or lost its connection, while waiting for ${who}'s answer, so it never learned the cost.${ids}`;
    case 'failed':
      return `The request may have reached ${who} before the connection failed, so ${who} may have done the work and billed it.${ids}`;
    case 'resent':
      return `An earlier attempt may have reached ${who} before the connection failed; byway sent the call again, and that call's own cost is counted separately.${ids}`;
  }
}

/** The advice under the list of calls that may have been billed. */
export const UNCERTAIN_ADVICE =
  'Each counts at its estimate against the workspace budget (not the run’s) until you clear it. Look it up in the provider’s own dashboard; clear it once you know whether it was billed.';

/** The advice beside a line of the audit file the spend book could not read. */
export const FAULT_ADVICE =
  'byway makes no paid call until you acknowledge this, because it cannot tell what that line spent. Look at the line in ledger.jsonl first; if the data directory was damaged, restore the whole directory from a backup (see "Back up and restore" in the README). Acknowledging lets paid calls go on without counting that line.';

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

/** What Settings' "Check the spend ledger" says: the chain, then the audit file against the spend book. */
export function auditText(audit: Pick<LedgerAudit, 'brokenAt' | 'missing' | 'pending'>): string {
  const parts = [ledgerCheckText(audit.brokenAt)];
  if (audit.missing.length > 0) {
    const n = audit.missing.length;
    const usd = audit.missing.reduce((sum, c) => sum + c.costUsd, 0);
    parts.push(
      `${n} ${n === 1 ? 'call' : 'calls'} (${formatUsd(usd)}) that byway's spending records hold ${n === 1 ? 'is' : 'are'} missing from ledger.jsonl or recorded there at another cost: an older or missing ledger.jsonl was restored, or a crash lost lines. The budgets still count ${n === 1 ? 'it' : 'them'}.`,
    );
  } else if (audit.brokenAt === null) {
    parts.push('Every call byway’s spending records hold as written there is in it, at the same cost.');
  }
  if (audit.pending > 0) parts.push(`${audit.pending} settled ${audit.pending === 1 ? 'call is' : 'calls are'} not written to it yet; byway writes ${audit.pending === 1 ? 'it' : 'them'} shortly.`);
  return parts.join(' ');
}
