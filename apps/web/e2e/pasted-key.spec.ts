/**
 * A provider key pasted into byway (ADR-0088): Start, an example you admire and an answer to a "Your turn" are refused
 * before anything is stored, the refusal says which key it is and never shows the value back, and the tab stops keeping
 * the part that held it while still showing it to be edited. The one request body that carries the paste is the only
 * place the stand-in key may appear; every response and every other request is still watched.
 */
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page, type Response } from '@playwright/test';
import { answerField, describeProblem, startRecommended, untilTurn, watchForKeys } from './flow.ts';
import { E2E_KEYS } from './keys.ts';

/** The intakes in the demo server's database: all of them, and those holding `text`. Opened read-only, then closed. */
function intakes(text: string): { all: number; holding: number } {
  const dataDir = process.env.BYWAY_E2E_DATA_DIR;
  if (!dataDir) throw new Error('BYWAY_E2E_DATA_DIR is not set: run the suite with pnpm e2e or the Playwright config.');
  const db = new DatabaseSync(path.join(dataDir, 'byway.sqlite'), { readOnly: true });
  try {
    const all = db.prepare('SELECT count(*) AS n FROM intakes').get() as { n: number };
    const holding = db.prepare('SELECT count(*) AS n FROM intakes WHERE instr(problem, ?) > 0').get(text) as { n: number };
    return { all: Number(all.n), holding: Number(holding.n) };
  } finally {
    db.close();
  }
}

/** Everything Start keeps in this tab's session, joined: the text's slot and the attachments' slot. */
const keptInTab = (page: Page) => page.evaluate(() => Object.entries(window.sessionStorage).filter(([k]) => k.startsWith('byway.start')).map(([, v]) => v).join('\n'));

const PROBLEM = 'A landing page for my pottery studio.';
const NOTES = 'Spring classes: wheel throwing on Tuesdays, glazing on Thursdays.';

async function attach(page: Page, name: string, text: string): Promise<void> {
  await page.getByRole('button', { name: 'Attach a draft or diff' }).click();
  await page.getByLabel('Name of attachment 1').fill(name);
  await page.getByLabel('Text of attachment 1').fill(text);
}

/** The refusal when the key was in Start's text. */
const IN_TEXT = 'This text contains your ANTHROPIC_API_KEY. Remove it and try again';

/**
 * Asks for a recommendation and expects the held-key refusal, naming the key and never showing it, and saying where it
 * was (`says`): the text or an attachment.
 */
async function refuse(page: Page, says = IN_TEXT): Promise<void> {
  const answered = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/intakes' && res.request().method() === 'POST');
  await page.getByRole('button', { name: /Get a recommendation/ }).click();
  expect((await answered).status()).toBe(400);
  await expect(page.getByText(says)).toBeVisible();
}

test('a provider key pasted on Start is refused before anything is stored, naming the key but never showing it', async ({ page }) => {
  const key = E2E_KEYS.ANTHROPIC_API_KEY;
  const before = intakes(key);
  const keys = watchForKeys(page, { pastedTo: '/api/intakes' });
  await page.goto('/');
  await page.getByLabel('What are you working on?').fill(`${PROBLEM} My Anthropic key is ${key} if you need it.`);
  await refuse(page);
  // Nothing was kept: still on Start, and no intake was stored.
  expect(new URL(page.url()).pathname).toBe('/');
  expect(intakes(key)).toEqual({ all: before.all, holding: 0 });
  // Nor in this tab: the paste stays in the field, to be edited, but Start no longer keeps it for "Change" (ADR-0088).
  await expect(page.getByLabel('What are you working on?')).toHaveValue(new RegExp(`My Anthropic key is ${key}`));
  expect(await keptInTab(page)).not.toContain(key);
  // Once the key is taken out, what is left is kept again, as any draft is.
  await page.getByLabel('What are you working on?').fill(PROBLEM);
  await expect.poll(() => keptInTab(page)).toContain(PROBLEM);
  expect(keys.pastes()).toBe(1);
  expect(keys.leaks).toEqual([]);
});

// The refusal stops keeping only the part that held the key: the rest is unsent work the tab keeps until a run starts
// (spec §5, ADR-0082 R1). Before, a key in the text also dropped the attachments, and they were not kept again until an
// attachment was edited, so a reload or "Change" brought back the text without them.
test('a refused key in the text leaves the attachments kept; once the text is fixed, a reload brings both back', async ({ page }) => {
  const key = E2E_KEYS.ANTHROPIC_API_KEY;
  const keys = watchForKeys(page, { pastedTo: '/api/intakes' });
  await page.goto('/');
  await page.getByLabel('What are you working on?').fill(`${PROBLEM} My Anthropic key is ${key} if you need it.`);
  await attach(page, 'Class notes', NOTES);
  await refuse(page);
  expect(await keptInTab(page)).not.toContain(key);
  expect(await keptInTab(page)).toContain(NOTES);

  await page.getByLabel('What are you working on?').fill(PROBLEM);
  await expect.poll(() => keptInTab(page)).toContain(PROBLEM);
  await page.reload();
  await expect(page.getByLabel('What are you working on?')).toHaveValue(PROBLEM);
  await expect(page.getByLabel('Name of attachment 1')).toHaveValue('Class notes');
  await expect(page.getByLabel('Text of attachment 1')).toHaveValue(NOTES);
  expect(keys.pastes()).toBe(1);
  expect(keys.leaks).toEqual([]);
});

test('a refused key in an attachment leaves the text kept; once the attachment is fixed, a reload brings both back', async ({ page }) => {
  const key = E2E_KEYS.ANTHROPIC_API_KEY;
  const keys = watchForKeys(page, { pastedTo: '/api/intakes' });
  await page.goto('/');
  await page.getByLabel('What are you working on?').fill(PROBLEM);
  await attach(page, 'Class notes', `${NOTES}\nconfig: ${key}`);
  // The refusal says the key was in an attachment, not "this text" (the field the person is looking at).
  await refuse(page, 'An attachment contains your ANTHROPIC_API_KEY. Remove it and try again');
  expect(await keptInTab(page)).not.toContain(key);
  expect(await keptInTab(page)).toContain(PROBLEM);

  await page.getByLabel('Text of attachment 1').fill(NOTES);
  await expect.poll(() => keptInTab(page)).toContain(NOTES);
  await page.reload();
  await expect(page.getByLabel('What are you working on?')).toHaveValue(PROBLEM);
  await expect(page.getByLabel('Text of attachment 1')).toHaveValue(NOTES);
  expect(await keptInTab(page)).not.toContain(key);
  expect(keys.pastes()).toBe(1);
  expect(keys.leaks).toEqual([]);
});

const MEMO = 'Tighten my quarterly status memo for the leadership team before Friday';

/** Everything this tab keeps under keys that start with `prefix`, joined. */
const keptUnder = (page: Page, prefix: string) =>
  page.evaluate((p) => Object.entries(window.sessionStorage).filter(([k]) => k.startsWith(p)).map(([, v]) => v).join('\n'), prefix);

/** Expects the held-key refusal for `response`, naming the key and never showing it, and saying where it was (`says`). */
async function refused(page: Page, response: Promise<Response>, says = IN_TEXT): Promise<void> {
  expect((await response).status()).toBe(400);
  await expect(page.getByRole('alert').filter({ hasText: says })).toBeVisible();
}

// The Recommendation screen kept a refused example in the tab, key and all: only Start stopped keeping a refused paste.
test('a refused key in an example you admire stops that example being kept; the others stay kept, and it is kept again once fixed', async ({ page }) => {
  const key = E2E_KEYS.ANTHROPIC_API_KEY;
  const keys = watchForKeys(page, { pastedTo: '/api/refs' });
  const held = `An example memo I admire: the ask first. config: ${key}`;
  const fixed = 'An example memo I admire: the ask first.';
  const other = 'A second one: two lines, then the numbers.';
  await describeProblem(page, MEMO);
  await expect(page.locator('#proposal-title')).toHaveText('Memo Polish', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Paste an example' }).click();
  await page.getByLabel('Example 1').fill(held);
  await page.getByRole('button', { name: 'Paste an example' }).click();
  await page.getByLabel('Example 2').fill(other);
  await expect.poll(() => keptUnder(page, 'byway.examples.')).toContain(key);

  const answered = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/refs' && res.request().method() === 'POST');
  await page.getByRole('button', { name: /^Start/ }).click();
  // Several examples are on screen: the refusal says which one held the key.
  await refused(page, answered, 'Example 1 contains your ANTHROPIC_API_KEY. Remove it and try again');
  // No run started; the example is still on screen to be edited, but the tab no longer keeps it. The other one stays kept.
  expect(new URL(page.url()).pathname).toMatch(/^\/recommend\//);
  await expect(page.getByLabel('Example 1')).toHaveValue(held);
  expect(await keptUnder(page, 'byway.examples.')).not.toContain(key);
  expect(await keptUnder(page, 'byway.examples.')).toContain(other);

  await page.getByLabel('Example 1').fill(fixed);
  await expect.poll(() => keptUnder(page, 'byway.examples.')).toContain(fixed);
  await page.reload();
  await expect(page.locator('#proposal-title')).toHaveText('Memo Polish', { timeout: 60_000 });
  await expect(page.getByLabel('Example 1')).toHaveValue(fixed);
  await expect(page.getByLabel('Example 2')).toHaveValue(other);
  expect(await keptUnder(page, 'byway.examples.')).not.toContain(key);
  expect(keys.pastes()).toBe(1);
  expect(keys.leaks).toEqual([]);
});

// The Run screen kept a refused answer in the tab, key and all, and wrote it again on the next pause in typing or reload.
test('a refused key in an answer stops that answer being kept, through a reload; once fixed it is kept again and sends', async ({ page }) => {
  const key = E2E_KEYS.ANTHROPIC_API_KEY;
  // The paste is the answer to this question; answers to earlier questions are watched like any other request.
  let answerPath: string | undefined;
  const keys = watchForKeys(page, { pastedTo: (pathname) => pathname === answerPath });
  const words = 'Warmer and plainer, please: the ask first.';
  await describeProblem(page, MEMO);
  const runId = await startRecommended(page, 'Memo Polish');
  const t = await untilTurn(page, ['react', 'write', 'directive']);
  const draftKey = `byway.draft.${t.id}`;
  answerPath = `/api/runs/${runId}/checkpoints/${encodeURIComponent(t.id)}`;
  await answerField(t).fill(`${words} My key is ${key}.`);
  await expect.poll(() => keptUnder(page, draftKey)).toContain(key);

  const answered = page.waitForResponse((res) => new URL(res.url()).pathname.startsWith(`/api/runs/${runId}/checkpoints/`) && res.request().method() === 'POST');
  await t.turn.locator('.turn-foot button.button-primary').click();
  await refused(page, answered);
  // Only that request was the paste: the answer sent later is watched like any other.
  answerPath = undefined;
  // The panel still shows the words, to be edited; the tab no longer keeps them, after a pause in typing either.
  await expect(answerField(t)).toHaveValue(new RegExp(`My key is ${key}`));
  expect(await keptUnder(page, 'byway.')).not.toContain(key);
  await page.waitForTimeout(1000);
  expect(await keptUnder(page, 'byway.')).not.toContain(key);
  // A reload writes pending drafts as the page goes: the refused one is not among them, so it does not come back.
  await page.reload();
  await expect(t.turn).toBeVisible();
  await expect(answerField(t)).not.toHaveValue(new RegExp(key));
  expect(await keptUnder(page, 'byway.')).not.toContain(key);

  // Without the key, the answer is kept again, survives a reload, and is accepted.
  await answerField(t).fill(words);
  await expect.poll(() => keptUnder(page, draftKey)).toContain(words);
  await page.reload();
  await expect(answerField(t)).toHaveValue(words);
  const posted = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname.startsWith(`/api/runs/${runId}/checkpoints/`));
  await t.turn.locator('.turn-foot button.button-primary').click();
  expect((await posted).postDataJSON()).toMatchObject({ text: words });
  await expect(t.turn).toHaveCount(0, { timeout: 30_000 });

  // Leave the demo engine free for the tests after this one.
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel run' }).click();
  await expect(page.locator('.run-status')).toHaveText('Cancelled');
  expect(keys.pastes()).toBe(1);
  expect(keys.leaks).toEqual([]);
});
