/**
 * One refusal rule for every provider (ADR-0102), as a run sees it: the gateway asks a declining model once more on the
 * same model; the run's events log the decline, the second ask and its outcome (a 'model-declined' event beside the
 * ledger's two entries); and when the second ask brings no answer the step fails with one plain message, not retried.
 * Real gateway in demo mode, with a mock responder that declines.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationFailure } from '@temporalio/common';
import { CATALOG } from '@byway/catalog';
import type { ArtifactStore, RunEvent, SpendBook } from '@byway/contracts';
import { createGateway, memorySpendBook, mockAdapter, PRICES, responderFor, type ModelGateway, type PriceRow, type ProviderAdapter, type Responder } from '@byway/gateway';
import { createPromptRenderer } from '@byway/prompts';
import { steps } from '@byway/recipe';
import { createActivities } from '../src/activities/index.ts';
import { serializeJson } from '../src/formats.ts';
import { FAILURE, toStepSpec, type AssetInput, type RunRef, type StepSpec } from '../src/types.ts';
import { storeBrief } from './helpers/briefs.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

let dir: string;
let store: MemoStore;
let workspaceId: string;
let gateway: ModelGateway | undefined;
/** Gateways a test opened besides `gateway`, closed after it. */
const opened: ModelGateway[] = [];

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-declines-'));
  store = createTestStore({ dataDir: dir });
  workspaceId = (await store.ensureDefaultWorkspace()).id;
});
afterEach(async () => {
  await gateway?.close();
  gateway = undefined;
  for (const g of opened.splice(0)) await g.close();
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
  const run: RunRef = { runId: created.id, workspaceId, recipeId: 'r', profileId: 'demo', medium: 'prose', problemId: await storeBrief(store.artifacts, { text: 'A memo about the move' }) };
  const acts = createActivities({ gateway: declining(times), store, prompts: fakePrompts() });
  const result = await acts.modelStep({ run, call: { key: `${run.runId}/concept/-/1`, stepId: 'concept', stage: 'D1' }, step, ports: {}, refs: [] }).catch((e: unknown) => e);
  return { result, events: await store.events(run.runId), run };
}

const declinedEvents = (events: RunEvent[]) => events.filter((e) => e.type === 'model-declined');

/** Waits (up to five seconds) until `done` holds. */
async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 500 && !done(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(done()).toBe(true);
}

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

/**
 * A decline is never bought again when its step runs again (ADR-0102): Temporal's retry after a crash, a timeout or a
 * local failure, or the same step run again after the person raises a budget. The image step is where it shows: a
 * declined image does not stop the step, so a later image's budget question runs the whole step again. Real gateway in
 * demo mode, with images priced at $0.04 each and a model that declines shot 1's image.
 */
describe('an image the model declined, when its step runs again (ADR-0102)', () => {
  // A still per shot: C5's anchor-frames step without its anchor, since with a video model it makes shot 1's still alone
  // (F12 (b), 2026-10-31). The decline rules hold on any image step that makes several.
  const FRAMES: StepSpec = { ...toStepSpec(steps(CATALOG.find((r) => r.id === 'c5')!).find(({ step: s }) => s.id === 'anchor-frames')!.step), produces: ['artifact'] };
  const BRIEFS = '```json\n' + JSON.stringify({ images: [1, 2, 3].map((slot) => ({ slot, prompt: `An image for ${slot}`, alt: `Alt ${slot}`, size: '1536x1024' })) }) + '\n```';
  const STORYBOARD = serializeJson({ storyboard: [1, 2, 3].map((shot) => ({ shot, description: `Shot ${shot} shows the cup`, imagePrompt: `The cup, angle ${shot}`, durationSec: 3 })), voiceover: 'Less waste.' });
  const SHOT_1 = 'An image for 1';
  const PRICED: PriceRow[] = [...PRICES.filter((p) => !(p.provider === 'mock' && p.model === 'mock-image')), { provider: 'mock', model: 'mock-image', inputPerMTok: 0, outputPerMTok: 0, perImageUsd: 0.04, source: 'decline tests' }];

  /**
   * The demo's adapter, with its image answers scripted per prompt: the nth ask of a prompt declines, answers with no image,
   * hangs (a worker that dies while it waits), or answers. Each ask is billed one image ($0.04), a decline included.
   */
  function imageModel(script: (prompt: string, n: number) => 'decline' | 'no-image' | 'hang' | 'answer' = () => 'answer') {
    const base = mockAdapter({ responders: { 'asset.briefs:media': () => BRIEFS } });
    const asked: string[] = [];
    const adapter: ProviderAdapter = {
      ...base,
      async image(req) {
        asked.push(req.prompt);
        const what = script(req.prompt, asked.filter((p) => p === req.prompt).length);
        if (what === 'hang') await new Promise<never>(() => undefined);
        const made = await base.image!(req);
        if (what === 'decline') return { ...made, bytes: new Uint8Array(), refusal: 'declined (IMAGE_SAFETY)', declined: { reason: 'IMAGE_SAFETY' }, responseBody: { declined: 'IMAGE_SAFETY' } };
        // An answer with text and no image, billed like any other: not a decline.
        if (what === 'no-image') return { ...made, bytes: new Uint8Array(), refusal: 'returned no image (text only)', responseBody: { text: 'A cup, described.' } };
        return made;
      },
    };
    return { adapter, asks: (prompt: string) => asked.filter((p) => p === prompt).length };
  }

  function imaging(adapter: ProviderAdapter, cap: { run: number }, book: SpendBook = memorySpendBook(), artifacts: ArtifactStore = store.artifacts): ModelGateway {
    const g = createGateway({
      ledgerPath: path.join(dir, 'ledger.jsonl'),
      artifacts,
      spendBook: book,
      caps: { workspaceCapUsd: () => 100, runCapUsd: () => cap.run },
      env: {},
      demo: true,
      prices: PRICED,
      adapters: { mock: adapter },
    });
    opened.push(g);
    return g;
  }

  async function frames(): Promise<AssetInput> {
    const created = await store.createRun({ id: `run-${Math.random().toString(36).slice(2)}`, workspaceId, recipeId: 'c5', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium: 'media', budgetUsd: 5 });
    await store.updateRun(created.id, { status: 'running' });
    const run: RunRef = { runId: created.id, workspaceId, recipeId: 'c5', profileId: 'demo', medium: 'media', problemId: await storeBrief(store.artifacts, { text: 'An ad for a cup' }) };
    const artifact = (await store.artifacts.putText(STORYBOARD, 'application/json')).id;
    return { run, call: { key: `${run.runId}/anchor-frames/-/1`, stepId: 'anchor-frames', stage: 'D2' }, step: FRAMES, ports: { artifact } };
  }

  /** Shot 1's image on the storyboard the step wrote. */
  const shot1Image = async (id: string) => (JSON.parse(await store.artifacts.getText(id)) as { storyboard: { imageArtifactId?: string }[] }).storyboard[0]!.imageArtifactId;

  const ledger = () =>
    readFileSync(path.join(dir, 'ledger.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { kind: string; costUsd: number; declined?: unknown; retryOf?: string; id: string });

  const stepNote = async (runId: string) => (await store.events(runId)).filter((e) => e.type === 'step-finished').map((e) => (e.data as { note?: string }).note).at(-1) ?? '';

  it('declined twice, then a later image meets the budget question: the step run again after the raise asks shot 1 nothing', async () => {
    // $0.10: shot 1's image and its retry fit ($0.08); shot 2's would not.
    const cap = { run: 0.1 };
    const model = imageModel((prompt) => (prompt === SHOT_1 ? 'decline' : 'answer'));
    const acts = createActivities({ gateway: imaging(model.adapter, cap), store, prompts: createPromptRenderer() });
    const input = await frames();
    expect(await acts.assetStep(input).catch((e: unknown) => e)).toMatchObject({ type: FAILURE.budget });
    expect(model.asks(SHOT_1)).toBe(2);
    cap.run = 1;
    const result = await acts.assetStep(input);
    expect(model.asks(SHOT_1)).toBe(2);
    // Both attempts of shot 1's image are in the step's cost, once: $0.08, and shots 2 and 3 at $0.04 each.
    expect(result.costUsd).toBeCloseTo(0.16, 9);
    expect(await shot1Image(result.artifactId!)).toBeUndefined();
    expect(await stepNote(input.run.runId)).toContain('The demo’s model mock-image declined the image for shot 1 (reason given: IMAGE_SAFETY). byway asked it once more, and it declined again. Both attempts were billed: $0.0800 in all.');
    expect(ledger().filter((e) => e.kind === 'image')).toHaveLength(4);
    expect(declinedEvents(await store.events(input.run.runId)).map((e) => (e.data as { retry?: string }).retry)).toEqual(['declined']);
  });

  it('declined once with no room for the retry, then the budget question: the decline stays final, and nothing asks shot 1 again', async () => {
    // $0.06: shot 1's image fits, its retry does not ($0.08), nor does shot 2's image.
    const cap = { run: 0.06 };
    const model = imageModel((prompt) => (prompt === SHOT_1 ? 'decline' : 'answer'));
    const acts = createActivities({ gateway: imaging(model.adapter, cap), store, prompts: createPromptRenderer() });
    const input = await frames();
    expect(await acts.assetStep(input).catch((e: unknown) => e)).toMatchObject({ type: FAILURE.budget });
    cap.run = 1;
    const result = await acts.assetStep(input);
    expect(model.asks(SHOT_1)).toBe(1);
    expect(result.costUsd).toBeCloseTo(0.12, 9);
    expect(await stepNote(input.run.runId)).toContain(
      'The demo’s model mock-image declined the image for shot 1 (reason given: IMAGE_SAFETY). byway did not ask it again: another attempt (estimated at $0.0400) would take the run over its budget of $0.06. The declined attempt was billed: $0.0400.',
    );
    expect(declinedEvents(await store.events(input.run.runId)).map((e) => (e.data as { retry?: string }).retry)).toEqual(['not-made']);
  });

  it('a retry billed with no image: both attempts are in the step’s cost and its note, and the run’s event names the retry’s entry', async () => {
    const model = imageModel((prompt, n) => (prompt !== SHOT_1 ? 'answer' : n === 1 ? 'decline' : 'no-image'));
    const acts = createActivities({ gateway: imaging(model.adapter, { run: 1 }), store, prompts: createPromptRenderer() });
    const input = await frames();
    const result = await acts.assetStep(input);
    expect(model.asks(SHOT_1)).toBe(2);
    expect(result.costUsd).toBeCloseTo(0.16, 9);
    expect(await stepNote(input.run.runId)).toContain('byway asked it once more, but that attempt failed: mock returned no image (text only). Both attempts were billed: $0.0800 in all.');
    const retry = ledger().find((e) => e.retryOf !== undefined)!;
    expect(declinedEvents(await store.events(input.run.runId)).map((e) => e.data)).toEqual([expect.objectContaining({ retry: 'failed', retryLedgerEntryId: retry.id, retryCostUsd: 0.04 })]);
  });

  it('a retry billed whose image byway could not store: the step stops, as for any billed image it could not keep, and buys no more images', async () => {
    const model = imageModel((prompt, n) => (prompt === SHOT_1 && n === 1 ? 'decline' : 'answer'));
    // The first image byway stores is the retry's: keeping it fails after the retry was billed.
    let puts = 0;
    const full: ArtifactStore = {
      put: async (bytes, mediaType) => {
        if (++puts === 1) throw new Error('disk full');
        return store.artifacts.put(bytes, mediaType);
      },
      putText: (text, mediaType) => store.artifacts.putText(text, mediaType),
      get: (id) => store.artifacts.get(id),
      getText: (id) => store.artifacts.getText(id),
      has: (id) => store.artifacts.has(id),
    };
    const acts = createActivities({ gateway: imaging(model.adapter, { run: 1 }, memorySpendBook(), full), store, prompts: createPromptRenderer() });
    const input = await frames();
    const err = await acts.assetStep(input).catch((e: unknown) => e);
    // The billed failure's own words: nothing is asked again, and the advice for a decline does not follow.
    expect(err).toBeInstanceOf(ApplicationFailure);
    expect(err).toMatchObject({
      type: FAILURE.step,
      nonRetryable: true,
      message:
        'The demo’s model mock-image declined this image (reason given: IMAGE_SAFETY). byway asked it once more, but that attempt failed: mock made the image and billed it, but it could not be stored: disk full. It is not retried, because a retry would pay again. Both attempts were billed: $0.0800 in all. That was the image for shot 1, so the run stops here, at the Custom imagery step, and buys no more images.',
    });
    expect(model.asks(SHOT_1)).toBe(2);
    expect(model.asks('An image for 2')).toBe(0);
    const retry = ledger().find((e) => e.retryOf !== undefined)!;
    expect(declinedEvents(await store.events(input.run.runId)).map((e) => e.data)).toEqual([expect.objectContaining({ retry: 'failed', retryLedgerEntryId: retry.id, retryCostUsd: 0.04 })]);
  });

  it('a worker lost during the retry: the next attempt makes the retry alone, and the declined image is not bought again', async () => {
    const book = memorySpendBook();
    const cap = { run: 1 };
    // Worker A: shot 1's image declines, and its retry never comes back (the worker dies while it waits).
    const lost = imageModel((prompt, n) => (prompt !== SHOT_1 ? 'answer' : n === 1 ? 'decline' : 'hang'));
    const workerA = imaging(lost.adapter, cap, book);
    const input = await frames();
    void createActivities({ gateway: workerA, store, prompts: createPromptRenderer() }).assetStep(input).catch(() => undefined);
    await until(() => lost.asks(SHOT_1) === 2);
    // Its leases end (a stopped worker's are ended at once; a dead one's run out): the retry may have been billed.
    await workerA.close();
    // Worker B runs the step's next attempt.
    const fresh = imageModel();
    const result = await createActivities({ gateway: imaging(fresh.adapter, cap, book), store, prompts: createPromptRenderer() }).assetStep(input);
    expect(fresh.asks(SHOT_1)).toBe(1);
    const images = ledger().filter((e) => e.kind === 'image');
    const declinedEntry = images.filter((e) => e.declined !== undefined);
    expect(declinedEntry).toHaveLength(1);
    // Shot 1's one ledgered retry names the declined call; no other entry buys shot 1's image again.
    expect(images.filter((e) => e.retryOf !== undefined).map((e) => e.retryOf)).toEqual([declinedEntry[0]!.id]);
    expect(images).toHaveLength(4);
    expect(await shot1Image(result.artifactId!)).toBeDefined();
    expect(declinedEvents(await store.events(input.run.runId)).map((e) => (e.data as { retry?: string }).retry)).toEqual(['answered']);
  });
});
