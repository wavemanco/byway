/**
 * The demo runner: implements the Runner contract by walking a recipe's demo script on a timer. It behaves
 * like the real runner from the UI's point of view (events with stage, block and who; checkpoints that wait
 * for an answer; costs against a budget that pauses on a "Raise the budget?" question; cancel) without any
 * model calls. Timing is injectable so tests run instantly.
 */
import { randomUUID } from 'node:crypto';
import type { CheckpointRecord, CheckpointResolution, RunEventType, RunRecord, StartRunInput, Store } from '@byway/contracts';
import { recipeHash } from '@byway/recipe';
import { picksNeeded } from '../../view/checkpoints.ts';
import { formatUsd } from '../../view/format.ts';
import { titleFromProblem } from '../../view/text.ts';
import type { RunControls } from '../types.ts';
import { subjectFrom } from './samples/text.ts';
import type { Ask, DemoContext, ScriptStep } from './script.ts';
import { scriptFor } from './scripts.ts';
import type { Runner } from '@byway/contracts';

export interface DemoRunnerOptions {
  store: Store;
  /** Waits between steps; tests pass an instant one. */
  sleep?: (ms: number) => Promise<void>;
  /** Length of one step unit in milliseconds (default 900, or BYWAY_DEMO_STEP_MS). */
  stepMs?: number;
}

export interface DemoRunner extends Runner, RunControls {
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
  wake?: () => void;
  waiting?: Waiting;
}

const MAX_TEXT = 100_000;

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t === 'object' && 'unref' in t) t.unref();
  });

const round = (n: number) => Math.round(n * 100) / 100;

function stepData(step: ScriptStep): Record<string, unknown> {
  return {
    label: step.label,
    stage: step.stage,
    role: step.role,
    who: step.who,
    actor: step.who === 'you' ? 'human' : step.who === 'ai' ? 'model' : 'tool',
    ...(step.block ? { block: step.block } : {}),
    ...(step.glue ? { glue: step.glue } : {}),
  };
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
  const { store } = opts;
  const sleep = opts.sleep ?? realSleep;
  const stepMs = opts.stepMs ?? (Number(process.env.BYWAY_DEMO_STEP_MS) || 900);
  const lives = new Map<string, Live>();
  let disposed = false;

  const emit = (runId: string, type: RunEventType, stepId: string | undefined, data: Record<string, unknown> = {}, candidate?: number) =>
    store.appendEvent({ runId, type, ...(stepId ? { stepId } : {}), ...(candidate !== undefined ? { candidate } : {}), data });

  async function gate(live: Live): Promise<void> {
    while (live.paused && !live.cancelled && !disposed) await new Promise<void>((r) => (live.wake = r));
    if (live.cancelled || disposed) throw new Cancelled();
  }

  async function pace(live: Live, ms: number): Promise<void> {
    await gate(live);
    await sleep(ms);
    await gate(live);
  }

  /** Ends a run as cancelled exactly once, closing any open question so it no longer reads as "Your turn". */
  async function stop(live: Live, reason: string): Promise<void> {
    if (live.ended) return;
    live.ended = true;
    live.cancelled = true;
    for (const cp of await store.checkpointsForRun(live.runId)) {
      if (cp.status === 'open') await store.resolveCheckpoint({ checkpointId: cp.id });
    }
    await store.updateRun(live.runId, { status: 'cancelled' });
    await emit(live.runId, 'run-cancelled', undefined, { reason });
    live.waiting?.reject(new Cancelled());
    live.wake?.();
  }

  async function ask(live: Live, step: ScriptStep, a: Ask): Promise<CheckpointResolution> {
    const cp = await store.openCheckpoint({
      id: `cp-${randomUUID()}`,
      runId: live.runId,
      stepId: step.id,
      kind: a.kind,
      prompt: a.prompt,
      ...(a.options ? { options: a.options } : {}),
      ...(a.k !== undefined ? { k: a.k } : {}),
      ...(a.initialText !== undefined ? { initialText: a.initialText } : {}),
      ...(a.artifactIds ? { artifactIds: a.artifactIds } : {}),
    });
    await store.updateRun(live.runId, { status: 'waiting' });
    await emit(live.runId, 'checkpoint-opened', step.id, { checkpointId: cp.id, kind: cp.kind });
    const res = await new Promise<CheckpointResolution>((resolve, reject) => {
      live.waiting = { checkpointId: cp.id, resolve, reject };
    });
    live.waiting = undefined;
    await gate(live);
    await emit(live.runId, 'checkpoint-resolved', step.id, { checkpointId: cp.id });
    await store.updateRun(live.runId, { status: 'running' });
    return res;
  }

  async function machine(live: Live, ctx: DemoContext, step: ScriptStep): Promise<void> {
    const cost = step.costUsd ?? 0;
    if (cost > 0 && live.cost + cost > live.budget + 1e-9) {
      const raise = Math.max(1, Math.ceil((live.cost + cost - live.budget) * 2) / 2);
      const res = await ask(live, step, {
        kind: 'confirm',
        prompt: `Raise the budget by ${formatUsd(raise)}? This run has spent ${formatUsd(live.cost)} of its ${formatUsd(live.budget)} budget, and ${step.label} needs about ${formatUsd(cost)}.`,
      });
      if (!res.approved) {
        await stop(live, 'Stopped at the budget.');
        throw new Cancelled();
      }
      live.budget = round(live.budget + raise);
      await emit(live.runId, 'cost', step.id, { totalUsd: live.cost, budgetUsd: live.budget });
    }
    const units = step.units ?? 1;
    if (step.iterations) {
      for (let n = 1; n <= step.iterations; n++) {
        await pace(live, (stepMs * units) / step.iterations);
        await emit(live.runId, 'loop-iteration', step.id, { iteration: n, max: 5 });
      }
    } else {
      await pace(live, stepMs * units);
    }
    const produced = (await step.work?.(ctx)) ?? [];
    for (const [i, p] of produced.entries()) {
      if (i > 0 && p.candidate !== undefined) await pace(live, stepMs / 4);
      await emit(
        live.runId,
        'artifact',
        step.id,
        { artifactId: p.artifactId, mediaType: p.mediaType, ...(p.label ? { label: p.label } : {}), ...(p.shot !== undefined ? { shot: p.shot } : {}) },
        p.candidate,
      );
    }
    live.cost = round(live.cost + cost);
    await store.updateRun(live.runId, { costUsd: live.cost });
    const note = step.note?.(ctx);
    await emit(live.runId, 'step-finished', step.id, { costUsd: cost, ...(note ? { note } : {}) });
    if (cost > 0) await emit(live.runId, 'cost', undefined, { totalUsd: live.cost });
  }

  async function drive(live: Live, input: StartRunInput, run: RunRecord): Promise<void> {
    const script = scriptFor(input.recipe.family);
    if (!script) throw new Error(`no demo script for ${input.recipe.family}`);
    const ctx: DemoContext = {
      run,
      problem: input.problem,
      subject: subjectFrom(input.problem.text),
      routes: input.routes ?? {},
      state: {},
      put: async (text, mediaType) => (await store.artifacts.putText(text, mediaType)).id,
      getText: (id) => store.artifacts.getText(id),
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
        await emit(live.runId, 'step-started', step.id, stepData(step));
        if (typeof when === 'string') {
          await pace(live, stepMs / 3);
          await emit(live.runId, 'step-finished', step.id, { skipped: true, note: when });
          i++;
          continue;
        }
        if (step.who === 'you') {
          if (!step.ask) throw new Error(`step ${step.id} has nothing to ask`);
          const res = await ask(live, step, await step.ask(ctx));
          await step.apply?.(ctx, res);
          await emit(live.runId, 'step-finished', step.id, {});
        } else {
          await machine(live, ctx, step);
        }
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
      await emit(live.runId, 'run-finished', undefined, { outputArtifactId: output });
    } catch (err) {
      if (err instanceof Cancelled || live.ended) return;
      live.ended = true;
      const message = err instanceof Error ? err.message : String(err);
      await store.updateRun(live.runId, { status: 'failed', error: message });
      await emit(live.runId, 'run-failed', undefined, { error: message });
    }
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
        title: titleFromProblem(input.problem.text),
        problem: input.problem.text,
        medium: input.recipe.medium ?? 'prose',
        status: 'running',
      });
      await emit(run.id, 'run-started', undefined, { budgetUsd: input.budgetUsd, recipeId: input.recipe.id, routes: input.routes ?? {}, demo: true });
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
      // The run is working again as soon as the answer is accepted, so a poll never sees a stale "Your turn".
      await store.updateRun(cp.runId, { status: 'running' });
      waiting.resolve(clean);
    },

    async cancel(runId) {
      const live = lives.get(runId);
      if (!live) {
        if (!(await store.getRun(runId))) throw new Error('Run not found.');
        return;
      }
      await stop(live, 'You cancelled the run.');
    },

    async view(runId, afterSeq) {
      const run = await store.getRun(runId);
      if (!run) throw new Error('Run not found.');
      const [events, checkpoints] = await Promise.all([store.events(runId, afterSeq), store.checkpointsForRun(runId)]);
      return { run, events, checkpoints };
    },

    async pause(runId) {
      const live = lives.get(runId);
      if (live && !live.ended) live.paused = true;
    },

    async resume(runId) {
      const live = lives.get(runId);
      if (!live) return;
      live.paused = false;
      live.wake?.();
    },

    isPaused(runId) {
      return lives.get(runId)?.paused ?? false;
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
