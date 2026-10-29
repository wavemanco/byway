/**
 * An answer of yours that a finished run left unused is said plainly on the Run screen and in the Result's steps (F01 (a);
 * ADR-0098 decision 7, the owner's choice of 2026-10-29: "Tell the person at run time"). Two finished C4 runs are seeded
 * into the suite's store: in one, no step that ran after your list took it in (as a run whose fix never ran would end);
 * in the other, the AI's fix applied it. Which steps ran is read from each run's events, so only the first says anything.
 * That the engine's own runs say the same is the runner's unused-answers test; the configurations spec checks that their
 * usual runs say nothing.
 */
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { finish, newRun, seeding, type Seeding } from './seed.ts';

const QUESTION = 'What should go? List what to remove, one item per line.';
const NOTE = `Your answer to “${QUESTION}” went unused: no step that ran after it took it into the work, so the result does not reflect it.`;

const runs: { unused?: string; used?: string } = {};

/** A finished C4 run in which you gave a list at its CUT; `fixed`: the AI's fix ran after it. */
async function seededRun(s: Seeding, title: string, fixed: boolean): Promise<string> {
  const memo = (await s.store.artifacts.putText(`# ${title}\n\nThe memo, as the run delivered it.\n`, 'text/markdown')).id;
  const runId = await newRun(s, title, 'c4', 'prose');
  const event = (type: Parameters<Seeding['store']['appendEvent']>[0]['type'], stepId: string, data: Record<string, unknown>) => s.store.appendEvent({ runId, type, stepId, data });
  await event('step-started', 'draft', { label: 'Draft', stage: 'D2', role: 'build', actor: 'model' });
  await event('artifact', 'draft', { artifactId: memo, mediaType: 'text/markdown', label: 'Draft' });
  await event('step-finished', 'draft', { costUsd: 0 });
  const checkpointId = randomUUID();
  await event('step-started', 'cut', { label: 'Cut', stage: 'D3', role: 'cut', actor: 'human' });
  await s.store.openCheckpoint({ id: checkpointId, runId, stepId: 'cut', kind: 'directive', prompt: QUESTION });
  await event('checkpoint-opened', 'cut', { checkpointId, kind: 'directive' });
  await s.store.resolveCheckpoint({ checkpointId, text: '- The second paragraph.' });
  await event('checkpoint-resolved', 'cut', { checkpointId });
  await event('step-finished', 'cut', { costUsd: 0 });
  if (fixed) {
    await event('step-started', 'apply-cut', { label: 'Apply cut', stage: 'D3', role: 'fix', actor: 'model' });
    await event('artifact', 'apply-cut', { artifactId: memo, mediaType: 'text/markdown', label: 'Apply cut' });
    await event('step-finished', 'apply-cut', { costUsd: 0 });
  }
  await finish(s, runId, memo);
  return runId;
}

test.beforeAll(async () => {
  await seeding(async (s) => {
    runs.unused = await seededRun(s, 'Seeded: a list no step took in (F01 (a))', false);
    runs.used = await seededRun(s, 'Seeded: a list the fix applied (F01 (a))', true);
  });
});

test('the Run screen and the Result say that an answer of yours went unused, naming the question', async ({ page }) => {
  await page.goto(`/runs/${runs.unused}`);
  await expect(page.getByRole('heading', { name: 'Your text is ready.' })).toBeVisible();
  const notice = page.locator('.state-done .notice[data-unused-answer]');
  await expect(notice).toHaveCount(1);
  await expect(notice).toHaveText(NOTE);
  // Said with the step that asked it, too.
  await expect(page.locator('.tl-note', { hasText: NOTE })).toHaveCount(1);
  await page.getByRole('link', { name: 'See the result' }).click();
  await expect(page.getByRole('heading', { name: 'How this was made' })).toBeVisible();
  await expect(page.locator('.made-note', { hasText: NOTE })).toHaveCount(1);
});

test('a run whose fix applied your answer says nothing of the kind', async ({ page }) => {
  await page.goto(`/runs/${runs.used}`);
  await expect(page.getByRole('heading', { name: 'Your text is ready.' })).toBeVisible();
  await expect(page.locator('[data-unused-answer]')).toHaveCount(0);
  await expect(page.getByText('went unused')).toHaveCount(0);
  await page.getByRole('link', { name: 'See the result' }).click();
  await expect(page.getByRole('heading', { name: 'How this was made' })).toBeVisible();
  await expect(page.getByText('went unused')).toHaveCount(0);
});
