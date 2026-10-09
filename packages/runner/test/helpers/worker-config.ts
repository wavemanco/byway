/**
 * How the e2e harness's workers are set up, shared by the harness (in this process) and a worker it starts as a process
 * of its own (worker-process.ts), so both run the same profiles, prices and gateways: the real gateway in demo mode (the
 * mock provider, no keys, no network) beside one that a placeholder key takes out of demo mode, each over its ledger.
 */
import path from 'node:path';
import type { ModelProfile, ProviderId, SpendBook } from '@byway/contracts';
import { createGateway, memorySpendBook, PRICES, PROFILES, type ModelGateway, type PriceRow, type ProviderAdapter, type Responder } from '@byway/gateway';
import { storeCaps } from '../../src/caps.ts';
import type { MemoStore } from './memo.ts';

/**
 * A stand-in for "a provider key is configured", so the gateway leaves demo mode (contracts v4: demo means forced or no
 * key at all). Not a key: only mock-backed profiles run in these tests, so it is never sent anywhere.
 */
export const PLACEHOLDER_KEY_ENV = { ANTHROPIC_API_KEY: 'placeholder-not-a-key' };

/** A demo profile with no video model: with keys present, C5 relay links finish as skipped (ADR-0069). */
export const NO_VIDEO_PROFILE: ModelProfile = {
  id: 'demo-novideo',
  label: 'Demo without video',
  tiers: { big: { provider: 'mock', model: 'mock-big' }, mid: { provider: 'mock', model: 'mock-mid' } },
  image: { provider: 'mock', model: 'mock-image' },
};

/** Mock text models with a small price, so costs, cost events and budgets are exercised (the real mock is free). */
export const PRICED: PriceRow[] = [
  ...PRICES.filter((p) => !(p.provider === 'mock' && (p.model === 'mock-big' || p.model === 'mock-mid'))),
  { provider: 'mock', model: 'mock-big', inputPerMTok: 0.1, outputPerMTok: 1, source: 'runner tests' },
  { provider: 'mock', model: 'mock-mid', inputPerMTok: 0.1, outputPerMTok: 1, source: 'runner tests' },
];

export interface TestGatewaysOptions {
  dir: string;
  /** The worker's store: its artifacts, its caps, and (with book 'store') its spend book. */
  store: MemoStore;
  /**
   * 'memory' (the default): each of the two ledgers has its own book in memory (one book reads one audit file).
   * 'store': both gateways share the store's book in byway.sqlite and one ledger, as production's processes do, so
   * another worker on the data directory sees their calls (stage 3's restart and kill tests).
   */
  book?: 'memory' | 'store';
  responders?: Readonly<Record<string, Responder>>;
  /** Provider adapters to use in place of the built-in ones (the relay board's mock). */
  adapters?: Partial<Record<ProviderId, ProviderAdapter>>;
  leaseMs?: number;
  renewEveryMs?: number;
}

export interface TestGateways {
  demo: ModelGateway;
  keyed: ModelGateway;
  ledgers: { demo: string; keyed: string };
}

export function testGateways(opts: TestGatewaysOptions): TestGateways {
  const shared = opts.book === 'store';
  const ledgers = { demo: path.join(opts.dir, 'ledger.jsonl'), keyed: path.join(opts.dir, shared ? 'ledger.jsonl' : 'ledger-keyed.jsonl') };
  const make = (keyed: boolean, book: SpendBook): ModelGateway =>
    createGateway({
      ledgerPath: keyed ? ledgers.keyed : ledgers.demo,
      spendBook: book,
      artifacts: opts.store.artifacts,
      caps: storeCaps(opts.store),
      demo: !keyed,
      env: keyed ? { ...PLACEHOLDER_KEY_ENV } : {},
      ...(opts.responders ? { mockResponders: opts.responders } : {}),
      ...(opts.adapters ? { adapters: opts.adapters } : {}),
      profiles: [...PROFILES, NO_VIDEO_PROFILE],
      prices: PRICED,
      retry: { maxAttempts: 1 },
      ...(opts.leaseMs !== undefined ? { leaseMs: opts.leaseMs } : {}),
      ...(opts.renewEveryMs !== undefined ? { renewEveryMs: opts.renewEveryMs } : {}),
    });
  return {
    demo: make(false, shared ? opts.store.spendBook : memorySpendBook()),
    keyed: make(true, shared ? opts.store.spendBook : memorySpendBook()),
    ledgers,
  };
}
