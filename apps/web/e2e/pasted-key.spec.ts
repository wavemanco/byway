/**
 * A provider key pasted into byway (ADR-0088): Start refuses it before anything is stored, says which key it is and
 * never shows the value back. The one request body that carries the paste is the only place the stand-in key may
 * appear; every response and every other request is still watched.
 */
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
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

test('a provider key pasted on Start is refused before anything is stored, naming the key but never showing it', async ({ page }) => {
  const key = E2E_KEYS.ANTHROPIC_API_KEY;
  const before = intakes(key);
  const keys = watchForKeys(page, { pastedTo: '/api/intakes' });
  await page.goto('/');
  await page.getByLabel('What are you working on?').fill(`A landing page for my pottery studio. My Anthropic key is ${key} if you need it.`);
  const answered = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/intakes' && res.request().method() === 'POST');
  await page.getByRole('button', { name: /Get a recommendation/ }).click();
  expect((await answered).status()).toBe(400);
  await expect(page.getByText('This text contains your ANTHROPIC_API_KEY. Remove it and try again')).toBeVisible();
  // Nothing was kept: still on Start, and no intake was stored.
  expect(new URL(page.url()).pathname).toBe('/');
  expect(intakes(key)).toEqual({ all: before.all, holding: 0 });
  // Nor in this tab: the paste stays in the field, to be edited, but Start no longer keeps it for "Change" (ADR-0088).
  const keptInTab = () => page.evaluate(() => Object.entries(window.sessionStorage).filter(([k]) => k.startsWith('byway.start')).map(([, v]) => v).join('\n'));
  await expect(page.getByLabel('What are you working on?')).toHaveValue(new RegExp(`My Anthropic key is ${key}`));
  expect(await keptInTab()).not.toContain(key);
  // Once the key is taken out, what is left is kept again, as any draft is.
  await page.getByLabel('What are you working on?').fill('A landing page for my pottery studio.');
  await expect.poll(keptInTab).toContain('A landing page for my pottery studio.');
  expect(keys.pastes()).toBe(1);
  expect(keys.leaks).toEqual([]);
});
