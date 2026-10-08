/**
 * Client state the person relies on, end to end in demo mode (ADR-0082): snapshots that arrive late or fail late never
 * move the Run screen backwards (F15); what you type for a "Your turn" outlives looking at earlier steps, a reload and
 * Back, is what gets sent, and is shown read-only if its question closes unsent (F06); and what you add on the way
 * (examples you admire, Start attachments) survives a detour. Memo Polish (C4) is used because it asks every kind of
 * text question early.
 */
import { expect, test, type APIResponse, type Locator, type Page, type Route } from '@playwright/test';
import type { CheckpointKind } from '@byway/contracts';
import { answerTurn, answerUntilDone, describeProblem, nextTurn, startRecommended, timelineLabels } from './flow.ts';

const MEMO = 'Tighten my quarterly status memo for the leadership team before Friday';
const NOT_ANSWERING = 'byway is not answering';

interface Turn {
  turn: Locator;
  id: string;
  kind: CheckpointKind;
}

async function startMemo(page: Page): Promise<string> {
  await describeProblem(page, MEMO);
  return startRecommended(page, 'Memo Polish');
}

/** The next "Your turn" other than `after`; fails if the run ends first. */
async function turnAfter(page: Page, after?: string): Promise<Turn> {
  const outcome = await nextTurn(page, after, 120_000);
  if ('done' in outcome) throw new Error(`The run ended before another question${after ? ` after ${after}` : ''}.`);
  if ('failed' in outcome) throw new Error(`The run failed: ${outcome.failed}`);
  const id = (await outcome.turn.getAttribute('data-checkpoint')) ?? '';
  const kind = (await outcome.turn.getAttribute('data-kind')) as CheckpointKind;
  return { turn: page.locator(`section.turn[data-checkpoint="${id}"]`), id, kind };
}

/** Answers questions as they come until one of `kinds` is open. */
async function untilTurn(page: Page, kinds: readonly CheckpointKind[], after?: string): Promise<Turn> {
  let last = after;
  for (let i = 0; i < 30; i++) {
    const t = await turnAfter(page, last);
    if (kinds.includes(t.kind)) return t;
    await answerTurn(page, t.turn, t.kind);
    last = t.id;
  }
  throw new Error(`No ${kinds.join(' or ')} question came.`);
}

/** Checks for `ms` that `ok` stays true (an assertion that something never happens in that time). */
async function staysTrue(page: Page, ms: number, ok: () => Promise<boolean>, message: string): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    expect(await ok(), message).toBe(true);
    await page.waitForTimeout(100);
  }
}

const draftKeys = (page: Page) => page.evaluate(() => Object.keys(window.sessionStorage).filter((k) => k.startsWith('byway.draft.')));

/** The text field a text question is answered in: the editor, the reaction field, or the list's first item. */
function field(t: Turn): Locator {
  return t.kind === 'directive' ? t.turn.getByRole('textbox', { name: 'Item 1', exact: true }) : t.turn.locator('textarea, .onscreen-copy input').first();
}

/** Open an earlier step from the timeline, then go back to the question with the button. */
async function inspectEarlierStep(page: Page): Promise<void> {
  await page.locator('.tl-step[data-status="done"] .tl-title').first().click();
  await expect(page.locator('section.detail')).toBeVisible();
  await page.getByRole('button', { name: /Back to your turn/ }).click();
}

/** Open an earlier step, then close it with Esc. */
async function inspectAndEscape(page: Page): Promise<void> {
  await page.locator('.tl-step[data-status="done"] .tl-title').first().click();
  await expect(page.locator('section.detail')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('section.detail')).toHaveCount(0);
}

/** Click the current "Your turn" row twice: it opens as a step, then closes again. */
async function currentRowTwice(page: Page): Promise<void> {
  const row = page.locator('.tl-step[data-status="waiting"] .tl-title').first();
  await row.click();
  await expect(page.locator('section.detail')).toBeVisible();
  await row.click();
  await expect(page.locator('section.detail')).toHaveCount(0);
}

/** Leave for History through the main navigation, then come back with the browser's Back. */
async function historyAndBack(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /History/ }).click();
  await expect(page).toHaveURL(/\/history$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]+$/);
}

test.describe('the Run screen applies only the newest snapshot (F15)', () => {
  test('a late, older poll never reopens an answered question, and a late failure leaves no banner on a finished run', async ({ page }) => {
    const runId = await startMemo(page);
    const hold: { want: boolean; caught: { route: Route; response: APIResponse } | null } = { want: false, caught: null };
    const fail = { next: false };
    await page.route(
      (url) => url.pathname === `/api/runs/${runId}` && url.searchParams.has('after'),
      async (route) => {
        if (fail.next) {
          fail.next = false;
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'e2e: one refresh failed' }) });
          return;
        }
        if (hold.want && !hold.caught) {
          hold.want = false;
          // The server's answer as of now, delivered later: an older snapshot arriving after newer ones.
          hold.caught = { route, response: await route.fetch() };
          return;
        }
        try {
          await route.continue();
        } catch {
          // The page gave up on this request (a newer one superseded it).
        }
      },
    );
    const holdOne = async () => {
      hold.want = true;
      // Ask for a poll now rather than wait for the timer.
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await expect.poll(() => hold.caught !== null, { timeout: 20_000 }).toBe(true);
    };
    const release = async (how: 'fulfill' | 'abort') => {
      const caught = hold.caught;
      hold.caught = null;
      try {
        if (how === 'fulfill' && caught) await caught.route.fulfill({ response: caught.response });
        else await caught?.route.abort();
      } catch {
        // The page had already given up on it.
      }
    };

    // (a) One poll is held while the person answers; the newer snapshots arrive first, then the held one.
    const first = await turnAfter(page);
    await holdOne();
    await answerTurn(page, first.turn, first.kind);
    await expect(page.locator(`section.turn[data-checkpoint="${first.id}"]`)).toHaveCount(0);
    await release('fulfill');
    await staysTrue(page, 2500, async () => (await page.locator(`section.turn[data-checkpoint="${first.id}"]`).count()) === 0, 'the answered question came back');

    // (c) The screen keeps applying snapshots across running, waiting and running again.
    const second = await turnAfter(page, first.id);
    expect((await timelineLabels(page)).length).toBeGreaterThan(0);

    // (b) The refresh right after an answer fails once: the banner says so, then clears when polling gets through.
    await page.route(`**/api/runs/${runId}/checkpoints/**`, async (route) => {
      const response = await route.fetch();
      fail.next = true;
      await route.fulfill({ response });
    });
    await answerTurn(page, second.turn, second.kind);
    await expect(page.getByText(NOT_ANSWERING)).toBeVisible();
    await expect(page.getByText(NOT_ANSWERING)).toHaveCount(0, { timeout: 15_000 });
    await page.unroute(`**/api/runs/${runId}/checkpoints/**`);

    // (a, late failure) A poll held while the person answers fails only after the run is done.
    const third = await turnAfter(page, second.id);
    await holdOne();
    await answerTurn(page, third.turn, third.kind);
    await answerUntilDone(page, { after: third.id });
    await expect(page.locator('.run-status')).toHaveText('Done');
    await release('abort');
    await staysTrue(page, 5000, async () => (await page.getByText(NOT_ANSWERING).count()) === 0, 'a late failure of an older poll showed the banner on a finished run');
    await expect(page.locator('.run-status')).toHaveText('Done');
  });
});
