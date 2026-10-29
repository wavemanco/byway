/**
 * The id a Start names its run with (F03 P3, ADR-0099 decision 7). The screen sends the same id again only for the same
 * Start: one whose answer never came back (the network failed, or the answer was lost), with the same inputs, so the
 * server gives the run it may have started instead of a second one. Once byway answered (a refusal, or the engine
 * being down), that Start is over and the next press is a new one; so is a Start with other inputs (another budget,
 * recipe, route or composed recipe). Before, the screen kept one id for its whole life, so a press after "Restart
 * byway, then try again" got the failed run back and started nothing, and a changed budget got the earlier run.
 *
 * Every start is stopped in the browser (page.route), so no run is started here.
 */
import { expect, test, type Page } from '@playwright/test';
import { describeProblem } from './flow.ts';

type Reply = 'no answer' | { status: number; error: string };

/** Answers each POST /api/runs with the next reply (the last one repeats), and keeps the run id each one named. */
async function answerStarts(page: Page, replies: Reply[]): Promise<{ ids: string[] }> {
  const ids: string[] = [];
  await page.route('**/api/runs', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    ids.push((route.request().postDataJSON() as { runId?: string }).runId ?? '(none)');
    const reply = replies[Math.min(ids.length, replies.length) - 1] as Reply;
    if (reply === 'no answer') return route.abort('connectionreset');
    return route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify({ error: reply.error }) });
  });
  return { ids };
}

/** Presses Start and waits until that start has been sent and the button is free again. */
async function pressStart(page: Page, sent: { ids: string[] }): Promise<string> {
  const before = sent.ids.length;
  const button = page.locator('.start-bar button[type="submit"]');
  await button.click();
  await expect.poll(() => sent.ids.length).toBe(before + 1);
  await expect(button).not.toHaveAttribute('aria-busy', 'true');
  return sent.ids[before] as string;
}

test('a Start sends its id again only while no answer came back and nothing changed', async ({ page }) => {
  await describeProblem(page, 'Tighten my quarterly status memo for the leadership team before Friday');
  await expect(page.locator('#proposal-title')).toHaveText('Memo Polish', { timeout: 60_000 });
  const engineDown = { status: 503, error: "byway's run engine is not running, or did not answer in time. Restart byway (pnpm start), then try again." };
  const sent = await answerStarts(page, ['no answer', 'no answer', 'no answer', engineDown, 'no answer']);

  const first = await pressStart(page, sent);
  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  await expect(page.locator('.start-bar-error')).toContainText('byway is not reachable');
  // No answer came back: pressed again, it is the same Start.
  expect(await pressStart(page, sent)).toBe(first);

  // Another budget is another Start.
  const budget = page.getByLabel('Budget for this run');
  await budget.fill(String(Number(await budget.inputValue()) + 1));
  const other = await pressStart(page, sent);
  expect(other).not.toBe(first);

  // byway answered that the engine is down: the next press, after a restart, is a new Start.
  expect(await pressStart(page, sent)).toBe(other);
  await expect(page.locator('.start-bar-error')).toContainText('Restart byway');
  const after = await pressStart(page, sent);
  expect(after).not.toBe(other);
  expect(after).not.toBe(first);
});

// B-042: the tab keeps a Start that got no answer, so the same Start pressed again after a reload is the same one.
test('a Start that got no answer keeps its id across a reload; once byway answered, the next is new', async ({ page }) => {
  await describeProblem(page, 'Tighten my quarterly status memo for the leadership team before Friday');
  const title = page.locator('#proposal-title');
  await expect(title).toHaveText('Memo Polish', { timeout: 60_000 });
  const sent = await answerStarts(page, ['no answer', 'no answer', { status: 409, error: 'e2e: refused' }, 'no answer']);

  const first = await pressStart(page, sent);
  await page.reload();
  await expect(title).toHaveText('Memo Polish', { timeout: 60_000 });
  expect(await pressStart(page, sent)).toBe(first);

  // byway answered with a refusal: that Start is over, and a reload does not bring it back.
  expect(await pressStart(page, sent)).toBe(first);
  await page.reload();
  await expect(title).toHaveText('Memo Polish', { timeout: 60_000 });
  expect(await pressStart(page, sent)).not.toBe(first);
});
