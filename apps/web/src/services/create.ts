/**
 * The real services behind the seam (Phase 3): @byway/store in the data directory, @byway/gateway with its ledger
 * there, @byway/prompts, @byway/advisor over the catalog, and a Runner that is a Temporal client of the engine the dev
 * script started. The web process never runs workflows, renders pages or loads esbuild: it uses only the runner's
 * client entry (engine.ts loads the packages).
 *
 * Demo mode can be switched in Settings while the app runs, so the host keeps one gateway (and the advisor over it)
 * per demo setting, created when first needed. Both admit and settle their calls in the store's spend book, which the
 * worker's gateway shares (ADR-0095), so the caps see every process's calls in flight; both write the same
 * hash-chained ledger, which takes a lock for every append. Closing the host closes the gateways first (their lease
 * renewal and outbox timer, and the calls they hold, handed back), then the store. byway's stop closes it
 * (shutdown.ts; ADR-0099), so the web process's calls in flight are handed back at once rather than waiting out their
 * leases (the residual ADR-0095 decision 5 named).
 */
import path from 'node:path';
import type { Advisor, Gateway, PromptRenderer, Runner, Store } from '@byway/contracts';
import type { Env as GatewayEnv } from '@byway/gateway';
import { effectiveMode } from './config.ts';
import type { EngineModules } from './engine.ts';
import { engineRunner } from './engine-runner.ts';
import { stringsIn } from './strings-in.ts';
import type { Services } from './types.ts';

/** The ledger of every model call, beside the database (spec §2 "Data"). */
export const LEDGER_FILENAME = 'ledger.jsonl';

export interface ServiceHostOptions {
  dataDir: string;
  /** `pnpm demo` (BYWAY_DEMO=1): the mock answers every call whatever Settings say. */
  demo: boolean;
  temporalAddress: string;
  /** Where keys are read: process.env in the app. Keys stay in it; nothing here copies them anywhere. */
  env: GatewayEnv;
  /** `.env.agents`, loaded into `env` once (only variables that are not set already). */
  envFile?: string;
  /** Connects the Runner to the engine; tests pass a fake. Defaults to the runner's Temporal client. */
  connect?: (store: Store, address: string) => Promise<Runner>;
}

export interface ServiceHost {
  readonly store: Store;
  readonly prompts: PromptRenderer;
  /** BYWAY_DEMO=1. */
  readonly demoForced: boolean;
  /** The services with the mock forced on (`demo`) or not. */
  services(demo: boolean): Services;
  /**
   * The name of a provider key byway holds that appears anywhere in a request body (any string, property names
   * included), or undefined. Never the value. Routes refuse such a body before storing anything (ADR-0088).
   */
  heldKeyIn(value: unknown): string | undefined;
  close(): Promise<void>;
}

export function createServiceHost(engine: EngineModules, opts: ServiceHostOptions): ServiceHost {
  if (opts.envFile) engine.gateway.loadEnvFile(opts.envFile, opts.env);
  const store = engine.store.createStore({ dataDir: opts.dataDir });
  const prompts = engine.prompts.createPromptRenderer();
  const connect = opts.connect ?? (async (s: Store, address: string) => (await engine.runner.connectRunner({ store: s, address })).runner);
  const runner = engineRunner(store, () => connect(store, opts.temporalAddress));
  const pairs = new Map<boolean, { gateway: Gateway; advisor: Advisor }>();

  const pair = (demo: boolean) => {
    let found = pairs.get(demo);
    if (!found) {
      const gateway = engine.gateway.createGateway({
        ledgerPath: path.join(opts.dataDir, LEDGER_FILENAME),
        artifacts: store.artifacts,
        spendBook: store.spendBook,
        caps: engine.runner.storeCaps(store),
        env: opts.env,
        demo,
      });
      found = { gateway, advisor: engine.advisor.createAdvisor({ gateway, prompts, catalog: engine.catalog }) };
      pairs.set(demo, found);
    }
    return found;
  };

  return {
    store,
    prompts,
    demoForced: opts.demo,
    services(demo: boolean): Services {
      const forced = opts.demo || demo;
      const { gateway, advisor } = pair(forced);
      // Gateway.demo covers a forced mock and an environment with no keys at all; effectiveMode adds the case of keys
      // that make no live profile usable.
      const mode = effectiveMode({ forced: forced || gateway.demo, preference: false, statuses: gateway.profileStatus() });
      return { advisor, runner, store, gateway, mode };
    },
    // An arrow, so routes can pass it on unbound. Reads the environment on every call, as the gateway does.
    heldKeyIn: (value: unknown) => engine.gateway.findHeldKey(opts.env, stringsIn(value)),
    async close() {
      for (const { gateway } of pairs.values()) await gateway.close();
      store.close();
    },
  };
}
