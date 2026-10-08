/**
 * What the activities are built from. Everything with I/O is injected, so tests run the real workflow against the
 * gateway's demo mode, a temp store and a fake prompt renderer, with no network and no keys.
 */
import type { Gateway, PromptRenderer, Store } from '@byway/contracts';
import type { PageRenderer } from '../pages.ts';

export interface RunnerDeps {
  gateway: Gateway;
  store: Store;
  /** The prompt templates (@byway/prompts in the product; a fake in tests). */
  prompts: PromptRenderer;
  /** Full-page screenshots of web pages. Defaults to Playwright Chromium (spec §3.2 RENDER). */
  pages?: PageRenderer;
  /** Plain step labels for step-started events. Defaults to the catalog presentations, then the block or role. */
  labelFor?: (recipeId: string, stepId: string) => string | undefined;
  /** The random SEED string (spec §3.3 "SEED in the product"). Defaults to crypto.randomBytes. */
  seed?: () => string;
  /** Uniform [0, 1) for the critic's shuffled reference positions. Defaults to draws from a random salt memoized per step call, so a retry shuffles alike. */
  random?: () => number;
  /** Aborted when Temporal cancels the running activity invocation (set per invocation by createActivities). */
  signal?: AbortSignal;
}
