/**
 * The services seam. Screens and route handlers reach data only through `getServices()`, which returns the four
 * contract interfaces and nothing else but the mode. Anything both the demo and the real services need on top of
 * the contracts (labelling run events by the presentation's stepIds, the cost meter from `cost` events) lives in
 * view code, so Phase 3 can swap @byway/advisor, @byway/runner, @byway/store and @byway/gateway in unchanged.
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
