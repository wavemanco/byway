/** History and Settings helpers: when a run changed, what an export is called, and what is left to spend. */
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
  spentUsd: number;
  remainingUsd: number;
  capUsd: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * What is left of the workspace budget. `ledgerSpentUsd` comes from the gateway's ledger (Gateway.spend), the spend
 * authority (spec §3.3): it includes recommending and composing, which belong to no run, and spend that landed after a
 * run ended (ENG-4), which summing the runs' costs would miss.
 */
export function workspaceSpend(capUsd: number, ledgerSpentUsd: number): WorkspaceSpend {
  const spentUsd = cents(ledgerSpentUsd);
  return { spentUsd, remainingUsd: cents(Math.max(0, capUsd - spentUsd)), capUsd };
}

/** Why a run budget cannot be accepted, or null when it can (agency: consequences before spending). */
export function budgetProblem(budgetUsd: number, spend: WorkspaceSpend): string | null {
  if (budgetUsd <= spend.remainingUsd + 1e-9) return null;
  return `This budget (${formatUsd(budgetUsd)}) is more than what is left of your workspace budget (${formatUsd(spend.remainingUsd)}). Lower it, or raise the workspace budget in Settings.`;
}

/**
 * Settings' note on calls the gateway settled at an assumed price (SpendSummary.assumedPricing, F04): the provider
 * said a model served them that byway has no price for, so they were counted at the requested model's price. Null when
 * there are none, so the note appears only when there is something to know.
 */
export function assumedPricingNote(assumed: { calls: number; usd: number } | undefined): string | null {
  if (!assumed || assumed.calls <= 0) return null;
  const one = assumed.calls === 1;
  return `${assumed.calls} ${one ? 'call was' : 'calls were'} answered by a model byway has no price for, so ${one ? 'it was' : 'they were'} counted at the price of the model byway asked for (${formatUsd(assumed.usd)}${one ? '' : ' in all'}). Your provider’s bill may differ.`;
}

/**
 * What Settings' "Check the spend ledger" says (Gateway.verifyLedger; ADR-0091): null is an intact chain, `head` a head
 * record that cannot be read, `line:<n>` a line that is not an entry, anything else the id of the first entry that
 * breaks the chain. A `line:<n>` line's spending may or may not be counted (a line that is not JSON is skipped, a JSON
 * entry missing only its id is still summed), and a torn last line is set aside by the next append. The backup unit is
 * the whole data directory (ADR-0094): restoring ledger.jsonl alone puts it out of step with its head and with the
 * runs' recorded costs, so the text never suggests it.
 */
export function ledgerCheckText(brokenAt: string | null): string {
  if (brokenAt === null) return 'The spend ledger checks out: every entry is intact and chained to the one before it.';
  if (brokenAt === 'head') return "The spend ledger's head record cannot be read, so whether entries were cut off the end cannot be checked. The next model call rewrites it.";
  const line = /^line:(\d+)$/.exec(brokenAt);
  if (line) {
    return `Line ${line[1]} of the spend ledger cannot be read as an entry, so its spending may not be counted. If it is the last line, a crash probably cut it short, and the next model call sets it aside so the ledger carries on. To go back to a backup, restore the whole data directory, not ledger.jsonl alone (see "Back up and restore" in the README).`;
  }
  return `The spend ledger fails its check at entry ${brokenAt}: an entry was changed, lost or cut off, so its totals may be short.`;
}
