/**
 * Settings' "How long to wait for an answer", end to end in demo mode (B-074): the few lines of AnswerWaits.tsx that
 * connect a select's change to its save (waitSaves.ts, tested whole in wait-saves.test.ts) and write the server's
 * answer back into the row. A change is announced, kept by the server and shown again after a reload. The owner chose a
 * browser test in this suite over a DOM test library for apps/web, on 2026-10-31. The wait is put back after the test,
 * whatever happens in it, so the suite's other specs wait as before. No wall-clock waits: only Playwright's own polling
 * of what the page shows.
 */
import { expect, test } from '@playwright/test';

/** What the test changed, to put back: the save's own request names the provider and the model. */
let changed: { provider: string; model: string; minutes: number } | undefined;

test.afterEach(async ({ page }) => {
  if (!changed) return;
  const res = await page.request.patch('/api/waits', { data: changed });
  expect(res.ok()).toBe(true);
  changed = undefined;
});

test("Settings: a model's answer wait saves at once, is announced, and is still chosen after a reload", async ({ page }) => {
  await page.goto('/settings');
  const section = page.locator('#waits');
  const row = section.locator('li.wait').first();
  const select = row.locator('select.wait-choice');
  const model = ((await row.locator('label.wait-model').textContent()) ?? '').trim();
  expect(model).not.toBe('');
  const before = Number(await select.inputValue());
  const offered = (await select.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).map(Number);
  const to = offered.find((m) => m !== before);
  expect(to).toBeDefined();

  const saved = page.waitForRequest((req) => new URL(req.url()).pathname === '/api/waits' && req.method() === 'PATCH');
  await select.selectOption(String(to));
  const sent = (await saved).postDataJSON() as { provider: string; model: string; minutes: number };
  // Kept before any check, so the wait is put back whatever fails next.
  changed = { provider: sent.provider, model: sent.model, minutes: before };
  expect(sent).toMatchObject({ model, minutes: to });

  await expect(section.locator('p[role="status"]')).toHaveText(`${model} now waits ${to} minutes, from its next call.`);
  await expect(select).toHaveValue(String(to));
  await expect(row.locator(`[id="${await select.getAttribute('aria-describedby')}"]`)).not.toContainText('Not chosen yet');

  await page.reload();
  await expect(section.locator('li.wait').first().locator('select.wait-choice')).toHaveValue(String(to));
});
