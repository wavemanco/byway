/**
 * The demo runner: implements the Runner contract by walking a recipe's demo script on a timer. From the app's
 * point of view it behaves like @byway/runner: it emits exactly the payloads of RunEventPayloads (step events
 * under the step's id, operator questions under the operator's id), opens checkpoints that wait for an answer,
 * asks before a step would go over the run's budget, pauses between steps, and finishes steps it cannot run as
 * skipped with a plain note (ADR-0069). C5's motion goes through the gateway's video call, as the real relay
 * does; nothing else calls a model. Timing is injectable so tests run instantly.
 */
import { randomUUID } from 'node:crypto';
import {
  GatewayError,
  type CheckpointRecord,
  type CheckpointResolution,
  type Gateway,
  type RunEventPayloads,
  type RunEventType,
  type RunRecord,
  type RunStatus,
  type Runner,
  type StartRunInput,
  type Store,
} from '@byway/contracts';
import { recipeHash } from '@byway/recipe';
import { picksNeeded } from '../../view/checkpoints.ts';
import { formatUsd } from '../../view/format.ts';
import { titleFromProblem } from '../../view/text.ts';
import { GREAT_MIN_REFS, okModeNote } from './notes.ts';
import { subjectFrom } from './samples/text.ts';
import { SkipStep, type Ask, type DemoContext, type ScriptStep } from './script.ts';
import { scriptFor } from './scripts.ts';

export interface DemoRunnerOptions {
  store: Store;
  /** Makes C5's relay clips; without one, motion is skipped as it is without a video key (ADR-0069). */
  gateway?: Gateway;
  /** Waits between steps; tests pass an instant one. */
  sleep?: (ms: number) => Promise<void>;
  /** Length of one step unit in milliseconds (default 900, or BYWAY_DEMO_STEP_MS). */
  stepMs?: number;
}

export interface DemoRunner extends Runner {
  /** Stops every run's timers (tests, hot reload). */
  dispose(): void;
}

/** Thrown inside a run's loop when the run was cancelled; never surfaces to callers. */
class Cancelled extends Error {
  override name = 'Cancelled';
}

interface Waiting {
  checkpointId: string;
  resolve: (res: CheckpointResolution) => void;
  reject: (err: Error) => void;
}

interface Live {
  runId: string;
  budget: number;
  cost: number;
  ended: boolean;
  cancelled: boolean;
  paused: boolean;
  /** The step in progress, for step-failed and for who is spending on a video call. */
  stepId?: string;
  wake?: () => void;
  waiting?: Waiting;
}

const MAX_TEXT = 100_000;
const LOOP_MAX = 5;
const TERMINAL: readonly RunStatus[] = ['done', 'failed', 'cancelled'];

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t === 'object' && 'unref' in t) t.unref();
  });

const round = (n: number) => Math.round(n * 100) / 100;

const ACTOR = { you: 'human', ai: 'model', tool: 'tool' } as const;

function stepData(step: ScriptStep): RunEventPayloads['step-started'] {
  return {
    label: step.label,
    stage: step.stage,
    role: step.role,
    actor: ACTOR[step.who],
    ...(step.block ? { block: step.block } : {}),
    ...(step.glue ? { glue: step.glue } : {}),
  };
}

/** A GREAT-mode critic with fewer than three of your examples scores against the bar instead, and says so (ADR-0071). */
function stepNote(step: ScriptStep, ctx: DemoContext): string | undefined {
  if (step.critic === 'GREAT' && ctx.refs.length < GREAT_MIN_REFS) return okModeNote(ctx.refs.length);
  return step.note?.(ctx);
}

/** Checks an answer against its checkpoint and keeps only the fields that kind uses. */
export function validateResolution(cp: CheckpointRecord, res: CheckpointResolution): CheckpointResolution {
  const optionIds = new Set((cp.options ?? []).map((o) => o.id));
  const chosen = (n: number, message: string) => {
    const choice = res.choice ?? [];
    if (choice.length !== n || new Set(choice).size !== n) throw new Error(message);
    for (const id of choice) if (!optionIds.has(id)) throw new Error(`"${id}" is not one of the options.`);
    return { checkpointId: cp.id, choice: [...choice] };
  };
  const text = (message: string) => {
    const value = res.text ?? '';
    if (!value.trim()) throw new Error(message);
    if (value.length > MAX_TEXT) throw new Error('That text is too long.');
    return { checkpointId: cp.id, text: value };
  };
  switch (cp.kind) {
    case 'pick': {
      const n = picksNeeded(cp);
      return chosen(n, `Choose ${n} option${n === 1 ? '' : 's'}.`);
    }
    case 'compare':
    case 'choose':
      return chosen(1, 'Choose one option.');
    case 'write':
    case 'react':
      return text('Write something first.');
    case 'directive':
      return text('List at least one item.');
    case 'confirm':
      if (typeof res.approved !== 'boolean') throw new Error('Answer yes or no.');
      return { checkpointId: cp.id, approved: res.approved };
  }
}

export function createDemoRunner(opts: DemoRunnerOptions): DemoRunner {
  const { store, gateway } = opts;
  const sleep = opts.sleep ?? realSleep;
  const stepMs = opts.stepMs ?? (Number(process.env.BYWAY_DEMO_STEP_MS) || 900);
  const lives = new Map<string, Live>();
  let disposed = false;

  function emit<T extends RunEventType>(runId: string, type: T, data: RunEventPayloads[T], at: { stepId?: string; candidate?: number } = {}) {
    return store.appendEvent({
      runId,
      type,
      ...(at.stepId ? { stepId: at.stepId } : {}),
      ...(at.candidate !== undefined ? { candidate: at.candidate } : {}),
      data,
    });
  }

  /** A paused run stays 'paused' whatever it is doing underneath, until it resumes or ends. */
  function setStatus(live: Live, status: RunStatus): Promise<RunRecord> {
    const shown = live.paused && !TERMINAL.includes(status) ? 'paused' : status;
    return store.updateRun(live.runId, { status: shown });
  }

  function stopIfCancelled(live: Live): void {
    if (live.cancelled || disposed) throw new Cancelled();
  }

  /** Between steps: wait out a pause (the step before it has already finished, as the contract says). */
  async function gate(live: Live): Promise<void> {
    while (live.paused && !live.cancelled && !disposed) await new Promise<void>((r) => (live.wake = r));
    stopIfCancelled(live);
  }

  async function pace(live: Live, ms: number): Promise<void> {
    stopIfCancelled(live);
    await sleep(ms);
    stopIfCancelled(live);
  }

  /** Ends a run as cancelled exactly once. Its open question stays open: the store only accepts real answers. */
  async function stop(live: Live): Promise<void> {
    if (live.ended) return;
    live.ended = true;
    live.cancelled = true;
    await store.updateRun(live.runId, { status: 'cancelled' });
    await emit(live.runId, 'run-cancelled', {});
    live.waiting?.reject(new Cancelled());
    live.wake?.();
  }

  async function ask(live: Live, stepId: string, a: Ask): Promise<CheckpointResolution> {
    const cp = await store.openCheckpoint({
      id: `cp-${randomUUID()}`,
      runId: live.runId,
      stepId,
      kind: a.kind,
      prompt: a.prompt,
      ...(a.options ? { options: a.options } : {}),
      ...(a.k !== undefined ? { k: a.k } : {}),
      ...(a.initialText !== undefined ? { initialText: a.initialText } : {}),
      ...(a.artifactIds ? { artifactIds: a.artifactIds } : {}),
    });
    await setStatus(live, 'waiting');
    await emit(live.runId, 'checkpoint-opened', { checkpointId: cp.id, kind: cp.kind }, { stepId });
    const res = await new Promise<CheckpointResolution>((resolve, reject) => {
      live.waiting = { checkpointId: cp.id, resolve, reject };
    });
    live.waiting = undefined;
    stopIfCancelled(live);
    await emit(live.runId, 'checkpoint-resolved', { checkpointId: cp.id }, { stepId });
    await setStatus(live, 'running');
    return res;
  }

  async function skip(live: Live, step: ScriptStep, note: string): Promise<void> {
    await emit(live.runId, 'step-started', stepData(step), { stepId: step.id });
    await pace(live, stepMs / 3);
    await emit(live.runId, 'step-finished', { costUsd: 0, skipped: true, note }, { stepId: step.id });
  }

  async function machine(live: Live, ctx: DemoContext, step: ScriptStep): Promise<void> {
    const cost = step.costUsd ?? 0;
    if (cost > 0 && live.cost + cost > live.budget + 1e-9) {
      const raise = Math.max(1, Math.ceil((live.cost + cost - live.budget) * 2) / 2);
      const res = await ask(live, step.id, {
        kind: 'confirm',
        prompt: `Raise the budget by ${formatUsd(raise)}? This run has spent ${formatUsd(live.cost)} of its ${formatUsd(live.budget)} budget, and ${step.label} needs about ${formatUsd(cost)}.`,
      });
      if (!res.approved) {
        await stop(live);
        throw new Cancelled();
      }
      live.budget = round(live.budget + raise);
      await store.updateRun(live.runId, { budgetUsd: live.budget });
      await emit(live.runId, 'cost', { totalUsd: live.cost, budgetUsd: live.budget });
    }
    const units = step.units ?? 1;
    if (step.iterations) {
      for (let n = 1; n <= step.iterations; n++) {
        await pace(live, (stepMs * units) / step.iterations);
        await emit(live.runId, 'loop-iteration', { iteration: n, max: step.loopMax ?? LOOP_MAX }, { stepId: step.id });
      }
    } else {
      await pace(live, stepMs * units);
    }
    let produced;
    try {
      produced = (await step.work?.(ctx)) ?? [];
    } catch (err) {
      if (!(err instanceof SkipStep)) throw err;
      await emit(live.runId, 'step-finished', { costUsd: 0, skipped: true, note: err.message }, { stepId: step.id });
      return;
    }
    for (const [i, p] of produced.entries()) {
      if (i > 0 && p.candidate !== undefined) await pace(live, stepMs / 4);
      await emit(
        live.runId,
        'artifact',
        { artifactId: p.artifactId, mediaType: p.mediaType, label: p.label ?? step.label, ...(p.shot !== undefined ? { shot: p.shot } : {}) },
        { stepId: step.id, ...(p.candidate !== undefined ? { candidate: p.candidate } : {}) },
      );
    }
    live.cost = round(live.cost + cost);
    await store.updateRun(live.runId, { costUsd: live.cost });
    const note = stepNote(step, ctx);
    await emit(
      live.runId,
      'step-finished',
      { costUsd: cost, ...(note ? { note } : {}), ...(produced.length > 0 ? { outputArtifactIds: produced.map((p) => p.artifactId) } : {}) },
      { stepId: step.id },
    );
    if (cost > 0) await emit(live.runId, 'cost', { totalUsd: live.cost, budgetUsd: live.budget });
  }

  async function drive(live: Live, input: StartRunInput, run: RunRecord): Promise<void> {
    const script = scriptFor(input.recipe.family);
    if (!script) throw new Error(`no demo script for ${input.recipe.family}`);
    const video = gateway
      ? (req: { prompt: string; durationSec: number; startFrameArtifactId?: string }) =>
          gateway.video({
            workspaceId: input.workspaceId,
            runId: live.runId,
            ...(live.stepId ? { stepId: live.stepId } : {}),
            purpose: 'relay:media',
            profileId: input.profileId,
            ...req,
          })
      : undefined;
    const ctx: DemoContext = {
      run,
      problem: input.problem,
      subject: subjectFrom(input.problem.text),
      routes: input.routes ?? {},
      refs: input.inputs?.refs ?? [],
      state: {},
      put: async (text, mediaType) => (await store.artifacts.putText(text, mediaType)).id,
      getText: (id) => store.artifacts.getText(id),
      mediaTypeOf: async (id) => (await store.artifacts.get(id)).record.mediaType,
      ...(video ? { video } : {}),
    };
    const steps = script.steps;
    let i = 0;
    let hops = 0;
    try {
      await pace(live, stepMs / 3);
      while (i < steps.length) {
        const step = steps[i];
        if (!step) break;
        await gate(live);
        const when = step.when ? step.when(ctx) : true;
        if (when === false) {
          i++;
          continue;
        }
        if (typeof when === 'string') {
          await skip(live, step, when);
          i++;
          continue;
        }
        if (step.optional) {
          const res = await ask(live, step.optional.id, await step.optional.ask(ctx));
          step.optional.apply?.(ctx, res);
          if (!res.approved) {
            await skip(live, step, step.optional.declined);
            i++;
            continue;
          }
          await gate(live);
        }
        live.stepId = step.id;
        await emit(live.runId, 'step-started', stepData(step), { stepId: step.id });
        if (step.who === 'you') {
          if (!step.ask) throw new Error(`step ${step.id} has nothing to ask`);
          const res = await ask(live, step.id, await step.ask(ctx));
          await step.apply?.(ctx, res);
          await emit(live.runId, 'step-finished', { costUsd: 0 }, { stepId: step.id });
        } else {
          await machine(live, ctx, step);
        }
        live.stepId = undefined;
        const back = step.again?.(ctx);
        const j = back ? steps.findIndex((s) => s.id === back) : -1;
        if (j >= 0 && hops < 20) {
          hops++;
          i = j;
        } else {
          i++;
        }
      }
      await gate(live);
      const output = await script.finish(ctx);
      live.ended = true;
      await store.updateRun(live.runId, { status: 'done', outputArtifactId: output });
      await emit(live.runId, 'run-finished', { outputArtifactId: output, costUsd: live.cost });
    } catch (err) {
      if (err instanceof Cancelled || live.ended) return;
      live.ended = true;
      const message = err instanceof Error ? err.message : String(err);
      if (live.stepId) {
        await emit(live.runId, 'step-failed', { error: message, retryable: err instanceof GatewayError ? err.retryable : false }, { stepId: live.stepId });
      }
      await store.updateRun(live.runId, { status: 'failed', error: message });
      await emit(live.runId, 'run-failed', { error: message });
    }
  }

  /** The live run, or nothing for a run that has ended; unknown runs are an error. */
  async function liveRun(runId: string): Promise<Live | undefined> {
    const live = lives.get(runId);
    if (live && !live.ended) return live;
    if (!live && !(await store.getRun(runId))) throw new Error('Run not found.');
    return undefined;
  }

  return {
    async start(input) {
      if (!scriptFor(input.recipe.family)) throw new Error(`There is no demo for recipe ${input.recipe.id}.`);
      if (!(input.budgetUsd > 0)) throw new Error('The budget must be more than zero.');
      const run = await store.createRun({
        id: `run-${randomUUID()}`,
        workspaceId: input.workspaceId,
        recipeId: input.recipe.id,
        recipeHash: input.recipe.hash ?? recipeHash(input.recipe),
        profileId: input.profileId,
        ...(input.intakeId ? { intakeId: input.intakeId } : {}),
        title: titleFromProblem(input.problem.text),
        problem: input.problem.text,
        medium: input.recipe.medium ?? 'prose',
        status: 'running',
        budgetUsd: input.budgetUsd,
      });
      await emit(run.id, 'run-started', { recipeId: input.recipe.id, profileId: input.profileId, budgetUsd: input.budgetUsd });
      const live: Live = { runId: run.id, budget: input.budgetUsd, cost: 0, ended: false, cancelled: false, paused: false };
      lives.set(run.id, live);
      void drive(live, input, run);
      return run;
    },

    async resolve(res) {
      const cp = await store.getCheckpoint(res.checkpointId);
      if (!cp) throw new Error('That question was not found.');
      if (cp.status !== 'open') throw new Error('That question has already been answered.');
      const live = lives.get(cp.runId);
      const waiting = live?.waiting;
      if (!live || live.ended || waiting?.checkpointId !== cp.id) throw new Error('This run is not waiting for that answer.');
      const clean = validateResolution(cp, res);
      await store.resolveCheckpoint(clean);
      // The run is working again as soon as the answer is accepted (unless paused), so a poll never sees a stale "Your turn".
      await setStatus(live, 'running');
      waiting.resolve(clean);
    },

    async cancel(runId) {
      const live = await liveRun(runId);
      if (live) await stop(live);
    },

    async pause(runId) {
      const live = await liveRun(runId);
      if (!live || live.paused) return;
      live.paused = true;
      await setStatus(live, 'paused');
      await emit(runId, 'run-paused', {});
    },

    async resume(runId) {
      const live = await liveRun(runId);
      if (!live || !live.paused) return;
      live.paused = false;
      await setStatus(live, live.waiting ? 'waiting' : 'running');
      await emit(runId, 'run-resumed', {});
      live.wake?.();
    },

    async view(runId, afterSeq) {
      const run = await store.getRun(runId);
      if (!run) throw new Error('Run not found.');
      const [events, checkpoints] = await Promise.all([store.events(runId, afterSeq), store.checkpointsForRun(runId)]);
      return { run, events, checkpoints };
    },

    dispose() {
      disposed = true;
      for (const live of lives.values()) {
        live.cancelled = true;
        live.waiting?.reject(new Cancelled());
        live.wake?.();
      }
    },
  };
}
