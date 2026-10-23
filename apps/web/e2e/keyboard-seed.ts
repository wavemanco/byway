/**
 * Runs the keyboard spec (R5) drives, seeded into the suite's own store the way seed.ts seeds the artifact-view runs:
 * a question of each kind whose controls disable themselves (confirm, react, select), a react question with an earlier
 * step to open, a compare of two pages, and an ended run with steps to open and a page for the viewer. Each going run has
 * a parked workflow, so the engine's lost-run pass leaves it alone, as seed.ts explains. The spec never lets an answer
 * reach byway (it refuses the send in the browser), so no seeded question is ever answered; `unseedKeyboard` withdraws
 * the questions, ends the runs and terminates their parked workflows.
 */
import { cancelSeeded, finish, newRun, outlastLostRunPass, question, seeding, stepWithArtifact, type SeededRun, type Seeding } from './seed.ts';

export interface KeyboardSeed {
  confirm: SeededRun;
  react: SeededRun;
  select: SeededRun;
  /** A react question, after a finished step ("Earlier notes") the person can open and close. */
  reactAfterStep: SeededRun;
  /** A compare of two generated pages (the C1 decision view). */
  pages: SeededRun;
  /** The artifact ids of the compared pages: KB.versionA's, then KB.versionB's. */
  versions: [string, string];
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
  return seeding(async (s) => {
    const put = async (text: string, type: string) => (await s.store.artifacts.putText(text, type)).id;
    const memo = await put('# Opening memo\n\nThe quarter went as planned. This is the memo the steps started from.', 'text/markdown');
    const notes = await put('# Earlier notes\n\nWhat the earlier step wrote, to be looked at while a question is open.', 'text/markdown');
    const plainPage = await put(page('Plain page', 'A page with nothing to run.'), 'text/html');
    const before = await put(page('Spring classes', 'Wheel throwing — on Tuesdays.'), 'text/html');
    const after = await put(page('Spring classes', 'Wheel throwing on Tuesdays.'), 'text/html');

    const done = await ended(s, memo, plainPage);
    const confirm = await question(s, 'Keyboard: confirm (R5)', 'c1', 'web-page', 'confirm', {});
    const react = await question(s, 'Keyboard: react (R5)', 'c1', 'web-page', 'react', {});
    const select = await question(s, 'Keyboard: select (R5)', 'c2', 'prose', 'select', { options: KB.hits.map((label, i) => ({ id: `hit-${i + 1}`, label })) });
    const reactAfterStep = await question(s, 'Keyboard: react after a step (R5, F06)', 'c4', 'prose', 'react', {}, [
      { stepId: 'e2e-notes', label: KB.earlierStep, artifactId: notes, mediaType: 'text/markdown' },
    ]);
    const pages = await question(s, 'Keyboard: compare two pages (R5, F13)', 'c1', 'web-page', 'compare', {
      options: [
        { id: 'A', label: KB.versionA, artifactId: before },
        { id: 'B', label: KB.versionB, artifactId: after },
      ],
    });
    await outlastLostRunPass(s, [confirm, react, select, reactAfterStep, pages].map((r) => r.runId));
    return { confirm, react, select, reactAfterStep, pages, versions: [before, after], done, plainPage };
  });
}

async function ended(s: Seeding, memo: string, plainPage: string): Promise<SeededRun> {
  const runId = await newRun(s, 'Keyboard: finished (R5)', 'c4', 'prose');
  await stepWithArtifact(s.store, runId, 'e2e-memo', KB.memoStep, memo, 'text/markdown');
  await stepWithArtifact(s.store, runId, 'e2e-page', KB.pageStep, plainPage, 'text/html');
  await finish(s, runId, memo);
  return { runId };
}

/** Ends the seeded runs that are still going, withdrawing their questions, so no later spec sees them waiting. */
export async function unseedKeyboard(seeded: KeyboardSeed | undefined): Promise<void> {
  if (!seeded) return;
  await seeding((s) => cancelSeeded(s, [seeded.confirm, seeded.react, seeded.select, seeded.reactAfterStep, seeded.pages].map((r) => r.runId)));
}
