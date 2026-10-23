/**
 * A note on each step whose pages were drawn with the page renderer's OS sandbox off (ADR-0105): written once per step
 * call, as its first such page is drawn, as a 'renderer-sandbox-off' event the Run and Result screens show with the
 * step's notes; none while the sandbox is on, and none for byway's own test page (the readiness check). No Temporal: the
 * activities run as the worker builds them (createActivities) on a temp store, with the fake renderer telling the
 * setting each page is drawn under, as the real one does.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Gateway } from '@byway/contracts';
import { createActivities } from '../src/activities/index.ts';
import { SANDBOX_OFF_NOTE } from '../src/activities/sandbox-note.ts';
import type { RunRef, StepCall, StepSpec } from '../src/types.ts';
import { storeBrief } from './helpers/briefs.ts';
import { fakePages, type FakePages } from './helpers/fake-pages.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

let dir: string;
let store: MemoStore;
let pages: FakePages;
let run: RunRef;
let calls = 0;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-sandbox-note-'));
  store = createTestStore({ dataDir: dir });
  const workspaceId = (await store.ensureDefaultWorkspace()).id;
  const rec = await store.createRun({ id: `run-${Math.random().toString(36).slice(2)}`, workspaceId, recipeId: 'c1', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium: 'web-page', budgetUsd: 5 });
  await store.updateRun(rec.id, { status: 'running' });
  run = { runId: rec.id, workspaceId, recipeId: 'c1', profileId: 'demo', medium: 'web-page', problemId: await storeBrief(store.artifacts, { text: 'A bakery page' }) };
  pages = fakePages();
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const call = (stepId: string): StepCall => ({ key: `${run.runId}/${stepId}/-/${++calls}`, stepId, stage: 'D2' });
const renderStep: StepSpec = { id: 'render', role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] };
const PAGE = '<!doctype html><html><body><h1>Sourdough</h1></body></html>';

async function render(pool = 1, c: StepCall = call('render')) {
  const activities = createActivities({ gateway: {} as Gateway, store, prompts: fakePrompts(), pages });
  const ids = await Promise.all(Array.from({ length: pool }, async (_, i) => (await store.artifacts.putText(`${PAGE}<!-- ${i} -->`, 'text/html')).id));
  await activities.renderView({ run, call: c, step: renderStep, artifactIds: ids, pool: pool > 1 });
  return c;
}

const notes = async () => (await store.events(run.runId)).filter((e) => e.type === 'renderer-sandbox-off');

describe("a step's pages drawn with the OS sandbox off (ADR-0105)", () => {
  it('say so once for the step call, with its step, however many pages it drew, before the step finished', async () => {
    pages.osSandbox = false;
    const c = await render(3);
    const events = await store.events(run.runId);
    const said = events.filter((e) => e.type === 'renderer-sandbox-off');
    expect(said).toEqual([expect.objectContaining({ stepId: 'render', data: { note: SANDBOX_OFF_NOTE } })]);
    const finished = events.findIndex((e) => e.type === 'step-finished');
    expect(events.indexOf(said[0]!)).toBeLessThan(finished);
    // The same step call again (Temporal ran it once more): no second note.
    await render(1, c);
    expect(await notes()).toHaveLength(1);
    // Another step call says so again.
    await render(1);
    expect(await notes()).toHaveLength(2);
  });

  it('say nothing while the sandbox is on, and the readiness check (byway’s test page) never counts', async () => {
    await render(2);
    const activities = createActivities({ gateway: {} as Gateway, store, prompts: fakePrompts(), pages });
    pages.osSandbox = false;
    await activities.beginRun({ runId: run.runId, recipeId: 'c1', profileId: 'demo', budgetUsd: 5 });
    expect(pages.readyCalls).toBe(1);
    expect(await notes()).toEqual([]);
  });

  it('the note says what happened in plain words', () => {
    expect(SANDBOX_OFF_NOTE).toBe("Pages in this step were drawn with the page renderer's OS sandbox off (it was switched off in Settings).");
  });
});
