/**
 * PROBE (refuter of MONEY-1): the real gateway (createGateway), a Google image client that never answers until its
 * abort signal fires, the store's own spend book (SqliteSpendBook), the memo layer with an operation key, and the real
 * asset step. Fake setTimeout only.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG } from '@byway/catalog';
import { type CompletionRequest, type CompletionResult, type Gateway, type ImageRequest, type Medium } from '@byway/contracts';
import { createGateway, PROFILES, type ModelGateway } from '@byway/gateway';
import { createPromptRenderer } from '@byway/prompts';
import { steps } from '@byway/recipe';
import { assetStep } from '../src/activities/asset.ts';
import type { RunnerDeps } from '../src/activities/deps.ts';
import { memoGateway } from '../src/activities/memo.ts';
import { serializeJson } from '../src/formats.ts';
import { toStepSpec, type AssetResult, type RunRef, type StepSpec } from '../src/types.ts';
import { storeBrief } from './helpers/briefs.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

const library = createPromptRenderer();
const MINUTE = 60_000;
let dir: string;
let store: MemoStore;
let workspaceId: string;
let real: ModelGateway;
let sends: { signal: AbortSignal | undefined; at: number }[];

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  dir = mkdtempSync(path.join(tmpdir(), 'byway-probe-m1-'));
  store = createTestStore({ dataDir: dir });
  workspaceId = (await store.ensureDefaultWorkspace()).id;
  sends = [];
  real = createGateway({
    ledgerPath: path.join(dir, 'ledger.jsonl'),
    artifacts: store.artifacts,
    caps: { workspaceCapUsd: () => 100, runCapUsd: () => 50, waitMinutes: () => 5 },
    spendBook: store.spendBook,
    env: { GEMINI_API_KEY: '[redacted]' },
    retry: { sleep: async () => {}, random: () => 0.5 },
    clients: {
      google: {
        models: {
          generateContent(params: { config?: { abortSignal?: AbortSignal } }) {
            const signal = params.config?.abortSignal;
            sends.push({ signal, at: Date.now() });
            return new Promise((_, reject) => {
              const fail = () => reject(new DOMException('This operation was aborted', 'AbortError'));
              if (!signal) return;
              if (signal.aborted) return fail();
              signal.addEventListener('abort', fail, { once: true });
            });
          },
        },
      } as never,
    },
  });
});
afterEach(async () => {
  vi.useRealTimers();
  await real.close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const spec = (recipeId: string, stepId: string, knobs?: Record<string, unknown>): StepSpec => {
  const recipe = CATALOG.find((r) => r.id === recipeId)!;
  const s = toStepSpec(steps(recipe).find(({ step }) => step.id === stepId)!.step);
  return knobs ? { ...s, knobs: { ...(s.knobs ?? {}), ...knobs } } : s;
};

const briefsOf = (...slots: (string | number)[]) =>
  '```json\n' + JSON.stringify({ images: slots.map((slot) => ({ slot, prompt: `An image for ${String(slot).trim()}`, alt: `Alt ${String(slot).trim()}`, size: '1536x1024' })) }) + '\n```';

/** Briefs scripted; images go to the real gateway. */
function composite(briefs: string[]): Gateway {
  const balanced = PROFILES.find((p) => p.id === 'balanced')!;
  const answer = (text: string): CompletionResult => ({ text, stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0.01, ledgerEntryId: 'l' });
  return {
    demo: false,
    async complete(_req: CompletionRequest) {
      return answer(briefs.shift() ?? '');
    },
    image: (req: ImageRequest) => real.image(req),
    video: async () => {
      throw new Error('no video');
    },
    spend: (id) => real.spend(id),
    providers: () => [],
    profiles: () => [],
    profileStatus: () => [{ profile: balanced, usable: true, missing: [], images: true, video: true, otherFamily: false }],
    verifyLedger: async () => null,
    spendRecords: (id) => real.spendRecords(id),
    auditLedger: async () => ({ brokenAt: null, missing: [], pending: 0, setAside: [], openFaults: 0 }),
    close: async () => undefined,
  } as Gateway;
}

async function newRun(medium: Medium, recipeId: string): Promise<RunRef> {
  const run = await store.createRun({ id: `run-${Math.random().toString(36).slice(2)}`, workspaceId, recipeId, recipeHash: 'sha256:x', profileId: 'balanced', title: 't', problem: 'p', medium, budgetUsd: 5 });
  await store.updateRun(run.id, { status: 'running' });
  return { runId: run.id, workspaceId, recipeId, profileId: 'balanced', medium, problemId: await storeBrief(store.artifacts, { text: 'An ad for a cup' }) };
}

async function runAsset(medium: Medium, recipeId: string, step: StepSpec, artifactText: string, briefs: string[]) {
  const run = await newRun(medium, recipeId);
  const artifact = (await store.artifacts.putText(artifactText, medium === 'prose' ? 'text/markdown' : 'application/json')).id;
  const call = { key: `${run.runId}/${step.id}/-/1`, stepId: step.id, stage: 'D2' as const };
  const until = new AbortController();
  const gateway = memoGateway(composite(briefs), store, { runId: run.runId, key: call.key }, { operation: { until: until.signal } });
  const deps: RunnerDeps = { gateway, store, prompts: library };
  let settled = false;
  const p = assetStep(deps, { run, call, step, ports: { artifact } }).catch((e: unknown) => e).finally(() => (settled = true));
  // Drive the clock until the step ends: each send waits 5 minutes, then aborts.
  const t0 = Date.now();
  for (let i = 0; i < 2000 && !settled; i++) {
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    await vi.advanceTimersByTimeAsync(10_000);
  }
  const result = await p;
  console.log('fake minutes elapsed', (Date.now() - t0) / MINUTE);
  const finished = (await store.events(run.runId)).filter((e) => e.type === 'step-finished');
  const records = await real.spendRecords(workspaceId);
  const all = await store.events(run.runId);
  console.log('event types', JSON.stringify(all.map((e) => e.type)));
  console.log('any event says the wait ran out or Settings:', JSON.stringify(all).includes('did not answer within'), JSON.stringify(all).includes('Settings'));
  return { result, notes: finished.map((e) => e.data.note), run, records };
}

const storyboard = (shots = [1, 2, 3]) =>
  serializeJson({ storyboard: shots.map((shot) => ({ shot, description: `Shot ${shot} shows the cup`, imagePrompt: `The cup, angle ${shot}`, durationSec: 3 })), voiceover: 'Less waste.' });

describe('PROBE MONEY-1', { timeout: 120_000 }, () => {
  it('C5 anchor frames on Balanced: shot 1 frame whose wait ran out', async () => {
    const { result, notes, records } = await runAsset('media', 'c5', spec('c5', 'anchor-frames'), storyboard([1]), [briefsOf('1')]);
    console.log('C5 result', JSON.stringify(result instanceof Error ? { error: result.message } : result));
    console.log('C5 sends', sends.length, sends.map((s) => s.at));
    console.log('C5 notes', JSON.stringify(notes));
    console.log('C5 uncertain', JSON.stringify(records.uncertain.map((u) => ({ reason: u.reason, usd: u.usd, waited: u.waited }))));
    console.log('ledger', existsSync(path.join(dir, 'ledger.jsonl')) ? readFileSync(path.join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').filter(Boolean).length : 0);
  });

  it('prose step with default tries (1)', async () => {
    const recipe = CATALOG.find((r) => r.id === 'c3')!;
    const { result, notes, records } = await runAsset('prose', 'c3', spec('c3', 'asset'), '# Piece\n\nThe text.', [briefsOf('header')]);
    console.log('C3 result', JSON.stringify(result instanceof Error ? { error: result.message } : result), recipe.id);
    console.log('C3 sends', sends.length);
    console.log('C3 notes', JSON.stringify(notes));
    console.log('C3 uncertain', JSON.stringify(records.uncertain.map((u) => ({ reason: u.reason, usd: u.usd }))));
  });

  it('prose step with triesPerSlot 3 (C1-like)', async () => {
    const { result, notes, records } = await runAsset('prose', 'c3', spec('c3', 'asset', { triesPerSlot: 3 }), '# Piece\n\nThe text.', [briefsOf('header')]);
    console.log('T3 result', JSON.stringify(result instanceof Error ? { error: result.message } : result));
    console.log('T3 sends', sends.length, sends.map((s) => s.at));
    console.log('T3 notes', JSON.stringify(notes));
    console.log('T3 uncertain', JSON.stringify(records.uncertain.map((u) => ({ reason: u.reason, usd: u.usd }))));
  });
});
