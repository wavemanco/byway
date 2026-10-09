/**
 * @byway/recipe's effects table (ADR-0092) agrees with what the activities actually do: which model roles' answers
 * become the work, which ASSET and RELAY steps write it, and which person's answers are written into it. Admission
 * reads the table instead of a step's own `writes` flag, so the table must be the runner's behaviour, written down.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CompletionRequest, CompletionResult, Gateway, ProfileStatus } from '@byway/contracts';
import { PROFILES } from '@byway/gateway';
import { PROTOCOL_CONFIGS } from '@byway/catalog';
import { outputForStep, slotsForStep } from '@byway/prompts';
import { hasNoExecutor, HUMAN_WRITE_ROLES, leavesNote, personWrite, restoresWork, ROLES, stepEffect, steps, voiceWrite, type Role } from '@byway/recipe';
import { assetStep } from '../src/activities/asset.ts';
import type { RunnerDeps } from '../src/activities/deps.ts';
import { finishHumanStep } from '../src/activities/human.ts';
import { modelStep, NOTE_LABELS, parserFor } from '../src/activities/model-step.ts';
import { ArtifactReader, buildPrompt } from '../src/activities/prompting.ts';
import { relayLink } from '../src/activities/relay.ts';
import { toStepSpec, type RunRef, type StepCall, type StepSpec } from '../src/types.ts';
import { humanKind } from '../src/workflow/wording.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

let dir: string;
let store: MemoStore;
let workspaceId: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-effects-'));
  store = createTestStore({ dataDir: dir });
  workspaceId = (await store.ensureDefaultWorkspace()).id;
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const DEMO = PROFILES.find((p) => p.id === 'demo')!;
const media: ProfileStatus = { profile: DEMO, usable: true, missing: [], images: true, video: true, otherFamily: false };

/** A gateway that answers completions from a script, makes one stored image per call, and one stored clip per call. */
function scripted(answers: string[]): Gateway {
  return {
    demo: false,
    async complete(_req: CompletionRequest): Promise<CompletionResult> {
      return { text: answers.shift() ?? '', stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0, ledgerEntryId: 'l' };
    },
    async image() {
      const { id } = await store.artifacts.put(new Uint8Array([137, 80, 78, 71]), 'image/png');
      return { artifactId: id, mediaType: 'image/png' as const, servedModel: 'scripted', provider: 'mock', costUsd: 0, ledgerEntryId: 'l' };
    },
    async video() {
      const clip = await store.artifacts.putText('<svg xmlns="http://www.w3.org/2000/svg"><text>clip</text></svg>', 'image/svg+xml');
      const frame = await store.artifacts.put(new Uint8Array([137, 80, 78, 71, 1]), 'image/png');
      return { artifactId: clip.id, mediaType: 'image/svg+xml' as const, lastFrameArtifactId: frame.id, lastFrameMediaType: 'image/png' as const, servedModel: 'scripted', provider: 'mock', costUsd: 0, ledgerEntryId: 'l' };
    },
    spend: async (id) => ({ workspaceId: id, spentUsd: 0, capUsd: 100, byRun: {} }),
    providers: () => [],
    profiles: () => [],
    profileStatus: () => [media],
    verifyLedger: async () => null,
    spendRecords: async () => ({ inFlight: [], uncertain: [], faults: [], notInAuditFile: 0, setAside: [] }),
    auditLedger: async () => ({ brokenAt: null, missing: [], pending: 0, setAside: [], openFaults: 0 }),
    close: async () => undefined,
  };
}

async function newRun(medium: RunRef['medium'] = 'prose'): Promise<RunRef> {
  const run = await store.createRun({ id: `run-${Math.random().toString(36).slice(2)}`, workspaceId, recipeId: 'tiny', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium, budgetUsd: 5 });
  await store.updateRun(run.id, { status: 'running' });
  return { runId: run.id, workspaceId, recipeId: 'tiny', profileId: 'demo', medium, problem: { text: 'A memo' }, seeds: [] };
}
const call = (run: RunRef, stepId: string): StepCall => ({ key: `${run.runId}/${stepId}/-/1`, stepId, stage: 'D2' });
const spec = (role: Role, actor: StepSpec['actor'], produces: StepSpec['produces'], extra: Partial<StepSpec> = {}): StepSpec => ({ id: `s-${role}`, role, actor, prompt: 'product.test.step', consumes: ['artifact'], produces, ...extra });

const ARTIFACT_ANSWER = '```markdown\n# Memo\n\nThe whole new text.\n```';
/** Roles the interpreter does not send through modelStep's parser: the critic's own branch, ASSET and RELAY activities. */
const OWN_BRANCH = new Set<Role>(['critic', 'asset', 'relay']);

describe('model steps: the answer becomes the work exactly where the table says it writes', () => {
  it.each(ROLES.filter((r) => !OWN_BRANCH.has(r)).map((r) => [r]))('%s', (role) => {
    const effect = stepEffect({ actor: 'model', role, produces: ['artifact'] });
    const asWork = parserFor(role, 'prose', {}, () => [])(ARTIFACT_ANSWER);
    expect(asWork.ok && asWork.value.kind === 'artifact', `${role} parsed as the work`).toBe(effect === 'writes');
    if (role === 'tells-compare') {
      const keep = parserFor(role, 'prose', {}, () => [])('Keep: A');
      expect(keep.ok && keep.value.kind).toBe('keep');
      expect(effect).toBe('restores');
    }
  });

  it("a critic's answer is a critique and a score, never the work", async () => {
    const run = await newRun();
    const doc = (await store.artifacts.putText('# Memo\n', 'text/markdown')).id;
    const deps: RunnerDeps = { gateway: scripted(['- The ask is buried.\nScore: 6/10']), store, prompts: fakePrompts() };
    const res = await modelStep(deps, { run, call: call(run, 'critic'), step: spec('critic', 'model', ['critique', 'score'], { consumes: ['view'], knobs: { mode: 'OK' } }), ports: { artifact: doc }, refs: [] });
    expect(res.artifactId).toBeUndefined();
    expect(res.score).toBeDefined();
    expect(stepEffect({ actor: 'model', role: 'critic', produces: ['critique', 'score', 'artifact'] })).toBe('annotates');
  });

  it('the prompt contracts agree with the effects table for every role a model step answers as the work', () => {
    // RELAY and ASSET write the work through their own executors: their model call answers a clip prompt or image briefs.
    const pinned = new Set<Role>(['relay', 'asset']);
    for (const role of ROLES.filter((r) => !pinned.has(r))) {
      let output: string;
      try {
        output = outputForStep({ role, consumes: ['artifact'] }, 'prose');
      } catch {
        continue;
      }
      expect(output.startsWith('artifact:'), role).toBe(stepEffect({ actor: 'model', role, produces: ['artifact'] }) === 'writes');
    }
    // A model VOICE or render is parsed as the work, and its prompt contract now says so (ADR-0092 stage 4).
    expect(outputForStep({ role: 'voice', consumes: ['artifact'] }, 'prose')).toBe('artifact:prose');
    expect(outputForStep({ role: 'render', consumes: ['artifact'] }, 'prose')).toBe('artifact:prose');
    expect(outputForStep({ role: 'asset', consumes: ['voice', 'artifact'] }, 'media')).toBe('none');
  });
});

describe('ASSET and RELAY steps', () => {
  const briefs = '```json\n{"images":[{"slot":"hero","prompt":"A loaf","alt":"A loaf","size":"1024x1024"}]}\n```';

  it.each([
    [['artifact'] as StepSpec['produces'], true],
    [['asset'] as StepSpec['produces'], false],
  ])('an ASSET step producing %j writes the work: %s', async (produces, writes) => {
    const run = await newRun();
    const doc = (await store.artifacts.putText('# Memo\n\nText.\n', 'text/markdown')).id;
    const gateway = scripted([briefs]);
    // The integrate answer must place the image by its address, which only the image call knows.
    const gatewayAnswers: string[] = [];
    const image = gateway.image.bind(gateway);
    gateway.image = async (req) => {
      const made = await image(req);
      gatewayAnswers.push(`\`\`\`markdown\n# Memo\n\n![A loaf](/api/artifacts/${made.artifactId})\n\nText.\n\`\`\``);
      return made;
    };
    const complete = gateway.complete.bind(gateway);
    gateway.complete = async (req) => (gatewayAnswers.length ? { ...(await complete(req)), text: gatewayAnswers.shift()! } : complete(req));
    const res = await assetStep({ gateway, store, prompts: fakePrompts() }, { run, call: call(run, 'art'), step: spec('asset', 'model', produces, { block: 'ASSET', knobs: { slots: 1 } }), ports: { artifact: doc } });
    expect(res.artifactId !== undefined).toBe(writes);
    expect(stepEffect({ actor: 'model', role: 'asset', produces })).toBe(writes ? 'writes' : 'annotates');
  });

  it('an ASSET that turns the script into audio has no executor: it finishes skipped and writes nothing, as hasNoExecutor says (ADR-0069)', async () => {
    const run = await newRun('media');
    const board = (await store.artifacts.putText('{"storyboard":[{"shot":1,"description":"d","imagePrompt":"p","durationSec":3}],"voiceover":"v"}', 'application/json')).id;
    const step = spec('asset', 'model', ['artifact'], { block: 'ASSET', consumes: ['voice', 'artifact'] });
    const res = await assetStep({ gateway: scripted([]), store, prompts: fakePrompts() }, { run, call: call(run, 'vo-audio'), step, ports: { artifact: board, voice: 'v' } });
    expect(res).toEqual({ costUsd: 0, skipped: true });
    expect(hasNoExecutor(step)).toBe(true);
    // An image ASSET has one.
    expect(hasNoExecutor(spec('asset', 'model', ['artifact']))).toBe(false);
  });

  it.each([[['artifact', 'anchor'] as StepSpec['produces']], [['anchor'] as StepSpec['produces']]])('a RELAY link writes the storyboard whatever it declares (%j)', async (produces) => {
    const run = await newRun('media');
    const board = (await store.artifacts.putText('{"storyboard":[{"shot":1,"description":"d","imagePrompt":"p","durationSec":3}],"voiceover":"v"}', 'application/json')).id;
    // The frame the link starts from: without one the link is skipped (ADR-0090).
    const start = (await store.artifacts.put(new Uint8Array([137, 80, 78, 71, 2]), 'image/png')).id;
    const res = await relayLink({ gateway: scripted(['```json\n{"clipPrompt":"A slow pan","durationSec":3}\n```']), store, prompts: fakePrompts() }, {
      run,
      call: call(run, 'clip'),
      step: spec('relay', 'model', produces, { block: 'RELAY', consumes: ['anchor', 'artifact'] }),
      ports: { artifact: board, anchor: start },
      shot: 1,
    });
    expect(res.artifactId).toBeDefined();
    expect(stepEffect({ actor: 'model', role: 'relay', produces })).toBe('writes');
  });
});

describe("a person's answer is written into the work exactly for a person write", () => {
  it('the write roles are the roles the runner asks a person to write', () => {
    expect(new Set(ROLES.filter((role) => humanKind({ role }) === 'write'))).toEqual(HUMAN_WRITE_ROLES);
  });

  it.each(ROLES.flatMap((role) => [[role, ['artifact']], [role, ['taste']]] as [Role, StepSpec['produces']][]))('a human %s producing %j', async (role, produces) => {
    const run = await newRun();
    const before = (await store.artifacts.putText('# Memo\n\nThe old line.\n', 'text/markdown')).id;
    const previous = (await store.artifacts.putText('# Memo\n\nAn older line.\n', 'text/markdown')).id;
    const step = spec(role, 'human', produces);
    const kind = humanKind(step);
    const res = await finishHumanStep({ gateway: scripted([]), store, prompts: fakePrompts() }, {
      run,
      call: call(run, step.id),
      step,
      kind,
      resolution: { checkpointId: 'cp', text: '# Memo\n\nMy own new line.\n', choice: ['A'] },
      ports: { artifact: before, previousArtifact: previous },
      initialText: '# Memo\n\nThe old line.\n',
    });
    expect(res.artifactId !== undefined, 'wrote the work').toBe(personWrite(step));
    expect(res.keep === 'A', 'kept the version before').toBe(restoresWork(step));
  });

  it('a human fix and a human build run the same way: the author’s own draft', async () => {
    const run = await newRun();
    const before = (await store.artifacts.putText('# Memo\n\nThe old line.\n', 'text/markdown')).id;
    const texts: string[] = [];
    for (const role of ['build', 'fix'] as const) {
      const step = spec(role, 'human', ['artifact']);
      const res = await finishHumanStep({ gateway: scripted([]), store, prompts: fakePrompts() }, { run, call: call(run, step.id), step, kind: humanKind(step), resolution: { checkpointId: 'cp', text: 'My draft, every sentence mine.' }, ports: { artifact: before } });
      texts.push(await store.artifacts.getText(res.artifactId!));
    }
    expect(texts[0]).toBe(texts[1]);
    expect(voiceWrite(spec('voice', 'human', ['artifact']))).toBe(true);
  });
});

describe('the slots the composed profile renders a template with are slots the runner always fills', () => {
  /** What an activity adds after buildPrompt: a judge's candidates (model-step.ts), a relay link's storyboard and shot, an ASSET step's work. */
  const activityAdds = (role: string, medium: string): string[] =>
    role === 'judge' || role === 'select' ? ['options'] : role === 'relay' ? ['artifact', 'brief'] : role === 'asset' ? ['artifact', ...(medium === 'options' ? ['options'] : [])] : [];
  const modelSteps = PROTOCOL_CONFIGS.flatMap((r) => steps(r).filter(({ step }) => step.actor === 'model' && step.prompt).map(({ step }) => [`${r.id} ${step.id}`, r.medium!, step] as const));
  it.each(modelSteps)('%s', async (_name, medium, step) => {
    const built = await buildPrompt(new ArtifactReader({ store }), {
      medium,
      problem: { text: 'A memo' },
      step: toStepSpec(step),
      ports: {},
      ...(step.role === 'seed' || step.consumes.includes('seed') ? { seed: 'a-seed' } : {}),
      ...(step.consumes.includes('tells') ? { tells: 'a catalog' } : {}),
    });
    const filled = new Set([...Object.keys(built.slots), ...activityAdds(step.role, medium)]);
    expect([...slotsForStep(step, medium)].filter((s) => !filled.has(s))).toEqual([]);
  });
});

describe('the notes a model step leaves beside the work (leavesNote)', () => {
  it('are the answers the runner stores as notes, and a seed build’s direction: what a person is shown beside the work', () => {
    const leaving = ROLES.filter((role) => leavesNote({ actor: 'model', role, produces: [] }));
    expect(new Set(leaving)).toEqual(new Set([...Object.keys(NOTE_LABELS), 'seed']));
    // A seed's build keeps the direction it wrote as a note; another builder's preamble is not one.
    const answer = 'Colour: dusk blues.\nLayout: one tall column.\n\n```markdown\n# Spark\n```';
    const parsed = (role: Role) => parserFor(role, 'prose', {}, () => [])(answer);
    expect(parsed('seed')).toMatchObject({ ok: true, value: { kind: 'artifact', direction: expect.stringContaining('dusk') } });
    expect(parsed('build')).toMatchObject({ ok: true, value: { kind: 'artifact' } });
    expect((parsed('build') as { value: { direction?: string } }).value.direction).toBeUndefined();
    // No person's step and no tool leaves one.
    expect(ROLES.some((role) => leavesNote({ actor: 'human', role, produces: [] }) || leavesNote({ actor: 'tool', role, produces: [] }))).toBe(false);
  });
});
