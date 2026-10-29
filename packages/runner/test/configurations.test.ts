/**
 * The protocol configurations end to end through the real workflow, worker and Runner client, on one shared harness:
 * the demo gateway (no keys, no network), a temp store, fake prompts and fake page renders. One Temporal server for
 * all of them keeps the suite light enough to run beside the other packages' tests.
 */
import { afterAll, beforeAll } from 'vitest';
import { c1Scenarios } from './e2e/c1.ts';
import { estimateBoundScenarios } from './e2e/estimate-bound.ts';
import { c2c5Scenarios } from './e2e/c2-c5.ts';
import { loopCapScenarios } from './e2e/loop-cap.ts';
import { textMediaScenarios } from './e2e/text-media.ts';
import { createHarness, type Harness } from './helpers/harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
}, 120_000);
afterAll(async () => {
  await h?.close();
}, 60_000);

c1Scenarios(() => h);
c2c5Scenarios(() => h);
textMediaScenarios(() => h);
loopCapScenarios(() => h);
estimateBoundScenarios(() => h);
