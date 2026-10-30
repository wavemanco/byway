/** History and Settings helpers: when a run changed, what an export is called, and what is left to spend. */
import type { BrokenLine, SpendSummary } from '@byway/contracts';
import { formatUsd } from './format.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const sameDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const otherYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function dayNumber(date: Date): number {
  return Math.floor(date.getTime() / (24 * HOUR));
}

/** "Just now", "5 min ago", "3 h ago", "Yesterday", "Oct 1", "Dec 24, 2025" (UTC, so server and browser agree). */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const ago = now.getTime() - at.getTime();
  if (ago < MINUTE) return 'Just now';
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)} min ago`;
  const days = dayNumber(now) - dayNumber(at);
  if (days === 0) return `${Math.floor(ago / HOUR)} h ago`;
  if (days === 1) return 'Yesterday';
  return at.getUTCFullYear() === now.getUTCFullYear() ? sameDay.format(at) : otherYear.format(at);
}

const EXPORT_NAMES: Record<string, string> = {
  'text/html': 'HTML',
  'text/markdown': 'Markdown',
  'application/json': 'JSON',
  'text/x-diff': 'patch',
};

/** The export button says the format you get. */
export function exportLabel(mediaType: string): string {
  const name = EXPORT_NAMES[mediaType.split(';')[0]?.trim() ?? ''];
  return name ? `Download ${name}` : 'Download file';
}

export interface WorkspaceSpend {
  /** Settled spend. */
  spentUsd: number;
  /** Calls under way, at their estimates. */
  inFlightUsd: number;
  /** Calls that may have been billed, until cleared in Settings. */
  uncertainUsd: number;
  remainingUsd: number;
  capUsd: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * What is left of the workspace budget: the cap less settled spend, calls under way and calls that may have been
 * billed, the same sum admission checks a new call against (ADR-0095). The figures come from the gateway's spend book
 * (Gateway.spend), the spend authority (spec §3.3): they include recommending and composing, which belong to no run,
 * and spend that landed after a run ended (ENG-4), which summing the runs' costs would miss.
 */
export function workspaceSpend(capUsd: number, summary: Pick<SpendSummary, 'spentUsd' | 'inFlightUsd' | 'uncertainUsd'>): WorkspaceSpend {
  const spentUsd = cents(summary.spentUsd);
  const inFlightUsd = cents(summary.inFlightUsd ?? 0);
  const uncertainUsd = cents(summary.uncertainUsd ?? 0);
  return { spentUsd, inFlightUsd, uncertainUsd, remainingUsd: cents(Math.max(0, capUsd - summary.spentUsd - (summary.inFlightUsd ?? 0) - (summary.uncertainUsd ?? 0))), capUsd };
}

/** Why a run budget cannot be accepted, or null when it can (agency: consequences before spending). */
export function budgetProblem(budgetUsd: number, spend: Pick<WorkspaceSpend, 'remainingUsd'>): string | null {
  if (budgetUsd <= spend.remainingUsd + 1e-9) return null;
  return `This budget (${formatUsd(budgetUsd)}) is more than what is left of your workspace budget (${formatUsd(spend.remainingUsd)}). Lower it, or raise the workspace budget in Settings.`;
}

/**
 * Settings' note on calls the gateway recorded on an assumption (SpendSummary.assumedPricing, LedgerEntry.priceBasis
 * 'assumed'; F04, ADR-0095 decision 7): the provider named a model byway has no price for, named no model, gave no token
 * counts (B-147), or reported usage or a cost byway could not use. Null when there are none, so the note appears only when there is something to know.
 */
export function assumedPricingNote(assumed: { calls: number; usd: number } | undefined): string | null {
  if (!assumed || assumed.calls <= 0) return null;
  const one = assumed.calls === 1;
  return `${assumed.calls} ${one ? 'call was' : 'calls were'} counted on an assumption (${formatUsd(assumed.usd)}${one ? '' : ' in all'}): the provider named a model byway has no price for, named no model, gave no token counts, or reported usage or a cost byway could not use. Your provider’s bill may differ.`;
}

/** What the spend book did with a line of the ledger that is not an entry (LedgerAudit.brokenLine), in words. */
const LINE_FATE: Record<BrokenLine['book'], string> = {
  fault: 'It is listed under Spending records, and byway makes no paid call until it is acknowledged there.',
  acknowledged: 'It was acknowledged under Spending records, so the budgets do not count it.',
  'read-before': "It changed after byway read it: byway's spending records keep what they read there then, and the line as it is now neither counts nor pauses anything.",
  blank: "It is blank: byway's spending records skip it, so it neither counts nor pauses anything.",
  unread: 'byway has not read it into its spending records yet; when it does, it lists it under Spending records and makes no paid call until it is acknowledged there.',
  torn: 'It is the last line and has no line ending, so a crash probably cut an append short; byway sets it aside the next time it writes to the ledger, and the ledger carries on.',
};
const LINE_FATE_UNKNOWN =
  "If it is the last line, a crash probably cut it short, and byway sets it aside the next time it writes to the ledger. If byway read it as it is now, it is listed under Spending records, and paid calls wait until it is acknowledged there; if it changed after byway read it, byway keeps what it read there then.";

/**
 * What Settings' "Check the spend ledger" says about the hash chain (Gateway.auditLedger's brokenAt; ADR-0091): null is
 * an intact chain, `head` a head record that cannot be read, `line:<n>` a line that is not an entry, anything else the id
 * of the first entry that breaks the chain, or the number of a missing entry whose head record has an empty id. For a
 * line that is not an entry, `brokenLine` says what the spend book did with it (ADR-0095), so the words say what is true
 * of this line: a fault that pauses paid calls, an acknowledged one, a line that changed after the book read it, a blank
 * line, or a torn last line. Without it they say each case conditionally and claim no pause. The backup unit is the
 * whole data directory (ADR-0094): restoring ledger.jsonl alone puts it out of step with its head and with the spend
 * book, so the text never suggests it.
 */
export function ledgerCheckText(brokenAt: string | null, brokenLine?: BrokenLine): string {
  if (brokenAt === null) return 'The spend ledger checks out: every entry is intact and chained to the one before it.';
  if (brokenAt === 'head') return "The spend ledger's head record cannot be read, so whether entries were cut off the end cannot be checked. The next model call rewrites it.";
  const line = /^line:(\d+)$/.exec(brokenAt);
  if (line) {
    const what = brokenLine && String(brokenLine.line) === line[1] ? LINE_FATE[brokenLine.book] : LINE_FATE_UNKNOWN;
    return `Line ${line[1]} of the spend ledger cannot be read as an entry. ${what} To go back to a backup, restore the whole data directory, not ledger.jsonl alone (see "Back up and restore" in the README).`;
  }
  return `The spend ledger fails its check at entry ${brokenAt}: an entry was changed, lost or cut off. The budgets count from byway's spending records in its database, not from this file.`;
}
