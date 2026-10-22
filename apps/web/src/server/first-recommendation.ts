/**
 * One in-process call for an intake's first recommendation (F03, ADR-0091). The Recommendation screen asks for it once
 * it is shown, when no recommendation is stored yet ({ ensure: true }), and so does Try again; the page's render only
 * reads what is stored. Two tabs, a reload during the call, or the first ask and Try again together used to make one
 * paid advisor.intake call each. Concurrent first asks for one intake now share one call; the entry is dropped when the
 * call settles, so a failure is never kept and the next ask tries again.
 *
 * Only this web process calls the advisor, so one map per process is enough. It lives on globalThis because Next.js
 * builds pages and route handlers into separate bundles, each with its own module scope (as the service host does,
 * services/index.ts), and it is keyed by the host's store, so separate hosts (tests) never share a call.
 */
import type { Recommendation, Store } from '@byway/contracts';

const KEY = Symbol.for('byway.firstRecommendation');

type Holder = { [KEY]?: WeakMap<Store, Map<string, Promise<Recommendation>>> };

/** The call in flight for this intake if there is one, else `make()`'s, shared until it settles. */
export function firstRecommendation(store: Store, intakeId: string, make: () => Promise<Recommendation>): Promise<Recommendation> {
  const holder = globalThis as Holder;
  const byStore = (holder[KEY] ??= new WeakMap());
  let flights = byStore.get(store);
  if (!flights) {
    flights = new Map();
    byStore.set(store, flights);
  }
  const pending = flights.get(intakeId);
  if (pending) return pending;
  const inFlight = flights;
  const flight = make().finally(() => inFlight.delete(intakeId));
  inFlight.set(intakeId, flight);
  return flight;
}
