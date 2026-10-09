/**
 * Activities on their own, against a temp store and a scripted gateway (no Temporal): prompt provenance on every
 * completion, withdrawn checkpoints on cancel and fail, and which profile decides whether images and video exist.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationFailure } from '@temporalio/common';
import { GatewayError, type CompletionRequest, type CompletionResult, type Gateway, type ModelProfile, type ProfileStatus } from '@byway/contracts';
import { heldKeyError, PROFILES } from '@byway/gateway';
import { askModel } from '../src/activities/call.ts';
import type { RunnerDeps } from '../src/activities/deps.ts';
import { cancelRun, failRun } from '../src/activities/lifecycle.ts';
import { recordResolution } from '../src/activities/human.ts';
import { assetStep, NO_IMAGES_NOTE } from '../src/activities/asset.ts';
import { ArtifactReader } from '../src/activities/prompting.ts';
import { NO_VIDEO_NOTE, relayLink } from '../src/activities/relay.ts';
import { createActivities } from '../src/activities/index.ts';
import { modelStep } from '../src/activities/model-step.ts';
import { OTHER_FAMILY_FALLBACK_NOTE } from '../src/activities/availability.ts';
import type { RunRef, StepCall, StepSpec } from '../src/types.ts';
import { fakeHash, fakePrompts } from './helpers/fake-prompts.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

let dir: string;
let store: MemoStore;
let workspaceId: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-acts-'));
  store = createTestStore({ dataDir: dir });
  workspaceId = (await store.ensureDefaultWorkspace()).id;
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const DEMO = PROFILES.find((p) => p.id === 'demo')!;
const NO_MEDIA: ModelProfile = { id: 'no-media', label: 'Text only', tiers: DEMO.tiers };
const status = (profile: ModelProfile, media: boolean): ProfileStatus => ({ profile, usable: true, missing: [], images: media, video: media, otherFamily: false });

/** A gateway whose completions answer from a script and record their requests. */
function scripted(answers: string[], opts: { demo?: boolean; statuses?: ProfileStatus[] } = {}): Gateway & { requests: CompletionRequest[] } {
  const requests: CompletionRequest[] = [];
  return {
    demo: opts.demo ?? false,
    requests,
    async complete(req): Promise<CompletionResult> {
      requests.push(req);
      const text = answers.shift() ?? '';
      return { text, stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0, ledgerEntryId: `l${requests.length}` };
    },
    image: async () => {
      throw new Error('no images here');
    },
    video: async () => {
      throw new Error('no video here');
    },
    spend: async (id) => ({ workspaceId: id, spentUsd: 0, capUsd: 100, byRun: {} }),
    providers: () => [],
    profiles: () => [],
    profileStatus: () => opts.statuses ?? [status(DEMO, true), status(NO_MEDIA, false)],
    verifyLedger: async () => null,
    spendRecords: async () => ({ inFlight: [], uncertain: [], faults: [], notInAuditFile: 0, setAside: [] }),
    auditLedger: async () => ({ brokenAt: null, missing: [], pending: 0, setAside: [], openFaults: 0 }),
    close: async () => undefined,
  };
}

async function newRun(profileId = 'no-media'): Promise<RunRef> {
  const run = await store.createRun({ id: `run-${Math.random().toString(36).slice(2)}`, workspaceId, recipeId: 'tiny', recipeHash: 'sha256:x', profileId, title: 't', problem: 'p', medium: 'prose', budgetUsd: 5 });
  await store.updateRun(run.id, { status: 'running' });
  return { runId: run.id, workspaceId, recipeId: 'tiny', profileId, medium: 'prose', problem: { text: 'A memo' }, seeds: [] };
}

const call = (run: RunRef, stepId: string): StepCall => ({ key: `${run.runId}/${stepId}/-/1`, stepId, stage: 'D1' });

describe('askModel', () => {
  it('names the template behind every completion (id, version, hash, fidelity), the retry too', async () => {
    const run = await newRun();
    const gateway = scripted(['', '```markdown\n# Memo\n\nThe ask.\n```']);
    const prompts = fakePrompts();
    const deps: RunnerDeps = { gateway, store, prompts };
    const out = await askModel(deps, new ArtifactReader(deps), {
      run,
      call: call(run, 'draft'),
      promptId: 'product.test.draft',
      slots: { medium: 'prose', problem: 'A memo' },
      images: [],
      purpose: 'build:prose',
      tier: 'mid',
      what: 'Draft',
      parse: (t) => (t.trim() ? { ok: true, value: t } : { ok: false, problem: 'empty' }),
    });
    expect(out.value).toContain('The ask.');
    expect(gateway.requests).toHaveLength(2);
    for (const r of gateway.requests) expect(r.prompt).toEqual({ id: 'product.test.draft', version: 1, hash: fakeHash('product.test.draft'), fidelity: 'project' });
  });
});

describe('a reviewer from another AI family (FID-1, convention C3)', () => {
  const criticSpec: StepSpec = { id: 'critic', role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'product.test.critic', consumes: ['view'], produces: ['critique', 'score'], knobs: { mode: 'OK', family: 'other' } };
  const BALANCED = PROFILES.find((p) => p.id === 'balanced')!;
  const critique = '- The ask is buried.\nScore: 7/10';

  it('a critic whose family knob is other runs on the profile’s other-family model when its key is set up', async () => {
    const run = await newRun('balanced');
    const gateway = scripted([critique], { statuses: [{ ...status(BALANCED, false), otherFamily: true }] });
    const out = await modelStep({ gateway, store, prompts: fakePrompts() }, { run, call: call(run, 'critic'), step: criticSpec, ports: {}, refs: [] });
    expect(gateway.requests[0]!.model).toEqual(BALANCED.otherFamily);
    expect(out.note).toBeUndefined();
  });

  it('without that key: a fresh session of the same family, and the step says so', async () => {
    const run = await newRun('balanced');
    const gateway = scripted([critique], { statuses: [status(BALANCED, false)] });
    const out = await modelStep({ gateway, store, prompts: fakePrompts() }, { run, call: call(run, 'critic'), step: criticSpec, ports: {}, refs: [] });
    expect(gateway.requests[0]!.model).toBeUndefined();
    expect(out.note).toBe(OTHER_FAMILY_FALLBACK_NOTE);
    expect(OTHER_FAMILY_FALLBACK_NOTE).toBe('No reviewer from another AI family is configured, so a fresh session of the same family reviewed this.');
  });

  it('in demo mode, the demo profile’s stand-in for another family, whatever profile the run names', async () => {
    const run = await newRun('balanced');
    const gateway = scripted([critique], { demo: true, statuses: [{ ...status(DEMO, true), otherFamily: true }, status(BALANCED, false)] });
    await modelStep({ gateway, store, prompts: fakePrompts() }, { run, call: call(run, 'critic'), step: criticSpec, ports: {}, refs: [] });
    expect(gateway.requests[0]!.model).toEqual({ provider: 'mock', model: 'mock-other' });
  });

  it('a critic of the same family (no knob) names no model', async () => {
    const run = await newRun('balanced');
    const gateway = scripted([critique], { statuses: [{ ...status(BALANCED, false), otherFamily: true }] });
    await modelStep({ gateway, store, prompts: fakePrompts() }, { run, call: call(run, 'critic'), step: { ...criticSpec, knobs: { mode: 'OK' } }, ports: {}, refs: [] });
    expect(gateway.requests[0]!.model).toBeUndefined();
  });
});

describe('SEED (SEED-1)', () => {
  const seedSpec: StepSpec = { id: 'spark', role: 'seed', block: 'SEED', actor: 'model', tier: 'mid', prompt: 'product.test.spark', consumes: ['intent'], produces: ['artifact'], writes: true };

  it('hands the step a 48-character random string, and keeps the written direction as a note beside the work, never the string', async () => {
    const run = await newRun();
    const prompts = fakePrompts();
    let seen = '';
    const gateway = scripted([]);
    gateway.complete = async (req) => {
      seen = /Seed: (\S+)\. /.exec(JSON.stringify(req.messages))?.[1] ?? '';
      const text = `Colour: dusk blues, from ${seen}.\nLayout: one tall column.\nType: a rounded grotesque.\n\n\`\`\`markdown\n# Spark\n\nA quiet direction.\n\`\`\``;
      return { text, stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0, ledgerEntryId: 'l1' };
    };
    const out = await modelStep({ gateway, store, prompts }, { run, call: call(run, 'spark'), step: seedSpec, ports: {}, refs: [] });
    expect(out.seed).toHaveLength(48);
    expect(seen).toBe(out.seed);
    expect(await store.artifacts.getText(out.artifactId!)).toBe('# Spark\n\nA quiet direction.\n');
    const note = await store.artifacts.getText(out.noteArtifactId!);
    expect(note).toContain('Layout: one tall column.');
    expect(note).not.toContain(out.seed!);
  });

  it('keeps no note when the answer has no written direction (one line of preamble is not one)', async () => {
    const run = await newRun();
    const gateway = scripted(['Here it is.\n\n```markdown\n# Spark\n```']);
    const out = await modelStep({ gateway, store, prompts: fakePrompts() }, { run, call: call(run, 'spark'), step: seedSpec, ports: {}, refs: [] });
    expect(out.noteArtifactId).toBeUndefined();
  });
});

describe('withdrawn checkpoints', () => {
  const openOne = async (run: RunRef, id: string) =>
    store.openCheckpoint({ id: `${run.runId}/${id}`, runId: run.runId, stepId: 'react', kind: 'react', prompt: 'What do you think?' });

  it('cancelling a run withdraws its open checkpoints; answered ones keep their answer', async () => {
    const run = await newRun();
    const answered = await openOne(run, 'cp1');
    await store.resolveCheckpoint({ checkpointId: answered.id, text: 'Fine.' });
    const open = await openOne(run, 'cp2');
    const deps: RunnerDeps = { gateway: scripted([]), store, prompts: fakePrompts() };
    await cancelRun(deps, { runId: run.runId, workspaceId });
    expect((await store.getCheckpoint(open.id))?.status).toBe('withdrawn');
    expect((await store.getCheckpoint(answered.id))?.status).toBe('resolved');
    expect(await store.openCheckpoints(workspaceId)).toEqual([]);
    expect((await store.getRun(run.runId))?.status).toBe('cancelled');
    // Idempotent: a retried activity changes nothing.
    await cancelRun(deps, { runId: run.runId, workspaceId });
    expect((await store.events(run.runId)).filter((e) => e.type === 'run-cancelled')).toHaveLength(1);
  });

  it('failing a run withdraws its open checkpoints', async () => {
    const run = await newRun();
    const open = await openOne(run, 'cp1');
    await failRun({ gateway: scripted([]), store, prompts: fakePrompts() }, { runId: run.runId, workspaceId, error: 'It broke.' });
    expect((await store.getCheckpoint(open.id))?.status).toBe('withdrawn');
    expect((await store.getRun(run.runId))?.status).toBe('failed');
  });

  it('an answer to a withdrawn checkpoint is refused for good, never taken as an earlier success', async () => {
    const run = await newRun();
    const open = await openOne(run, 'cp1');
    await store.withdrawCheckpoints(run.runId);
    const acts = createActivities({ gateway: scripted([]), store, prompts: fakePrompts() });
    const err = await acts.recordResolution({ runId: run.runId, call: call(run, 'react'), resolution: { checkpointId: open.id, text: 'Late.' } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApplicationFailure);
    expect((err as ApplicationFailure).nonRetryable).toBe(true);
    expect((err as ApplicationFailure).message).toMatch(/withdrawn/);
    expect((await store.events(run.runId)).some((e) => e.type === 'checkpoint-resolved')).toBe(false);
    // A checkpoint answered by an earlier attempt of the same activity is still a success.
    const again = await openOne(run, 'cp2');
    await store.resolveCheckpoint({ checkpointId: again.id, text: 'Yes.' });
    await recordResolution({ gateway: scripted([]), store, prompts: fakePrompts() }, { runId: run.runId, call: call(run, 'react'), resolution: { checkpointId: again.id, text: 'Yes.' } });
    expect((await store.events(run.runId)).filter((e) => e.type === 'checkpoint-resolved')).toHaveLength(1);
  });
});

describe('which profile says whether images and video exist', () => {
  const assetSpec: StepSpec = { id: 'art', role: 'asset', block: 'ASSET', actor: 'model', prompt: 'product.test.art', consumes: ['artifact'], produces: ['artifact'], writes: true };
  const relaySpec: StepSpec = { id: 'clip', role: 'relay', block: 'RELAY', actor: 'model', prompt: 'product.test.clip', consumes: ['anchor', 'artifact'], produces: ['artifact', 'anchor'], writes: true };

  it('with keys, the run’s own profile: no image or video model means an honest skip', async () => {
    const run = await newRun('no-media');
    const deps: RunnerDeps = { gateway: scripted([], { demo: false }), store, prompts: fakePrompts() };
    const doc = (await store.artifacts.putText('# Memo\n', 'text/markdown')).id;
    expect(await assetStep(deps, { run, call: call(run, 'art'), step: assetSpec, ports: { artifact: doc } })).toMatchObject({ skipped: true });
    expect(await relayLink(deps, { run, call: call(run, 'clip'), step: relaySpec, ports: { artifact: doc }, shot: 1 })).toMatchObject({ skipped: true });
    const notes = (await store.events(run.runId)).filter((e) => e.type === 'step-finished').map((e) => e.data.note);
    expect(notes).toEqual([NO_IMAGES_NOTE, NO_VIDEO_NOTE]);
  });

  it('in demo mode, the demo profile, whatever profile the run names (contracts v4 Gateway.demo)', async () => {
    const run = await newRun('no-media');
    // Image briefs come from the script; the image call itself then fails, which shows the step did not skip.
    const deps: RunnerDeps = { gateway: scripted(['```json\n{"images":[{"slot":"hero","prompt":"A loaf","alt":"A loaf","size":"1024x1024"}]}\n```'], { demo: true }), store, prompts: fakePrompts() };
    const doc = (await store.artifacts.putText('# Memo\n', 'text/markdown')).id;
    await expect(assetStep(deps, { run, call: call(run, 'art'), step: assetSpec, ports: { artifact: doc } })).rejects.toThrow(/no images here/);
  });
});

describe('an image refused because its prompt holds a provider key (ADR-0088)', () => {
  const assetSpec: StepSpec = { id: 'art', role: 'asset', block: 'ASSET', actor: 'model', prompt: 'product.test.art', consumes: ['artifact'], produces: ['artifact'], writes: true, knobs: { triesPerSlot: 2 } };
  const briefs = '```json\n{"images":[{"slot":"hero","prompt":"A loaf","alt":"A loaf","size":"1024x1024"}]}\n```';

  async function attempt(error: Error) {
    const run = await newRun('no-media');
    let tries = 0;
    const gateway: Gateway = {
      ...scripted([briefs], { demo: true }),
      image: async () => {
        tries++;
        throw error;
      },
    };
    const doc = (await store.artifacts.putText('# Memo\n', 'text/markdown')).id;
    const outcome = await assetStep({ gateway, store, prompts: fakePrompts() }, { run, call: call(run, 'art'), step: assetSpec, ports: { artifact: doc } }).catch((e: unknown) => e);
    return { outcome, tries };
  }

  it('stops the step with the gateway’s message, like the other key problems, instead of skipping it', async () => {
    const refused = heldKeyError('invalid-request', 'This request contains your OPENAI_API_KEY. byway never sends a key to a model; remove it from the material and try again.', 'OPENAI_API_KEY');
    const { outcome, tries } = await attempt(refused);
    expect(outcome).toBe(refused);
    expect(tries).toBe(1);
  });

  it('stops the step on an accounting fault (ADR-0095): every paid call waits until the person acknowledges it', async () => {
    const fault = new GatewayError('accounting-fault', 'byway found a line in its spend ledger (ledger.jsonl, at byte 0) that it cannot read.');
    const { outcome, tries } = await attempt(fault);
    expect(outcome).toBe(fault);
    expect(tries).toBe(1);
  });

  it('stops the step when the image was billed but byway could not keep it: another try would buy another image (follow-up (e), ADR-0090)', async () => {
    const lost = new GatewayError('byway-failure', 'openai made the image and billed it, but it could not be stored: ENOSPC.', false, { billed: true });
    const { outcome, tries } = await attempt(lost);
    expect(outcome).toBe(lost);
    expect(tries).toBe(1);
  });

  it('tries the image again when byway did not start the call (nothing was billed), as before byway-side failures had their own code', async () => {
    // A GatewayError fails the step for good (FAILURE.step is not retried), so a call byway did not send is tried as any
    // other unbilled failure is: up to triesPerSlot, then the step finishes skipped.
    for (const message of ['byway is stopping, so it did not start this call. Try again once it has started again.', 'byway could not record this call as sent in its spending records, so it did not send it. Try again.']) {
      const { outcome, tries } = await attempt(new GatewayError('byway-failure', message, true, { billed: false }));
      expect(outcome).toMatchObject({ skipped: true });
      expect(tries).toBe(2);
    }
  });

  it('still tries any other refused image again, then finishes skipped, as before', async () => {
    const { outcome, tries } = await attempt(new GatewayError('invalid-request', 'content policy'));
    expect(outcome).toMatchObject({ skipped: true });
    expect(tries).toBe(2);
  });
});
