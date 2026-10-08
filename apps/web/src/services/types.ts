/**
 * The services seam. Screens and route handlers reach data only through `getContext()` / `getServices()`, which return
 * the four contract interfaces and nothing else but the mode. Anything on top of the contracts (labelling run events by
 * the presentation's stepIds, the cost meter from `cost` events) lives in view code, so the screens depend on the
 * contracts alone; tests run them against the real packages with a fake Runner.
 */
import type { Advisor, Gateway, Runner, Store } from '@byway/contracts';

export interface Services {
  advisor: Advisor;
  runner: Runner;
  store: Store;
  gateway: Gateway;
  /** 'demo' while the mock provider answers every call (no keys, or demo mode on). */
  mode: 'demo' | 'live';
}
