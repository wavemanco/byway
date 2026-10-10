/**
 * A loop a person holds ends only on their answer (F20, ADR-0093), end to end through the real workflow: C6a's author
 * loop with a cap of two rounds, so its cap is reached in a test. Before, its last round ended the loop as if the
 * person had said it was ready. Now the last planned round asks the cap's question; No allows the planned rounds
 * again, once; at the raised cap the person keeps this version or stops the run, which ends it cancelled. Cancel while
 * the cap question is open ends it cancelled too.
 *
 * And the engine's own refusal at workflow start (F02, ADR-0092): a workflow started with a recipe past the engine's
 * limits, past Runner.start (which refuses it first), ends failed before the run begins, instead of wedging.
 */
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { c6a } from '@byway/catalog';
import { walk, withHash, type Recipe } from '@byway/recipe';
import { RUN_WORKFLOW, workflowIdFor, type RunInput } from '../../src/types.ts';
import { FINAL_CHOICE_PROMPT, READY_PROMPT, STOPPED_AT_CAP } from '../../src/workflow/wording.ts';
import { checkEvents, ofType } from '../helpers/events.ts';
import { AUTHOR_DRAFT, type Answer, type Harness } from '../helpers/harness.ts';

let h: Harness;

/** C6a with its author loop capped at two rounds. */
function smallC6a(): Recipe {
  const r = structuredClone(c6a);
  walk(r, (n) => {
    if (n.op === 'loop' && n.id === 'author-loop') n.gate.max = 2;
  });
  return withHash(r);
}

const isCap = (prompt: string) => prompt.startsWith('That was the last planned round.');

/** No to every "Is this ready?" and to the cap question, then `last` at the final choice. */
const authorAnswers =
  (last: 'use' | 'stop'): Answer =>
  (cp) => {
    if (cp.stepId === 'pick-card') return { checkpointId: cp.id, choice: ['C'] };
    if (cp.stepId !== 'author-loop') return undefined;
    if (cp.prompt === READY_PROMPT || isCap(cp.prompt)) return { checkpointId: cp.id, approved: false };
    if (cp.kind === 'choose') return { checkpointId: cp.id, choice: [last] };
    return undefined;
  };

export function loopCapScenarios(use: () => Harness): void {
  beforeAll(() => {
    h = use();
  });

  describe("a loop a person holds, at its cap (C6a's author loop, two rounds)", () => {
    it('asks at the last round; No raises it once; at the raised cap you keep this version, and the run goes on', async () => {
      const run = await h.start(smallC6a(), { problem: { text: 'A short story about a lighthouse keeper who counts boats' }, inputs: { draft: AUTHOR_DRAFT } });
      const view = await h.drive(run.id, authorAnswers('use'));
      expect(view.run.status).toBe('done');
      checkEvents(view, 'c6a');
      const asked = view.checkpoints.filter((c) => c.stepId === 'author-loop').map((c) => (c.prompt === READY_PROMPT ? 'READY' : isCap(c.prompt) ? 'CAP' : c.kind === 'choose' ? 'CHOICE' : c.prompt));
      expect(asked).toEqual(['READY', 'CAP', 'READY', 'CHOICE']);
      const cap = view.checkpoints.find((c) => c.stepId === 'author-loop' && isCap(c.prompt))!;
      expect(cap.prompt).toBe('That was the last planned round. Use this version? No allows up to 2 more rounds, once.');
      // The cap question shows the draft and the round's three readers' notes beside it.
      expect(cap.artifactIds!.length).toBeGreaterThanOrEqual(4);
      const choice = view.checkpoints.find((c) => c.stepId === 'author-loop' && c.kind === 'choose')!;
      expect(choice.prompt).toBe(FINAL_CHOICE_PROMPT);
      expect(choice.options?.map((o) => o.label)).toEqual(['Use this version', 'Stop the run']);
      expect(ofType(view, 'loop-iteration', 'author-loop').map((e) => [e.data.iteration, e.data.max])).toEqual([
        [1, 2],
        [2, 2],
        [3, 4],
        [4, 4],
      ]);
      expect(view.checkpoints.filter((c) => c.stepId === 'write')).toHaveLength(4);
    }, 120_000);

    it("'Stop the run' at the last choice ends the run cancelled: you stopped it, nothing failed", async () => {
      const run = await h.start(smallC6a(), { problem: { text: 'A short story about a lighthouse keeper who counts boats' }, inputs: { draft: AUTHOR_DRAFT } });
      const view = await h.drive(run.id, authorAnswers('stop'));
      expect(view.run.status).toBe('cancelled');
      expect(view.run.error).toBeUndefined();
      expect(view.events.at(-1)?.type).toBe('run-cancelled');
      expect(await h.env.client.workflow.getHandle(workflowIdFor(run.id)).result()).toEqual({ status: 'cancelled' });
      expect(STOPPED_AT_CAP).toMatch(/You stopped the run/);
      // Nothing after the loop ran: no VOICE question was opened.
      expect(view.checkpoints.some((c) => c.stepId === 'voice')).toBe(false);
    }, 120_000);

    it('Cancel while the cap question is open ends the run cancelled and withdraws the question', async () => {
      const run = await h.start(smallC6a(), { problem: { text: 'A short story about a lighthouse keeper who counts boats' }, inputs: { draft: AUTHOR_DRAFT } });
      let cancelled = false;
      const view = await h.drive(run.id, (cp) => {
        if (cp.stepId === 'author-loop' && isCap(cp.prompt)) {
          if (!cancelled) {
            cancelled = true;
            void h.runner.cancel(run.id);
          }
          return 'wait';
        }
        return authorAnswers('use')(cp);
      });
      expect(cancelled).toBe(true);
      expect(view.run.status).toBe('cancelled');
      expect(view.checkpoints.find((c) => isCap(c.prompt))?.status).toBe('withdrawn');
      expect(view.events.at(-1)?.type).toBe('run-cancelled');
    }, 120_000);
  });

  describe("the engine's own refusal at workflow start", () => {
    it('a workflow started with a recipe past the limits ends failed before the run begins, and says why', async () => {
      const recipe = structuredClone(smallC6a());
      walk(recipe, (n) => {
        if (n.op === 'replicate') n.n = 1e9;
      });
      const id = randomUUID();
      await h.store.createRun({ id, workspaceId: h.workspaceId, recipeId: recipe.id, recipeHash: withHash(recipe).hash!, profileId: 'demo', title: 'Too many', problem: 'A story', medium: 'prose', budgetUsd: 5, status: 'queued' });
      const input: RunInput = { runId: id, workspaceId: h.workspaceId, recipe, problem: { text: 'A story' }, profileId: 'demo', budgetUsd: 5, medium: 'prose', routes: {}, inputs: {} };
      await h.env.client.workflow.start(RUN_WORKFLOW, { taskQueue: h.taskQueue, workflowId: workflowIdFor(id), args: [input] });
      const view = await h.drive(id);
      expect(view.run.status).toBe('failed');
      expect(view.run.error).toMatch(/^This recipe cannot run: replicate ".+"'s count is 1000000000; the engine allows at most 500/);
      expect(view.events.some((e) => e.type === 'run-started')).toBe(false);
      expect(view.events.at(-1)?.type).toBe('run-failed');
    }, 120_000);
  });
}
