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
