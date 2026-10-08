/**
 * Number formatting for money and time. Costs are shown before anything is spent (spec §5, "agency: clear
 * consequences before spending"), so a real cost must never round down to "$0.00".
 */

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatUsd(amount: number): string {
  if (amount > 0 && amount < 0.005) return '<$0.01';
  return usd.format(amount);
}

/** "$0.40–$1.20"; "up to $0.30" when the low end is below a cent; one value when both ends round alike. */
export function formatCostRange(lowUsd: number, highUsd: number): string {
  const low = formatUsd(lowUsd);
  const high = formatUsd(highUsd);
  if (highUsd <= 0) return formatUsd(0);
  if (low === high) return high;
  if (lowUsd < 0.005) return `up to ${high}`;
  return `${low}–${high}`;
}

function hours(minutes: number): string {
  const h = Math.round((minutes / 60) * 2) / 2;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

/** Human time a run asks for: minutes for short sessions, hours from two hours up. */
export function formatMinutes(range: { low: number; high: number }): string {
  const { low, high } = range;
  if (high <= 0) return 'none';
  if (high < 120) return low === high ? `${high} min` : `${low}–${high} min`;
  if (low < 120) return `${low} min–${hours(high)} h`;
  const [l, h] = [hours(low), hours(high)];
  return l === h ? `${h} h` : `${l}–${h} h`;
}

export function formatCallRange(range: { low: number; high: number }): string {
  const { low, high } = range;
  const noun = high === 1 ? 'AI call' : 'AI calls';
  return low === high ? `${high} ${noun}` : `${low}–${high} ${noun}`;
}

/** A default run budget: a quarter above the high estimate, rounded up to 50 cents; $1 when nothing is spent. */
export function suggestBudget(estimate: { lowUsd: number; highUsd: number }): number {
  if (estimate.highUsd <= 0) return 1;
  return Math.max(0.5, Math.ceil(estimate.highUsd * 1.25 * 2) / 2);
}

/** The largest budget the budget fields accept; a typo should not authorise a large spend. */
export const MAX_BUDGET_USD = 1000;

/** Parses a typed budget ("2.50", "$3"); null when it is not a positive amount within the limit. */
export function parseBudgetInput(text: string): number | null {
  const cleaned = text.trim().replace(/^\$/, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!(value > 0) || value > MAX_BUDGET_USD) return null;
  return value;
}
