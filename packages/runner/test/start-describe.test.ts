/**
 * A run start whose workflow start failed asks Temporal for the workflow before it marks the run failed (B1, ADR-0107;
 * backlog "Run start: describe the workflow before marking a run failed" and "a start that timed out is reported as
 * 'engine was not running'"). A start can fail after Temporal accepted it: its reply timed out (gRPC 4), or, for a Start
 * delivered twice to a stopping engine, the other delivery's start went through. Marking that run failed would refuse
 * its later calls but not one already under way, and the old message said "Nothing was spent". Now a workflow Temporal
 * has is the run's, and the run is left to it; a workflow Temporal does not have means the run did not start; and when
 * byway cannot ask, the run is failed with a message that says it cannot tell. The real store; a stand-in Temporal
 * client (engine-state.test.ts runs the same against a real Temporal server).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkflowNotFoundError } from '@temporalio/common';
import type { Client } from '@temporalio/client';
import type { StartRunInput } from '@byway/contracts';
import { createRunnerClient } from '../src/client.ts';
import { ENGINE_DOWN_AT_START, ENGINE_SLOW_AT_START, ENGINE_SLOW_UNCONFIRMED } from '../src/start-failure.ts';
import { workflowIdFor } from '../src/types.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';
import { tiny } from './helpers/recipes.ts';

let dir: string;
let store: MemoStore;
let workspaceId: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-start-describe-'));
  store = createTestStore({ dataDir: dir });
  workspaceId = (await store.ensureDefaultWorkspace()).id;
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const grpc = (code: number, message: string) => Object.assign(new Error(message), { code });
const TIMED_OUT = () => grpc(4, '4 DEADLINE_EXCEEDED: Deadline exceeded');
const UNREACHABLE = () => grpc(14, '14 UNAVAILABLE: No connection established. Last error: connect ECONNREFUSED 127.0.0.1:7233');

interface Engine {
  /** What the workflow start does: it may first let Temporal accept the workflow, then fail on the way back. */
  start: (accept: () => void) => Promise<void>;
  /** What a describe of a workflow Temporal does not have does, when it can be asked at all. */
  describeFails?: () => Error;
}

/** Temporal's side: the workflows it accepted, and a describe that finds them. */
function temporal(engine: Engine) {
  const accepted = new Set<string>();
  const described: string[] = [];
  const client = {
    workflow: {
      async start(_type: string, o: { workflowId: string }) {
        await engine.start(() => accepted.add(o.workflowId));
        accepted.add(o.workflowId);
        return { workflowId: o.workflowId };
      },
      getHandle(workflowId: string) {
        return {
          async describe() {
            described.push(workflowId);
            if (engine.describeFails) throw engine.describeFails();
            if (!accepted.has(workflowId)) throw new WorkflowNotFoundError('Workflow not found', workflowId, undefined);
            return { workflowId, status: { name: 'RUNNING' } };
          },
        };
      },
    },
  } as unknown as Client;
  return { client, accepted, described };
}

const RUN_ID = '3c2b1a09-8f7e-4d6c-9b5a-493827160514';
const input = (over: Partial<StartRunInput> = {}): StartRunInput => ({ workspaceId, recipe: tiny, problem: { text: 'A memo for the board' }, profileId: 'demo', budgetUsd: 2, ...over });

describe('a start that failed after Temporal may have accepted it', () => {
  it('timed out after Temporal accepted it: the run is left to its workflow, not marked failed', async () => {
    const t = temporal({
      start: async (accept) => {
        accept();
        throw TIMED_OUT();
      },
    });
    const run = await createRunnerClient({ client: t.client, store }).start(input());
    expect(run.status).toBe('queued');
    expect(await store.getRun(run.id)).toMatchObject({ status: 'queued' });
    expect((await store.getRun(run.id))?.error).toBeUndefined();
    expect(t.described).toEqual([workflowIdFor(run.id)]);
  });

  it('timed out and Temporal has no workflow for it: failed, it did not start, and nothing was spent', async () => {
    const t = temporal({ start: async () => Promise.reject(TIMED_OUT()) });
    const err = await createRunnerClient({ client: t.client, store }).start(input({ runId: RUN_ID })).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 4 });
    expect(await store.getRun(RUN_ID)).toMatchObject({ status: 'failed', error: ENGINE_SLOW_AT_START });
  });

  it('timed out and byway could not ask Temporal either: failed, saying it cannot tell, not that nothing was spent', async () => {
    const t = temporal({ start: async () => Promise.reject(TIMED_OUT()), describeFails: TIMED_OUT });
    const err = await createRunnerClient({ client: t.client, store }).start(input({ runId: RUN_ID })).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 4 });
    expect(await store.getRun(RUN_ID)).toMatchObject({ status: 'failed', error: ENGINE_SLOW_UNCONFIRMED });
  });

  it('the engine was not there at all: failed, the engine was not running, nothing was spent (as before)', async () => {
    for (const describeFails of [undefined, UNREACHABLE]) {
      const runId = describeFails ? '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' : RUN_ID;
      const t = temporal({ start: async () => Promise.reject(UNREACHABLE()), ...(describeFails ? { describeFails } : {}) });
      await expect(createRunnerClient({ client: t.client, store }).start(input({ runId }))).rejects.toMatchObject({ code: 14 });
      expect(await store.getRun(runId)).toMatchObject({ status: 'failed', error: ENGINE_DOWN_AT_START });
    }
  });

  it('P3 double fault: the delivery that wrote the run fails, the other delivery’s start went through: not marked failed', async () => {
    // Two deliveries of one Start reach a stopping engine. The one that wrote the run is refused (here, unavailable);
    // the other's workflow start reached Temporal first. Before, the run was marked failed under its running workflow.
    let repeat: Promise<unknown> | undefined;
    let first = true;
    const t = temporal({
      start: async (accept) => {
        if (!first) return accept();
        first = false;
        repeat = runner.start(input({ runId: RUN_ID })).catch((e: unknown) => e);
        await repeat;
        throw UNREACHABLE();
      },
    });
    const runner = createRunnerClient({ client: t.client, store });
    const wrote = await runner.start(input({ runId: RUN_ID })).catch((e: unknown) => e);
    expect(wrote).toMatchObject({ id: RUN_ID });
    expect(await repeat).toMatchObject({ id: RUN_ID });
    expect([...t.accepted]).toEqual([workflowIdFor(RUN_ID)]);
    expect(await store.getRun(RUN_ID)).toMatchObject({ status: 'queued' });
    expect((await store.getRun(RUN_ID))?.error).toBeUndefined();
  });

  it('a start that succeeds asks Temporal nothing more', async () => {
    const t = temporal({ start: async () => undefined });
    await createRunnerClient({ client: t.client, store }).start(input());
    expect(t.described).toEqual([]);
  });
});
