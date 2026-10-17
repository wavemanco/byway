/**
 * One refusal rule for every provider (ADR-0102), as a run sees it: the gateway asks a declining model once more on the
 * same model; the run's events log the decline, the second ask and its outcome (a 'model-declined' event beside the
 * ledger's two entries); and when the second ask brings no answer the step fails with one plain message, not retried.
 * Real gateway in demo mode, with a mock responder that declines.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationFailure } from '@temporalio/common';
import type { RunEvent } from '@byway/contracts';
import { createGateway, memorySpendBook, responderFor, type ModelGateway, type Responder } from '@byway/gateway';
import { createActivities } from '../src/activities/index.ts';
import { FAILURE, type RunRef } from '../src/types.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

let dir: string;
let store: MemoStore;
let workspaceId: string;
let gateway: ModelGateway | undefined;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-declines-'));
  store = createTestStore({ dataDir: dir });
  workspaceId = (await store.ensureDefaultWorkspace()).id;
});
afterEach(async () => {
  await gateway?.close();
  gateway = undefined;
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const step = { id: 'concept', role: 'build' as const, actor: 'model' as const, tier: 'mid' as const, prompt: 'product.test.concept', consumes: ['intent' as const], produces: ['artifact' as const], writes: true };

/** A demo gateway whose build answers decline `times` times, then answer as the demo does. */
function declining(times: number): ModelGateway {
  const build: Responder = (ctx) => (ctx.iteration < times ? { text: '', declined: { reason: 'cyber' } } : responderFor(ctx.purpose)!(ctx));
  gateway = createGateway({
    ledgerPath: path.join(dir, 'ledger.jsonl'),
    artifacts: store.artifacts,
    spendBook: memorySpendBook(),
    caps: { workspaceCapUsd: () => 100, runCapUsd: () => 100 },
    env: {},
    demo: true,
    mockResponders: { 'build:prose': build },
  });
  return gateway;
}

async function attempt(times: number): Promise<{ result: unknown; events: RunEvent[]; run: RunRef }> {
  const created = await store.createRun({ id: `run-${Math.random().toString(36).slice(2)}`, workspaceId, recipeId: 'r', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium: 'prose', budgetUsd: 5 });
  await store.updateRun(created.id, { status: 'running' });
  const run: RunRef = { runId: created.id, workspaceId, recipeId: 'r', profileId: 'demo', medium: 'prose', problem: { text: 'A memo about the move' }, seeds: [] };
  const acts = createActivities({ gateway: declining(times), store, prompts: fakePrompts() });
  const result = await acts.modelStep({ run, call: { key: `${run.runId}/concept/-/1`, stepId: 'concept', stage: 'D1' }, step, ports: {}, refs: [] }).catch((e: unknown) => e);
  return { result, events: await store.events(run.runId), run };
}

const declinedEvents = (events: RunEvent[]) => events.filter((e) => e.type === 'model-declined');

describe('a model that declines once (ADR-0102)', () => {
  it('is asked once more; the step goes on with the answer, and the run’s events say what happened', async () => {
    const { result, events } = await attempt(1);
    expect(result).not.toBeInstanceOf(Error);
    expect(events.some((e) => e.type === 'step-failed')).toBe(false);
    const [declined] = declinedEvents(events);
    expect(declinedEvents(events)).toHaveLength(1);
    expect(declined).toMatchObject({
      stepId: 'concept',
      data: {
        provider: 'mock',
        model: 'mock-mid',
        purpose: 'build:prose',
        kind: 'completion',
        reason: 'cyber',
        retry: 'answered',
        ledgerEntryId: expect.any(String),
        retryLedgerEntryId: expect.any(String),
        note: 'The demo’s model mock-mid declined this request (reason given: cyber). byway asked it once more, and it answered. byway recorded no cost for either attempt.',
      },
    });
  });

  it('logs the decline once when the step runs again and gets its kept answer', async () => {
    const { run } = await attempt(1);
    const acts = createActivities({ gateway: gateway!, store, prompts: fakePrompts() });
    // The same step call again, as Temporal runs it after a local failure: its paid answer comes from the memo.
    await acts.modelStep({ run, call: { key: `${run.runId}/concept/-/1`, stepId: 'concept', stage: 'D1' }, step, ports: {}, refs: [] });
    expect(declinedEvents(await store.events(run.runId))).toHaveLength(1);
  });
});

describe('a model that declines twice (ADR-0102)', () => {
  it('fails the step with one plain message, not retried, and logs the decline and the second ask', async () => {
    const { result, events } = await attempt(2);
    expect(result).toBeInstanceOf(ApplicationFailure);
    const story = 'The demo’s model mock-mid declined this request (reason given: cyber). byway asked it once more, and it declined again. byway recorded no cost for either attempt.';
    const message = `${story} Rephrase the request, or choose another model profile in Settings, then try again.`;
    expect(result).toMatchObject({ type: FAILURE.step, nonRetryable: true, message });
    // The event tells what happened; the step's failure says what to do.
    expect(declinedEvents(events).map((e) => e.data)).toEqual([expect.objectContaining({ retry: 'declined', reason: 'cyber', note: story })]);
  });
});
