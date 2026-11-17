/**
 * Only a run this byway started is carried out, and only its answers are recorded (backlog row B-188). Temporal's
 * port answers any program on the computer: one could start a byway workflow, replay one from its history, reset one,
 * or answer a run's checkpoint, the "use more of the budget?" question among them. Here such a program is played by
 * the test's own Temporal client, on the real workflow and worker.
 */
import { MockActivityEnvironment } from '@temporalio/testing';
import { defaultPayloadConverter } from '@temporalio/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withHash } from '@byway/recipe';
import { RESOLVE_UPDATE } from '@byway/contracts';
import { answerSigned, signAnswer } from '../src/answer-check.ts';
import { REFUSED_START_MESSAGE } from '../src/activities/claim.ts';
import { createActivities } from '../src/activities/index.ts';
import { createRunnerClient, ResolutionRejectedError } from '../src/client.ts';
import { createWorker } from '../src/worker.ts';
import { startDigest } from '../src/start-digest.ts';
import { RUN_WORKFLOW, workflowIdFor, type RunInput } from '../src/types.ts';
import { createHarness, HARNESS_ACCESS_KEY, type Harness } from './helpers/harness.ts';
import { tiny } from './helpers/recipes.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
}, 120_000);
afterAll(async () => {
  await h?.close();
}, 60_000);

/** Once a run is waiting for a person: its open checkpoint. */
async function openQuestion(runId: string) {
  await h.waitFor('the run’s question', async () => (await h.runner.view(runId)).checkpoints.some((c) => c.status === 'open'));
  return (await h.runner.view(runId)).checkpoints.find((c) => c.status === 'open')!;
}

/** The input a run's workflow was started with, as any program can read it from Temporal's history. */
async function startedWith(runId: string): Promise<RunInput> {
  const history = await h.env.client.workflow.getHandle(workflowIdFor(runId)).fetchHistory();
  const payload = history.events?.[0]?.workflowExecutionStartedEventAttributes?.input?.payloads?.[0];
  return defaultPayloadConverter.fromPayload(payload!) as RunInput;
}

describe('a workflow started through the port by another program', () => {
  it('replaying a finished run from its history stops before any step: no call is made, and the run stays as it ended', async () => {
    const run = await h.start(tiny);
    const done = await h.drive(run.id, (cp) => ({ checkpointId: cp.id, text: 'warmer, please' }));
    expect(done.run.status).toBe('done');
    const calls = h.ledger(run.id).length;
    const events = done.events.length;
    const input = await startedWith(run.id);
    // Temporal lets a closed workflow id be started again: the replay runs in a new execution.
    const replay = await h.env.client.workflow.start(RUN_WORKFLOW, { taskQueue: h.taskQueue, workflowId: workflowIdFor(run.id), args: [input] });
    await expect(replay.result()).rejects.toThrow();
    const failure = (await replay.describe()).status.name;
    expect(failure).toBe('FAILED');
    expect(h.ledger(run.id)).toHaveLength(calls);
    const after = await h.runner.view(run.id);
    expect(after.run.status).toBe('done');
    expect(after.events).toHaveLength(events);
  }, 120_000);

  it('a workflow for a run byway never created stops at its first step', async () => {
    const run = await h.start(tiny);
    const input = await startedWith(run.id);
    const forged: RunInput = { ...input, runId: `${run.id}-forged` };
    const handle = await h.env.client.workflow.start(RUN_WORKFLOW, { taskQueue: h.taskQueue, workflowId: workflowIdFor(forged.runId), args: [forged] });
    await expect(handle.result()).rejects.toThrow();
    expect(h.ledger(forged.runId)).toHaveLength(0);
    await h.runner.cancel(run.id);
  }, 120_000);

  it('a workflow for a run byway made, not yet claimed, but with any other input, stops at its first step, and the run fails plainly; with its own input it runs', async () => {
    // As if another program read a new run's input from Temporal's history and, before its first step, stopped its
    // workflow and started its own with another recipe, profile, budget or routes.
    const run = await h.start(tiny);
    const own = await startedWith(run.id);
    await h.runner.cancel(run.id);
    const made = async (): Promise<RunInput> => {
      const input: RunInput = { ...own, runId: randomUUID() };
      await h.store.createRun({ id: input.runId, workspaceId: input.workspaceId, recipeId: tiny.id, recipeHash: withHash(tiny).hash!, profileId: input.profileId, title: 'Bound', problem: 'p', medium: input.medium, budgetUsd: input.budgetUsd, status: 'queued', startDigest: startDigest(input) });
      return input;
    };
    for (const change of [{ profileId: 'best' }, { routes: { any: 'other' } }, { budgetUsd: own.budgetUsd + 1 }]) {
      const input = await made();
      const handle = await h.env.client.workflow.start(RUN_WORKFLOW, { taskQueue: h.taskQueue, workflowId: workflowIdFor(input.runId), args: [{ ...input, ...change }] });
      await expect(handle.result()).rejects.toThrow();
      expect(await h.store.runClaim(input.runId)).toBeUndefined();
      expect(h.ledger(input.runId)).toHaveLength(0);
      // Its own workflow refused, the run could never start: it says so now, not at the next lost-run pass.
      expect(await h.store.getRun(input.runId)).toMatchObject({ status: 'failed', error: REFUSED_START_MESSAGE });
    }
    // Under a workflow id of another program's choosing, the refusal leaves the run alone, and its own input runs it.
    const input = await made();
    const elsewhere = await h.env.client.workflow.start(RUN_WORKFLOW, { taskQueue: h.taskQueue, workflowId: `${workflowIdFor(input.runId)}-elsewhere`, args: [{ ...input, profileId: 'best' }] });
    await expect(elsewhere.result()).rejects.toThrow();
    expect((await h.store.getRun(input.runId))?.status).toBe('queued');
    await h.env.client.workflow.start(RUN_WORKFLOW, { taskQueue: h.taskQueue, workflowId: workflowIdFor(input.runId), args: [input] });
    await openQuestion(input.runId);
    expect(await h.store.runClaim(input.runId)).toEqual(expect.any(String));
    await h.runner.cancel(input.runId);
  }, 240_000);
});

describe("a checkpoint's answer", () => {
  it('is recorded only with byway’s signature: an answer sent through the port is refused, and the question stays open', async () => {
    const run = await h.start(tiny);
    const cp = await openQuestion(run.id);
    const handle = h.env.client.workflow.getHandle(workflowIdFor(run.id));
    await expect(handle.executeUpdate(RESOLVE_UPDATE, { args: [{ checkpointId: cp.id, text: 'from another program' }] })).rejects.toThrow();
    // Signed, but for what another answer says: refused too.
    const signedForOther = signAnswer(HARNESS_ACCESS_KEY, run.id, { checkpointId: cp.id, text: 'what byway sent' });
    await expect(handle.executeUpdate(RESOLVE_UPDATE, { args: [{ checkpointId: cp.id, text: 'changed', signature: signedForOther }] })).rejects.toThrow();
    expect((await h.store.getCheckpoint(cp.id))?.status).toBe('open');
    // byway's own client signs, and its answer is recorded.
    await h.runner.resolve({ checkpointId: cp.id, text: 'from byway' });
    expect((await h.store.getCheckpoint(cp.id))?.status).toBe('resolved');
    await h.runner.cancel(run.id);
  }, 120_000);

  it('is recorded only as it was signed, and a worker without this start’s key records none', async () => {
    const run = await h.start(tiny);
    const cp = await openQuestion(run.id);
    const inWorker = new MockActivityEnvironment({ workflowExecution: { workflowId: workflowIdFor(run.id), runId: (await h.store.runClaim(run.id))! } } as never);
    const call = { stepId: 'react', attempt: 1 } as never;
    const signed = { checkpointId: cp.id, text: 'what byway sent', signature: signAnswer(HARNESS_ACCESS_KEY, run.id, { checkpointId: cp.id, text: 'what byway sent' }) };
    // The signed answer with another resolution beside it: what would be written is not what was signed.
    const keyed = createActivities({ gateway: h.gateway, store: h.store, prompts: h.prompts, pages: h.pages, accessKey: HARNESS_ACCESS_KEY });
    await expect(inWorker.run(keyed.recordResolution, { runId: run.id, call, resolution: { checkpointId: cp.id, text: 'something else' }, answer: signed })).rejects.toThrow(/not sent by byway/);
    // A worker with no key refuses even a signed answer.
    const keyless = createActivities({ gateway: h.gateway, store: h.store, prompts: h.prompts, pages: h.pages });
    await expect(inWorker.run(keyless.recordResolution, { runId: run.id, call, resolution: { checkpointId: cp.id, text: 'what byway sent' }, answer: signed })).rejects.toThrow(/not sent by byway/);
    expect((await h.store.getCheckpoint(cp.id))?.status).toBe('open');
    await h.runner.cancel(run.id);
  }, 120_000);

  it('recorded before a restart, it counts as recorded when Temporal tries it again under the next start’s key', async () => {
    // byway stopped hard after an attempt wrote the answer and before Temporal heard of it; the retry runs on the next
    // start's worker, whose key is new (B-188's re-check).
    const run = await h.start(tiny);
    const cp = await openQuestion(run.id);
    const inWorker = new MockActivityEnvironment({ workflowExecution: { workflowId: workflowIdFor(run.id), runId: (await h.store.runClaim(run.id))! } } as never);
    const call = { stepId: 'react', attempt: 1 } as never;
    const resolution = { checkpointId: cp.id, text: 'what the person said' };
    const signedBefore = { ...resolution, signature: signAnswer(HARNESS_ACCESS_KEY, run.id, resolution) };
    const nextStart = createActivities({ gateway: h.gateway, store: h.store, prompts: h.prompts, pages: h.pages, accessKey: 'n'.repeat(43) });
    await h.store.resolveCheckpoint(resolution);
    await expect(inWorker.run(nextStart.recordResolution, { runId: run.id, call, resolution, answer: signedBefore })).resolves.toBeUndefined();
    // Anything other than what was recorded is still refused.
    const other = { checkpointId: cp.id, text: 'something else' };
    await expect(inWorker.run(nextStart.recordResolution, { runId: run.id, call, resolution: other, answer: { ...other, signature: signAnswer(HARNESS_ACCESS_KEY, run.id, other) } })).rejects.toThrow(/not sent by byway/);
    expect((await h.store.getCheckpoint(cp.id))?.resolution).toEqual(resolution);
    await h.runner.cancel(run.id);
  }, 120_000);

  it('refused, it reaches the person as byway’s own words, not the engine’s', async () => {
    const run = await h.start(tiny);
    const cp = await openQuestion(run.id);
    const otherKey = createRunnerClient({ client: h.env.client, store: h.store, taskQueue: h.taskQueue, accessKey: 'o'.repeat(43) });
    const refused = await otherKey.resolve({ checkpointId: cp.id, text: 'signed with another key' }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(ResolutionRejectedError);
    expect((refused as Error).message).toMatch(/This answer was not sent by byway/);
    expect((await h.store.getCheckpoint(cp.id))?.status).toBe('open');
    await h.runner.cancel(run.id);
  }, 120_000);

  it('a worker without this start’s key does not start', async () => {
    for (const accessKey of ['', 'short']) {
      await expect(createWorker({ connection: h.env.nativeConnection, taskQueue: `no-key-${randomUUID()}`, gateway: h.gateway, store: h.store, prompts: h.prompts, pages: h.pages, workflowsPath: h.workflowsPath, accessKey })).rejects.toThrow(/access key/);
    }
  });

  it("signs the run, the checkpoint and what the answer says, in constant time", () => {
    const r = { checkpointId: 'cp-1', choice: ['A'] };
    const signature = signAnswer('k'.repeat(40), 'run-1', r);
    expect(answerSigned('k'.repeat(40), 'run-1', { ...r, signature })).toBe(true);
    expect(answerSigned('k'.repeat(40), 'run-2', { ...r, signature })).toBe(false);
    expect(answerSigned('k'.repeat(40), 'run-1', { checkpointId: 'cp-2', choice: ['A'], signature })).toBe(false);
    expect(answerSigned('k'.repeat(40), 'run-1', { checkpointId: 'cp-1', choice: ['B'], signature })).toBe(false);
    expect(answerSigned('j'.repeat(40), 'run-1', { ...r, signature })).toBe(false);
    expect(answerSigned('k'.repeat(40), 'run-1', r)).toBe(false);
  });
});

describe('every step after the claim', () => {
  it('runs only in the execution that claimed the run, so a reset or another execution stops before it does anything', async () => {
    const run = await h.start(tiny);
    await openQuestion(run.id);
    const acts = createActivities({ gateway: h.gateway, store: h.store, prompts: h.prompts, pages: h.pages });
    const other = new MockActivityEnvironment({ workflowExecution: { workflowId: workflowIdFor(run.id), runId: 'another-execution' } } as never);
    await expect(other.run(acts.setRunStatus, { runId: run.id, status: 'paused' as const })).rejects.toThrow(/not started by this byway/);
    await expect(other.run(acts.claimRun, await startedWith(run.id))).rejects.toThrow(/not started by this byway/);
    expect((await h.store.getRun(run.id))?.status).not.toBe('paused');
    await h.runner.cancel(run.id);
  }, 120_000);
});
