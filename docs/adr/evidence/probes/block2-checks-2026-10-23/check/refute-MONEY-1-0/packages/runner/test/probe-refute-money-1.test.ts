/**
 * PROBE (refute-MONEY-1-0): an image whose whole wait runs out, end to end. Real gateway (demo mode, the mock image
 * adapter marked answered whole, so it gets a Deadline, and hanging until that deadline aborts it, as Google's SDK
 * rejects), the real memo layer (createActivities), and the store's own SQLite spend book. Only setTimeout and
 * clearTimeout are faked.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG } from '@byway/catalog';
import { createGateway, mockAdapter, PRICES, type ModelGateway, type PriceRow, type ProviderAdapter } from '@byway/gateway';
import { createPromptRenderer } from '@byway/prompts';
import { steps } from '@byway/recipe';
import { createActivities } from '../src/activities/index.ts';
import { serializeJson } from '../src/formats.ts';
import { toStepSpec, type AssetInput, type RunRef, type StepSpec } from '../src/types.ts';
import { storeBrief } from './helpers/briefs.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

const MINUTE = 60_000;
let dir: string;
let store: MemoStore;
let workspaceId: string;
const opened: ModelGateway[] = [];

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-probe-m1-'));
  store = createTestStore({ dataDir: dir });
  workspaceId = (await store.ensureDefaultWorkspace()).id;
});
afterEach(async () => {
  vi.useRealTimers();
  for (const g of opened.splice(0)) await g.close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const PRICED: PriceRow[] = [...PRICES.filter((p) => !(p.provider === 'mock' && p.model === 'mock-image')), { provider: 'mock', model: 'mock-image', inputPerMTok: 0, outputPerMTok: 0, perImageUsd: 0.04, source: 'probe' }];

function hangingImages(briefs: Record<string, string>) {
  const base = mockAdapter({ responders: briefs });
  const sends: { prompt: string; at: number }[] = [];
  const adapter: ProviderAdapter = {
    ...base,
    answersWhole: { image: true },
    async image(req) {
      sends.push({ prompt: req.prompt, at: Date.now() });
      const signal = req.deadline?.signal;
      if (!signal) throw new Error('no deadline');
      await new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')), { once: true }));
      throw new Error('unreachable');
    },
  };
  return { adapter, sends };
}

function gatewayWith(adapter: ProviderAdapter): ModelGateway {
  const g = createGateway({
    ledgerPath: path.join(dir, 'ledger.jsonl'),
    artifacts: store.artifacts,
    spendBook: store.spendBook,
    caps: { workspaceCapUsd: () => 100, runCapUsd: () => 100 },
    env: {},
    demo: true,
    prices: PRICED,
    adapters: { mock: adapter },
    retry: { sleep: async () => {}, random: () => 0.5 },
  }, 120_000);
  opened.push(g);
  return g;
}

async function drive<T>(p: Promise<T>): Promise<T> {
  let done = false;
  const out = p.then(
    (v) => ((done = true), v),
    (e) => {
      done = true;
      throw e;
    },
  );
  for (let i = 0; i < 2000 && !done; i++) { for (let k = 0; k < 30; k++) await new Promise((r) => setImmediate(r)); if (vi.getTimerCount() > 0) await vi.advanceTimersByTimeAsync(MINUTE / 2); }
  return out;
}

const stepNote = async (runId: string) => (await store.events(runId)).filter((e) => e.type === 'step-finished').map((e) => (e.data as { note?: string }).note).at(-1) ?? '';

describe('PROBE: a waited image in the asset step, end to end', () => {
  it('prose, triesPerSlot 3 (C1 sets 3): how many sends, how many waited rows, what the note says', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const BRIEFS = '```json\n{"images":[{"slot":"hero","prompt":"A loaf","alt":"A loaf","size":"1024x1024"}]}\n```';
    const model = hangingImages({ 'asset.briefs:prose': () => BRIEFS });
    const acts = createActivities({ gateway: gatewayWith(model.adapter), store, prompts: fakePrompts() });
    const created = await store.createRun({ id: `run-${Math.random().toString(36).slice(2)}`, workspaceId, recipeId: 'tiny', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium: 'prose', budgetUsd: 5 });
    await store.updateRun(created.id, { status: 'running' });
    const run: RunRef = { runId: created.id, workspaceId, recipeId: 'tiny', profileId: 'demo', medium: 'prose', problemId: await storeBrief(store.artifacts, { text: 'A memo' }) };
    const step: StepSpec = { id: 'art', role: 'asset', block: 'ASSET', actor: 'model', prompt: 'product.test.art', consumes: ['artifact'], produces: ['artifact'], writes: true, knobs: { triesPerSlot: 3 } };
    const doc = (await store.artifacts.putText('# Memo\n', 'text/markdown')).id;
    const t0 = Date.now();
    const outcome = await drive(acts.assetStep({ run, call: { key: `${run.runId}/art/-/1`, stepId: 'art', stage: 'D1' }, step, ports: { artifact: doc } }).catch((e: unknown) => e));
    const records = await store.spendBook.records?.(workspaceId).catch(() => undefined);
    const g = opened[0]!;
    const listed = (await g.spendRecords(workspaceId)).uncertain;
    console.log('PROSE outcome', JSON.stringify(outcome));
    console.log('PROSE sends', model.sends.length, 'minutes elapsed', (model.sends.at(-1)!.at - t0) / MINUTE, 'total', (Date.now() - t0) / MINUTE);
    console.log('PROSE uncertain rows', JSON.stringify(listed.map((r) => ({ reason: r.reason, waited: r.waited, usd: r.usd }))));
    console.log('PROSE spent', JSON.stringify(await g.spend(workspaceId)));
    console.log('PROSE note', await stepNote(run.runId));
    void records;
    expect(model.sends.length).toBeGreaterThan(0);
  }, 120_000);

  it('media C5 anchor-frames, shot 1 hangs: sends of shot 1, rows, note', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const FRAMES = toStepSpec(steps(CATALOG.find((r) => r.id === 'c5')!).find(({ step: s }) => s.id === 'anchor-frames')!.step);
    const BRIEFS = '```json\n' + JSON.stringify({ images: [1].map((slot) => ({ slot, prompt: `An image for ${slot}`, alt: `Alt ${slot}`, size: '1536x1024' })) }) + '\n```';
    const STORYBOARD = serializeJson({ storyboard: [1].map((shot) => ({ shot, description: `Shot ${shot} shows the cup`, imagePrompt: `The cup, angle ${shot}`, durationSec: 3 })), voiceover: 'Less waste.' });
    const model = hangingImages({ 'asset.briefs:media': () => BRIEFS });
    const acts = createActivities({ gateway: gatewayWith(model.adapter), store, prompts: createPromptRenderer() });
    const created = await store.createRun({ id: `run-${Math.random().toString(36).slice(2)}`, workspaceId, recipeId: 'c5', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium: 'media', budgetUsd: 5 });
    await store.updateRun(created.id, { status: 'running' });
    const run: RunRef = { runId: created.id, workspaceId, recipeId: 'c5', profileId: 'demo', medium: 'media', problemId: await storeBrief(store.artifacts, { text: 'An ad for a cup' }) };
    const artifact = (await store.artifacts.putText(STORYBOARD, 'application/json')).id;
    const input: AssetInput = { run, call: { key: `${run.runId}/anchor-frames/-/1`, stepId: 'anchor-frames', stage: 'D2' }, step: FRAMES, ports: { artifact } };
    console.log('MEDIA knobs', JSON.stringify(FRAMES.knobs));
    const t0 = Date.now();
    const outcome = await drive(acts.assetStep(input).catch((e: unknown) => e));
    const g = opened[0]!;
    const listed = (await g.spendRecords(workspaceId)).uncertain;
    console.log('MEDIA outcome', JSON.stringify(outcome));
    console.log('MEDIA sends', model.sends.length, 'total minutes', (Date.now() - t0) / MINUTE);
    console.log('MEDIA uncertain rows', JSON.stringify(listed.map((r) => ({ reason: r.reason, waited: r.waited, usd: r.usd }))));
    console.log('MEDIA note', await stepNote(run.runId));
    const events = (await store.events(run.runId)).map((e) => e.type);
    console.log('MEDIA events', JSON.stringify(events));
    expect(model.sends.length).toBeGreaterThan(0);
  }, 120_000);
});
