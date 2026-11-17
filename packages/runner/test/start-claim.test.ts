/**
 * Only a run this byway started is carried out, and only its answers are recorded (backlog row B-188). Temporal's
 * port answers any program on the computer: one could start a byway workflow, replay one from its history, reset one,
 * or answer a run's checkpoint, the "use more of the budget?" question among them. Here such a program is played by
 * the test's own Temporal client, on the real workflow and worker.
 */
import { MockActivityEnvironment } from '@temporalio/testing';
import { defaultPayloadConverter } from '@temporalio/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RESOLVE_UPDATE } from '@byway/contracts';
import { answerSigned, signAnswer } from '../src/answer-check.ts';
import { createActivities } from '../src/activities/index.ts';
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
    expect(input.startToken).toEqual(expect.any(String));
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

  it('a workflow for a run byway never created, or with another token, stops at its first step', async () => {
    const run = await h.start(tiny);
    const input = await startedWith(run.id);
    const forged: RunInput = { ...input, runId: `${run.id}-forged`, startToken: 'guessed' };
    const handle = await h.env.client.workflow.start(RUN_WORKFLOW, { taskQueue: h.taskQueue, workflowId: workflowIdFor(forged.runId), args: [forged] });
    await expect(handle.result()).rejects.toThrow();
    expect(h.ledger(forged.runId)).toHaveLength(0);
    await h.runner.cancel(run.id);
  }, 120_000);
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
    await expect(other.run(acts.claimRun, { runId: run.id, startToken: (await h.store.runStartToken(run.id))! })).rejects.toThrow(/not started by this byway/);
    expect((await h.store.getRun(run.id))?.status).not.toBe('paused');
    await h.runner.cancel(run.id);
  }, 120_000);
});
