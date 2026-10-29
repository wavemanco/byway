/** PROBE (lens-money): an image whose whole wait ran out, as the asset step sees it. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type CompletionRequest, type CompletionResult, type Gateway, type ModelProfile, type ProfileStatus } from '@byway/contracts';
import { PROFILES } from '@byway/gateway';
import { waitedError } from '../../gateway/src/waited.ts';
import { assetStep } from '../src/activities/asset.ts';
import type { RunRef, StepCall, StepSpec } from '../src/types.ts';
import { storeBrief } from './helpers/briefs.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

let dir: string;
let store: MemoStore;
let workspaceId: string;
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-probe-'));
  store = createTestStore({ dataDir: dir });
  workspaceId = (await store.ensureDefaultWorkspace()).id;
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const DEMO = PROFILES.find((p) => p.id === 'demo')!;
const status = (profile: ModelProfile): ProfileStatus => ({ profile, usable: true, missing: [], images: true, video: true, otherFamily: false });

function gw(answers: string[], image: () => Promise<never>): Gateway {
  const requests: CompletionRequest[] = [];
  return {
    demo: true,
    async complete(req): Promise<CompletionResult> {
      requests.push(req);
      return { text: answers.shift() ?? '', stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0, ledgerEntryId: `l${requests.length}` };
    },
    image,
    video: async () => {
      throw new Error('no video');
    },
    spend: async (id) => ({ workspaceId: id, spentUsd: 0, capUsd: 100, byRun: {} }),
    providers: () => [],
    profiles: () => [],
    profileStatus: () => [status(DEMO)],
    verifyLedger: async () => null,
    spendRecords: async () => ({ inFlight: [], uncertain: [], faults: [], notInAuditFile: 0, setAside: [] }),
    auditLedger: async () => ({ brokenAt: null, missing: [], pending: 0, setAside: [], openFaults: 0 }),
    close: async () => undefined,
  };
}

async function newRun(medium: 'prose' | 'media'): Promise<RunRef> {
  const run = await store.createRun({ id: `run-${Math.random().toString(36).slice(2)}`, workspaceId, recipeId: 'tiny', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium, budgetUsd: 5 });
  await store.updateRun(run.id, { status: 'running' });
  return { runId: run.id, workspaceId, recipeId: 'tiny', profileId: 'demo', medium, problemId: await storeBrief(store.artifacts, { text: 'A memo' }) };
}
const call = (run: RunRef, stepId: string): StepCall => ({ key: `${run.runId}/${stepId}/-/1`, stepId, stage: 'D1' });

describe('PROBE: an image whose wait ran out, in the asset step', () => {
  it('prose, triesPerSlot 1 (default): what the step says', async () => {
    const run = await newRun('prose');
    let tries = 0;
    const spec: StepSpec = { id: 'art', role: 'asset', block: 'ASSET', actor: 'model', prompt: 'product.test.art', consumes: ['artifact'], produces: ['artifact'], writes: true };
    const briefs = '```json\n{"images":[{"slot":"hero","prompt":"A loaf","alt":"A loaf","size":"1024x1024"}]}\n```';
    const g = gw([briefs], async () => {
      tries++;
      throw waitedError({ provider: 'google', model: 'gemini-nano-banana-2.1' }, { minutes: 15, how: 'answer' }, { retryable: false, billing: 'maybe' });
    });
    const doc = (await store.artifacts.putText('# Memo\n', 'text/markdown')).id;
    const outcome = await assetStep({ gateway: g, store, prompts: fakePrompts() }, { run, call: call(run, 'art'), step: spec, ports: { artifact: doc } }).catch((e: unknown) => e);
    const notes = (await store.events(run.runId)).filter((e) => e.type === 'step-finished').map((e) => e.data.note);
    console.log('PROSE outcome', JSON.stringify(outcome), 'tries', tries, 'notes', JSON.stringify(notes));
    expect(tries).toBe(1);
  });

  it('media, the first shot frame (at least two tries)', async () => {
    const run = await newRun('media');
    let tries = 0;
    const spec: StepSpec = { id: 'frames', role: 'asset', block: 'ASSET', actor: 'model', prompt: 'product.test.art', consumes: ['artifact'], produces: ['artifact'], writes: true };
    const storyboard = JSON.stringify({ storyboard: [{ shot: 1, description: 'a loaf', imagePrompt: 'a loaf', durationSec: 5 }], voiceover: 'v' });
    const briefs = '```json\n{"images":[{"slot":"1","prompt":"A loaf","alt":"A loaf","size":"1024x1024"}]}\n```';
    const g = gw([briefs], async () => {
      tries++;
      throw waitedError({ provider: 'google', model: 'gemini-nano-banana-2.1' }, { minutes: 15, how: 'answer' }, { retryable: false, billing: 'maybe' });
    });
    const doc = (await store.artifacts.putText(storyboard, 'application/json')).id;
    const outcome = await assetStep({ gateway: g, store, prompts: fakePrompts() }, { run, call: call(run, 'frames'), step: spec, ports: { artifact: doc } }).catch((e: unknown) => e);
    const notes = (await store.events(run.runId)).filter((e) => e.type === 'step-finished').map((e) => e.data.note);
    console.log('MEDIA outcome', outcome instanceof Error ? outcome.message : JSON.stringify(outcome), 'tries', tries, 'notes', JSON.stringify(notes));
  });
});
