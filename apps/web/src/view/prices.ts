/**
 * When byway's prices were last checked, in the words Settings, the Recommendation's estimated cost and the Library
 * show (PRICE-CADENCE, block 2; the Library's from WEB-5 of block 2's check). The owner chose on 2026-10-21 23:15
 * "Weekly report + monthly re-read + date in the app (Recommended)", whose description read, in part, "Settings and the
 * estimate show when prices were last checked, with a notice after about 45 days." The day is the gateway's
 * PRICES_CHECKED, the last day every row of its price table was read against the provider's page; the server reads it
 * (ServiceHost.pricesCheckedOn) and puts it in words here with its own clock, so the client components never import
 * @byway/gateway and the server and the browser show the same words.
 */

/** Past this many whole days after the check, the screens add a notice: "about 45 days", as the owner chose. */
export const PRICES_STALE_DAYS = 45;

const DAY_MS = 86_400_000;
const named = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** The line each screen shows, and the notice it adds once the check is old (null until then). */
export interface PricesChecked {
  text: string;
  notice: string | null;
}

/** A YYYY-MM-DD day as its UTC midnight, or undefined when it is not a real day. */
function dayStart(day: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const at = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isNaN(at) || new Date(at).toISOString().slice(0, 10) !== day ? undefined : at;
}

/**
 * The words for a check made on `checkedOn` (YYYY-MM-DD), seen at `now`: "Prices last checked Oct 22, 2026.", and from
 * the 46th day after it a notice that says how long ago that was and what it means. Days are whole UTC days, so the age
 * changes at the same moment for every reader; a clock behind the day reads as no age. A day that cannot be read is
 * said as such, with a notice, rather than shown as a date it is not.
 */
export function pricesChecked(checkedOn: string, now: Date): PricesChecked {
  const start = dayStart(checkedOn);
  if (start === undefined) {
    return { text: 'byway cannot tell when its prices were last checked.', notice: "Providers change their prices, so estimates and the costs byway records may differ from your provider's bill." };
  }
  const shown = named.format(start);
  const days = Math.floor((now.getTime() - start) / DAY_MS);
  return {
    text: `Prices last checked ${shown}.`,
    notice:
      days > PRICES_STALE_DAYS
        ? `byway's prices were last checked against the providers' pages ${days} days ago, on ${shown}, and providers change their prices. Until they are checked again, estimates and the costs byway records may differ from your provider's bill.`
        : null,
  };
}
