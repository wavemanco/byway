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
import type { QuestionEstimate } from '@byway/advisor';
import type { Advisor, Gateway, PromptRenderer, Runner, Store } from '@byway/contracts';
import type { Env as GatewayEnv } from '@byway/gateway';
import type { Recipe } from '@byway/recipe';
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
  /**
   * What each answer to a run's questions would cost (@byway/advisor estimateQuestions; UX-4 remainder), by the id of
   * the optional or loop that asks it, for a run on `profileId`. Priced as the worker prices that run's calls
   * (runner activities/availability.ts): with the demo profile when this byway's own gateway is in demo mode (`pnpm
   * demo`, or no provider key), else with the run's profile, whatever Settings' demo switch says now, since that switch
   * changes the profile of runs started after it, not the calls of a run under way. Empty when that profile has no
   * status or no price: the figures are only shown, so a run's screen never fails for want of one.
   */
  questionEstimates(recipe: Recipe, profileId: string): Record<string, QuestionEstimate>;
  /**
   * The day byway's prices were last checked (YYYY-MM-DD): the gateway's PRICES_CHECKED, the last full read of its price
   * table, which Settings and the Recommendation's estimated cost show (view/prices.ts; PRICE-CADENCE, block 2). Read
   * here, on the server, so the client components do not import @byway/gateway.
   */
  readonly pricesCheckedOn: string;
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
    // An arrow too, for the same reason.
    questionEstimates: (recipe: Recipe, profileId: string) => {
      // The gateway set up as the worker's is: demo only when `pnpm demo` forced it or no key is set.
      const { gateway } = pair(opts.demo);
      const priced = gateway.demo ? engine.gateway.DEMO_PROFILE_ID : profileId;
      const status = gateway.profileStatus().find((s) => s.profile.id === priced);
      if (!status) return {};
      try {
        return engine.advisor.estimateQuestions(recipe, { profile: status.profile, images: status.images, video: status.video, otherFamily: status.otherFamily, at: new Date() });
      } catch (err) {
        // A model with no price (AdvisorError 'unknown-profile'): no figures, rather than no Run screen.
        if (err instanceof engine.advisor.AdvisorError) return {};
        throw err;
      }
    },
    pricesCheckedOn: engine.gateway.PRICES_CHECKED,
    async close() {
      for (const { gateway } of pairs.values()) await gateway.close();
      store.close();
    },
  };
}
