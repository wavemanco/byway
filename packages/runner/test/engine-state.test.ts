/**
 * Runs the engine can no longer move on end plainly instead of waiting forever, with their questions withdrawn:
 * - OPS-1: the run's workflow is gone (an engine that was not byway's own, a workflow closed from outside);
 * - C7 (ENG-11, RUN-1): the run was started by another workflow bundle, whose history the new code cannot replay.
 * And the other direction (R4): a run workflow whose run the store does not have (byway.sqlite restored from a backup
 * older than temporal.sqlite) is stopped at engine start, before the worker polls, so none of its steps runs.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@temporalio/client';
import { WorkflowNotFoundError } from '@temporalio/common';
import { createRunnerClient, ResolutionRejectedError } from '../src/client.ts';
import { ENGINE_SLOW_AT_START } from '../src/start-failure.ts';
import { engineStartLines, settleBeforePolling } from '../src/dev-engine.ts';
import { LOST_RUN_MESSAGE, ORPHAN_RUN_MESSAGE, reconcileLostRuns } from '../src/lost-runs.ts';
import { RUN_WORKFLOW, workflowIdFor, type RunInput } from '../src/types.ts';
import { createWorker } from '../src/worker.ts';
import { OLDER_VERSION_MESSAGE, retireStaleRuns } from '../src/versioning.ts';
import { WORKFLOW_HASH_MEMO } from '../src/workflow/version.ts';
import { storeBrief } from './helpers/briefs.ts';
import { createHarness, PROBLEM, type Harness } from './helpers/harness.ts';
import { tiny } from './helpers/recipes.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
}, 120_000);
afterAll(async () => {
  await h?.close();
}, 60_000);

const openCheckpoint = (runId: string) => h.waitFor('an open checkpoint', async () => (await h.store.checkpointsForRun(runId)).find((c) => c.status === 'open'));
/**
 * Waits for a run's status. The workflow writes it in an activity of its own, in no fixed order with the activity that
 * opens a checkpoint, so a run whose checkpoint is open may not read 'waiting' yet.
 */
const statusIs = (runId: string, status: string) => h.waitFor(`status ${status}`, async () => (await h.store.getRun(runId))?.status === status);
const handle = (runId: string) => h.env.client.workflow.getHandle(workflowIdFor(runId));

/** A run waiting for a person whose workflow is then closed outside byway (a lost engine, a stray terminate). */
async function waitingThenLost(): Promise<{ runId: string; cpId: string }> {
  const run = await h.start(tiny);
  const cp = await openCheckpoint(run.id);
  await statusIs(run.id, 'waiting');
  await handle(run.id).terminate('closed outside byway');
  return { runId: run.id, cpId: cp.id };
}

async function expectClosed(runId: string, cpId: string, status: 'failed' | 'cancelled', error?: string): Promise<void> {
  const view = await h.runner.view(runId);
  expect(view.run.status).toBe(status);
  if (error) expect(view.run.error).toBe(error);
  expect(view.checkpoints.find((c) => c.id === cpId)?.status).toBe('withdrawn');
  expect(view.events.at(-1)).toMatchObject(status === 'failed' ? { type: 'run-failed', data: { error } } : { type: 'run-cancelled' });
  expect((await h.store.openCheckpoints(h.workspaceId)).some((c) => c.runId === runId)).toBe(false);
}

describe('a run whose workflow is gone (OPS-1)', () => {
  it('an answer is refused with a plain reason, and the run ends as failed', async () => {
    const { runId, cpId } = await waitingThenLost();
    const err = await h.runner.resolve({ checkpointId: cpId, text: 'Good.' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ResolutionRejectedError);
    expect((err as Error).message).toBe(LOST_RUN_MESSAGE);
    await expectClosed(runId, cpId, 'failed', LOST_RUN_MESSAGE);
  }, 60_000);

  it('Cancel always ends it', async () => {
    const { runId, cpId } = await waitingThenLost();
    await h.runner.cancel(runId);
    await expectClosed(runId, cpId, 'cancelled');
  }, 60_000);

  it('Pause on it ends it as failed: it cannot continue', async () => {
    const { runId, cpId } = await waitingThenLost();
    await h.runner.pause(runId);
    await expectClosed(runId, cpId, 'failed', LOST_RUN_MESSAGE);
  }, 60_000);

  it('at engine start, runs the store shows as going but Temporal does not run are failed; live runs are left alone', async () => {
    const ghost = await h.store.createRun({ id: `ghost-${Date.now()}`, workspaceId: h.workspaceId, recipeId: 'tiny', recipeHash: tiny.hash ?? 'sha256:x', profileId: 'demo', title: 'Ghost', problem: 'p', medium: 'prose', budgetUsd: 5, status: 'waiting' });
    const ghostCp = await h.store.openCheckpoint({ id: `${ghost.id}/cp1`, runId: ghost.id, stepId: 'react', kind: 'react', prompt: 'What do you think?' });
    const lost = await waitingThenLost();
    const live = await h.start(tiny);
    await openCheckpoint(live.id);

    const { lost: closed, orphaned } = await reconcileLostRuns(h.env.client, h.store, [h.workspaceId], { taskQueue: h.taskQueue });
    expect(closed).toEqual(expect.arrayContaining([ghost.id, lost.runId]));
    expect(closed).not.toContain(live.id);
    // Every workflow on the queue has its run in the store: none is stopped.
    expect(orphaned).toEqual([]);
    await expectClosed(ghost.id, ghostCp.id, 'failed', LOST_RUN_MESSAGE);
    await expectClosed(lost.runId, lost.cpId, 'failed', LOST_RUN_MESSAGE);
    await statusIs(live.id, 'waiting');

    await h.runner.cancel(live.id);
    await statusIs(live.id, 'cancelled');
  }, 60_000);
});

describe('a start whose reply timed out, against a real Temporal server (B1, ADR-0109)', () => {
  /**
   * The harness's Temporal client, with a workflow start whose reply is lost: it times out (gRPC 4) after Temporal
   * accepted the workflow, or before the request reached it. Everything else is the real client, the describe included.
   */
  function replyLost(acceptFirst: boolean): Client {
    const real = h.env.client;
    const timedOut = () => Object.assign(new Error('4 DEADLINE_EXCEEDED: Deadline exceeded'), { code: 4 });
    const bound = <T extends object>(target: T, prop: PropertyKey) => {
      const v = Reflect.get(target, prop, target) as unknown;
      return typeof v === 'function' ? v.bind(target) : v;
    };
    const workflow = new Proxy(real.workflow, {
      get: (target, prop) =>
        prop === 'start'
          ? async (...args: Parameters<Client['workflow']['start']>) => {
              if (acceptFirst) await target.start(...args);
              throw timedOut();
            }
          : bound(target, prop),
    });
    return new Proxy(real, { get: (target, prop) => (prop === 'workflow' ? workflow : bound(target, prop)) });
  }
  const startWith = (client: Client) => createRunnerClient({ client, store: h.store, taskQueue: h.taskQueue }).start({ workspaceId: h.workspaceId, recipe: tiny, problem: PROBLEM, profileId: 'demo', budgetUsd: 50 });

  it('Temporal accepted it: the run goes on under its workflow, not marked failed', async () => {
    const run = await startWith(replyLost(true));
    await openCheckpoint(run.id);
    // A run marked failed never reads 'waiting': setRunStatus leaves an ended run as it is.
    await statusIs(run.id, 'waiting');
    expect((await h.store.getRun(run.id))?.error).toBeUndefined();
    await h.runner.cancel(run.id);
    await statusIs(run.id, 'cancelled');
  }, 60_000);

  it('it never reached Temporal: Temporal says it has no such workflow, and the run is failed as one that did not start', async () => {
    const err = await startWith(replyLost(false)).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 4 });
    const [run] = (await h.store.listRuns(h.workspaceId)).filter((r) => r.error === ENGINE_SLOW_AT_START);
    expect(run).toMatchObject({ status: 'failed' });
    await expect(handle(run!.id).describe()).rejects.toBeInstanceOf(WorkflowNotFoundError);
  }, 60_000);
});

describe('runs started by another workflow bundle (C7)', () => {
  it('a run records the hash of the workflow bundle it started under', async () => {
    const run = await h.start(tiny);
    await openCheckpoint(run.id);
    expect(h.worker.workflowHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await handle(run.id).describe()).memo?.[WORKFLOW_HASH_MEMO]).toBe(h.worker.workflowHash);
    await h.runner.cancel(run.id);
    await statusIs(run.id, 'cancelled');
  }, 60_000);

  it('a worker on other code ends those waiting runs as failed, plainly, and withdraws their questions', async () => {
    const run = await h.start(tiny);
    const cp = await openCheckpoint(run.id);
    await statusIs(run.id, 'waiting');
    const retire = (hash: string) => retireStaleRuns({ client: h.env.client, store: h.store, taskQueue: h.taskQueue, hash });

    // The same code: nothing to retire.
    expect(await retire(h.worker.workflowHash!)).not.toContain(run.id);
    expect((await h.store.getRun(run.id))?.status).toBe('waiting');

    // Another bundle (byway was updated while the run waited).
    expect(await retire('f'.repeat(64))).toContain(run.id);
    await expectClosed(run.id, cp.id, 'failed', OLDER_VERSION_MESSAGE);
    expect((await handle(run.id).describe()).status.name).toBe('TERMINATED');
    await expect(h.runner.resolve({ checkpointId: cp.id, text: 'Late.' })).rejects.toThrow(/withdrawn/);
    // Cancel on it now does nothing (it has ended).
    await h.runner.cancel(run.id);
    expect((await h.store.getRun(run.id))?.status).toBe('failed');
  }, 60_000);
});

describe('a run workflow whose run the store does not have (R4: a store older than the engine)', () => {
  it('is stopped at engine start, before the worker polls, so none of its steps runs', async () => {
    const queue = `${h.taskQueue}-restored`;
    const runId = `orphan-${Date.now()}`;
    const input: RunInput = { runId, workspaceId: h.workspaceId, recipe: tiny, problemId: await storeBrief(h.store.artifacts, PROBLEM), profileId: 'demo', budgetUsd: 5, medium: 'prose', routes: {}, inputs: {} };
    // Started as the Runner client starts a run, on a queue no worker polls yet, and never written to this store: as
    // after a restore of byway.sqlite from before the run began, beside a temporal.sqlite from after.
    await h.env.client.workflow.start(RUN_WORKFLOW, { taskQueue: queue, workflowId: workflowIdFor(runId), args: [input] });
    await h.waitFor('the workflow in the engine’s listing', async () => {
      for await (const wf of h.env.client.workflow.list({ query: `WorkflowId = '${workflowIdFor(runId)}' AND ExecutionStatus = 'Running'` })) return wf.taskQueue === queue;
      return false;
    });
    // A worker on another queue leaves it alone: each engine settles its own queue.
    expect((await reconcileLostRuns(h.env.client, h.store, [h.workspaceId], { taskQueue: h.taskQueue })).orphaned).not.toContain(runId);
    const worker = await createWorker({ connection: h.env.nativeConnection, taskQueue: queue, gateway: h.gateway, store: h.store, prompts: h.prompts, pages: h.pages, workflowsPath: h.workflowsPath });
    let running: Promise<void> | undefined;
    try {
      const atStart = await settleBeforePolling(h.env.client, worker, h.store);
      running = worker.run();
      expect(atStart.orphaned).toEqual([runId]);
      expect(atStart.lost).not.toContain(runId);
      const events = (await handle(runId).fetchHistory()).events ?? [];
      expect(events.at(-1)?.workflowExecutionTerminatedEventAttributes?.reason).toBe(ORPHAN_RUN_MESSAGE);
      // No workflow task ever started, so no step was scheduled: no call, nothing written for a run nobody can see.
      expect(events.some((e) => e.workflowTaskStartedEventAttributes)).toBe(false);
      expect(h.calls.filter((c) => c.runId === runId)).toEqual([]);
      expect(await h.store.getRun(runId)).toBeUndefined();
    } finally {
      await handle(runId).terminate('test cleanup').catch(() => undefined);
      await worker.shutdown();
      await running?.catch(() => undefined);
    }
  }, 60_000);
});

describe('what byway prints about the runs the engine ended at start', () => {
  it('says what each kind was, plainly, and nothing when it ended none', () => {
    expect(engineStartLines({ retired: [], lost: [], orphaned: [] })).toEqual([]);
    expect(engineStartLines({ retired: ['a'], lost: ['b', 'c'], orphaned: ['d'] })).toEqual([
      'ended 1 run started by an older version of byway, which cannot continue',
      'ended 2 runs the engine no longer has, which cannot continue',
      "stopped 1 run that byway's records do not have (the data directory was probably restored from an older backup)",
    ]);
  });
});
