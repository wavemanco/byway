import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CheckpointKind, CheckpointRecord, CheckpointResolution, RunRecord } from '@byway/contracts';
import { MEDIUM_FORMAT } from '@byway/contracts';
import { createDemoRunner, type DemoRunner } from '../src/services/demo/runner.ts';
import { createDemoStore } from '../src/services/demo/store.ts';
import { demoRecipes } from '../src/services/demo/recipes.ts';

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

function setup() {
  const store = createDemoStore();
  runner = createDemoRunner({ store, sleep: instant });
  return { store, runner };
}

async function start(recipeId: string, extra: { budgetUsd?: number; routes?: Record<string, string>; text?: string } = {}) {
  const { store, runner } = setup();
  const ws = await store.ensureDefaultWorkspace();
  const recipe = demoRecipes.get(recipeId);
  if (!recipe) throw new Error(`no recipe ${recipeId}`);
  const run = await runner.start({
    workspaceId: ws.id,
    recipe,
    problem: { text: extra.text ?? 'A landing page for my pottery studio in Lisbon' },
    profileId: 'balanced',
    budgetUsd: extra.budgetUsd ?? 10,
    ...(extra.routes ? { routes: extra.routes } : {}),
  });
  return { store, runner, run };
}

async function settle(runner: DemoRunner, runId: string): Promise<RunRecord> {
  let run: RunRecord | undefined;
  await vi.waitFor(async () => {
    run = (await runner.view(runId)).run;
    expect(['waiting', 'done', 'failed', 'cancelled']).toContain(run.status);
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

describe('demo runner', () => {
  it('runs every recipe end to end and delivers the medium the recipe promises', async () => {
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
      const types = (await runner.view(run.id)).events.map((e) => e.type);
      expect(types[0]).toBe('run-started');
      expect(types.at(-1)).toBe('run-finished');
    }
    // Every checkpoint UI can be exercised from the demo.
    expect([...seen].sort()).toEqual(['choose', 'compare', 'confirm', 'directive', 'pick', 'react', 'write']);
  });

  it('opens a route choice only when the route was not chosen up front', async () => {
    const { runner, run } = await start('c1', { routes: { entry: 'seed' } });
    const { kinds } = await drive(runner, run.id);
    expect(kinds).not.toContain('choose');
  });

  it('records the budget on run-started and emits step events with stage, block and who', async () => {
    const { runner, run } = await start('c4');
    await settle(runner, run.id);
    const { events } = await runner.view(run.id);
    expect(events[0]?.data).toMatchObject({ budgetUsd: 10 });
    const started = events.find((e) => e.type === 'step-started');
    expect(started?.data).toMatchObject({ stage: expect.stringMatching(/^D[123]$/), label: expect.any(String), who: expect.any(String) });
    const opened = events.find((e) => e.type === 'checkpoint-opened');
    expect(opened?.data).toMatchObject({ checkpointId: expect.any(String), kind: 'react' });
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

  it('pauses on a budget question when the next step would go over, and stops if you decline', async () => {
    const { runner, run } = await start('c1', { budgetUsd: 0.05, routes: { entry: 'seed' } });
    await settle(runner, run.id);
    const [cp] = (await runner.view(run.id)).checkpoints.filter((c) => c.status === 'open');
    expect(cp).toMatchObject({ kind: 'confirm' });
    expect(cp?.prompt).toMatch(/^Raise the budget/);
    await runner.resolve({ checkpointId: cp?.id ?? '', approved: false });
    const stopped = await settle(runner, run.id);
    expect(stopped.status).toBe('cancelled');
  });

  it('raises the budget when you agree and carries on', async () => {
    const { runner, run } = await start('c4', { budgetUsd: 0.01 });
    const { run: done } = await drive(runner, run.id, true);
    expect(done.status).toBe('done');
    const raises = (await runner.view(run.id)).events.filter((e) => e.type === 'cost' && typeof e.data.budgetUsd === 'number');
    expect(raises.length).toBeGreaterThan(0);
  });

  it('cancels a run and refuses answers afterwards', async () => {
    const { runner, run } = await start('c4');
    await settle(runner, run.id);
    const [cp] = (await runner.view(run.id)).checkpoints;
    await runner.cancel(run.id);
    const cancelled = await settle(runner, run.id);
    expect(cancelled.status).toBe('cancelled');
    expect((await runner.view(run.id)).events.at(-1)?.type).toBe('run-cancelled');
    await expect(runner.resolve({ checkpointId: cp?.id ?? '', text: 'late' })).rejects.toThrow();
  });

  it('validates answers before accepting them', async () => {
    const { runner, run } = await start('c1', { routes: { entry: 'seed' } });
    // Answer until the pick of one draft opens.
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

  it('holds a paused run until it resumes', async () => {
    const store = createDemoStore();
    let release: () => void = () => {};
    const gate = () => new Promise<void>((r) => (release = r));
    runner = createDemoRunner({ store, sleep: gate });
    const ws = await store.ensureDefaultWorkspace();
    const recipe = demoRecipes.get('c7');
    if (!recipe) throw new Error('no c7');
    const run = await runner.start({ workspaceId: ws.id, recipe, problem: { text: 'Trim this PR' }, profileId: 'balanced', budgetUsd: 5 });
    await vi.waitFor(() => expect(runner?.isPaused(run.id)).toBe(false));
    await runner.pause(run.id);
    expect(runner.isPaused(run.id)).toBe(true);
    const before = (await runner.view(run.id)).events.length;
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect((await runner.view(run.id)).events.length).toBeLessThanOrEqual(before + 2);
    await runner.resume(run.id);
    expect(runner.isPaused(run.id)).toBe(false);
  });
});
