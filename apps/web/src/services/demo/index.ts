/** Demo services: in-memory fakes of the four contracts, wired together. */
import type { PreferenceStore, Preferences, Services } from '../types.ts';
import { createDemoAdvisor } from './advisor.ts';
import { createDemoGateway } from './gateway.ts';
import { demoRecipes } from './recipes.ts';
import { createDemoRunner, type DemoRunnerOptions } from './runner.ts';
import { createDemoStore } from './store.ts';

function createPreferences(initial: Preferences): PreferenceStore {
  let current = { ...initial };
  return {
    get: () => ({ ...current }),
    set(patch) {
      current = { ...current, ...patch };
      return { ...current };
    },
  };
}

export function createDemoServices(opts: Omit<DemoRunnerOptions, 'store'> = {}): Services {
  const store = createDemoStore();
  const runner = createDemoRunner({ ...opts, store });
  return {
    advisor: createDemoAdvisor(),
    runner,
    store,
    gateway: createDemoGateway({ store }),
    recipes: demoRecipes,
    controls: runner,
    preferences: createPreferences({ profileId: 'balanced', demoMode: true }),
    mode: 'demo',
  };
}
