/**
 * One in-process call for each of an intake's paid asks while it is under way (F03, ADR-0091; B-070). The Recommendation
 * screen asks for the first recommendation once it is shown, when no recommendation is stored yet ({ ensure: true }),
 * and so does Try again; the page's render only reads what is stored. Two tabs, a reload during the call, or the first
 * ask and Try again together used to make one paid advisor.intake call each. "Build my own" and a re-route are the same:
 * their calls run inside the web request, bounded only by the model's wait, and go on when the request ends (their
 * answers are kept on the intake), so a press again after a reload, or in a second tab, used to buy a second call beside
 * the first. Concurrent asks of one kind for one intake now share one call (a re-route only with the same answers); the
 * entry is dropped when the call settles, so a failure is never kept and the next ask tries again.
 *
 * Only this web process calls the advisor, so one map per process is enough. It lives on globalThis because Next.js
 * builds pages and route handlers into separate bundles, each with its own module scope (as the service host does,
 * services/index.ts), and it is keyed by the host's store, so separate hosts (tests) never share a call.
 */
import type { Recommendation, Store } from '@byway/contracts';

const KEY = Symbol.for('byway.firstRecommendation');

type Holder = { [KEY]?: WeakMap<Store, Map<string, Promise<unknown>>> };

/** The call in flight under `key` if there is one, else `make()`'s, shared until it settles. */
export function sharedCall<T>(store: Store, key: string, make: () => Promise<T>): Promise<T> {
  const holder = globalThis as Holder;
  const byStore = (holder[KEY] ??= new WeakMap());
  let flights = byStore.get(store);
  if (!flights) {
    flights = new Map();
    byStore.set(store, flights);
  }
  const pending = flights.get(key);
  if (pending) return pending as Promise<T>;
  const inFlight = flights;
  const flight = make().finally(() => inFlight.delete(key));
  inFlight.set(key, flight);
  return flight;
}

/** The first recommendation's call in flight for this intake if there is one, else `make()`'s. */
export function firstRecommendation(store: Store, intakeId: string, make: () => Promise<Recommendation>): Promise<Recommendation> {
  return sharedCall(store, `first:${intakeId}`, make);
}
