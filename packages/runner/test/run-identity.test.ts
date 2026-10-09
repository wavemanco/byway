/**
 * Run-start identity (F03's P3; ADR-0099). The Runner client minted a new run id on every start, so a Start delivered
 * twice (a lost answer and a retry, a request the network sent again) started two paid runs. Now the caller may name
 * the run (StartRunInput.runId, a UUID the app mints once per Start), and a start repeated with it gives one run and
 * one workflow; the same id for another workspace or intake is refused as a conflict, and an id that is not a UUID is
 * refused before anything is written. The real store; a stand-in Temporal client that keeps workflow ids as Temporal
 * does (a second start of a running id fails with WorkflowExecutionAlreadyStartedError).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkflowExecutionAlreadyStartedError, type Client } from '@temporalio/client';
import type { StartRunInput } from '@byway/contracts';
import { createRunnerClient, RunStartConflictError, RunStartInvalidError } from '../src/client.ts';
import { workflowIdFor } from '../src/types.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';
import { tiny } from './helpers/recipes.ts';

let dir: string;
let store: MemoStore;
let workspaceId: string;
let intakeId: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-run-id-'));
  store = createTestStore({ dataDir: dir });
  workspaceId = (await store.ensureDefaultWorkspace()).id;
  intakeId = (await store.createIntake({ id: 'b4c1d2e3-0000-4000-8000-000000000001', workspaceId, problem: { text: 'A memo for the board' } })).id;
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Temporal's side, as far as starting goes: one execution per workflow id while it runs. */
function temporal() {
  const started: string[] = [];
  const attempts: string[] = [];
  const client = {
    workflow: {
      async start(workflowType: string, opts: { workflowId: string }) {
        attempts.push(opts.workflowId);
        // A moment on the wire, so two starts sent at once overlap.
        await new Promise((r) => setTimeout(r, 10));
        if (started.includes(opts.workflowId)) throw new WorkflowExecutionAlreadyStartedError('Workflow execution already started', opts.workflowId, workflowType);
        started.push(opts.workflowId);
        return { workflowId: opts.workflowId };
      },
    },
  } as unknown as Client;
  return { client, started, attempts };
}

const RUN_ID = '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e';
const input = (over: Partial<StartRunInput> = {}): StartRunInput => ({ workspaceId, recipe: tiny, problem: { text: 'A memo for the board' }, profileId: 'demo', budgetUsd: 2, intakeId, runId: RUN_ID, ...over });

describe('starting a run the caller named (F03 P3)', () => {
  it('a start repeated with the same id gives one run and one workflow, one after the other or at once', async () => {
    const t = temporal();
    const runner = createRunnerClient({ client: t.client, store });
    const first = await runner.start(input());
    expect(first.id).toBe(RUN_ID);
    expect(await runner.start(input())).toEqual(first);
    const [a, b] = await Promise.all([runner.start(input({ runId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' })), runner.start(input({ runId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' }))]);
    expect(a).toEqual(b);
    expect((await store.listRuns(workspaceId)).map((r) => r.id).sort()).toEqual(['1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', RUN_ID].sort());
    expect(t.started.sort()).toEqual([workflowIdFor(RUN_ID), workflowIdFor('1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d')].sort());
    // Nothing failed on the way: the second start found Temporal already running it.
    expect((await store.getRun(RUN_ID))?.status).toBe('queued');
  });

  it('a start repeated after its run ended returns that run and starts nothing', async () => {
    const t = temporal();
    const runner = createRunnerClient({ client: t.client, store });
    await runner.start(input());
    await store.updateRun(RUN_ID, { status: 'done' });
    expect(await runner.start(input())).toMatchObject({ id: RUN_ID, status: 'done' });
    expect(t.attempts).toEqual([workflowIdFor(RUN_ID)]);
  });

  it('the same id for another workspace or another intake is a conflict, and changes nothing', async () => {
    const t = temporal();
    const runner = createRunnerClient({ client: t.client, store });
    await runner.start(input());
    const elsewhere = await store.createIntake({ id: 'b4c1d2e3-0000-4000-8000-000000000002', workspaceId, problem: { text: 'Another problem' } });
    // (byway has one workspace; the id is compared before anything else is read.)
    await expect(runner.start(input({ workspaceId: 'ws-other', intakeId: undefined }))).rejects.toBeInstanceOf(RunStartConflictError);
    await expect(runner.start(input({ intakeId: elsewhere.id }))).rejects.toMatchObject({ name: 'RunStartConflictError' });
    await expect(runner.start(input({ intakeId: undefined }))).rejects.toBeInstanceOf(RunStartConflictError);
    expect(await store.listRuns(workspaceId)).toHaveLength(1);
    expect(t.attempts).toEqual([workflowIdFor(RUN_ID)]);
  });

  it('refuses an id that is not a UUID before anything is written', async () => {
    const t = temporal();
    const runner = createRunnerClient({ client: t.client, store });
    for (const runId of ['', 'run-1', `${RUN_ID}x`, RUN_ID.toUpperCase().replace(/-/g, '')]) {
      await expect(runner.start(input({ runId }))).rejects.toBeInstanceOf(RunStartInvalidError);
    }
    expect(await store.listRuns(workspaceId)).toEqual([]);
    expect(t.attempts).toEqual([]);
  });

  it('without an id, every start is a new run, as before', async () => {
    const t = temporal();
    const runner = createRunnerClient({ client: t.client, store });
    const { runId: _, ...unnamed } = input();
    const [a, b] = [await runner.start(unnamed), await runner.start(unnamed)];
    expect(a.id).not.toBe(b.id);
    expect(t.started).toHaveLength(2);
  });
});
