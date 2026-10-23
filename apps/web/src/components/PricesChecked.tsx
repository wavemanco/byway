import type { PricesChecked } from '../view/prices.ts';

/**
 * The notice Settings, the Recommendation and the Library add once byway's prices were last checked more than about 45
 * days ago (view/prices.ts; PRICE-CADENCE, block 2), as a caution: nothing stops, and the person knows estimates and
 * recorded costs may have drifted from the providers' prices. Nothing while the check is recent.
 */
export function PricesStaleNotice({ prices }: { prices: PricesChecked }) {
  return prices.notice ? <p className="notice notice-caution prices-stale">{prices.notice}</p> : null;
}
