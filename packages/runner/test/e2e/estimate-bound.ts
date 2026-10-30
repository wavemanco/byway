/**
 * The advisor's estimate held to what the engine runs (B-152, the ponytail audit's RECIPES-5): each protocol
 * configuration end to end on the demo gateway, once answered the cheapest way a run can go (every optional declined,
 * every loop's work taken at its first chance) and once the dearest way the estimate counts (every optional taken,
 * every loop a person ends run to its planned cap, every gate's question answered to go on), with the completions the
 * gateway answered counted against the estimate's model calls for the same recipe and profile. The estimate does not
 * count a cap raised by a person's No (ADR-0073, ADR-0093), so neither script raises one.
 *
 * Where the estimate is known to differ from the engine, the case is marked failing with the backlog row that holds
 * the difference (KNOWN), so the day a fix lands it fails here and is turned back into a plain case. None is known since
 * the estimate fixes of 2026-10-30 (B-149, B-150, B-151, B-153, B-154, and a loop's low end counted as one round): the
 * mock's critics never fail C5's launch gate, so the advisor's estimate.test.ts holds B-149's and B-150's cases.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { estimateRecipe } from '@byway/advisor';
import { c1, c2, c3, c4, c5, c6, c6a, c7 } from '@byway/catalog';
import type { CheckpointRecord, StartRunInput } from '@byway/contracts';
import { DEMO_PROFILE_ID, PROFILES } from '@byway/gateway';
import type { Recipe } from '@byway/recipe';
import { BEST_SO_FAR_PROMPT, FINAL_CHOICE_PROMPT, GATE_FAILED_PROMPT, NOT_CONVERGING_PROMPT, READY_PROMPT } from '../../src/workflow/wording.ts';
import { AUTHOR_DRAFT, type Answer, type Harness } from '../helpers/harness.ts';

let h: Harness;

type Script = 'cheapest' | 'dearest';

const isOptional = (cp: CheckpointRecord) => cp.kind === 'confirm' && cp.prompt.startsWith('Run this step');
const isHumanCap = (cp: CheckpointRecord) => cp.kind === 'confirm' && cp.prompt.startsWith('That was the last planned round.');

/** The answers of each script; anything else takes the harness's default answer. */
const answers =
  (script: Script): Answer =>
  (cp) => {
    const yes = (approved: boolean) => ({ checkpointId: cp.id, approved });
    if (isOptional(cp)) return yes(script === 'dearest');
    // A person's loop: ready at once, or No to every round until the cap, whose question then keeps the version.
    if (cp.prompt === READY_PROMPT) return yes(script === 'cheapest');
    if (isHumanCap(cp)) return yes(true);
    if (cp.prompt === FINAL_CHOICE_PROMPT) return { checkpointId: cp.id, choice: ['use'] };
    // A critic or check loop at its cap keeps the best version; it stops when the critique is not improving the work,
    // or goes on; a failed gate's work is used.
    if (cp.prompt === BEST_SO_FAR_PROMPT || cp.prompt === GATE_FAILED_PROMPT) return yes(true);
    if (cp.prompt === NOT_CONVERGING_PROMPT) return yes(script === 'dearest');
    return undefined;
  };

/** Each configuration with what it is started with. */
const CONFIGS: [Recipe, Partial<Omit<StartRunInput, 'recipe' | 'workspaceId'>>][] = [
  [c1, {}],
  [c2, { problem: { text: 'Positioning options for a bike repair subscription' } }],
  [c3, { problem: { text: 'A newsletter piece on teaching fractions with recipes' }, inputs: { draft: AUTHOR_DRAFT } }],
  [c4, { problem: { text: 'A status memo for leadership on the billing migration, 3 weeks in' } }],
  [c5, { problem: { text: 'A 30-second video ad for trail running shoes' } }],
  [c6, { problem: { text: 'A personal statement for a nursing programme' } }],
  [c6a, { problem: { text: 'A short story about a lighthouse keeper who counts boats' }, inputs: { draft: AUTHOR_DRAFT } }],
  [c7, { problem: { text: 'Trim this agent-written refactor of the invoice formatter' } }],
];

/** The cases where the estimate is known to differ from the engine, by the backlog row that holds the difference. */
const KNOWN: Partial<Record<string, string>> = {};

/** The demo profile, as the harness's runs use it: the mock makes images and clips. */
const demo = PROFILES.find((p) => p.id === DEMO_PROFILE_ID)!;

export function estimateBoundScenarios(use: () => Harness): void {
  beforeAll(() => {
    h = use();
  });

  describe("the estimate's model calls hold what a run makes (B-152)", () => {
    for (const [recipe, opts] of CONFIGS) {
      for (const script of ['cheapest', 'dearest'] as const) {
        const known = KNOWN[`${recipe.id} ${script}`];
        (known ? it.fails : it)(
          `${recipe.id}, answered the ${script} way: the completions are within the estimate's range${known ? ` (known difference: ${known})` : ''}`,
          async () => {
            const run = await h.start(recipe, opts);
            const view = await h.drive(run.id, answers(script), 300_000);
            expect(view.run.status, view.run.error).toBe('done');
            const made = h.succeeded(run.id).filter((c) => c.kind === 'complete').length;
            const { modelCalls } = estimateRecipe(recipe, { profile: demo, images: true, video: true, otherFamily: true, at: new Date() });
            const said = `${recipe.id}: ${made} completions, estimate ${modelCalls.low}–${modelCalls.high}`;
            expect(made, said).toBeGreaterThanOrEqual(modelCalls.low);
            expect(made, said).toBeLessThanOrEqual(modelCalls.high);
          },
          360_000,
        );
      }
    }
  });
}
