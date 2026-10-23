/**
 * The lost-run pass while the engine runs (the backlog row "Reconcile lost runs while the engine runs, not only at
 * start"). The pass byway runs at start (engine-state.test.ts) also runs every few minutes while the worker polls, so a
 * run whose workflow Temporal closed without byway closing it (at a payload, batch or history limit, or terminated from
 * outside) is marked failed instead of staying "running" until byway next starts. It skips queued runs, because a start
 * may be under way. These tests call the pass directly, beside a worker that polls; the timer that repeats it is tested
 * in repeat-every.test.ts and the engine's use of both in dev-engine.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@temporalio/client';
import type { Store } from '@byway/contracts';
import { createRunnerClient } from '../src/client.ts';
import { reconcileWhilePolling } from '../src/dev-engine.ts';
import { LOST_RUN_MESSAGE, reconcileLostRuns, type Reconciled } from '../src/lost-runs.ts';
import { RUN_WORKFLOW, workflowIdFor } from '../src/types.ts';
import { createHarness, PROBLEM, type Harness } from './helpers/harness.ts';
import { tiny } from './helpers/recipes.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
}, 120_000);
afterAll(async () => {
  await h?.close();
}, 60_000);

/** The pass as the engine repeats it while its worker polls. */
const pass = (store: Store = h.store) => reconcileWhilePolling(h.env.client, h.worker, store);
const handle = (runId: string) => h.env.client.workflow.getHandle(workflowIdFor(runId));
const openCheckpoint = (runId: string) => h.waitFor('an open checkpoint', async () => (await h.store.checkpointsForRun(runId)).find((c) => c.status === 'open'));
/** The workflow writes a run's status in an activity of its own, in no fixed order with the one that opens a checkpoint. */
const statusIs = (runId: string, status: string) => h.waitFor(`status ${status}`, async () => (await h.store.getRun(runId))?.status === status);

/** The reason Temporal gives when it terminates a workflow whose history has grown past its limit. */
const HISTORY_LIMIT = 'Workflow history size exceeds limit.';

/** A run record only, as Runner.start writes one before it starts the run's workflow. */
const runRecord = (id: string, status: 'queued' | 'running' | 'waiting') =>
  h.store.createRun({ id, workspaceId: h.workspaceId, recipeId: 'tiny', recipeHash: tiny.hash ?? 'sha256:x', profileId: 'demo', title: 'A run', problem: PROBLEM.text, medium: 'prose', budgetUsd: 5, status });

/**
 * The harness's Temporal client, with one change: just before it starts a workflow, it runs `first`. A Runner client
 * on it writes the run as queued, then `first` runs, then the workflow starts, so `first` sees a start under way.
 */
function startingAfter(first: () => Promise<void>): Client {
  const real = h.env.client;
  const bound = <T extends object>(target: T, prop: PropertyKey) => {
    const v = Reflect.get(target, prop, target) as unknown;
    return typeof v === 'function' ? v.bind(target) : v;
  };
  const workflow = new Proxy(real.workflow, {
    get: (target, prop) =>
      prop === 'start'
        ? async (...args: Parameters<Client['workflow']['start']>) => {
            await first();
            return target.start(...args);
          }
        : bound(target, prop),
  });
  return new Proxy(real, { get: (target, prop) => (prop === 'workflow' ? workflow : bound(target, prop)) });
}

describe('the lost-run pass while the engine runs', () => {
  it('marks failed a run whose workflow Temporal closed while it was going, withdraws its questions, and leaves runs still going alone', async () => {
    // A run waiting for a person, whose workflow Temporal then closes at its history limit: the workflow's own code
    // never runs again, so nothing in it ends the run.
    const waiting = await h.start(tiny);
    const waitingCp = await openCheckpoint(waiting.id);
    await statusIs(waiting.id, 'waiting');
    await handle(waiting.id).terminate(HISTORY_LIMIT);
    // A run the store shows as running, closed the same way mid-step. Its workflow is started on a queue no worker
    // polls, so no step of it runs here and its input is never read.
    const running = await runRecord(`closed-running-${Date.now()}`, 'running');
    await h.env.client.workflow.start(RUN_WORKFLOW, { taskQueue: `${h.taskQueue}-unpolled`, workflowId: workflowIdFor(running.id), args: [] });
    await handle(running.id).terminate(HISTORY_LIMIT);
    // A run still going: its workflow waits for a person.
    const live = await h.start(tiny);
    await openCheckpoint(live.id);
    await statusIs(live.id, 'waiting');

    const settled = await pass();
    expect(settled.lost).toEqual(expect.arrayContaining([waiting.id, running.id]));
    expect(settled.lost).not.toContain(live.id);
    // Every workflow on the queue has its run in the store: none is stopped.
    expect(settled.orphaned).toEqual([]);
    for (const runId of [waiting.id, running.id]) {
      const view = await h.runner.view(runId);
      expect(view.run).toMatchObject({ status: 'failed', error: LOST_RUN_MESSAGE });
      expect(view.events.at(-1)).toMatchObject({ type: 'run-failed', data: { error: LOST_RUN_MESSAGE } });
    }
    expect((await h.store.checkpointsForRun(waiting.id)).find((c) => c.id === waitingCp.id)?.status).toBe('withdrawn');
    expect((await h.store.openCheckpoints(h.workspaceId)).some((c) => c.runId === waiting.id)).toBe(false);
    expect((await h.store.getRun(live.id))?.status).toBe('waiting');

    await h.runner.cancel(live.id);
    await statusIs(live.id, 'cancelled');
  }, 60_000);

  it('skips a queued run, whose start may be under way: the run goes on once its workflow starts', async () => {
    // The pass runs at the worst moment of a start: the run is written as queued and its workflow is not started yet.
    let seen: Reconciled | undefined;
    const runner = createRunnerClient({
      client: startingAfter(async () => {
        seen = await pass();
      }),
      store: h.store,
      taskQueue: h.taskQueue,
    });
    const run = await runner.start({ workspaceId: h.workspaceId, recipe: tiny, problem: PROBLEM, profileId: 'demo', budgetUsd: 5 });
    expect(seen?.lost).not.toContain(run.id);
    await openCheckpoint(run.id);
    // A run marked failed never reads 'waiting': setRunStatus leaves an ended run as it is.
    await statusIs(run.id, 'waiting');
    expect((await h.store.getRun(run.id))?.error).toBeUndefined();
    await h.runner.cancel(run.id);
    await statusIs(run.id, 'cancelled');
  }, 60_000);

  it('the pass at start still fails a queued run with no workflow: nothing is starting then', async () => {
    const queued = await runRecord(`queued-${Date.now()}`, 'queued');
    expect((await pass()).lost).not.toContain(queued.id);
    expect((await h.store.getRun(queued.id))?.status).toBe('queued');
    // byway's app starts after the engine (scripts/serve.ts), so at engine start no start of its can be under way.
    const atStart = await reconcileLostRuns(h.env.client, h.store, [h.workspaceId], { taskQueue: h.taskQueue });
    expect(atStart.lost).toContain(queued.id);
    expect(await h.store.getRun(queued.id)).toMatchObject({ status: 'failed', error: LOST_RUN_MESSAGE });
  }, 60_000);

  it('a run that ended while the pass looked at it keeps its end, and is not counted as one the pass closed', async () => {
    const run = await h.start(tiny);
    expect((await h.drive(run.id)).run.status).toBe('done');
    // "done" is written just before the workflow returns; once it has returned, Temporal reads it as closed.
    expect(await handle(run.id).result()).toMatchObject({ status: 'done' });
    // The pass's listing was read a moment before the workflow wrote "done": it still shows the run as running.
    const bound = <T extends object>(target: T, prop: PropertyKey) => {
      const v = Reflect.get(target, prop, target) as unknown;
      return typeof v === 'function' ? v.bind(target) : v;
    };
    const staleListing = new Proxy(h.store, {
      get: (target, prop) =>
        prop === 'listRuns'
          ? async (...args: Parameters<Store['listRuns']>) => (await target.listRuns(...args)).map((r) => (r.id === run.id ? { ...r, status: 'running' as const } : r))
          : bound(target, prop),
    });

    expect((await pass(staleListing)).lost).not.toContain(run.id);
    const view = await h.runner.view(run.id);
    expect(view.run.status).toBe('done');
    expect(view.run.error).toBeUndefined();
    expect(view.events.some((e) => e.type === 'run-failed')).toBe(false);
  }, 60_000);
});
