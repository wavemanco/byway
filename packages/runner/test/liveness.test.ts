/**
 * Activity liveness (ENG-4, ENG-10): Cancel stops new provider calls and the run's cost catches up with the ledger
 * once in-flight calls finish; stopping the worker does not wait for steps that ignore it. The gateway guard and the
 * late-cost settlement are tested on their own first; then the real workflow on a harness whose worker stops quickly.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CancelledFailure } from '@temporalio/activity';
import { ApplicationFailure } from '@temporalio/common';
import type { CompletionRequest, CompletionResult, Gateway } from '@byway/contracts';
import { CANCELLED_CALL, ENDED_CALL, guardGateway, settleLateCost } from '../src/activities/liveness.ts';
import { createHarness, type Harness } from './helpers/harness.ts';
import { createTestStore } from './helpers/memo.ts';
import { threePages, tiny } from './helpers/recipes.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A gateway that answers at once and counts what reaches it. */
function counting(byRun: Record<string, number> = {}): Gateway & { sent: CompletionRequest[] } {
  const sent: CompletionRequest[] = [];
  const ok = async (): Promise<never> => {
    throw new Error('not used');
  };
  return {
    demo: true,
    sent,
    async complete(req): Promise<CompletionResult> {
      sent.push(req);
      return { text: 'ok', stopReason: 'end', servedModel: 'm', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0, ledgerEntryId: 'l1' };
    },
    image: ok,
    video: ok,
    spend: async (workspaceId) => ({ workspaceId, spentUsd: 0, capUsd: 100, byRun }),
    providers: () => [],
    profiles: () => [],
    profileStatus: () => [],
    verifyLedger: async () => null,
  };
}

describe('the gateway one activity invocation sees', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'byway-live-'));
  const store = createTestStore({ dataDir: dir });
  afterAll(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const newRun = async (status: 'running' | 'cancelled') => {
    const ws = (await store.ensureDefaultWorkspace()).id;
    const run = await store.createRun({ id: `r-${Math.random().toString(36).slice(2)}`, workspaceId: ws, recipeId: 'tiny', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium: 'prose', budgetUsd: 5 });
    await store.updateRun(run.id, { status });
    return { runId: run.id, workspaceId: ws };
  };
  const req = (r: { runId: string; workspaceId: string }): CompletionRequest => ({ ...r, purpose: 'build:prose', tier: 'mid', profileId: 'demo', messages: [], prompt: { id: 'p', version: 1, hash: 'sha256:x', fidelity: 'project' } }) as CompletionRequest;

  it('makes no new provider call once the invocation is cancelled; other calls pass through', async () => {
    const inner = counting();
    const ctrl = new AbortController();
    const g = guardGateway(inner, store, ctrl.signal);
    const r = await newRun('running');
    await g.complete(req(r));
    expect(inner.sent).toHaveLength(1);
    expect(g.demo).toBe(true);
    ctrl.abort();
    const err = await g.complete(req(r)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CancelledFailure);
    expect((err as Error).message).toBe(CANCELLED_CALL);
    expect(inner.sent).toHaveLength(1);
    expect((await g.spend(r.workspaceId)).capUsd).toBe(100);
    expect([...g.calledFor]).toEqual([[r.runId, r.workspaceId]]);
  });

  it('makes no new provider call for a run that has ended, and says so without a retry', async () => {
    const inner = counting();
    const g = guardGateway(inner, store, undefined);
    const err = await g.complete(req(await newRun('cancelled'))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApplicationFailure);
    expect((err as ApplicationFailure).nonRetryable).toBe(true);
    expect((err as Error).message).toBe(ENDED_CALL);
    expect(inner.sent).toHaveLength(0);
  });

  it('brings an ended run’s cost up to the ledger after its last call, never down, and leaves going runs to their steps', async () => {
    const ended = await newRun('cancelled');
    const going = await newRun('running');
    await store.updateRun(ended.runId, { costUsd: 0.1 });
    await settleLateCost(counting({ [ended.runId]: 0.3, [going.runId]: 0.5 }), store, new Map([[ended.runId, ended.workspaceId], [going.runId, going.workspaceId]]));
    expect((await store.getRun(ended.runId))?.costUsd).toBe(0.3);
    expect((await store.getRun(going.runId))?.costUsd).toBe(0);
    await settleLateCost(counting({ [ended.runId]: 0.2 }), store, new Map([[ended.runId, ended.workspaceId]]));
    expect((await store.getRun(ended.runId))?.costUsd).toBe(0.3);
  });
});

describe('cancel and stop through the real workflow', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness({ shutdownGraceTime: '500 milliseconds', shutdownForceTime: '3 seconds' });
  }, 120_000);
  afterAll(async () => {
    h?.setLatency(0);
    h?.pages.release();
    await h?.close();
  }, 60_000);

  const statusIs = (runId: string, status: string) => h.waitFor(`status ${status}`, async () => (await h.store.getRun(runId))?.status === status);

  it('Cancel stops new provider calls, and the run’s cost catches up with the ledger once the call in flight returns (ENG-4)', async () => {
    // A draft that never parses: without the guard, the step would ask the model again after the first answer.
    h.responders['build:prose'] = () => '';
    h.setLatency(1_500);
    try {
      const run = await h.start(tiny);
      await h.waitFor('the draft call in flight', async () => h.calls.some((c) => c.runId === run.id && c.purpose === 'build:prose'));
      const cancelledAt = Date.now();
      await h.runner.cancel(run.id);
      await statusIs(run.id, 'cancelled');
      await h.waitFor('the call in flight returned', async () => h.calls.filter((c) => c.runId === run.id).every((c) => c.result !== undefined));
      await sleep(2_500);
      expect(h.calls.filter((c) => c.runId === run.id && c.at > cancelledAt)).toEqual([]);
      const ledger = h.ledger(run.id).reduce((sum, e) => sum + e.costUsd, 0);
      expect(ledger).toBeGreaterThan(0);
      await h.waitFor('the run’s cost to match the ledger', async () => Math.abs(((await h.store.getRun(run.id))?.costUsd ?? 0) - ledger) < 1e-12);
      expect((await h.store.events(run.id)).at(-1)?.type).toBe('run-cancelled');
    } finally {
      delete h.responders['build:prose'];
      h.setLatency(0);
    }
  }, 60_000);

  it('Cancel reaches steps that are running: held renders stop without being released (ENG-4)', async () => {
    h.pages.hold();
    try {
      const run = await h.start(threePages);
      await h.waitFor('renders in flight', async () => h.pages.waiting() === 3);
      await h.runner.cancel(run.id);
      await statusIs(run.id, 'cancelled');
      // The cancel travels to each running step in a heartbeat's reply; the step then closes its page.
      await h.waitFor('the renders to stop', async () => h.pages.waiting() === 0, 15_000);
    } finally {
      h.pages.release();
    }
  }, 60_000);

  it('stopping the worker does not wait for steps in flight: renders stop, a slow call is abandoned (ENG-10)', async () => {
    h.pages.hold();
    const pagesRun = await h.start(threePages);
    await h.waitFor('renders in flight', async () => h.pages.waiting() === 3);
    h.setLatency(30_000);
    const slow = await h.start(tiny);
    await h.waitFor('a slow call in flight', async () => h.calls.some((c) => c.runId === slow.id && c.result === undefined));
    const started = Date.now();
    const stopped = await Promise.race([h.worker.shutdown().then(() => 'stopped'), sleep(20_000).then(() => 'still stopping')]);
    expect(stopped).toBe('stopped');
    expect(Date.now() - started).toBeLessThan(10_000);
    // The held renders were told to stop (their step was cancelled by the shutdown), not left waiting.
    expect(h.pages.waiting()).toBe(0);
    expect(pagesRun.id).toBeTruthy();
  }, 60_000);
});
