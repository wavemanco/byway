/**
 * Runs the keyboard spec (R5) drives, seeded into the suite's own store the way seed.ts seeds the artifact-view runs:
 * a question of each kind whose controls disable themselves (confirm, react, select), a react question with an earlier
 * step to open, a compare of two pages, and an ended run with steps to open and a page for the viewer. The spec never
 * lets an answer reach byway (it refuses the send in the browser), so no seeded question is ever answered; `unseed`
 * withdraws the questions and ends the runs.
 */
import type { SqliteStore } from '@byway/store';
import { newRun, openStore, question, stepWithArtifact, type SeededRun } from './seed.ts';

export interface KeyboardSeed {
  confirm: SeededRun;
  react: SeededRun;
  select: SeededRun;
  /** A react question, after a finished step ("Earlier notes") the person can open and close. */
  reactAfterStep: SeededRun;
  /** A compare of two generated pages (the C1 decision view). */
  pages: SeededRun;
  /** Ended, with two steps ("Opening memo", "Plain page") to open from the timeline. */
  done: SeededRun;
  /** A plain page with no scripts that leave, for the viewer's scripts switch. */
  plainPage: string;
}

/** Labels the spec finds things by. */
export const KB = {
  memoStep: 'Opening memo',
  pageStep: 'Plain page',
  earlierStep: 'Earlier notes',
  versionA: 'Before the swaps',
  versionB: 'After the swaps',
  hits: ['Em dash pivot — hero heading → a full stop', 'Triplet — features list → two items', 'Rhetorical question — intro → a statement'],
} as const;

const page = (title: string, body: string) => `<!doctype html><title>${title}</title><main><h1>${title}</h1><p>${body}</p></main>`;

export async function seedKeyboard(): Promise<KeyboardSeed> {
  const store = openStore();
  try {
    const put = async (text: string, type: string) => (await store.artifacts.putText(text, type)).id;
    const memo = await put('# Opening memo\n\nThe quarter went as planned. This is the memo the steps started from.', 'text/markdown');
    const notes = await put('# Earlier notes\n\nWhat the earlier step wrote, to be looked at while a question is open.', 'text/markdown');
    const plainPage = await put(page('Plain page', 'A page with nothing to run.'), 'text/html');
    const before = await put(page('Spring classes', 'Wheel throwing — on Tuesdays.'), 'text/html');
    const after = await put(page('Spring classes', 'Wheel throwing on Tuesdays.'), 'text/html');

    const done = await ended(store, memo, plainPage);
    const confirm = await question(store, 'Keyboard: confirm (R5)', 'c1', 'web-page', 'confirm', {});
    const react = await question(store, 'Keyboard: react (R5)', 'c1', 'web-page', 'react', {});
    const select = await question(store, 'Keyboard: select (R5)', 'c2', 'prose', 'select', { options: KB.hits.map((label, i) => ({ id: `hit-${i + 1}`, label })) });
    const reactAfterStep = await question(store, 'Keyboard: react after a step (R5, F06)', 'c4', 'prose', 'react', {}, [
      { stepId: 'e2e-notes', label: KB.earlierStep, artifactId: notes, mediaType: 'text/markdown' },
    ]);
    const pages = await question(store, 'Keyboard: compare two pages (R5, F13)', 'c1', 'web-page', 'compare', {
      options: [
        { id: 'A', label: KB.versionA, artifactId: before },
        { id: 'B', label: KB.versionB, artifactId: after },
      ],
    });
    return { confirm, react, select, reactAfterStep, pages, done, plainPage };
  } finally {
    store.close();
  }
}

async function ended(store: SqliteStore, memo: string, plainPage: string): Promise<SeededRun> {
  const runId = await newRun(store, 'Keyboard: finished (R5)', 'c4', 'prose');
  await stepWithArtifact(store, runId, 'e2e-memo', KB.memoStep, memo, 'text/markdown');
  await stepWithArtifact(store, runId, 'e2e-page', KB.pageStep, plainPage, 'text/html');
  await store.appendEvent({ runId, type: 'run-finished', data: {} });
  await store.updateRun(runId, { status: 'done', outputArtifactId: memo });
  return { runId };
}

/** Ends the seeded runs that are still going, withdrawing their questions, so no later spec sees them waiting. */
export async function unseedKeyboard(seeded: KeyboardSeed | undefined): Promise<void> {
  if (!seeded) return;
  const store = openStore();
  try {
    for (const { runId } of [seeded.confirm, seeded.react, seeded.select, seeded.reactAfterStep, seeded.pages]) {
      await store.withdrawCheckpoints(runId);
      await store.updateRun(runId, { status: 'cancelled' });
    }
  } finally {
    store.close();
  }
}
