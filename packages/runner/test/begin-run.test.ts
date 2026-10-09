/**
 * A web page is rendered at its first RENDER, after the build and seed steps have been paid for. So a web-page run
 * whose page renderer cannot start is refused when it begins, before any step, with the renderer's plain message,
 * not retried (F18; ADR-0084). Runs of other media begin as before: they need the renderer only if a lineup forms cards.
 * The same through the real workflow is in e2e/controls.ts.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationFailure } from '@temporalio/common';
import type { Gateway, Medium } from '@byway/contracts';
import { createActivities } from '../src/activities/index.ts';
import { launchFailure } from '../src/pages.ts';
import { FAILURE } from '../src/types.ts';
import { fakePages, type FakePages } from './helpers/fake-pages.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

let dir: string;
let store: MemoStore;
let workspaceId: string;
let called: string[];
let pages: FakePages;

/** A gateway that records any call reaching it; beginning a run must make none. */
const recording = (): Gateway =>
  new Proxy({} as Gateway, {
    get: (_, prop) => {
      if (prop === 'then') return undefined;
      return async () => {
        called.push(String(prop));
        throw new Error(`no ${String(prop)} here`);
      };
    },
  });

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-begin-'));
  store = createTestStore({ dataDir: dir });
  workspaceId = (await store.ensureDefaultWorkspace()).id;
  called = [];
  pages = fakePages();
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

async function queued(medium: Medium): Promise<{ runId: string; recipeId: string; profileId: string; budgetUsd: number }> {
  const run = await store.createRun({ id: `run-${Math.random().toString(36).slice(2)}`, workspaceId, recipeId: 'r', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium, budgetUsd: 5 });
  return { runId: run.id, recipeId: 'r', profileId: 'demo', budgetUsd: 5 };
}

const unavailable = launchFailure(new Error("browserType.launch: Executable doesn't exist at /pw/chrome-headless-shell"));

describe('beginning a run', () => {
  it('refuses a web-page run whose page renderer cannot start, plainly, not retried, before anything is spent', async () => {
    pages.failReady(unavailable);
    const acts = createActivities({ gateway: recording(), store, prompts: fakePrompts(), pages });
    const input = await queued('web-page');
    const err = await acts.beginRun(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApplicationFailure);
    expect(err).toMatchObject({ type: FAILURE.step, nonRetryable: true, message: unavailable.message });
    expect(pages.readyCalls).toBe(1);
    expect(called).toEqual([]);
    // The run never began: the workflow's failRun ends it with the message.
    expect((await store.getRun(input.runId))?.status).toBe('queued');
    expect((await store.events(input.runId)).map((e) => e.type)).not.toContain('run-started');
  });

  it('begins a run of another medium on the same renderer without asking it', async () => {
    pages.failReady(unavailable);
    const acts = createActivities({ gateway: recording(), store, prompts: fakePrompts(), pages });
    const input = await queued('prose');
    await acts.beginRun(input);
    expect(pages.readyCalls).toBe(0);
    expect((await store.getRun(input.runId))?.status).toBe('running');
  });

  it('begins a web-page run whose renderer is ready', async () => {
    const acts = createActivities({ gateway: recording(), store, prompts: fakePrompts(), pages });
    const input = await queued('web-page');
    await acts.beginRun(input);
    expect(pages.readyCalls).toBe(1);
    expect((await store.getRun(input.runId))?.status).toBe('running');
    expect(called).toEqual([]);
  });
});
