/**
 * A composed recipe is admitted again at Start (F01, ADR-0092), end to end in demo mode: the `ok` stored when "Build my
 * own" made it is not taken on trust. Here the stored intake is changed behind the screen's back, through the suite's
 * own store (seed.ts), as an older byway's admission would have left it:
 * - a recipe that no longer hashes to the one offered is refused (400 composed-refused), the screen says so in its own
 *   words (not as a failed protocol check), and Start stays blocked;
 * - a recipe that no longer passes today's checks is refused (400) under the protocol checks;
 * - a recipe whose explanation changed does not start (409 composed-changed): the screen shows the new explanation, and
 *   a second Start, after the person has seen it, runs it.
 */
import { expect, test, type Page } from '@playwright/test';
import type { ComposeResult } from '@byway/contracts';
import { steps, withHash, type Recipe, type Seq } from '@byway/recipe';
import { describeProblem } from './flow.ts';
import { openStore } from './seed.ts';

const MEMO = 'Tighten my quarterly status memo for the leadership team before Friday';

/** Describe the memo, build your own (the demo composer: Memo Polish with its critique one round shorter); its intake id. */
async function buildMyOwn(page: Page): Promise<string> {
  await describeProblem(page, MEMO);
  await page.getByRole('button', { name: 'Build my own' }).click();
  await expect(page.locator('.proposal-kicker')).toContainText('Your recipe');
  await expect(page.locator('.composed')).toContainText('repeats up to 1 round instead of 2');
  return new URL(page.url()).pathname.split('/').filter(Boolean).at(-1)!;
}

/** Change the stored composed result, as an older admission could have stored it. */
async function storedAs(intakeId: string, change: (c: ComposeResult) => ComposeResult): Promise<void> {
  const store = openStore();
  try {
    const intake = await store.getIntake(intakeId);
    if (!intake?.composed) throw new Error(`intake ${intakeId} has no composed recipe`);
    await store.updateIntake(intakeId, { composed: change(intake.composed) });
  } finally {
    store.close();
  }
}

const startButton = (page: Page) => page.locator('.start-bar button[type="submit"]');

async function startAndRead(page: Page): Promise<number> {
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/runs' && r.request().method() === 'POST');
  await startButton(page).click();
  return (await response).status();
}

test('a composed recipe that no longer reads as the one offered is refused at Start (400), worded as what it is', async ({ page }) => {
  const intakeId = await buildMyOwn(page);
  await storedAs(intakeId, (c) => ({ ...c, recipe: { ...c.recipe, hash: `sha256:${'0'.repeat(64)}` } }));
  expect(await startAndRead(page)).toBe(400);
  const refusal = page.locator('.composed .notice-danger');
  await expect(refusal).toContainText('It is no longer the recipe byway offered you, so it cannot run:');
  await expect(refusal).not.toContainText('did not pass the protocol checks');
  await expect(page.locator('.start-bar-error')).toContainText('Build your own again');
  await expect(startButton(page)).toHaveAttribute('aria-disabled', 'true');
  expect(new URL(page.url()).pathname).toMatch(/^\/recommend\//);
});

test('a composed recipe that no longer passes the checks is refused at Start (400), under the protocol checks', async ({ page }) => {
  const intakeId = await buildMyOwn(page);
  // What admission accepted before ADR-0092: an AI pass after your words that says it does not write.
  await storedAs(intakeId, (c) => {
    const recipe = structuredClone(c.recipe) as Recipe;
    const d3 = recipe.stages.find((s) => s.stage === 'D3')!.body as Seq;
    const revise = steps(recipe).find(({ step }) => step.role === 'fix' && step.actor === 'model')!.step;
    d3.steps.push({ ...revise, id: 'ai-polish', writes: false, produces: [] });
    delete recipe.hash;
    return { ...c, recipe: withHash(recipe) };
  });
  expect(await startAndRead(page)).toBe(400);
  const refusal = page.locator('.composed .notice-danger');
  await expect(refusal).toContainText('It did not pass the protocol checks, so it cannot run:');
  await expect(startButton(page)).toHaveAttribute('aria-disabled', 'true');
});

test('a composed recipe whose explanation changed does not start (409); the new one shows, and a second Start runs it', async ({ page }) => {
  const intakeId = await buildMyOwn(page);
  await storedAs(intakeId, (c) => ({ ...c, diff: ['The same steps as Memo Polish.'] }));
  // The screen shows what is stored: the stale explanation.
  await page.reload();
  await page.getByRole('button', { name: 'Show your recipe' }).click();
  await expect(page.locator('.composed')).toContainText('The same steps as Memo Polish.');
  expect(await startAndRead(page)).toBe(409);
  await expect(page.locator('.start-bar-error')).toContainText('now explains it differently');
  await expect(page.locator('.composed')).toContainText('repeats up to 1 round instead of 2');
  await expect(page.locator('.composed')).not.toContainText('The same steps as Memo Polish.');
  expect(new URL(page.url()).pathname).toMatch(/^\/recommend\//);
  // Seen; Start again runs it.
  expect(await startAndRead(page)).toBe(201);
  await expect(page).toHaveURL(/\/runs\//, { timeout: 60_000 });
  // Cancel it, so it does not keep the demo engine busy for the tests after this one.
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel run' }).click();
  await expect(page.locator('.run-status')).toHaveText('Cancelled');
});
