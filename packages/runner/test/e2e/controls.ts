/**
 * The run's controls through the real workflow: human checkpoints and their validation, pause and resume, cancel
 * (also while paused), budget refusals, routes, SEED and GREAT-mode critics.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { CompletionRequest, RunEvent } from '@byway/contracts';
import { RESOLVE_UPDATE } from '@byway/contracts';
import { DEFAULT_RESPONDERS } from '@byway/gateway';
import { OK_FALLBACK_NOTE } from '../../src/activities/critic.ts';
import { sectionOf } from '../../src/parse.ts';
import { ResolutionRejectedError } from '../../src/client.ts';
import { workflowIdFor } from '../../src/types.ts';
import { launchFailure } from '../../src/pages.ts';
import { fakeHash } from '../helpers/fake-prompts.ts';
import type { Harness } from '../helpers/harness.ts';
import { judged, routed, seeded, threePages, tiny, twoAuthors } from '../helpers/recipes.ts';

let h: Harness;

const types = (events: RunEvent[]) => events.map((e) => e.type);
const openCheckpoint = (runId: string) => h.waitFor('an open checkpoint', async () => (await h.store.checkpointsForRun(runId)).find((c) => c.status === 'open'));
const statusIs = (runId: string, status: string) => h.waitFor(`status ${status}`, async () => (await h.store.getRun(runId))?.status === status);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Registers these scenarios on the test file's shared harness (one Temporal server and worker per file). */
export function controlScenarios(use: () => Harness): void {
  beforeAll(() => {
    h = use();
  });

  describe('a run from start to finish', () => {
    it('starts with a queued RunRecord, then runs the steps, waits for a person and ends with the output', async () => {
      const run = await h.start(tiny, { budgetUsd: 12 });
      expect(run).toMatchObject({ recipeId: 'tiny', recipeHash: tiny.hash, medium: 'prose', budgetUsd: 12, status: 'queued' });
      expect(run.title).toMatch(/^A landing page for a neighborhood bakery/);
      const cp = await openCheckpoint(run.id);
      expect(cp).toMatchObject({ kind: 'react', stepId: 'react' });
      await statusIs(run.id, 'waiting');
      const view = await h.drive(run.id);
      expect(view.run.status).toBe('done');
      expect(view.run.outputArtifactId).toMatch(/^sha256:/);
      const ev = types(view.events);
      expect(ev[0]).toBe('run-started');
      expect(ev.at(-1)).toBe('run-finished');
      expect(ev).toContain('checkpoint-opened');
      expect(ev).toContain('checkpoint-resolved');
      expect(view.events.filter((e) => e.type === 'step-started').map((e) => e.stepId)).toEqual(['draft', 'react', 'revise']);
      const finished = view.events.find((e) => e.type === 'run-finished')!;
      expect(finished.data.outputArtifactId).toBe(view.run.outputArtifactId);
      // The fix saw the person's reaction.
      expect(h.prompts.calls.find((c) => c.id === 'product.test.revise')?.slots.taste).toBe('Warmer and plainer, please; avoid jargon.');
      expect(view.run.costUsd).toBeGreaterThan(0);
    }, 60_000);
  });

  describe('starting a run', () => {
    it('refuses a recipe that does not parse, before any run exists', async () => {
      const before = (await h.store.listRuns(h.workspaceId)).length;
      const broken = { ...tiny, stages: [{ stage: 'D1', body: { op: 'step', id: 'x' } }] } as unknown as typeof tiny;
      await expect(h.start(broken)).rejects.toThrow();
      expect((await h.store.listRuns(h.workspaceId)).length).toBe(before);
    }, 30_000);
  });

  describe('checkpoint answers', () => {
    it('refuses a mismatched answer and a stale one, in the workflow’s own words', async () => {
      const run = await h.start(tiny);
      const cp = await openCheckpoint(run.id);
      // A react checkpoint needs text, not a choice: the Update's validator refuses it and the checkpoint stays open.
      await expect(h.runner.resolve({ checkpointId: cp.id, choice: ['A'] })).rejects.toThrow(/needs `text`/);
      expect((await h.store.getCheckpoint(cp.id))?.status).toBe('open');
      // Straight to the workflow, past the client's store check: an unknown checkpoint is refused.
      const handle = h.env.client.workflow.getHandle(workflowIdFor(run.id));
      await expect(handle.executeUpdate(RESOLVE_UPDATE, { args: [{ checkpointId: `${run.id}/cp99-nope`, text: 'x' }] })).rejects.toThrow();
      await h.runner.resolve({ checkpointId: cp.id, text: 'Shorter.' });
      // Answered: the store and the workflow both refuse it again.
      await expect(h.runner.resolve({ checkpointId: cp.id, text: 'Again.' })).rejects.toBeInstanceOf(ResolutionRejectedError);
      await expect(handle.executeUpdate(RESOLVE_UPDATE, { args: [{ checkpointId: cp.id, text: 'Again.' }] })).rejects.toThrow();
      const view = await h.drive(run.id);
      expect(view.run.status).toBe('done');
      expect(view.checkpoints[0]?.resolution).toEqual({ checkpointId: cp.id, text: 'Shorter.' });
    }, 60_000);

    it('records the resolution in the store before resolve returns', async () => {
      const run = await h.start(tiny);
      const cp = await openCheckpoint(run.id);
      await h.runner.resolve({ checkpointId: cp.id, text: 'Fine.' });
      expect((await h.store.getCheckpoint(cp.id))?.status).toBe('resolved');
      expect((await h.store.events(run.id)).some((e) => e.type === 'checkpoint-resolved' && e.data.checkpointId === cp.id)).toBe(true);
      await h.drive(run.id);
    }, 60_000);

    it('a pick must choose exactly k of the options shown', async () => {
      const run = await h.start(threePages);
      const cp = await h.waitFor('the pick', async () => (await h.store.checkpointsForRun(run.id)).find((c) => c.kind === 'pick' && c.status === 'open'));
      expect(cp.k).toBe(2);
      expect(cp.options?.map((o) => o.id)).toEqual(['A', 'B', 'C']);
      expect(cp.options?.every((o) => o.artifactId?.startsWith('sha256:'))).toBe(true);
      expect(cp.artifactIds?.length).toBe(3);
      await expect(h.runner.resolve({ checkpointId: cp.id, choice: ['A'] })).rejects.toThrow(/exactly 2/);
      await expect(h.runner.resolve({ checkpointId: cp.id, choice: ['A', 'Z'] })).rejects.toThrow(/unknown options/);
      await h.runner.resolve({ checkpointId: cp.id, choice: ['C', 'A'] });
      const view = await h.drive(run.id);
      expect(view.run.outputArtifactId).toBe(cp.options?.find((o) => o.id === 'C')?.artifactId);
    }, 60_000);
  });

  describe('pause and resume', () => {
    it('lets running candidates finish their step, then pauses; nothing starts until resume', async () => {
      h.pages.hold();
      const run = await h.start(threePages);
      await h.waitFor('three renders in flight', async () => h.pages.waiting() === 3);
      await h.runner.pause(run.id);
      // The renders are still running: the run is not paused yet.
      await pause(300);
      expect((await h.store.getRun(run.id))?.status).toBe('running');
      h.pages.release();
      await statusIs(run.id, 'paused');
      const at = await h.store.events(run.id);
      const paused = at.find((e) => e.type === 'run-paused')!;
      // Every in-flight render finished before the pause took effect, and nothing was logged after it.
      expect(at.filter((e) => e.type === 'step-finished' && e.stepId === 'shot' && e.seq < paused.seq)).toHaveLength(3);
      expect(at.filter((e) => e.seq > paused.seq)).toEqual([]);
      await pause(300);
      expect(await h.store.checkpointsForRun(run.id)).toEqual([]);
      await h.runner.resume(run.id);
      const view = await h.drive(run.id);
      expect(view.run.status).toBe('done');
      const ev = types(view.events);
      expect(ev.indexOf('run-resumed')).toBeGreaterThan(ev.indexOf('run-paused'));
      expect(ev.indexOf('checkpoint-opened')).toBeGreaterThan(ev.indexOf('run-resumed'));
    }, 60_000);

    it('pauses a run that is waiting for a person, and keeps it paused after the answer until resume', async () => {
      const run = await h.start(tiny);
      const cp = await openCheckpoint(run.id);
      await h.runner.pause(run.id);
      await statusIs(run.id, 'paused');
      await h.runner.resolve({ checkpointId: cp.id, text: 'Go on.' });
      await pause(300);
      expect((await h.store.events(run.id)).some((e) => e.type === 'step-started' && e.stepId === 'revise')).toBe(false);
      expect((await h.store.getRun(run.id))?.status).toBe('paused');
      await h.runner.resume(run.id);
      expect((await h.drive(run.id)).run.status).toBe('done');
    }, 60_000);
  });

  describe('cancel', () => {
    it('cancels a paused run, which withdraws its open question; it then takes no answers', async () => {
      const run = await h.start(tiny);
      const cp = await openCheckpoint(run.id);
      await h.runner.pause(run.id);
      await statusIs(run.id, 'paused');
      await h.runner.cancel(run.id);
      const view = await h.drive(run.id);
      expect(view.run.status).toBe('cancelled');
      expect(view.events.at(-1)?.type).toBe('run-cancelled');
      expect(await h.env.client.workflow.getHandle(workflowIdFor(run.id)).result()).toEqual({ status: 'cancelled' });
      expect(view.checkpoints.find((c) => c.id === cp.id)?.status).toBe('withdrawn');
      expect((await h.store.openCheckpoints(h.workspaceId)).some((c) => c.runId === run.id)).toBe(false);
      const late = await h.runner.resolve({ checkpointId: cp.id, text: 'Late.' }).catch((e: unknown) => e);
      expect(late).toBeInstanceOf(ResolutionRejectedError);
      expect((late as Error).message).toMatch(/withdrawn/);
    }, 60_000);

    it('cancels while steps are running, and nothing is logged after "cancelled"', async () => {
      h.pages.hold();
      const run = await h.start(threePages);
      await h.waitFor('renders in flight', async () => h.pages.waiting() === 3);
      await h.runner.cancel(run.id);
      await statusIs(run.id, 'cancelled');
      h.pages.release();
      await pause(500);
      const events = await h.store.events(run.id);
      expect(events.at(-1)?.type).toBe('run-cancelled');
      // Signals to an ended run are harmless.
      await h.runner.pause(run.id);
    }, 60_000);
  });

  describe('failure', () => {
    it('a run that fails withdraws the questions it left open', async () => {
      // The first draft is in; its tidy names a prompt that does not exist, so its branch fails the run while the
      // second draft is still asked for.
      h.prompts.missing.add('product.test.tidy');
      try {
        const run = await h.start(twoAuthors, { problem: { text: 'Fix the rounding bug in the invoice total' } });
        const open = await h.waitFor('both drafts asked for', async () => {
          const cps = (await h.store.checkpointsForRun(run.id)).filter((c) => c.status === 'open');
          return cps.length === 2 && cps;
        });
        const draft = '```diff\n--- a/invoice.ts\n+++ b/invoice.ts\n@@ -1 +1 @@\n-const total = round(sum);\n+const total = roundHalfEven(sum);\n```\n\nWhy: banker\'s rounding.';
        await h.runner.resolve({ checkpointId: open[0]!.id, text: draft });
        const view = await h.drive(run.id, () => 'wait');
        expect(view.run.status).toBe('failed');
        expect(view.run.error).toMatch(/step has no prompt template "product\.test\.tidy"\.$/);
        expect(view.checkpoints.find((c) => c.id === open[0]!.id)?.status).toBe('resolved');
        expect(view.checkpoints.find((c) => c.id === open[1]!.id)?.status).toBe('withdrawn');
        await expect(h.runner.resolve({ checkpointId: open[1]!.id, text: 'Late.' })).rejects.toThrow(/withdrawn/);
      } finally {
        h.prompts.missing.clear();
      }
    }, 60_000);

    it("a draft byway cannot read is asked again with why, starting from what was written; the run goes on (ENG-6)", async () => {
      const run = await h.start(twoAuthors, { problem: { text: 'Fix the rounding bug in the invoice total' } });
      const open = await h.waitFor('both drafts asked for', async () => {
        const cps = (await h.store.checkpointsForRun(run.id)).filter((c) => c.status === 'open');
        return cps.length === 2 && cps;
      });
      await h.runner.resolve({ checkpointId: open[0]!.id, text: 'not a diff at all' });
      const again = await h.waitFor('the draft asked again', async () => (await h.store.checkpointsForRun(run.id)).find((c) => c.status === 'open' && c.id !== open[1]!.id));
      expect(again).toMatchObject({ stepId: 'own-diff', kind: 'write', initialText: 'not a diff at all' });
      expect(again.prompt).toMatch(/^Your draft could not be used as the code-diff: The answer is not a unified diff/);
      expect((await h.store.getRun(run.id))?.status).not.toBe('failed');
      await h.runner.cancel(run.id);
      await statusIs(run.id, 'cancelled');
    }, 60_000);
  });

  describe('controls on runs that are not running', () => {
    it('cancel, pause and resume on a run that has ended do nothing; an unknown run throws', async () => {
      const run = await h.start(tiny);
      const done = await h.drive(run.id);
      expect(done.run.status).toBe('done');
      await h.runner.cancel(run.id);
      await h.runner.pause(run.id);
      await h.runner.resume(run.id);
      const after = await h.runner.view(run.id);
      expect(after.run.status).toBe('done');
      expect(after.events).toEqual(done.events);
      await expect(h.runner.cancel('no-such-run')).rejects.toThrow(/no run/);
      await expect(h.runner.pause('no-such-run')).rejects.toThrow(/no run/);
      await expect(h.runner.view('no-such-run')).rejects.toThrow(/no run/);
    }, 60_000);
  });

  describe('provenance', () => {
    it('names the template behind every completion in the hash-chained ledger', async () => {
      const run = await h.start(tiny);
      await h.drive(run.id);
      const completions = h.ledger(run.id).filter((e) => e.kind === 'completion');
      expect(completions.map((e) => e.prompt?.id)).toEqual(['product.test.draft', 'product.test.revise']);
      for (const e of completions) expect(e.prompt).toEqual({ id: e.prompt!.id, version: 1, hash: fakeHash(e.prompt!.id), fidelity: 'project' });
      expect(await h.gateway.verifyLedger()).toBeNull();
    }, 60_000);
  });

  describe('budget', () => {
    it('asks to raise the budget when a call would exceed it, raises it, and carries on', async () => {
      const run = await h.start(tiny, { budgetUsd: 0.01 });
      const cp = await openCheckpoint(run.id);
      expect(cp).toMatchObject({ kind: 'confirm', stepId: 'draft', prompt: 'Raise the budget by $1?' });
      await statusIs(run.id, 'waiting');
      await h.runner.resolve({ checkpointId: cp.id, approved: true });
      await h.waitFor('the raise', async () => ((await h.store.getRun(run.id))?.budgetUsd ?? 0) > 1);
      expect((await h.store.getRun(run.id))?.budgetUsd).toBeCloseTo(1.01, 5);
      const view = await h.drive(run.id);
      expect(view.run.status).toBe('done');
      expect(view.run.budgetUsd).toBeCloseTo(1.01, 5);
      expect(view.events.filter((e) => e.type === 'step-started' && e.stepId === 'draft')).toHaveLength(1);
      expect(view.events.some((e) => e.type === 'cost' && Math.abs((e.data.budgetUsd as number) - 1.01) < 1e-9)).toBe(true);
    }, 60_000);

    it('fails the run with a plain message when the raise is declined', async () => {
      const run = await h.start(tiny, { budgetUsd: 0.01 });
      const cp = await openCheckpoint(run.id);
      await h.runner.resolve({ checkpointId: cp.id, approved: false });
      const view = await h.drive(run.id);
      expect(view.run.status).toBe('failed');
      expect(view.run.error).toBe('The run stopped at its budget of $0.01, and the budget was not raised.');
      expect(view.events.at(-1)).toMatchObject({ type: 'run-failed', data: { error: view.run.error } });
    }, 60_000);
  });

  describe('routes', () => {
    it('takes a route chosen up front without asking', async () => {
      const run = await h.start(routed, { routes: { who: 'ai' } });
      const view = await h.drive(run.id);
      expect(view.checkpoints).toEqual([]);
      expect(view.events.some((e) => e.type === 'step-started' && e.stepId === 'ai-draft')).toBe(true);
    }, 60_000);

    it('asks with a choose checkpoint otherwise, and follows the answer', async () => {
      const run = await h.start(routed);
      const view = await h.drive(run.id, (cp) => (cp.kind === 'choose' ? { checkpointId: cp.id, choice: ['own'] } : undefined));
      expect(view.checkpoints.map((c) => [c.kind, c.stepId])).toEqual([
        ['choose', 'who'],
        ['write', 'own-draft'],
      ]);
      expect(view.checkpoints[0]?.options?.map((o) => o.id)).toEqual(['ai', 'own']);
      expect(await h.store.artifacts.getText(view.run.outputArtifactId!)).toContain('What the river kept');
    }, 60_000);
  });

  describe('SEED (PR3)', () => {
    it('hands the step a random string, and refuses an answer that writes it into the work', async () => {
      let calls = 0;
      h.responders['seed:prose'] = (ctx) => {
        const seed = /Seed: (\S+?)\. /.exec(ctx.prompt)?.[1] ?? '';
        calls++;
        return calls === 1 ? `\`\`\`markdown\n# Spark\n\nThe code ${seed} became a direction.\n\`\`\`` : '```markdown\n# Spark\n\nA quiet direction, interpreted.\n```';
      };
      try {
        const run = await h.start(seeded);
        const view = await h.drive(run.id);
        expect(view.run.status).toBe('done');
        expect(calls).toBe(2);
        const seed = h.prompts.calls.filter((c) => c.id === 'product.test.spark').at(-1)!.slots.seed!;
        expect(seed).toMatch(/^sd\d+x/);
        const retry = h.succeeded(run.id).filter((c) => c.purpose === 'seed:prose').at(-1)!.request as { messages: { content: { type: string; text?: string }[] }[] };
        expect(retry.messages.at(-1)?.content[0]?.text).toMatch(/never write it into the work/);
        for (const e of view.events.filter((x) => x.type === 'artifact')) {
          expect(await h.store.artifacts.getText(e.data.artifactId as string)).not.toContain(seed);
        }
      } finally {
        delete h.responders['seed:prose'];
      }
    }, 60_000);
  });

  describe('CRITIC modes (ADR-0071)', () => {
    it('falls back to OK mode without three references, and says so', async () => {
      const run = await h.start(judged);
      const view = await h.drive(run.id);
      const finished = view.events.find((e) => e.type === 'step-finished' && e.stepId === 'critic')!;
      expect(finished.data.note).toBe(OK_FALLBACK_NOTE);
      const call = h.prompts.calls.filter((c) => c.id === 'product.test.critic').at(-1)!;
      expect(call.slots.refs).toBe('');
      expect(call.user).not.toMatch(/GREAT/);
    }, 60_000);

    const exemplars = async () => {
      const refs: string[] = [];
      for (const text of ['# Exemplar one\n\nClear ask up top.', '# Exemplar two\n\nOne point, landed.', '# Exemplar three\n\nShort and plain.']) {
        refs.push((await h.store.artifacts.putText(text, 'text/markdown')).id);
      }
      return refs;
    };

    it('runs in GREAT mode with three or more references: a shuffled, blind lineup, ranked whole, with no threshold in sight (ADR-0072)', async () => {
      const run = await h.start(judged, { inputs: { refs: await exemplars() } });
      const view = await h.drive(run.id);
      expect(view.run.status).toBe('done');
      const finished = view.events.find((e) => e.type === 'step-finished' && e.stepId === 'critic')!;
      expect(finished.data.note).toBeUndefined();
      const call = h.prompts.calls.filter((c) => c.id === 'product.test.critic').at(-1)!;
      // The slots of @byway/prompts' greatLineup: nothing says which item is ours.
      expect(call.slots.refs).toBe('3');
      expect(call.slots.labels).toBe('4 items, labelled A–D');
      expect(call.user).toContain('There are 3 references and 1 of ours (4 items, labelled A–D).');
      expect(call.user).not.toMatch(/ours is|\bours:|which is ours/i);
      expect(call.slots.view).toContain('Exemplar one');
      expect(call.slots.artifact).toBeUndefined();
      expect(call.user).not.toMatch(/\b9\/10\b|threshold/i);
      const gw = h.succeeded(run.id).filter((c) => c.purpose === 'critic:prose');
      expect(gw).toHaveLength(1);
      expect(gw[0]!.request).toMatchObject({ tier: 'big' });
      // The critic ranked every label; the note beside the work is our item's own section, found by the runner.
      const answer = (gw[0]!.result as { text: string }).text;
      expect([...(/\nRanking: (.+)$/.exec(answer)?.[1]?.split(', ') ?? [])].sort()).toEqual(['A', 'B', 'C', 'D']);
      const draft = await h.store.artifacts.getText(view.events.find((e) => e.type === 'artifact' && e.stepId === 'draft')!.data.artifactId as string);
      const ours = [...call.slots.view!.matchAll(/^### ([A-D])\n([\s\S]*?)(?=\n### [A-D]\n|$)/gm)].find((m) => m[2]!.includes(draft.split('\n')[0]!))![1]!;
      const note = await h.store.artifacts.getText((finished.data.outputArtifactIds as string[])[0]!);
      expect(note).toBe(`${sectionOf(answer, ours)}\n`);
      expect(note).toMatch(/^- Intent: /);
      expect(note).not.toMatch(/^###/m);
    }, 60_000);

    it('asks once more when the ranking does not name every label exactly once', async () => {
      let n = 0;
      h.responders['critic:prose'] = (ctx) => (++n === 1 ? '### A\n- Fine.\n\nRanking: A, B' : DEFAULT_RESPONDERS.critic!(ctx));
      try {
        const run = await h.start(judged, { inputs: { refs: await exemplars() } });
        const view = await h.drive(run.id);
        expect(view.run.status).toBe('done');
        const gw = h.succeeded(run.id).filter((c) => c.purpose === 'critic:prose');
        expect(gw).toHaveLength(2);
        const retry = (gw[1]!.request as CompletionRequest).messages.at(-1)!.content[0];
        expect(retry?.type === 'text' && retry.text).toMatch(/every label exactly once \(missing C, D\)/);
      } finally {
        delete h.responders['critic:prose'];
      }
    }, 60_000);
  });

  describe('answers that miss their contract', () => {
    it('asks again with a larger output allowance when an answer was cut off', async () => {
      let n = 0;
      h.responders['build:prose'] = () => (++n === 1 ? { text: '```markdown\n# Half a memo\n\nThe migration is', truncated: true } : '```markdown\n# A whole memo\n\nThe migration is on track.\n```');
      try {
        const run = await h.start(tiny);
        const view = await h.drive(run.id);
        expect(view.run.status).toBe('done');
        const builds = h.succeeded(run.id).filter((c) => c.purpose === 'build:prose').map((c) => (c.request as { maxOutputTokens?: number }).maxOutputTokens);
        expect(builds).toEqual([16_000, 32_000]);
        const draft = view.events.find((e) => e.type === 'artifact' && e.stepId === 'draft')!;
        expect(await h.store.artifacts.getText(draft.data.artifactId as string)).toContain('A whole memo');
      } finally {
        delete h.responders['build:prose'];
      }
    }, 60_000);

    it('retries once with the problem appended, then fails the step and the run in plain words', async () => {
      h.responders['build:prose'] = () => '';
      try {
        const run = await h.start(tiny);
        const view = await h.drive(run.id);
        expect(view.run.status).toBe('failed');
        expect(view.run.error).toMatch(/^The Draft step's answer could not be used after a retry: The answer is empty/);
        expect(view.events.find((e) => e.type === 'step-failed')).toMatchObject({ stepId: 'draft', data: { retryable: false } });
        expect(h.succeeded(run.id).filter((c) => c.purpose === 'build:prose')).toHaveLength(2);
      } finally {
        delete h.responders['build:prose'];
      }
    }, 60_000);

    it('fails the run plainly when a step names a prompt that does not exist', async () => {
      h.prompts.missing.add('product.test.draft');
      try {
        const run = await h.start(tiny);
        const view = await h.drive(run.id);
        expect(view.run.status).toBe('failed');
        expect(view.run.error).toBe('The Draft step has no prompt template "product.test.draft".');
      } finally {
        h.prompts.missing.clear();
      }
    }, 60_000);

    it('fails a web-page run whose page renderer cannot start before any step or AI call, in the renderer’s words (F18)', async () => {
      const unavailable = launchFailure(new Error("browserType.launch: Executable doesn't exist at /pw/chrome-headless-shell"));
      h.pages.failReady(unavailable);
      try {
        const run = await h.start(threePages);
        const view = await h.drive(run.id);
        expect(view.run.status).toBe('failed');
        expect(view.run.error).toBe(unavailable.message);
        expect(types(view.events)).not.toContain('step-started');
        expect(h.calls.filter((c) => c.runId === run.id)).toEqual([]);
      } finally {
        h.pages.failReady(undefined);
      }
    }, 60_000);
  });

  describe('determinism', () => {
    it('replays recorded histories of concurrent and interactive runs without a mismatch', async () => {
      const { Worker } = await import('@temporalio/worker');
      const { buildWorkflows } = await import('../../src/build.ts');
      const runs = [await h.start(threePages), await h.start(tiny)];
      for (const run of runs) await h.drive(run.id);
      const { DEFAULT_WORKFLOWS_BUNDLE } = await import('../../src/build.ts');
      const workflowsPath = await buildWorkflows({ outfile: DEFAULT_WORKFLOWS_BUNDLE.replace(/workflows.js$/, `replay-${process.pid}.js`) });
      for (const run of runs) {
        const history = await h.env.client.workflow.getHandle(workflowIdFor(run.id)).fetchHistory();
        await Worker.runReplayHistory({ workflowsPath }, history, workflowIdFor(run.id));
      }
      const { rmSync } = await import('node:fs');
      rmSync(workflowsPath, { force: true });
    }, 120_000);
  });
}
