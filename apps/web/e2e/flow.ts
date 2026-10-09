/**
 * What a person does in byway, as steps the specs share: describe the problem on Start, start the recommended recipe,
 * answer every "Your turn" through its panel, and reach the Result. Plus a watch on every request and response for
 * the stand-in provider keys (e2e/keys.ts).
 */
import { expect, type Locator, type Page } from '@playwright/test';
import type { CheckpointKind } from '@byway/contracts';
import { E2E_KEYS, SENTINEL } from './keys.ts';

const TEXTUAL = /^(text\/|application\/(json|javascript|x-component)|image\/svg\+xml)/;

export interface KeyWatchOptions {
  /**
   * The path of the one POST whose body is the person pasting a stand-in key on purpose (the refusal test, ADR-0088), or
   * a test of the path, for a path that holds an id the test learns later (a run's checkpoint). Only that first
   * request's body is exempt; its URL and headers, every response and every other request are checked.
   */
  pastedTo?: string | ((pathname: string) => boolean);
}

/** Records every place a stand-in key appeared: request URLs, headers and bodies; response headers and bodies. */
export function watchForKeys(page: Page, opts: KeyWatchOptions = {}): { leaks: string[]; checked(): number; pastes(): number } {
  const leaks: string[] = [];
  let responses = 0;
  let pastes = 0;
  const scan = (where: string, text: string | null | undefined) => {
    if (!text || !text.includes(SENTINEL)) return;
    for (const [name, value] of Object.entries(E2E_KEYS)) if (text.includes(value)) leaks.push(`${name} in ${where}`);
  };
  const target = opts.pastedTo;
  const isTarget = (pathname: string) => (typeof target === 'string' ? pathname === target : target !== undefined && target(pathname));
  const pasted = (url: string, method: string) => method === 'POST' && isTarget(new URL(url).pathname) && pastes++ === 0;
  page.on('request', (req) => {
    scan(`request URL ${req.url()}`, req.url());
    scan(`request headers ${req.url()}`, JSON.stringify(req.headers()));
    if (!pasted(req.url(), req.method())) scan(`request body ${req.url()}`, req.postData());
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
  return { leaks, checked: () => responses, pastes: () => pastes };
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

/** A turn: its panel, pinned to its checkpoint id (a later panel is another locator), with the id and kind it showed. */
export type Outcome = { turn: Locator; id: string; kind: CheckpointKind } | { done: true } | { failed: string };

/** How long reading a panel may wait: a panel that is not there now has gone (the run moved on, or finished). */
const READ = { timeout: 1000 };

/**
 * Waits for a "Your turn" other than `after`, the run being done, or the run failing. A panel can go at any moment,
 * the last one as the run finishes, so everything about it is read without waiting; one that went is looked for again,
 * which also finds the run done.
 */
export async function nextTurn(page: Page, after: string | undefined, timeoutMs: number): Promise<Outcome> {
  const deadline = Date.now() + timeoutMs;
  const turn = page.locator('section.turn');
  while (Date.now() < deadline) {
    if (await page.locator('.state-done').isVisible()) return { done: true };
    const failed = page.getByRole('heading', { name: 'This run stopped with a problem' });
    if (await failed.isVisible()) return { failed: (await page.locator('.notice-danger').first().textContent()) ?? 'no reason' };
    const id = (await turn.count()) > 0 ? await turn.first().getAttribute('data-checkpoint', READ).catch(() => null) : null;
    if (id !== null && id !== after) {
      const pinned = page.locator(`section.turn[data-checkpoint="${id}"]`);
      const kind = await pinned.getAttribute('data-kind', READ).catch(() => null);
      if (kind !== null) return { turn: pinned, id, kind: kind as CheckpointKind };
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Nothing happened in ${timeoutMs / 1000} s after ${after ? `answering ${after}` : 'starting'}.`);
}

/** A "Your turn" a spec is answering: its panel (pinned to its checkpoint id), its id and its kind. */
export interface Turn {
  turn: Locator;
  id: string;
  kind: CheckpointKind;
}

/** The next "Your turn" other than `after`; fails if the run ends first. */
export async function turnAfter(page: Page, after?: string): Promise<Turn> {
  const outcome = await nextTurn(page, after, 120_000);
  if ('done' in outcome) throw new Error(`The run ended before another question${after ? ` after ${after}` : ''}.`);
  if ('failed' in outcome) throw new Error(`The run failed: ${outcome.failed}`);
  return { turn: outcome.turn, id: outcome.id, kind: outcome.kind };
}

/** Answers questions as they come until one of `kinds` is open. */
export async function untilTurn(page: Page, kinds: readonly CheckpointKind[], after?: string): Promise<Turn> {
  let last = after;
  for (let i = 0; i < 30; i++) {
    const t = await turnAfter(page, last);
    if (kinds.includes(t.kind)) return t;
    await answerTurn(page, t.turn, t.kind);
    last = t.id;
  }
  throw new Error(`No ${kinds.join(' or ')} question came.`);
}

/** The text field a text question is answered in: the editor, the reaction field, or the list's first item. */
export function answerField(t: Turn): Locator {
  return t.kind === 'directive' ? t.turn.getByRole('textbox', { name: 'Item 1', exact: true }) : t.turn.locator('textarea, .onscreen-copy input').first();
}

/** Text answers that read like a person's. */
const WORDS = {
  react: 'Warmer and plainer, please: lead with what people get, and keep it short.',
  directive: 'Remove the second paragraph.',
  write: 'This is my own draft, in my own words. It says plainly what I mean and stops.',
};

/** Answers one "Your turn" through its panel, the way a person would. */
export async function answerTurn(page: Page, turn: Locator, kind: CheckpointKind): Promise<void> {
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
    const outcome = await nextTurn(page, last, opts.stepTimeoutMs ?? 120_000);
    if ('done' in outcome) return answered;
    if ('failed' in outcome) throw new Error(`The run failed: ${outcome.failed}\nAnswered so far: ${JSON.stringify(answered)}`);
    const { turn, id, kind } = outcome;
    const prompt = await turn.locator('h2').first().textContent(READ).catch(() => null);
    // Gone since it was found: look again (the run may have moved on, or finished).
    if (prompt === null) continue;
    last = id;
    await answerTurn(page, turn, kind);
    answered.push({ kind, prompt: prompt.trim() });
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
