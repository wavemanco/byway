/** Demo services: in-memory fakes of the four contracts, wired together as the real ones will be. */
import type { Services } from '../types.ts';
import { createDemoAdvisor } from './advisor.ts';
import { createDemoGateway } from './gateway.ts';
import { createDemoRunner, type DemoRunnerOptions } from './runner.ts';
import { createDemoStore } from './store.ts';

export function createDemoServices(opts: Omit<DemoRunnerOptions, 'store' | 'gateway'> = {}): Services {
  const store = createDemoStore();
  const gateway = createDemoGateway({ store });
  return {
    advisor: createDemoAdvisor(),
    runner: createDemoRunner({ ...opts, store, gateway }),
    store,
    gateway,
    mode: 'demo',
  };
}
