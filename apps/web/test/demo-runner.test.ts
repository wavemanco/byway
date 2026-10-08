import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  GatewayError,
  MEDIUM_FORMAT,
  type CheckpointKind,
  type CheckpointRecord,
  type CheckpointResolution,
  type Gateway,
  type RunEvent,
  type RunEventType,
  type RunRecord,
  type Store,
} from '@byway/contracts';
import { walk, type Recipe } from '@byway/recipe';
import { CHECKPOINT_KINDS } from '../src/view/checkpoints.ts';
import { createDemoGateway } from '../src/services/demo/gateway.ts';
import { NO_COMPOSITING, NO_VIDEO, NO_VO_AUDIO, okModeNote } from '../src/services/demo/notes.ts';
import { createDemoRunner, type DemoRunner } from '../src/services/demo/runner.ts';
import { createDemoStore } from '../src/services/demo/store.ts';
import { demoRecipes } from '../src/services/demo/recipes.ts';

/** RunEventPayloads (contracts store.ts), strictly: the runner emits exactly these keys. */
const PAYLOADS: Record<RunEventType, z.ZodType> = {
  'run-started': z.strictObject({ recipeId: z.string(), profileId: z.string(), budgetUsd: z.number() }),
  'step-started': z.strictObject({
    label: z.string().min(1),
    stage: z.enum(['D1', 'D2', 'D3']),
    role: z.string().min(1),
    actor: z.enum(['model', 'human', 'policy', 'tool']),
    block: z.string().optional(),
    glue: z.string().optional(),
  }),
  'step-finished': z.strictObject({
    costUsd: z.number(),
    skipped: z.boolean().optional(),
    note: z.string().optional(),
    outputArtifactIds: z.array(z.string()).optional(),
  }),
  'step-failed': z.strictObject({ error: z.string(), retryable: z.boolean() }),
  'checkpoint-opened': z.strictObject({ checkpointId: z.string(), kind: z.enum(CHECKPOINT_KINDS) }),
  'checkpoint-resolved': z.strictObject({ checkpointId: z.string() }),
  artifact: z.strictObject({ artifactId: z.string().regex(/^sha256:/), mediaType: z.string(), label: z.string().min(1), shot: z.number().optional() }),
  'loop-iteration': z.strictObject({ iteration: z.number(), max: z.number(), score: z.number().optional() }),
  cost: z.strictObject({ totalUsd: z.number(), budgetUsd: z.number() }),
  'run-finished': z.strictObject({ outputArtifactId: z.string(), costUsd: z.number() }),
  'run-failed': z.strictObject({ error: z.string() }),
  'run-cancelled': z.strictObject({}),
  'run-paused': z.strictObject({}),
  'run-resumed': z.strictObject({}),
};

const STEP_EVENTS: RunEventType[] = ['step-started', 'step-finished', 'step-failed', 'artifact'];
const RUN_EVENTS: RunEventType[] = ['run-started', 'cost', 'run-finished', 'run-failed', 'run-cancelled', 'run-paused', 'run-resumed'];

/** Each event's payload matches its type; step events name a recipe step, operator events a node, run events none. */
function expectConforms(events: RunEvent[], recipe: Recipe): void {
  const steps = new Set<string>();
  const nodes = new Set<string>();
  walk(recipe, (node) => {
    if (node.op === 'step') steps.add(node.id);
    if ('id' in node && node.id) nodes.add(node.id);
  });
  for (const e of events) {
    const parsed = PAYLOADS[e.type].safeParse(e.data);
    expect(parsed.success, `${recipe.id} ${e.type} ${JSON.stringify(e.data)}`).toBe(true);
    if (STEP_EVENTS.includes(e.type)) expect(steps.has(e.stepId ?? ''), `${recipe.id} ${e.type} stepId ${e.stepId}`).toBe(true);
    else if (RUN_EVENTS.includes(e.type)) expect(e.stepId, `${recipe.id} ${e.type}`).toBeUndefined();
    else expect(nodes.has(e.stepId ?? ''), `${recipe.id} ${e.type} stepId ${e.stepId}`).toBe(true);
  }
}

/** Answers any checkpoint the way a person plausibly would. */
function answer(cp: CheckpointRecord, approve = true): CheckpointResolution {
  const ids = (cp.options ?? []).map((o) => o.id);
  switch (cp.kind) {
    case 'pick':
      return { checkpointId: cp.id, choice: ids.slice(0, Math.min(cp.k ?? 1, ids.length)) };
    case 'compare':
      return { checkpointId: cp.id, choice: [ids.at(-1) ?? 'B'] };
    case 'choose':
      return { checkpointId: cp.id, choice: [ids[0] ?? ''] };
    case 'confirm':
      return { checkpointId: cp.id, approved: cp.prompt.startsWith('Is it done') ? true : approve };
    case 'directive':
      return { checkpointId: cp.id, text: 'Remove the last section' };
    case 'react':
      return { checkpointId: cp.id, text: 'Warmer, and less corporate.' };
    case 'write':
      return { checkpointId: cp.id, text: cp.initialText?.trim() ? cp.initialText : 'My own words, written by me.' };
  }
}

const instant = () => Promise.resolve();
let runner: DemoRunner | undefined;

afterEach(() => runner?.dispose());

interface Setup {
  sleep?: (ms: number) => Promise<void>;
  gateway?: (store: Store) => Gateway | undefined;
}

function setup(over: Setup = {}) {
  const store = createDemoStore();
  const gateway = over.gateway ? over.gateway(store) : createDemoGateway({ store });
  runner = createDemoRunner({ store, sleep: over.sleep ?? instant, ...(gateway ? { gateway } : {}) });
  return { store, runner };
}

interface StartOptions extends Setup {
  budgetUsd?: number;
  routes?: Record<string, string>;
  text?: string;
  refs?: number;
  intakeId?: string;
}

async function start(recipeId: string, extra: StartOptions = {}) {
  const { store, runner } = setup(extra);
  const ws = await store.ensureDefaultWorkspace();
  const recipe = demoRecipes.get(recipeId);
  if (!recipe) throw new Error(`no recipe ${recipeId}`);
  const refs = await Promise.all(Array.from({ length: extra.refs ?? 0 }, (_, i) => store.artifacts.putText(`Example ${i + 1}`, 'text/markdown')));
  const run = await runner.start({
    workspaceId: ws.id,
    recipe,
    problem: { text: extra.text ?? 'A landing page for my pottery studio in Lisbon' },
    profileId: 'balanced',
    budgetUsd: extra.budgetUsd ?? 10,
    ...(extra.routes ? { routes: extra.routes } : {}),
    ...(extra.intakeId ? { intakeId: extra.intakeId } : {}),
    ...(refs.length > 0 ? { inputs: { refs: refs.map((r) => r.id) } } : {}),
  });
  return { store, runner, run, recipe };
}

const STILL: RunRecord['status'][] = ['waiting', 'paused', 'done', 'failed', 'cancelled'];

async function settle(runner: DemoRunner, runId: string): Promise<RunRecord> {
  let run: RunRecord | undefined;
  await vi.waitFor(async () => {
    run = (await runner.view(runId)).run;
    expect(STILL).toContain(run.status);
  });
  if (!run) throw new Error('unreachable');
  return run;
}

/** Drives a run to the end, answering every checkpoint; returns the kinds it was asked. */
async function drive(runner: DemoRunner, runId: string, approve = true): Promise<{ run: RunRecord; kinds: CheckpointKind[] }> {
  const kinds: CheckpointKind[] = [];
  for (let guard = 0; guard < 200; guard++) {
    const run = await settle(runner, runId);
    if (run.status !== 'waiting') return { run, kinds };
    const open = (await runner.view(runId)).checkpoints.filter((c) => c.status === 'open');
    for (const cp of open) {
      kinds.push(cp.kind);
      await runner.resolve(answer(cp, approve));
    }
  }
  throw new Error('run did not finish');
}

const finished = (events: RunEvent[], stepId: string) => events.filter((e) => e.type === 'step-finished' && e.stepId === stepId).map((e) => e.data);

describe('demo runner', () => {
  it('runs every recipe end to end, delivers its medium, and emits exactly the contract payloads', async () => {
    const seen = new Set<CheckpointKind>();
    for (const recipe of demoRecipes.list()) {
      const { store, runner, run } = await start(recipe.id);
      const { run: done, kinds } = await drive(runner, run.id);
      kinds.forEach((k) => seen.add(k));
      expect(done.status, recipe.id).toBe('done');
      expect(done.outputArtifactId, recipe.id).toMatch(/^sha256:/);
      const output = await store.artifacts.get(done.outputArtifactId ?? '');
      const medium = recipe.medium ?? 'prose';
      expect(output.record.mediaType, recipe.id).toBe(MEDIUM_FORMAT[medium].artifactMediaType);
      expect(done.costUsd, recipe.id).toBeGreaterThan(0);
      const { events } = await runner.view(run.id);
      expect(events[0]?.type).toBe('run-started');
      expect(events.at(-1)).toMatchObject({ type: 'run-finished', data: { outputArtifactId: done.outputArtifactId, costUsd: done.costUsd } });
      expectConforms(events, recipe);
    }
    // Every checkpoint UI can be exercised from the demo.
    expect([...seen].sort()).toEqual(['choose', 'compare', 'confirm', 'directive', 'pick', 'react', 'write']);
  });

  it('opens a route choice only when the route was not chosen up front', async () => {
    const { runner, run } = await start('c1', { routes: { entry: 'seed' } });
    const { kinds } = await drive(runner, run.id);
    expect(kinds).not.toContain('choose');
  });

  it('records the budget and the intake on the run, and announces the start', async () => {
    const { runner, run } = await start('c4', { intakeId: 'intake-7' });
    expect(run).toMatchObject({ budgetUsd: 10, intakeId: 'intake-7', status: 'running' });
    await settle(runner, run.id);
    const { events } = await runner.view(run.id);
    expect(events[0]?.data).toEqual({ recipeId: 'c4', profileId: 'balanced', budgetUsd: 10 });
    const opened = events.find((e) => e.type === 'checkpoint-opened');
    expect(opened).toMatchObject({ stepId: 'vision', data: { checkpointId: expect.any(String), kind: 'react' } });
  });

  it('uses your words in the deliverable', async () => {
    const { store, runner, run } = await start('c6', { text: 'My cover letter for a museum job' });
    await settle(runner, run.id);
    const [cp] = (await runner.view(run.id)).checkpoints.filter((c) => c.status === 'open');
    expect(cp?.kind).toBe('write');
    await runner.resolve({ checkpointId: cp?.id ?? '', text: 'Dear committee, I restored a 1930s loom last spring.' });
    const { run: done } = await drive(runner, run.id);
    expect(await store.artifacts.getText(done.outputArtifactId ?? '')).toContain('I restored a 1930s loom');
  });

  it('returns only the events after a sequence number', async () => {
    const { runner, run } = await start('c4');
    await settle(runner, run.id);
    const all = (await runner.view(run.id)).events;
    const later = (await runner.view(run.id, 2)).events;
    expect(later.map((e) => e.seq)).toEqual(all.filter((e) => e.seq > 2).map((e) => e.seq));
  });

  it('asks before a step would go over the budget, and stops if you decline', async () => {
    const { runner, run } = await start('c1', { budgetUsd: 0.05, routes: { entry: 'seed' } });
    await settle(runner, run.id);
    const [cp] = (await runner.view(run.id)).checkpoints.filter((c) => c.status === 'open');
    expect(cp).toMatchObject({ kind: 'confirm' });
    expect(cp?.prompt).toMatch(/^Raise the budget/);
    await runner.resolve({ checkpointId: cp?.id ?? '', approved: false });
    const stopped = await settle(runner, run.id);
    expect(stopped.status).toBe('cancelled');
    expect((await runner.view(run.id)).events.at(-1)).toMatchObject({ type: 'run-cancelled', data: {} });
  });

  it('raises the run budget when you agree, on the record and in the cost events', async () => {
    const { runner, run } = await start('c4', { budgetUsd: 0.01 });
    const { run: done } = await drive(runner, run.id, true);
    expect(done.status).toBe('done');
    expect(done.budgetUsd).toBeGreaterThan(0.01);
    const costs = (await runner.view(run.id)).events.filter((e) => e.type === 'cost');
    expect(costs.length).toBeGreaterThan(0);
    expect(costs.at(-1)?.data).toEqual({ totalUsd: done.costUsd, budgetUsd: done.budgetUsd });
  });

  it('cancels a run and refuses answers afterwards; its open question stays unanswered', async () => {
    const { runner, run } = await start('c4');
    await settle(runner, run.id);
    const [cp] = (await runner.view(run.id)).checkpoints;
    await runner.cancel(run.id);
    const cancelled = await settle(runner, run.id);
    expect(cancelled.status).toBe('cancelled');
    expect((await runner.view(run.id)).events.at(-1)).toMatchObject({ type: 'run-cancelled', data: {} });
    await expect(runner.resolve({ checkpointId: cp?.id ?? '', text: 'late' })).rejects.toThrow();
    // The store only accepts real answers, so the question stays open; screens treat it as closed (view/run.ts).
    expect((await runner.view(run.id)).checkpoints[0]?.status).toBe('open');
  });

  it('validates answers before accepting them', async () => {
    const { runner, run } = await start('c1', { routes: { entry: 'seed' } });
    for (let i = 0; i < 10; i++) {
      await settle(runner, run.id);
      const [cp] = (await runner.view(run.id)).checkpoints.filter((c) => c.status === 'open');
      if (!cp) throw new Error('no checkpoint');
      if (cp.kind === 'pick') {
        await expect(runner.resolve({ checkpointId: cp.id, choice: [] })).rejects.toThrow(/choose 1/i);
        await expect(runner.resolve({ checkpointId: cp.id, choice: ['not-an-option'] })).rejects.toThrow(/not one of the options/i);
        return;
      }
      await runner.resolve(answer(cp));
    }
    throw new Error('no pick checkpoint reached');
  });

  it('asks the optional question under its own id, and skips the step with a plain note on a no', async () => {
    const { runner, run } = await start('c1', { routes: { entry: 'seed' } });
    for (let i = 0; i < 10; i++) {
      await settle(runner, run.id);
      const [cp] = (await runner.view(run.id)).checkpoints.filter((c) => c.status === 'open');
      if (!cp) throw new Error('no checkpoint');
      if (cp.kind === 'confirm' && cp.prompt.includes('plain')) {
        expect(cp.stepId).toBe('asset-if-plain');
        await runner.resolve({ checkpointId: cp.id, approved: false });
        await settle(runner, run.id);
        const { events } = await runner.view(run.id);
        expect(events.find((e) => e.type === 'checkpoint-opened' && e.data.checkpointId === cp.id)?.stepId).toBe('asset-if-plain');
        expect(finished(events, 'asset')).toEqual([{ costUsd: 0, skipped: true, note: 'You did not find the drafts plain.' }]);
        return;
      }
      await runner.resolve(answer(cp));
    }
    throw new Error('no optional question reached');
  });
});

describe('demo runner: pause and resume', () => {
  it('lets the current step finish, then holds the run as paused until it resumes', async () => {
    let release: () => void = () => {};
    const sleep = () => new Promise<void>((r) => (release = r));
    const { store, runner, run } = await start('c7', { sleep, text: 'Trim this PR' });
    await runner.pause(run.id);
    expect((await store.getRun(run.id))?.status).toBe('paused');
    // The step in flight carries on to its end; nothing new starts.
    for (let i = 0; i < 5; i++) {
      release();
      await new Promise((r) => setTimeout(r, 5));
    }
    const { events } = await runner.view(run.id);
    const pausedAt = events.findIndex((e) => e.type === 'run-paused');
    expect(pausedAt).toBeGreaterThanOrEqual(0);
    expect(events.slice(pausedAt).filter((e) => e.type === 'step-started')).toEqual([]);
    expect((await store.getRun(run.id))?.status).toBe('paused');

    await runner.resume(run.id);
    expect((await store.getRun(run.id))?.status).toBe('running');
    for (let i = 0; i < 5; i++) {
      release();
      await new Promise((r) => setTimeout(r, 5));
    }
    const after = (await runner.view(run.id)).events;
    const resumedAt = after.findIndex((e) => e.type === 'run-resumed');
    expect(resumedAt).toBeGreaterThan(pausedAt);
    expect(after.slice(resumedAt).some((e) => e.type === 'step-started')).toBe(true);
  });

  it('keeps a waiting run paused while you answer, and goes back to your turn on resume', async () => {
    const { store, runner, run } = await start('c4');
    await settle(runner, run.id);
    await runner.pause(run.id);
    await runner.pause(run.id);
    expect((await store.getRun(run.id))?.status).toBe('paused');
    await runner.resume(run.id);
    expect((await store.getRun(run.id))?.status).toBe('waiting');
    await runner.pause(run.id);
    const [cp] = (await runner.view(run.id)).checkpoints.filter((c) => c.status === 'open');
    if (!cp) throw new Error('no checkpoint');
    await runner.resolve(answer(cp));
    await new Promise((r) => setTimeout(r, 10));
    expect((await store.getRun(run.id))?.status).toBe('paused');
    const types = (await runner.view(run.id)).events.map((e) => e.type);
    expect(types.filter((t) => t === 'run-paused')).toHaveLength(2);
    expect(types.filter((t) => t === 'run-resumed')).toHaveLength(1);
    expect(types.slice(types.lastIndexOf('run-paused')).filter((t) => t === 'step-started')).toEqual([]);
    await runner.resume(run.id);
    const { run: done } = await drive(runner, run.id);
    expect(done.status).toBe('done');
  });

  it('does nothing to a run that has ended', async () => {
    const { store, runner, run } = await start('c4');
    await settle(runner, run.id);
    await runner.cancel(run.id);
    await runner.pause(run.id);
    await runner.resume(run.id);
    expect((await store.getRun(run.id))?.status).toBe('cancelled');
    await expect(runner.pause('run-missing')).rejects.toThrow(/not found/);
  });
});

describe('demo runner: outside critique and your examples (ADR-0071)', () => {
  it('scores against the quality bar, and says so, with fewer than three examples', async () => {
    for (const refs of [0, 2]) {
      const { runner, run } = await start('c3', { refs, text: 'A weekly newsletter about cycling' });
      await drive(runner, run.id);
      const { events } = await runner.view(run.id);
      expect(finished(events, 'critic-loop')[0]).toMatchObject({ note: okModeNote(refs) });
    }
    expect(okModeNote(0)).toBe('No examples were supplied, so the outside critique scored the work against a quality bar instead of ranking it against examples.');
  });

  it('ranks against your examples when you supply at least three', async () => {
    const { runner, run } = await start('c3', { refs: 3, text: 'A weekly newsletter about cycling' });
    await drive(runner, run.id);
    const note = String(finished((await runner.view(run.id)).events, 'critic-loop')[0]?.note);
    expect(note).toMatch(/your 3 examples/);
  });
});

describe('demo runner: Ad Video Chain motion (ADR-0069)', () => {
  it('makes one clip per shot through the gateway and puts them in the storyboard', async () => {
    const { store, runner, run } = await start('c5', { text: 'A 30-second ad for a bakery' });
    const { run: done } = await drive(runner, run.id);
    const { events } = await runner.view(run.id);
    const clips = events.filter((e) => e.type === 'artifact' && e.stepId === 'relay');
    expect(clips.map((e) => e.data)).toEqual([1, 2, 3, 4, 5].map((shot) => ({ artifactId: expect.any(String), mediaType: 'image/svg+xml', label: `Shot ${shot} clip`, shot })));
    const board = JSON.parse(await store.artifacts.getText(done.outputArtifactId ?? '')) as { storyboard: { imageArtifactId?: string; clipArtifactId?: string }[] };
    expect(board.storyboard.map((s) => s.clipArtifactId)).toEqual(clips.map((e) => e.data.artifactId));
    expect(board.storyboard.every((s) => s.imageArtifactId)).toBe(true);
    expect(finished(events, 'matte')).toEqual([{ costUsd: 0, skipped: true, note: NO_COMPOSITING }]);
    expect(finished(events, 'vo-audio')).toEqual([{ costUsd: 0, skipped: true, note: NO_VO_AUDIO }]);
  });

  it('skips motion with a plain note when no video model is usable, and keeps the frames', async () => {
    const refusing = (store: Store): Gateway => ({
      ...createDemoGateway({ store }),
      video: () => Promise.reject(new GatewayError('no-credentials', 'no fal key')),
    });
    for (const gateway of [refusing, () => undefined]) {
      const { store, runner, run } = await start('c5', { gateway, text: 'A 30-second ad for a bakery' });
      const { run: done } = await drive(runner, run.id);
      expect(done.status).toBe('done');
      const { events } = await runner.view(run.id);
      expect(finished(events, 'relay')).toEqual([{ costUsd: 0, skipped: true, note: NO_VIDEO }]);
      const board = JSON.parse(await store.artifacts.getText(done.outputArtifactId ?? '')) as { storyboard: { imageArtifactId?: string; clipArtifactId?: string }[] };
      expect(board.storyboard.some((s) => s.clipArtifactId)).toBe(false);
      expect(board.storyboard.every((s) => s.imageArtifactId)).toBe(true);
    }
  });

  it('fails the step and the run on any other gateway error', async () => {
    const broken = (store: Store): Gateway => ({
      ...createDemoGateway({ store }),
      video: () => Promise.reject(new GatewayError('rate-limited', 'Slow down.', true)),
    });
    const { runner, run } = await start('c5', { gateway: broken, text: 'A 30-second ad for a bakery' });
    const { run: failed } = await drive(runner, run.id);
    expect(failed).toMatchObject({ status: 'failed', error: 'Slow down.' });
    const { events } = await runner.view(run.id);
    expect(events.at(-2)).toMatchObject({ type: 'step-failed', stepId: 'relay', data: { error: 'Slow down.', retryable: true } });
    expect(events.at(-1)).toMatchObject({ type: 'run-failed', data: { error: 'Slow down.' } });
  });
});
