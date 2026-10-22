/**
 * Activity liveness (ENG-4, ENG-10) and the true stop for Cancel (ADR-0111): Cancel stops new provider calls and cuts
 * off the calls in flight that byway can stop; a call it cannot stop finishes, and the run's cost catches up with the
 * ledger; stopping the worker does not wait for steps that ignore it. The gateway guard, the stop rule and the late-cost
 * settlement are tested on their own first; then the real workflow on a harness whose worker stops quickly.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CancelledFailure, Context } from '@temporalio/activity';
import { ApplicationFailure } from '@temporalio/common';
import { MockActivityEnvironment } from '@temporalio/testing';
import { GatewayError, type CompletionRequest, type CompletionResult, type Gateway } from '@byway/contracts';
import { mockAdapter, type ProviderAdapter, type Responder } from '@byway/gateway';
import { COMPOSED_LIMITS, composedLimitProblems, workBound } from '@byway/recipe';
import { createActivities } from '../src/activities/index.ts';
import { CANCELLED_CALL, cancelEndsRun, ENDED_CALL, guardGateway, guardPages, runHasEnded, settleLateCost, STOPPED_STEP, stopSignal } from '../src/activities/liveness.ts';
import type { StepSpec } from '../src/types.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { fakePages } from './helpers/fake-pages.ts';
import { createHarness, type Harness } from './helpers/harness.ts';
import { createTestStore } from './helpers/memo.ts';
import { cancelPeak, threePages, tiny } from './helpers/recipes.ts';

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
    spendRecords: async () => ({ inFlight: [], uncertain: [], faults: [], notInAuditFile: 0, setAside: [] }),
    auditLedger: async () => ({ brokenAt: null, missing: [], pending: 0, setAside: [], openFaults: 0 }),
    close: async () => undefined,
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

describe('the stop rule: which cancels cut a call off (ADR-0111)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'byway-stop-'));
  const store = createTestStore({ dataDir: dir });
  afterAll(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  /** Temporal's cancel of an invocation: its signal aborts with a CancelledFailure whose message is the reason. */
  const cancelled = (reason: string) => {
    const cancel = new AbortController();
    return { cancel, fire: () => cancel.abort(new CancelledFailure(reason)) };
  };
  /** A read of the store that the test answers, so the decision is awaited, never timed. */
  const asked = (ended: boolean) => {
    let answered!: Promise<boolean>;
    return { runEnded: () => (answered = Promise.resolve(ended)), settled: async () => (await answered, await Promise.resolve()) };
  };

  it('CANCELLED (the workflow cancelled its one scope: Cancel, "Stop the run", or a failure) cuts the call off at once', () => {
    const { cancel, fire } = cancelled('CANCELLED');
    const read = asked(false);
    const stop = stopSignal(cancel.signal, read.runEnded);
    expect(stop?.aborted).toBe(false);
    fire();
    expect(stop?.aborted).toBe(true);
    expect(cancelEndsRun(new CancelledFailure('CANCELLED'))).toBe(true);
  });

  it('TIMED_OUT with the run going cuts nothing off: another attempt takes the call over (ADR-0099)', async () => {
    const { cancel, fire } = cancelled('TIMED_OUT');
    const read = asked(false);
    const stop = stopSignal(cancel.signal, read.runEnded);
    fire();
    await read.settled();
    expect(stop?.aborted).toBe(false);
  });

  it('NOT_FOUND (the workflow closed) with the run ended cuts the call off; WORKER_SHUTDOWN with the run going does not', async () => {
    const closed = cancelled('NOT_FOUND');
    const ended = asked(true);
    const stop = stopSignal(closed.cancel.signal, ended.runEnded);
    closed.fire();
    await ended.settled();
    expect(stop?.aborted).toBe(true);
    const shutdown = cancelled('WORKER_SHUTDOWN');
    const going = asked(false);
    const kept = stopSignal(shutdown.cancel.signal, going.runEnded);
    shutdown.fire();
    await going.settled();
    expect(kept?.aborted).toBe(false);
  });

  it('a cancel already given when the invocation starts is read the same way, and there is no stop outside an activity', () => {
    const { cancel, fire } = cancelled('CANCELLED');
    fire();
    expect(stopSignal(cancel.signal, async () => false)?.aborted).toBe(true);
    expect(stopSignal(undefined, async () => true)).toBeUndefined();
  });

  it('reads the run’s end from the store', async () => {
    const ws = (await store.ensureDefaultWorkspace()).id;
    const run = await store.createRun({ id: 'r-stop', workspaceId: ws, recipeId: 'tiny', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium: 'prose', budgetUsd: 5 });
    expect(await runHasEnded(store, run.id)).toBe(false);
    await store.updateRun(run.id, { status: 'cancelled' });
    expect(await runHasEnded(store, run.id)).toBe(true);
    expect(await runHasEnded(store, undefined)).toBe(false);
  });

  it('holds only while the run workflow has one cancellation scope, which nothing but the run’s end cancels', () => {
    // Reading CANCELLED as "the run is ending" is true only of this shape (ADR-0111): one scope, made in run.ts and
    // cancelled there on Cancel and when the run ends; no other scope anywhere in the workflow code.
    const workflowDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'workflow');
    const sources = Object.fromEntries(readdirSync(workflowDir).filter((f) => f.endsWith('.ts')).map((f) => [f, readFileSync(path.join(workflowDir, f), 'utf8')]));
    const all = Object.values(sources).join('\n');
    expect(all.match(/new CancellationScope\b/g)).toHaveLength(1);
    expect(sources['run.ts']).toMatch(/const main = new CancellationScope\(\);/);
    expect(all).not.toMatch(/CancellationScope\.(cancellable|nonCancellable|withTimeout)/);
    expect(all.match(/\.cancel\(\)/g)).toHaveLength(2);
    expect(sources['run.ts']?.match(/main\.cancel\(\);/g)).toHaveLength(2);
  });
});

describe('a step whose run is ending, in an activity (ADR-0111)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'byway-step-stop-'));
  const store = createTestStore({ dataDir: dir });
  afterAll(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const draft: StepSpec = { id: 'draft', role: 'build', actor: 'model', tier: 'mid', prompt: 'product.test.draft', consumes: ['intent'], produces: ['artifact'], writes: true };

  /** A gateway whose call is held until the stop it was handed aborts, then ends as the gateway's cut-off does. */
  function heldUntilStopped() {
    const inner = counting();
    const seen: CompletionRequest[] = [];
    const gateway: Gateway = {
      ...inner,
      complete: (req) =>
        new Promise<CompletionResult>((_, reject) => {
          seen.push(req);
          const stop = req.operation?.stop;
          if (!stop) return reject(new Error('the call was handed no stop'));
          stop.addEventListener('abort', () => reject(new GatewayError('byway-failure', 'byway cut off this mock call because its run was ending.', false)), { once: true });
        }),
    };
    return { gateway, seen };
  }

  const start = async (status: 'running' | 'cancelled') => {
    const ws = (await store.ensureDefaultWorkspace()).id;
    const run = await store.createRun({ id: `r-${Math.random().toString(36).slice(2)}`, workspaceId: ws, recipeId: 'tiny', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium: 'prose', budgetUsd: 5 });
    await store.updateRun(run.id, { status: 'running' });
    const input = { run: { runId: run.id, workspaceId: ws, recipeId: 'tiny', profileId: 'demo', medium: 'prose' as const, problem: { text: 'A memo' }, seeds: [] }, call: { key: `${run.id}/draft/-/1`, stepId: 'draft', stage: 'D1' as const }, step: draft, ports: {}, refs: [] };
    return { runId: run.id, input, end: () => store.updateRun(run.id, { status }) };
  };

  it.each([
    ['CANCELLED, whatever the store says', 'CANCELLED', 'running'],
    ['NOT_FOUND once the store shows the run ended', 'NOT_FOUND', 'cancelled'],
  ] as const)('%s: its call is cut off, and the step ends as cancelled, not as a failed step Temporal could try again', async (_what, reason, status) => {
    const held = heldUntilStopped();
    const acts = createActivities({ gateway: held.gateway, store, prompts: fakePrompts() });
    const { input, end } = await start(status);
    const env = new MockActivityEnvironment();
    const outcome = env.run(acts.modelStep, input).then(
      () => undefined,
      (e: unknown) => e,
    );
    await new Promise<void>((resolve) => {
      const look = () => (held.seen.length > 0 ? resolve() : setImmediate(look));
      look();
    });
    await end();
    env.cancel(reason);
    const err = await outcome;
    expect(err).toBeInstanceOf(CancelledFailure);
    expect((err as Error).message).toBe(STOPPED_STEP);
    expect(held.seen).toHaveLength(1);
    expect(held.seen[0]?.operation?.stop?.aborted).toBe(true);
  });
});

describe('the page renderer one activity invocation sees', () => {
  it('asks the renderer itself whether it can start, so a run is refused in the renderer’s own words (F18)', async () => {
    const inner = fakePages();
    const pages = guardPages(inner, new AbortController().signal);
    await pages.ready();
    expect(inner.readyCalls).toBe(1);
    inner.failReady(new Error('Chromium could not start'));
    await expect(pages.ready()).rejects.toThrow('Chromium could not start');
  });
});

/**
 * The demo's mock, whose text calls the tests can hold. `cuts` says whether the adapter takes a stop at all, so the same
 * mock stands for a provider byway cuts off and for one it does not (Google's calls, every image): a held call that was
 * handed a signal ends as an abort when byway cuts it off, and one that was not answers once its step's cancel has come.
 */
function holdingMock(responders: Readonly<Record<string, Responder>>) {
  const inner = mockAdapter({ responders });
  const held: { req: Parameters<ProviderAdapter['complete']>[0]; release: () => void }[] = [];
  const state = { hold: undefined as ((purpose: string) => boolean) | undefined, cuts: true };
  const adapter: ProviderAdapter = {
    ...inner,
    get cutsOff() {
      return { complete: state.cuts };
    },
    async complete(req) {
      if (state.hold?.(req.context.purpose)) {
        await new Promise<void>((resolve, reject) => {
          held.push({ req, release: resolve });
          if (req.signal) {
            req.signal.addEventListener('abort', () => reject(Object.assign(new Error('The stream was closed.'), { name: 'AbortError' })), { once: true });
            return;
          }
          // Not cut off: it answers once its step's cancel has come (the activity's own signal), not before.
          const cancel = Context.current().cancellationSignal;
          if (cancel.aborted) resolve();
          else cancel.addEventListener('abort', () => resolve(), { once: true });
        });
      }
      return inner.complete(req);
    },
  };
  return {
    adapter,
    held,
    hold(purpose: string, cuts: boolean) {
      state.hold = (p) => p === purpose;
      state.cuts = cuts;
    },
    reset() {
      state.hold = undefined;
      state.cuts = true;
      held.splice(0).forEach((h) => h.release());
    },
  };
}

describe('cancel and stop through the real workflow', () => {
  let h: Harness;
  const responders: Record<string, Responder> = {};
  const mock = holdingMock(responders);
  beforeAll(async () => {
    h = await createHarness({ shutdownGraceTime: '500 milliseconds', shutdownForceTime: '3 seconds', adapters: { mock: mock.adapter } });
  }, 120_000);
  afterAll(async () => {
    h?.setLatency(0);
    h?.pages.release();
    await h?.close();
  }, 60_000);

  const statusIs = (runId: string, status: string) => h.waitFor(`status ${status}`, async () => (await h.store.getRun(runId))?.status === status);

  it('Cancel cuts off a call in flight: the run ends cancelled, nothing is ledgered for it, and Spending records list it (ENG-4, ADR-0111)', async () => {
    // A draft that never parses: without the guard, the step would ask the model again after the first answer.
    responders['build:prose'] = () => '';
    mock.hold('build:prose', true);
    try {
      const run = await h.start(tiny);
      await h.waitFor('the draft call held', async () => mock.held.length === 1);
      await h.runner.cancel(run.id);
      // The run shows Cancelled at once, without waiting for its step; the step then hears of the cancel (a heartbeat's
      // reply) and byway cuts its call off.
      await statusIs(run.id, 'cancelled');
      await h.waitFor('the call cut off', async () => mock.held[0]?.req.signal?.aborted === true);
      const listed = await h.waitFor('the call listed in Spending records', async () => {
        const rows = (await h.gateway.spendRecords(h.workspaceId)).uncertain.filter((c) => c.runId === run.id);
        return rows.length > 0 && rows;
      });
      // The guard refuses every call once the cancel has reached the step, so these are all the calls it made: the
      // cut-off one, never answered.
      const calls = h.calls.filter((c) => c.runId === run.id);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.result).toBeUndefined();
      expect(h.ledger(run.id)).toEqual([]);
      expect(listed).toEqual([expect.objectContaining({ purpose: 'build:prose', provider: 'mock', reason: 'interrupted' })]);
      expect(listed[0]?.usd).toBeGreaterThan(0);
      expect((await h.store.getRun(run.id))?.costUsd).toBe(0);
      const events = await h.store.events(run.id);
      expect(events.at(-1)?.type).toBe('run-cancelled');
      expect(events.some((e) => e.type === 'step-failed')).toBe(false);
    } finally {
      delete responders['build:prose'];
      mock.reset();
    }
  }, 60_000);

  it('a call byway does not cut off finishes after Cancel and is paid for: the run’s cost catches up with the ledger (ENG-4)', async () => {
    responders['build:prose'] = () => '';
    mock.hold('build:prose', false);
    try {
      const run = await h.start(tiny);
      await h.waitFor('the draft call held', async () => mock.held.length === 1);
      await h.runner.cancel(run.id);
      await statusIs(run.id, 'cancelled');
      // Handed no signal, nothing cuts it off: it answers once Temporal's cancel has reached its step, as a provider
      // that finishes its answer whatever byway does, and it is settled and paid for after the run has stopped.
      const calls = await h.waitFor('the call to answer', async () => {
        const made = h.calls.filter((c) => c.runId === run.id);
        return made.every((c) => c.result !== undefined) && made;
      });
      expect(mock.held[0]?.req.signal).toBeUndefined();
      expect(calls).toHaveLength(1);
      const ledger = h.ledger(run.id).reduce((sum, e) => sum + e.costUsd, 0);
      expect(ledger).toBeGreaterThan(0);
      await h.waitFor('the run’s cost to match the ledger', async () => Math.abs(((await h.store.getRun(run.id))?.costUsd ?? 0) - ledger) < 1e-12);
      expect((await h.gateway.spendRecords(h.workspaceId)).uncertain.filter((c) => c.runId === run.id)).toEqual([]);
      expect((await h.store.events(run.id)).at(-1)?.type).toBe('run-cancelled');
    } finally {
      delete responders['build:prose'];
      mock.reset();
    }
  }, 60_000);

  it('Cancel at the composed limits’ peak stops every call: no activity starts and nothing is ledgered after it (F02, SUB-DA-4)', async () => {
    // The fan-out is at the composed limits: two slots of a replicate at its limit, 32 model calls at once.
    expect(composedLimitProblems(cancelPeak)).toEqual([]);
    expect(workBound(cancelPeak).peak).toBe(COMPOSED_LIMITS.peak);
    mock.hold('build:prose', true);
    try {
      const run = await h.start(cancelPeak);
      await h.waitFor('every branch’s call held', async () => mock.held.length === COMPOSED_LIMITS.peak, 60_000);
      await h.runner.cancel(run.id);
      await statusIs(run.id, 'cancelled');
      // Every call is cut off as its step hears of the cancel, and each is listed once its call has ended.
      await h.waitFor('every call cut off', async () => mock.held.every((c) => c.req.signal?.aborted === true), 60_000);
      await h.waitFor('every call listed', async () => (await h.gateway.spendRecords(h.workspaceId)).uncertain.filter((c) => c.runId === run.id).length === COMPOSED_LIMITS.peak, 60_000);
      // None answered, and no call or step came after them.
      const calls = h.calls.filter((c) => c.runId === run.id);
      expect(calls).toHaveLength(COMPOSED_LIMITS.peak);
      expect(calls.every((c) => c.result === undefined)).toBe(true);
      expect(h.ledger(run.id)).toEqual([]);
      const events = await h.store.events(run.id);
      expect(events.filter((e) => e.type === 'step-started' && e.stepId === 'draft')).toHaveLength(COMPOSED_LIMITS.peak);
      expect(events.some((e) => e.type === 'step-started' && e.stepId === 'after')).toBe(false);
      expect(events.at(-1)?.type).toBe('run-cancelled');
      const listed = (await h.gateway.spendRecords(h.workspaceId)).uncertain.filter((c) => c.runId === run.id);
      expect(listed).toHaveLength(COMPOSED_LIMITS.peak);
      expect(listed.every((c) => c.reason === 'interrupted')).toBe(true);
    } finally {
      mock.reset();
    }
  }, 120_000);

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
    // Expected output: the SDK logs "[ERROR] Worker failed" with GracefulShutdownPeriodExpiredError here. That is this
    // test's intended outcome (worker.ts `abandoned`), not a failure. The suite's log is left unfiltered, so a real
    // error of that kind elsewhere stays visible.
    const stopped = await Promise.race([h.worker.shutdown().then(() => 'stopped'), sleep(20_000).then(() => 'still stopping')]);
    expect(stopped).toBe('stopped');
    expect(Date.now() - started).toBeLessThan(10_000);
    // The held renders were told to stop (their step was cancelled by the shutdown), not left waiting.
    expect(h.pages.waiting()).toBe(0);
    expect(pagesRun.id).toBeTruthy();
  }, 60_000);
});
