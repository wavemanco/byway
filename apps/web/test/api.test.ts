import { afterEach, describe, expect, it, vi } from 'vitest';
import { GatewayError, type CheckpointRecord, type GatewayErrorCode } from '@byway/contracts';
import { AdvisorError } from '@byway/advisor';
import { heldKeyError } from '@byway/gateway';
import type { Services } from '../src/services/index.ts';
import {
  HttpError,
  addRef,
  artifactResponse,
  composeIntake,
  controlRun,
  createIntake,
  currentRecommendation,
  recipeForRun,
  recommendIntake,
  recommendationOrProblem,
  resolveInRun,
  startRun,
  updateSettings,
  type Deps,
} from '../src/server/api.ts';
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
  const services: Services = current.host.services(true);
  const ws = await services.store.ensureDefaultWorkspace();
  return { services, workspaceId: ws.id, profileId: 'demo', heldKeyIn: current.host.heldKeyIn };
}

/**
 * Every test here runs the real store, gateway and advisor on a fresh data directory, so it creates a database and
 * writes artifact files that are flushed to disk. Alone, a test takes about 0.1 s; with the machine busy (several suites,
 * their Chromium and Temporal servers) the compose test has run past vitest's 5 s default. The limit is realistic for
 * that, and still bounded.
 */
const PRODUCT_PATH = { timeout: 30_000 };

async function openQuestion(d: Deps, runId: string): Promise<CheckpointRecord> {
  const open = (await d.services.runner.view(runId)).checkpoints.find((c) => c.status === 'open');
  if (!open) throw new Error('no open question');
  return open;
}

describe('route handler logic', PRODUCT_PATH, () => {
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
});

describe('examples you admire (ADR-0071)', PRODUCT_PATH, () => {
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

describe('the artifact route', PRODUCT_PATH, () => {
  it('serves stored artifacts with their headers, as downloads on request, and refuses bad ids', async () => {
    const d = await deps();
    const page = await d.services.store.artifacts.putText('<!doctype html><title>x</title>', 'text/html');
    const res = await artifactResponse(d.services, encodeURIComponent(page.id), new URL(`http://127.0.0.1:3000/artifacts/${page.id}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain('sandbox allow-scripts');
    expect(await res.text()).toContain('<title>x</title>');

    // The CSP names the origin the browser used, even when the request URL was normalised to localhost.
    const viaLoopback = await artifactResponse(d.services, page.id, new URL(`http://localhost:3000/artifacts/${page.id}`), 'http://127.0.0.1:3000');
    expect(viaLoopback.headers.get('content-security-policy')).toContain('img-src http://127.0.0.1:3000/artifacts/');

    const dl = await artifactResponse(d.services, page.id, new URL(`http://127.0.0.1:3000/artifacts/${page.id}?download=1&name=My%20page`));
    expect(dl.headers.get('content-disposition')).toBe('attachment; filename="my-page.html"');

    expect((await artifactResponse(d.services, 'sha256:..%2F..%2Fsecrets', new URL('http://127.0.0.1:3000/x'))).status).toBe(400);
    expect((await artifactResponse(d.services, `sha256:${'0'.repeat(64)}`, new URL('http://127.0.0.1:3000/x'))).status).toBe(404);
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

describe('model errors while recommending or composing (UX-2)', PRODUCT_PATH, () => {
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
    // Anything else is not dressed up as a model problem.
    recommend.mockRejectedValueOnce(new TypeError('a bug'));
    await expect(recommendIntake(d, intakeId)).rejects.toBeInstanceOf(TypeError);
  });

  it('gives the Recommendation screen a problem to show instead of failing to load', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A memo' });
    vi.spyOn(d.services.advisor, 'recommend').mockRejectedValueOnce(gatewayError('rate-limited'));
    const first = await recommendationOrProblem(d, intakeId);
    expect(first).toEqual({ problem: expect.stringMatching(/busy/) });
    const second = await recommendationOrProblem(d, intakeId);
    expect('recommendation' in second && second.recommendation.recipeId).toBeTruthy();
  });
});

describe('exports carry their images (EXP-1)', PRODUCT_PATH, () => {
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
