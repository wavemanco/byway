/**
 * A provider key pasted into byway (ADR-0088): Start refuses it before anything is stored, says which key it is and
 * never shows the value back. The one request body that carries the paste is the only place the stand-in key may
 * appear; every response and every other request is still watched.
 */
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { watchForKeys } from './flow.ts';
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

/** Asks for a recommendation and expects the held-key refusal, naming the key and never showing it. */
async function refuse(page: Page): Promise<void> {
  const answered = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/intakes' && res.request().method() === 'POST');
  await page.getByRole('button', { name: /Get a recommendation/ }).click();
  expect((await answered).status()).toBe(400);
  await expect(page.getByText('This text contains your ANTHROPIC_API_KEY. Remove it and try again')).toBeVisible();
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
  await refuse(page);
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
