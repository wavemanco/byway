/**
 * Driving VOICE and keepsVoice activities on their own (no Temporal): a temp store, a gateway that answers from a script
 * and records every request, and the open → answer → finish sequence the interpreter runs for a `write` checkpoint,
 * re-asks included (a re-ask's starting text is the person's previous answer; "unchanged" is still measured against
 * the first offer).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CompletionRequest, CompletionResult, Gateway, Medium, ModelProfile, ProfileStatus } from '@byway/contracts';
import { PROFILES } from '@byway/gateway';
import type { RunnerDeps } from '../../src/activities/deps.ts';
import { finishHumanStep, openCheckpoint } from '../../src/activities/human.ts';
import { serializeJson } from '../../src/formats.ts';
import type { PageRenderer } from '../../src/pages.ts';
import type { FinishHumanResult, RunRef, StepCall, StepSpec } from '../../src/types.ts';
import { fakePrompts } from './fake-prompts.ts';
import { createTestStore, type MemoStore } from './memo.ts';

const DEMO = PROFILES.find((p) => p.id === 'demo')!;
const status = (profile: ModelProfile): ProfileStatus => ({ profile, usable: true, missing: [], images: true, video: true, otherFamily: false });

export type ScriptedGateway = Gateway & { requests: CompletionRequest[] };

/** A gateway whose completions answer from a script (or a function of the request) and record their requests. */
export function scriptedGateway(answers: (string | ((req: CompletionRequest) => string))[] = []): ScriptedGateway {
  const requests: CompletionRequest[] = [];
  return {
    demo: false,
    requests,
    async complete(req): Promise<CompletionResult> {
      requests.push(req);
      const next = answers.shift() ?? '';
      const text = typeof next === 'function' ? next(req) : next;
      return { text, stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0.01, ledgerEntryId: `l${requests.length}` };
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
    profileStatus: () => [status(DEMO)],
    verifyLedger: async () => null,
  };
}

export interface VoiceBench {
  store: MemoStore;
  gateway: ScriptedGateway;
  deps: RunnerDeps;
  workspaceId: string;
  close(): void;
}

/** `pages`: the page renderer a page's VOICE reads with (the arbiter); none means no renderer is configured. */
export async function voiceBench(answers: (string | ((req: CompletionRequest) => string))[] = [], opts: { pages?: PageRenderer } = {}): Promise<VoiceBench> {
  const dir = mkdtempSync(path.join(tmpdir(), 'byway-voice-'));
  const store = createTestStore({ dataDir: dir });
  const workspaceId = (await store.ensureDefaultWorkspace()).id;
  const gateway = scriptedGateway(answers);
  return {
    store,
    gateway,
    deps: { gateway, store, prompts: fakePrompts(), ...(opts.pages ? { pages: opts.pages } : {}) },
    workspaceId,
    close() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const MEDIA_TYPES: Record<Medium, string> = { 'web-page': 'text/html', prose: 'text/markdown', options: 'application/json', media: 'application/json', 'code-diff': 'text/x-diff' };

export async function benchRun(b: VoiceBench, medium: Medium): Promise<RunRef> {
  const id = `run-${Math.random().toString(36).slice(2)}`;
  await b.store.createRun({ id, workspaceId: b.workspaceId, recipeId: 'tiny', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium, budgetUsd: 5 });
  await b.store.updateRun(id, { status: 'running' });
  return { runId: id, workspaceId: b.workspaceId, recipeId: 'tiny', profileId: 'demo', medium, problem: { text: 'p' }, seeds: [] };
}

export const putWork = async (b: VoiceBench, medium: Medium, text: string): Promise<string> => (await b.store.artifacts.putText(text, MEDIA_TYPES[medium])).id;

export const voiceStep = (over: Partial<StepSpec> = {}): StepSpec => ({ id: 'voice', role: 'voice', block: 'VOICE', actor: 'human', consumes: ['artifact'], produces: ['voice', 'artifact'], writes: true, ...over });

let calls = 0;
export const stepCall = (run: RunRef, stepId: string): StepCall => ({ key: `${run.runId}/${stepId}/-/${++calls}`, stepId, stage: 'D3' });

/** One VOICE question as the interpreter asks it: opened from the work, answered, finished; re-asks on a refusal. */
export class VoiceQuestion {
  private n = 0;
  offered?: string;
  prompt?: string;
  readonly call: StepCall;
  private readonly b: VoiceBench;
  readonly run: RunRef;
  readonly step: StepSpec;
  readonly artifactId: string;
  private constructor(b: VoiceBench, run: RunRef, step: StepSpec, artifactId: string) {
    this.b = b;
    this.run = run;
    this.step = step;
    this.artifactId = artifactId;
    this.call = stepCall(run, step.id);
  }

  /** Open the first offer of a VOICE step on `artifactId`. */
  static async open(b: VoiceBench, run: RunRef, artifactId: string, step: StepSpec = voiceStep(), from: 'copy' | 'claims' = 'copy'): Promise<VoiceQuestion> {
    const q = new VoiceQuestion(b, run, step, artifactId);
    const opened = await q.ask({ prompt: 'Write the words yourself: change any line below.', initial: { from, artifactId } });
    q.offered = opened.initialText;
    return q;
  }

  /** A question opened by an older engine: its first offer is `offered` as that engine read the work. */
  static async openInFlight(b: VoiceBench, run: RunRef, artifactId: string, offered: string, step: StepSpec = voiceStep()): Promise<VoiceQuestion> {
    const q = new VoiceQuestion(b, run, step, artifactId);
    const opened = await q.ask({ prompt: 'Write the words yourself: change any line below.', initialText: offered });
    q.offered = opened.initialText;
    return q;
  }

  /** Open a checkpoint for this step (the first offer, or a re-ask starting from the person's previous answer). */
  async ask(spec: { prompt: string; initialText?: string; initial?: { from: 'copy' | 'claims'; artifactId: string } }): Promise<{ checkpointId: string; initialText?: string; prompt: string }> {
    const id = `${this.run.runId}/cp${++this.n}-${this.step.id}`;
    const opened = await openCheckpoint(this.b.deps, {
      run: this.run,
      call: this.call,
      checkpoint: { id, kind: 'write', prompt: spec.prompt, artifactIds: [this.artifactId], ...(spec.initialText !== undefined ? { initialText: spec.initialText } : {}) },
      step: this.step,
      ...(spec.initial ? { initial: spec.initial } : {}),
    });
    const stored = await this.b.store.getCheckpoint(opened.checkpointId);
    this.prompt = stored!.prompt;
    return { ...opened, prompt: stored!.prompt };
  }

  /**
   * Answer the checkpoint `checkpointId` (default: the first) and finish the step. Answering the same checkpoint again
   * tries another answer against the same offer (the store keeps the first resolution; finishing reads only its text).
   */
  async answer(text: string, checkpointId = `${this.run.runId}/cp1-${this.step.id}`): Promise<FinishHumanResult> {
    if ((await this.b.store.getCheckpoint(checkpointId))?.status === 'open') await this.b.store.resolveCheckpoint({ checkpointId, text });
    return finishHumanStep(this.b.deps, {
      run: this.run,
      call: this.call,
      step: this.step,
      kind: 'write',
      resolution: { checkpointId, text },
      ports: { artifact: this.artifactId },
      ...(this.offered !== undefined ? { initialText: this.offered } : {}),
    });
  }

  /** Re-ask after a refusal, as the interpreter does, and answer the new checkpoint. */
  async reask(previous: string, problem: string, text: string): Promise<FinishHumanResult> {
    const again = await this.ask({ prompt: `${problem} Write the words yourself: change any line below.`, initialText: previous });
    return this.answer(text, again.checkpointId);
  }
}

/** A storyboard artifact, as the runner stores them. */
export const storyboard = (v: { voiceover: string; headline?: string; tagline?: string; storyboard: { shot: number; caption?: string; clipArtifactId?: string; description?: string }[] }): string =>
  serializeJson({ ...v, storyboard: v.storyboard.map((s) => ({ shot: s.shot, description: s.description ?? `d${s.shot}`, imagePrompt: `p${s.shot}`, durationSec: 3, ...(s.caption !== undefined ? { caption: s.caption } : {}), ...(s.clipArtifactId ? { clipArtifactId: s.clipArtifactId } : {}) })) });
