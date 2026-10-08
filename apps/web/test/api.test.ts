import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CheckpointRecord } from '@byway/contracts';
import { createDemoServices } from '../src/services/demo/index.ts';
import type { DemoRunner } from '../src/services/demo/runner.ts';
import type { Services } from '../src/services/index.ts';
import {
  HttpError,
  artifactResponse,
  composeIntake,
  controlRun,
  createIntake,
  recommendIntake,
  resolveInRun,
  startRun,
  updateSettings,
  type Deps,
} from '../src/server/api.ts';
import { createIntakeStore } from '../src/server/intakes.ts';
import { getRunData } from '../src/server/run-data.ts';

const instant = () => Promise.resolve();
let services: Services | undefined;

afterEach(() => (services?.runner as DemoRunner | undefined)?.dispose());

async function deps(): Promise<Deps> {
  services = createDemoServices({ sleep: instant, stepMs: 0 });
  const ws = await services.store.ensureDefaultWorkspace();
  return { services, intakes: createIntakeStore(), workspaceId: ws.id, profileId: 'balanced' };
}

async function openQuestion(d: Deps, runId: string): Promise<CheckpointRecord> {
  let open: CheckpointRecord | undefined;
  await vi.waitFor(async () => {
    open = (await d.services.runner.view(runId)).checkpoints.find((c) => c.status === 'open');
    expect(open).toBeDefined();
  });
  if (!open) throw new Error('unreachable');
  return open;
}

describe('route handler logic', () => {
  it('takes a problem from Start to a recommendation, re-routes on a flipped answer, and starts the run', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A landing page for my pottery studio' });
    const rec = await recommendIntake(d, intakeId);
    expect(rec.recipeId).toBe('c1');

    const flipped = rec.answers.map((a) => (a.questionId === 'visual' ? { ...a, answer: false, setBy: 'user' as const } : a));
    expect((await recommendIntake(d, intakeId, flipped)).recipeId).not.toBe('c1');

    const { runId } = await startRun(d, { intakeId, recipeId: 'c1', budgetUsd: 3 });
    const data = await getRunData(d.services, runId);
    expect(data.view.run.recipeId).toBe('c1');
    expect(data.budgetUsd).toBe(3);
  });

  it('starts a library recipe directly', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'Tighten my quarterly memo', recipeId: 'c4' });
    expect(d.intakes.get(intakeId)?.recipeId).toBe('c4');
    await expect(createIntake(d, { text: 'x', recipeId: 'c99' })).rejects.toMatchObject({ status: 404 });
  });

  it('composes a recipe, keeps it with the intake and starts it as composed', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'Tighten my quarterly memo' });
    const composed = await composeIntake(d, intakeId);
    expect(composed.label.scope).toBe('Composed');
    expect(composed).not.toHaveProperty('recipe');
    const { runId } = await startRun(d, { intakeId, budgetUsd: 2 });
    expect(d.intakes.runPresentation(runId)?.name).toMatch(/^Your recipe/);
  });

  it('refuses unknown intakes, a missing composed recipe, and budgets over what the workspace has left', async () => {
    const d = await deps();
    await expect(recommendIntake(d, '0b7f2f5e-3c1a-4d2e-9f00-5a3c2b1d4e6f')).rejects.toBeInstanceOf(HttpError);
    const { intakeId } = await createIntake(d, { text: 'A memo' });
    await expect(startRun(d, { intakeId, budgetUsd: 2 })).rejects.toMatchObject({ status: 400 });
    await expect(startRun(d, { intakeId, recipeId: 'c4', budgetUsd: 500 })).rejects.toThrow(/workspace budget/);
  });

  it('resolves a question only within its own run, and passes validation messages through', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A landing page', recipeId: 'c1' });
    const { runId } = await startRun(d, { intakeId, recipeId: 'c1', budgetUsd: 5 });
    const cp = await openQuestion(d, runId);
    expect(cp.kind).toBe('choose');
    await expect(resolveInRun(d, 'run-other', cp.id, { choice: ['seed'] })).rejects.toMatchObject({ status: 404 });
    await expect(resolveInRun(d, runId, cp.id, { choice: ['nope'] })).rejects.toMatchObject({ status: 400 });
    await resolveInRun(d, runId, cp.id, { choice: ['seed'] });
    const after = (await d.services.runner.view(runId)).checkpoints.find((c) => c.id === cp.id);
    expect(after?.status).toBe('resolved');
  });

  it('pauses, resumes and cancels runs', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A memo', recipeId: 'c4' });
    const { runId } = await startRun(d, { intakeId, recipeId: 'c4', budgetUsd: 2 });
    await controlRun(d, runId, 'pause');
    expect(d.services.controls?.isPaused(runId)).toBe(true);
    await controlRun(d, runId, 'resume');
    expect(d.services.controls?.isPaused(runId)).toBe(false);
    await controlRun(d, runId, 'cancel');
    await vi.waitFor(async () => expect((await d.services.runner.view(runId)).run.status).toBe('cancelled'));
    await expect(controlRun(d, 'run-missing', 'cancel')).rejects.toMatchObject({ status: 404 });
  });

  it('updates the profile, demo mode and workspace budget, and refuses unknown profiles', async () => {
    const d = await deps();
    const next = await updateSettings(d, { profileId: 'best', workspaceBudgetUsd: 50 });
    expect(next.profileId).toBe('best');
    expect((await d.services.store.getWorkspace(d.workspaceId))?.budgetUsd).toBe(50);
    await expect(updateSettings(d, { profileId: 'nope' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('the artifact route', () => {
  it('serves stored artifacts with their headers, as downloads on request, and refuses bad ids', async () => {
    const d = await deps();
    const page = await d.services.store.artifacts.putText('<!doctype html><title>x</title>', 'text/html');
    const res = await artifactResponse(d.services, encodeURIComponent(page.id), new URL(`http://127.0.0.1:3000/artifacts/${page.id}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain('sandbox allow-scripts');
    expect(await res.text()).toContain('<title>x</title>');

    const dl = await artifactResponse(d.services, page.id, new URL(`http://127.0.0.1:3000/artifacts/${page.id}?download=1&name=My%20page`));
    expect(dl.headers.get('content-disposition')).toBe('attachment; filename="my-page.html"');

    expect((await artifactResponse(d.services, 'sha256:..%2F..%2Fsecrets', new URL('http://127.0.0.1:3000/x'))).status).toBe(400);
    expect((await artifactResponse(d.services, `sha256:${'0'.repeat(64)}`, new URL('http://127.0.0.1:3000/x'))).status).toBe(404);
  });
});
