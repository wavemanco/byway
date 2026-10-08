/**
 * What a person does in byway, as steps the specs share: describe the problem on Start, start the recommended recipe,
 * answer every "Your turn" through its panel, and reach the Result. Plus a watch on every request and response for
 * the stand-in provider keys (e2e/keys.ts).
 */
import { expect, type Locator, type Page } from '@playwright/test';
import type { CheckpointKind } from '@byway/contracts';
import { E2E_KEYS, SENTINEL } from './keys.ts';

const TEXTUAL = /^(text\/|application\/(json|javascript|x-component)|image\/svg\+xml)/;

/** Records every place a stand-in key appeared: request URLs, headers and bodies; response headers and bodies. */
export function watchForKeys(page: Page): { leaks: string[]; checked(): number } {
  const leaks: string[] = [];
  let responses = 0;
  const scan = (where: string, text: string | null | undefined) => {
    if (!text || !text.includes(SENTINEL)) return;
    for (const [name, value] of Object.entries(E2E_KEYS)) if (text.includes(value)) leaks.push(`${name} in ${where}`);
  };
  page.on('request', (req) => {
    scan(`request URL ${req.url()}`, req.url());
    scan(`request headers ${req.url()}`, JSON.stringify(req.headers()));
    scan(`request body ${req.url()}`, req.postData());
  });
  page.on('response', async (res) => {
    scan(`response headers ${res.url()}`, JSON.stringify(res.headers()));
    const type = res.headers()['content-type'] ?? '';
    if (!TEXTUAL.test(type)) return;
    try {
      scan(`response body ${res.url()}`, await res.text());
      responses++;
    } catch {
      // Redirects and aborted navigations have no body.
    }
  });
  return { leaks, checked: () => responses };
}

/** Start: type the problem and ask for a recommendation. */
export async function describeProblem(page: Page, problem: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('What are you working on?').fill(problem);
  await page.getByRole('button', { name: /Get a recommendation/ }).click();
  await expect(page).toHaveURL(/\/recommend\//, { timeout: 60_000 });
}

/** Recommendation: check what byway recommends, then start it with the suggested budget. Returns the run id. */
export async function startRecommended(page: Page, recipeName: string): Promise<string> {
  await expect(page.locator('#proposal-title')).toHaveText(recipeName, { timeout: 60_000 });
  await expect(page.locator('.facts')).toContainText('Untested');
  await page.getByRole('button', { name: /^Start/ }).click();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]+$/, { timeout: 60_000 });
  return new URL(page.url()).pathname.split('/').pop() as string;
}

export interface Answered {
  kind: CheckpointKind;
  prompt: string;
}

type Outcome = { turn: Locator } | { done: true } | { failed: string };

async function next(page: Page, after: string | undefined, timeoutMs: number): Promise<Outcome> {
  const deadline = Date.now() + timeoutMs;
  const turn = page.locator('section.turn');
  while (Date.now() < deadline) {
    if (await page.locator('.state-done').isVisible()) return { done: true };
    const failed = page.getByRole('heading', { name: 'This run stopped with a problem' });
    if (await failed.isVisible()) return { failed: (await page.locator('.notice-danger').first().textContent()) ?? 'no reason' };
    if ((await turn.count()) > 0 && (await turn.getAttribute('data-checkpoint')) !== after) return { turn };
    await page.waitForTimeout(250);
  }
  throw new Error(`Nothing happened in ${timeoutMs / 1000} s after ${after ? `answering ${after}` : 'starting'}.`);
}

/** Text answers that read like a person's. */
const WORDS = {
  react: 'Warmer and plainer, please: lead with what people get, and keep it short.',
  directive: 'Remove the second paragraph.',
  write: 'This is my own draft, in my own words. It says plainly what I mean and stops.',
};

/** Answers one "Your turn" through its panel, the way a person would. */
async function answer(page: Page, turn: Locator, kind: CheckpointKind): Promise<void> {
  const primary = turn.locator('.turn-foot button.button-primary');
  switch (kind) {
    case 'pick': {
      const inputs = turn.locator('input.sheet-input');
      const type = await inputs.first().getAttribute('type');
      const status = (await turn.locator('.turn-status').textContent()) ?? '';
      const k = type === 'radio' ? 1 : Number(/of (\d+) chosen/.exec(status)?.[1] ?? 1);
      for (let i = 0; i < k; i++) await inputs.nth(i).check();
      await primary.click();
      return;
    }
    case 'select':
      // Any subset is an answer; a person who wants every swap ticks them all.
      for (const box of await turn.locator('input[type="checkbox"]').all()) await box.check();
      await primary.click();
      return;
    case 'choose':
      await turn.locator('input[type="radio"]').first().check();
      await primary.click();
      return;
    case 'compare':
      await turn.getByRole('button', { name: /^Keep this/ }).first().click();
      return;
    case 'confirm':
      await turn.getByRole('button', { name: 'Yes', exact: true }).click();
      return;
    case 'react':
      await turn.locator('textarea').fill(WORDS.react);
      await primary.click();
      return;
    case 'write': {
      const field = turn.locator('textarea');
      // On-screen copy (C4) comes as labelled fields, already filled; anything else is one text field.
      if ((await field.count()) > 0 && !(await field.inputValue()).trim()) await field.fill(WORDS.write);
      await primary.click();
      return;
    }
    case 'directive':
      await turn.getByRole('textbox', { name: 'Item 1', exact: true }).fill(WORDS.directive);
      await primary.click();
      return;
  }
}

/**
 * Run: answer every "Your turn" as it comes until the run is done. Fails with the run's own message if it stops with a
 * problem. Returns what was asked, in order.
 */
export async function answerUntilDone(
  page: Page,
  opts: { stepTimeoutMs?: number; maxTurns?: number; /** A checkpoint the test answered itself, so its fading panel is not answered again. */ after?: string } = {},
): Promise<Answered[]> {
  const answered: Answered[] = [];
  let last: string | undefined = opts.after;
  for (let i = 0; i < (opts.maxTurns ?? 60); i++) {
    const outcome = await next(page, last, opts.stepTimeoutMs ?? 120_000);
    if ('done' in outcome) return answered;
    if ('failed' in outcome) throw new Error(`The run failed: ${outcome.failed}\nAnswered so far: ${JSON.stringify(answered)}`);
    const { turn } = outcome;
    const kind = (await turn.getAttribute('data-kind')) as CheckpointKind;
    const prompt = ((await turn.locator('h2').first().textContent()) ?? '').trim();
    last = (await turn.getAttribute('data-checkpoint')) ?? undefined;
    await answer(page, turn, kind);
    answered.push({ kind, prompt });
  }
  throw new Error(`The run asked more than ${opts.maxTurns ?? 60} questions: ${JSON.stringify(answered)}`);
}

/** The step labels the timeline shows, in order. */
export async function timelineLabels(page: Page): Promise<string[]> {
  return (await page.locator('.tl-step .tl-title').allTextContents()).map((t) => t.trim());
}

/** Result: the deliverable as its medium is shown, and how it was made. */
export async function openResult(page: Page): Promise<Locator> {
  await page.getByRole('link', { name: 'See the result' }).click();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]+\/result$/);
  await expect(page.getByRole('heading', { name: 'How this was made' })).toBeVisible();
  return page.getByRole('region', { name: 'Result' });
}

/** Result: the export the Download button gives, as text. It must work away from byway (EXP-1): no byway addresses. */
export async function exportText(page: Page): Promise<string> {
  const href = await page.locator('.result-actions a[download]').getAttribute('href');
  if (!href) throw new Error('no Download link');
  const res = await page.request.get(href);
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-disposition'] ?? '').toMatch(/^attachment/);
  return res.text();
}
