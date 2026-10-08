/**
 * The run's controls and operators through the real workflow, on small recipes and one shared harness: answers and
 * their validation, pause and resume, cancel and failure (withdrawn questions), controls on ended runs, budget, routes,
 * SEED, provenance in the ledger, critic modes (GREAT ranked blind), relay repair, empty cuts, policy caps, keepsVoice.
 */
import { afterAll, beforeAll } from 'vitest';
import { controlScenarios } from './e2e/controls.ts';
import { operatorScenarios } from './e2e/operators.ts';
import { createHarness, type Harness } from './helpers/harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
}, 120_000);
afterAll(async () => {
  await h?.close();
}, 60_000);

controlScenarios(() => h);
operatorScenarios(() => h);
