/**
 * RENDER-1 / ENG-9: a web page is rendered as the surfaces the prompts name (a wide screen, a phone, the first
 * screen), stored and shown under those names, and attached to a model's prompt under a line naming each surface; a
 * step's `renders` knob picks which surfaces it is shown. No Temporal: the activities run directly on a temp store.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage, Gateway } from '@byway/contracts';
import type { RunnerDeps } from '../src/activities/deps.ts';
import { ArtifactReader, buildPrompt, userMessage, viewParts } from '../src/activities/prompting.ts';
import { renderView } from '../src/activities/render.ts';
import { SURFACE_CAPTIONS } from '../src/surfaces.ts';
import type { RunRef, StepCall, StepSpec, View } from '../src/types.ts';
import { storeBrief } from './helpers/briefs.ts';
import { fakePages, fakeTiles } from './helpers/fake-pages.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

let dir: string;
let store: MemoStore;
let deps: RunnerDeps;
let run: RunRef;
let calls = 0;

/** Renders never call the gateway. */
const noGateway = {} as Gateway;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-surfaces-'));
  store = createTestStore({ dataDir: dir });
  const workspaceId = (await store.ensureDefaultWorkspace()).id;
  const rec = await store.createRun({ id: `run-${Math.random().toString(36).slice(2)}`, workspaceId, recipeId: 'c1', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium: 'web-page', budgetUsd: 5 });
  await store.updateRun(rec.id, { status: 'running' });
  run = { runId: rec.id, workspaceId, recipeId: 'c1', profileId: 'demo', medium: 'web-page', problemId: await storeBrief(store.artifacts, { text: 'A bakery page' }) };
  deps = { gateway: noGateway, store, prompts: fakePrompts(), pages: fakePages() };
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const call = (stepId: string): StepCall => ({ key: `${run.runId}/${stepId}/-/${++calls}`, stepId, stage: 'D2' });
const renderStep: StepSpec = { id: 'render', role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] };
const critic = (renders?: string[]): StepSpec => ({
  id: 'critic',
  role: 'critic',
  block: 'CRITIC',
  actor: 'model',
  tier: 'big',
  isolated: true,
  frozenPrompt: true,
  prompt: 'runbook.critic-ok',
  consumes: ['view'],
  produces: ['critique', 'score'],
  knobs: { mode: 'OK', ...(renders ? { renders } : {}) },
});
const PAGE = '<!doctype html><html><body><h1>Sourdough</h1><!--rev--></body></html>';

const texts = (m: ChatMessage) => m.content.flatMap((p) => (p.type === 'text' ? [p.text] : []));
/** The message after its prompt text, as an outline: text parts as they are, each image as "[img]". */
const outline = (m: ChatMessage) => m.content.slice(1).map((p) => (p.type === 'text' ? p.text : '[img]'));

async function renderPage(html = PAGE, step: StepSpec = renderStep): Promise<View> {
  const id = (await store.artifacts.putText(html, 'text/html')).id;
  return (await renderView(deps, { run, call: call(step.id), step, artifactIds: [id], pool: false })).view;
}

describe('rendering a web page (RENDER-1)', () => {
  it('makes the wide screen, the phone and the first screen, and labels each screenshot with its surface', async () => {
    const item = (await renderPage()).items[0]!;
    const per = fakeTiles(PAGE);
    expect(item.surfaces?.map((s) => [s.surface, s.imageArtifactIds.length])).toEqual([
      ['desktop', per],
      ['mobile', per],
      ['fold', 1],
    ]);
    expect(item.imageArtifactIds).toEqual(item.surfaces!.flatMap((s) => s.imageArtifactIds));
    const labels = (await store.events(run.runId)).filter((e) => e.type === 'artifact').map((e) => e.data.label);
    expect(labels).toEqual(['Wide screen 1 of 2', 'Wide screen 2 of 2', 'Phone 1 of 2', 'Phone 2 of 2', 'First screen']);
  });

  it("renders only the surfaces a render step's own `renders` knob names", async () => {
    const view = await renderPage(PAGE, { ...renderStep, knobs: { renders: ['desktop'] } });
    expect(view.items[0]!.surfaces?.map((s) => s.surface)).toEqual(['desktop']);
  });
});

describe('showing the surfaces to a model', () => {
  it('attaches every surface under the line that names it, for a critic that asks for all three', async () => {
    const view = await renderPage();
    const reader = new ArtifactReader(deps);
    const built = await buildPrompt(reader, { medium: 'web-page', problemId: run.problemId, step: critic(['desktop', 'mobile', 'fold']), ports: { view } });
    expect(outline(await userMessage(reader, 'Prompt', built.images))).toEqual([SURFACE_CAPTIONS.desktop, '[img]', '[img]', SURFACE_CAPTIONS.mobile, '[img]', '[img]', SURFACE_CAPTIONS.fold, '[img]']);
  });

  it("honours the `renders` knob: Study 1's critic sees the wide screen only", async () => {
    const view = await renderPage();
    const reader = new ArtifactReader(deps);
    const built = await buildPrompt(reader, { medium: 'web-page', problemId: run.problemId, step: critic(['desktop']), ports: { view } });
    expect(outline(await userMessage(reader, 'Prompt', built.images))).toEqual([SURFACE_CAPTIONS.desktop, '[img]', '[img]']);
  });

  it('a step with no knob (defect check, tells sweep) sees every surface rendered', async () => {
    const view = await renderPage();
    const reader = new ArtifactReader(deps);
    const check: StepSpec = { id: 'critic-check', role: 'check', actor: 'model', tier: 'big', prompt: 'runbook.defect-check', consumes: ['view'], produces: ['critique'] };
    const built = await buildPrompt(reader, { medium: 'web-page', problemId: run.problemId, step: check, ports: { view } });
    expect(texts(await userMessage(reader, 'Prompt', built.images)).slice(1)).toEqual([SURFACE_CAPTIONS.desktop, SURFACE_CAPTIONS.mobile, SURFACE_CAPTIONS.fold]);
  });

  it('a pool shows each candidate under one label, its surfaces named beneath it', async () => {
    const a = (await store.artifacts.putText(PAGE, 'text/html')).id;
    const b = (await store.artifacts.putText('<html><body>B</body></html>', 'text/html')).id;
    const { view } = await renderView(deps, { run, call: call('render'), step: { ...renderStep, consumes: ['option_set<artifact>'] }, artifactIds: [a, b], pool: true });
    const reader = new ArtifactReader(deps);
    const parts = await viewParts(reader, view);
    const shown = outline(await userMessage(reader, 'Prompt', parts.images));
    expect(shown.filter((t) => t.startsWith('### '))).toEqual(['### A', '### B']);
    expect(shown.filter((t) => t === SURFACE_CAPTIONS.mobile)).toHaveLength(2);
  });
});
