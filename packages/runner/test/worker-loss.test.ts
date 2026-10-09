/**
 * The run engine losing its worker mid-run, end to end through the real workflow (F03 stage 3; ADR-0099): the e2e
 * harness with the worker on the store's spend book, as production runs it. Nothing leaves this computer: the provider
 * is the demo's mock (and, for clips, a stand-in for fal's queue on 127.0.0.1).
 *
 * - A worker killed outright while fal makes a relay link's clip (a process killed: no clean stop, nothing handed
 *   back). Temporal runs the link again on a new worker once the dead one's heartbeat times out; the new attempt takes
 *   the call over and polls the clip's stored request id. One clip is bought per link, and the run goes on.
 * - A worker stopped cleanly (scripts/serve.ts's order) while a C2 seed stage is in flight, then started again. The
 *   stopped calls may have been billed: they count against the workspace only, at once, and are listed as interrupted
 *   until cleared. The seeds Temporal runs again are admitted under the run's budget without a budget question, though
 *   that budget holds the seed stage once and not twice.
 *
 * Each waits out Temporal's 30 s heartbeat timeout (workflow code, unchanged), so each takes about a minute.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { c2 } from '@byway/catalog';
import type { CheckpointRecord, CheckpointResolution } from '@byway/contracts';
import { mockAdapter, type ProviderAdapter } from '@byway/gateway';
import { relay, seq, step, withHash, type Recipe, type Step } from '@byway/recipe';
import { READY_PROMPT } from '../src/workflow/wording.ts';
import { createHarness, type Harness } from './helpers/harness.ts';
import { boardAdapter, relayBoard, type RelayBoard } from './helpers/relay-board.ts';

/** A budget question ("Raise the budget by $X?", "Raise the workspace budget by $X?"). */
const BUDGET_QUESTION = /^Raise the (workspace )?budget by \$/;

/** Answers that record any budget question and decline it, so a question cannot pass unseen. */
function refusingBudget(asked: CheckpointRecord[], answer: (cp: CheckpointRecord) => CheckpointResolution | undefined = () => undefined) {
  return (cp: CheckpointRecord): CheckpointResolution | undefined => {
    if (cp.kind === 'confirm' && BUDGET_QUESTION.test(cp.prompt ?? '')) {
      asked.push(cp);
      return { checkpointId: cp.id, approved: false };
    }
    return answer(cp);
  };
}

/** A storyboard, its frames, and two relay links. */
const relayLinks: Recipe = withHash({
  schema: 'byway.recipe/1',
  id: 'relay-links',
  title: 'relay-links',
  kind: 'composed',
  family: 'test',
  channel: 'workspace',
  medium: 'media',
  inputs: ['intent'],
  stages: [
    {
      stage: 'D1',
      body: seq(
        step({ id: 'board', role: 'build', actor: 'model', tier: 'mid', prompt: 'product.test.board', consumes: ['intent'], produces: ['artifact'], writes: true }),
        step({ id: 'frames', role: 'asset', block: 'ASSET', actor: 'model', tier: 'mid', prompt: 'product.test.frames', consumes: ['artifact'], produces: ['artifact', 'anchor'], writes: true }),
        relay('links', 2, step({ id: 'clip', role: 'relay', block: 'RELAY', actor: 'model', tier: 'mid', prompt: 'product.test.clip', consumes: ['anchor', 'artifact'], produces: ['artifact', 'anchor'], writes: true }) as Step),
      ),
    },
  ],
  sitsOut: [],
  exceptions: [],
  bank: false,
});

describe('a worker killed while fal makes a relay link’s clip (F03 stage 3)', () => {
  let h: Harness;
  let board: RelayBoard;
  beforeAll(async () => {
    board = await relayBoard();
    // A short lease: the killed worker's call is taken over well before Temporal's 30 s heartbeat timeout passes.
    h = await createHarness({ book: 'store', adapters: { mock: boardAdapter(board.url) }, leaseMs: 3_000, renewEveryMs: 500 });
  }, 120_000);
  afterAll(async () => {
    await h?.close();
    await board?.close();
  }, 60_000);

  it('a new worker resumes the clip by its stored request id: one clip bought per link, one ledger entry each, nothing left as may have been billed', async () => {
    await h.stopWorker();
    const killed = await h.spawnWorkerProcess({ boardUrl: board.url });
    const run = await h.start(relayLinks, { problem: { text: 'A 10-second ad for a reusable cup' } });
    await h.waitFor('the first clip submitted and being made', async () => board.submissions.length === 1 && board.polls.length >= 1, 90_000);
    // Recorded in the spend book as accepted, with its job id, before it was polled.
    const flying = await h.store.spendBook.records(h.workspaceId);
    expect(flying.inFlight).toEqual([expect.objectContaining({ runId: run.id, purpose: 'relay:media' })]);
    await killed.kill();
    board.release();
    await h.startWorker();
    const asked: CheckpointRecord[] = [];
    const view = await h.drive(run.id, refusingBudget(asked), 180_000);
    expect(view.run.error).toBeUndefined();
    expect(view.run.status).toBe('done');
    expect(asked).toEqual([]);
    // Two links, two clips: the killed worker's job was polled again by its id, never submitted again.
    expect(board.submissions.map((s) => s.shot)).toEqual([1, 2]);
    expect(board.polls.filter((id) => id === 'job-1').length).toBeGreaterThanOrEqual(2);
    expect(h.ledger(run.id).filter((e) => e.kind === 'video')).toHaveLength(2);
    expect(await h.store.spendBook.spend(h.workspaceId)).toMatchObject({ inFlightUsd: 0, uncertainUsd: 0 });
  }, 240_000);
});

describe('a worker stopped cleanly during a C2 seed stage, and started again (F03 stage 3)', () => {
  let h: Harness;
  /** While set, every seed call hangs: the seed stage is in flight when the worker stops, as a slow provider leaves it. */
  const hold = { seeds: true };
  const mock = mockAdapter();
  const seedsHang: ProviderAdapter = {
    ...mock,
    async complete(req) {
      if (hold.seeds && req.context.purpose.startsWith('seed:')) await new Promise(() => undefined);
      return mock.complete(req);
    },
  };
  beforeAll(async () => {
    h = await createHarness({ book: 'store', adapters: { mock: seedsHang }, shutdownGraceTime: '500 milliseconds', shutdownForceTime: '2 seconds' });
  }, 120_000);
  afterAll(async () => {
    await h?.close();
  }, 60_000);

  it('the stopped seeds count against the workspace only, as interrupted, until cleared; the retried stage raises no budget question', async () => {
    const run = await h.start(c2, { problem: { text: 'Positioning options for a bike repair subscription' } });
    const seedsInFlight = async () => (await h.store.spendBook.records(h.workspaceId)).inFlight.filter((c) => c.runId === run.id && c.purpose === 'seed:options');
    await h.waitFor('the seed stage in flight', async () => (await seedsInFlight()).length === 12, 90_000);
    const stage = Math.round((await seedsInFlight()).reduce((usd, c) => usd + c.usd, 0) * 1e6) / 1e6;
    expect(stage).toBeGreaterThan(0);
    // The run's budget holds the seed stage once, not twice: had the stopped calls counted against the run, the stage
    // run again on the new worker would ask to raise it.
    const spent = (await h.store.spendBook.spend(h.workspaceId)).byRun[run.id] ?? 0;
    await h.store.updateRun(run.id, { budgetUsd: Math.round((spent + 1.5 * stage) * 100) / 100 });

    await h.stopWorker();
    // At once, without waiting for a lease: the stopped seeds may have been billed, against the workspace only.
    expect(await h.store.spendBook.spend(h.workspaceId)).toMatchObject({ inFlightUsd: 0, uncertainUsd: stage });
    hold.seeds = false;
    await h.startWorker();

    const asked: CheckpointRecord[] = [];
    let ready = 0;
    const view = await h.drive(
      run.id,
      refusingBudget(asked, (cp) => (cp.prompt === READY_PROMPT ? { checkpointId: cp.id, approved: ++ready > 1 } : undefined)),
      180_000,
    );
    expect(asked).toEqual([]);
    expect(view.run.error).toBeUndefined();
    expect(view.run.status).toBe('done');
    expect(h.succeeded(run.id).filter((c) => c.purpose === 'seed:options')).toHaveLength(12);

    const { uncertain } = await h.store.spendBook.records(h.workspaceId);
    const stopped = uncertain.filter((u) => u.runId === run.id);
    expect(stopped).toHaveLength(12);
    expect(stopped.every((u) => u.reason === 'interrupted' && u.purpose === 'seed:options')).toBe(true);
    expect((await h.store.spendBook.spend(h.workspaceId)).uncertainUsd).toBeCloseTo(stage, 6);
    // Settings' Clear stops counting them.
    expect(await h.store.spendBook.clearUncertain(h.workspaceId, stopped.map((u) => u.opId))).toBe(12);
    expect(await h.store.spendBook.spend(h.workspaceId)).toMatchObject({ uncertainUsd: 0, inFlightUsd: 0 });
  }, 240_000);
});
