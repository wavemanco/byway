/**
 * Client state the person relies on, end to end in demo mode (ADR-0082): snapshots that arrive late or fail late never
 * move the Run screen backwards (F15); what you type for a "Your turn" outlives looking at earlier steps, a reload and
 * Back, is what gets sent, and is shown read-only if its question closes unsent (F06); and what you add on the way
 * (examples you admire, Start attachments) survives a detour. Memo Polish (C4) is used because it asks every kind of
 * text question early.
 */
import { expect, test, type APIResponse, type Page, type Route } from '@playwright/test';
import type { CheckpointKind } from '@byway/contracts';
import { answerField as field, answerTurn, answerUntilDone, describeProblem, nextTurn, startRecommended, timelineLabels, turnAfter, untilTurn, type Turn } from './flow.ts';

const MEMO = 'Tighten my quarterly status memo for the leadership team before Friday';
const NOT_ANSWERING = 'byway is not answering';

async function startMemo(page: Page): Promise<string> {
  await describeProblem(page, MEMO);
  return startRecommended(page, 'Memo Polish');
}

/** Checks for `ms` that `ok` stays true (an assertion that something never happens in that time). */
async function staysTrue(page: Page, ms: number, ok: () => Promise<boolean>, message: string): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    expect(await ok(), message).toBe(true);
    await page.waitForTimeout(100);
  }
}

/**
 * The server's answer to an intercepted request, on a connection of its own. Playwright's request context keeps its
 * connections alive, and one the server closed as it idled can be taken for the next request, which then dies with
 * ECONNRESET (main's Windows run 40063127719, at the "Sent" test): asking with `connection: close` leaves none to reuse.
 */
const fetchOwn = (route: Route) => route.fetch({ headers: { ...route.request().headers(), connection: 'close' } });

const draftKeys = (page: Page) => page.evaluate(() => Object.keys(window.sessionStorage).filter((k) => k.startsWith('byway.draft.')));

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

/**
 * Leave for another screen through the main navigation, then come back with the browser's Back. Back shows the copy
 * Next.js's client router cache kept of the Run page first (not the browser's back/forward cache; ADR-0082): the one
 * from when the page was last loaded or reached, which can predate the question (reached from Start) or show it still
 * open after it was answered (reloaded while it was open).
 */
async function awayAndBack(page: Page, to: 'History' | 'Settings'): Promise<void> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: new RegExp(to) }).click(); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- `to` is typed 'History' | 'Settings', two constant words
  await expect(page).toHaveURL(new RegExp(`/${to.toLowerCase()}$`)); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- `to` is typed 'History' | 'Settings', two constant words
  await page.goBack();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]+$/);
}
const historyAndBack = (page: Page) => awayAndBack(page, 'History');

/** Cancels the run on screen, so it does not keep the demo engine busy for the tests after this one. */
async function cancelRun(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel run' }).click();
  await expect(page.locator('.run-status')).toHaveText('Cancelled');
}

test.describe('the Run screen applies only the newest snapshot (F15)', () => {
  test('a late, older poll never reopens an answered question, and a late failure leaves no banner on a finished run', async ({ page }) => {
    const runId = await startMemo(page);
    const hold: { want: boolean; caught: { route: Route; response: APIResponse } | null } = { want: false, caught: null };
    const fail = { next: false };
    // After the one failed refresh, later ones wait here until the test has seen the banner (step (b)).
    const stall = { on: false, waiting: [] as (() => void)[] };
    const endStall = () => {
      stall.on = false;
      for (const go of stall.waiting.splice(0)) go();
    };
    await page.route(
      (url) => url.pathname === `/api/runs/${runId}` && url.searchParams.has('after'),
      async (route) => {
        if (fail.next) {
          fail.next = false;
          stall.on = true;
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'e2e: one refresh failed' }) });
          return;
        }
        if (stall.on) await new Promise<void>((go) => stall.waiting.push(go));
        if (hold.want && !hold.caught) {
          hold.want = false;
          // The server's answer as of now, delivered later: an older snapshot arriving after newer ones.
          hold.caught = { route, response: await fetchOwn(route) };
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

    // (b) The refresh right after an answer fails once: the banner says so, then clears when polling gets through. The
    // next refresh is held until the banner has been seen. While the run waits, its poll interval equals LOST_RETRY_MS,
    // so losing the connection does not restart the timer: the retry is the tick already due, which can come a few
    // hundred milliseconds after the failure and, answered at once, clear the banner between two checks of toBeVisible.
    await page.route(`**/api/runs/${runId}/checkpoints/**`, async (route) => {
      const response = await fetchOwn(route);
      fail.next = true;
      await route.fulfill({ response });
    });
    await answerTurn(page, second.turn, second.kind);
    await expect(page.getByText(NOT_ANSWERING)).toBeVisible();
    endStall();
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

test.describe('your unsent answer belongs to its question, not to the panel showing it (F06)', () => {
  test('what you type survives looking at earlier steps, Esc, the current row, a reload and Back, and is exactly what is sent', async ({ page }) => {
    await startMemo(page);
    const words = 'F06 sentinel: my own words, typed here and nowhere else.';
    const t = await untilTurn(page, ['write']);
    const editor = () => field(t);
    await editor().fill(words);

    await inspectEarlierStep(page);
    await expect(editor()).toHaveValue(words);
    await inspectAndEscape(page);
    await expect(editor()).toHaveValue(words);
    await currentRowTwice(page);
    await expect(editor()).toHaveValue(words);
    await page.reload();
    await expect(editor()).toHaveValue(words);
    await historyAndBack(page);
    await expect(editor()).toHaveValue(words);

    const posted = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes(`/checkpoints/`));
    await t.turn.locator('.turn-foot button.button-primary').click();
    expect((await posted).postDataJSON()).toMatchObject({ text: words });
    await expect(t.turn).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(() => draftKeys(page)).not.toContain(`byway.draft.${t.id}`);
  });

  test('reached from Start with no reload, what you type survives History then Back and Settings then Back', async ({ page }) => {
    // The cached copy Back shows was rendered as the run started, before this question existed: it must not settle
    // (and so delete) the draft for a question it does not list.
    await startMemo(page);
    const words = 'F06 sentinel: typed, then away to History and Settings, and back with the browser.';
    const t = await untilTurn(page, ['react', 'write', 'directive']);
    await field(t).fill(words);

    await awayAndBack(page, 'History');
    await expect(field(t)).toHaveValue(words);
    expect(await draftKeys(page)).toContain(`byway.draft.${t.id}`);
    await awayAndBack(page, 'Settings');
    await expect(field(t)).toHaveValue(words);
    expect(await draftKeys(page)).toContain(`byway.draft.${t.id}`);

    const posted = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes(`/checkpoints/`));
    await t.turn.locator('.turn-foot button.button-primary').click();
    expect((await posted).postDataJSON()).toMatchObject({ text: words });
    await expect(t.turn).toHaveCount(0, { timeout: 30_000 });
    await cancelRun(page);
  });

  test('lists, ticks and highlights survive inspection; lists and ticks survive a reload, a compare highlight does not (UX-1)', async ({ page }) => {
    // Memo Polish asks for a list of cuts; in the demo its sweep finds no clichés, so Landing Page Studio supplies the
    // contact sheet (pick), the cliché checklist (select) and the before/after (compare).
    await startMemo(page);
    const checked = await roundTripEachKind(page);
    await describeProblem(page, 'A landing page for the spring classes at my pottery studio');
    await startRecommended(page, 'Landing Page Studio');
    for (const kind of await roundTripEachKind(page)) checked.add(kind);
    expect([...checked]).toEqual(expect.arrayContaining(['directive', 'pick', 'select', 'compare']));
  });
});

/**
 * Answers a run to the end. The first question of each kind below is first given an answer, then looked away from
 * (an earlier step, Back to your turn) and reloaded, and what the person chose must still be there (or, for a compare
 * highlight, must not survive the reload). Returns the kinds checked.
 */
async function roundTripEachKind(page: Page): Promise<Set<CheckpointKind>> {
  const checked = new Set<CheckpointKind>();
  let after: string | undefined;
  for (let i = 0; i < 60; i++) {
    const outcome = await nextTurn(page, after, 120_000);
    if ('done' in outcome) return checked;
    if ('failed' in outcome) throw new Error(`The run failed: ${outcome.failed}`);
    const { id, kind } = outcome;
    const t: Turn = { turn: outcome.turn, id, kind };
    after = id;
    if (checked.has(kind)) {
      await answerTurn(page, t.turn, kind);
      continue;
    }
    if (kind === 'directive') {
      checked.add(kind);
      const first = t.turn.getByRole('textbox', { name: 'Item 1', exact: true });
      await first.fill('Remove the opening pleasantries.');
      await first.press('Enter');
      await t.turn.getByRole('textbox', { name: 'Item 2', exact: true }).fill('Remove the second chart.');
      await inspectEarlierStep(page);
      await expect(t.turn.getByRole('textbox', { name: 'Item 2', exact: true })).toHaveValue('Remove the second chart.');
      await page.reload();
      await expect(t.turn.getByRole('textbox', { name: 'Item 1', exact: true })).toHaveValue('Remove the opening pleasantries.');
      await expect(t.turn.getByRole('textbox', { name: 'Item 2', exact: true })).toHaveValue('Remove the second chart.');
      const posted = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/checkpoints/'));
      await t.turn.locator('.turn-foot button.button-primary').click();
      expect((await posted).postDataJSON()).toMatchObject({ text: 'Remove the opening pleasantries.\nRemove the second chart.' });
    } else if (kind === 'select' || kind === 'pick') {
      checked.add(kind);
      const boxes = t.turn.locator(kind === 'pick' ? 'input.sheet-input' : 'input[type="checkbox"]');
      const target = boxes.last();
      const value = (await target.getAttribute('value')) ?? '';
      await target.check();
      await inspectEarlierStep(page);
      await expect(t.turn.locator(`input[value="${value}"]`)).toBeChecked();
      await page.reload();
      await expect(t.turn.locator(`input[value="${value}"]`)).toBeChecked();
      if (kind === 'select') {
        const posted = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/checkpoints/'));
        await t.turn.locator('.turn-foot button.button-primary').click();
        expect((await posted).postDataJSON()).toMatchObject({ choice: [value] });
      } else {
        await answerTurn(page, t.turn, kind);
      }
    } else if (kind === 'compare') {
      checked.add(kind);
      // J highlights a version (the versions are framed pages, so a click inside one would not reach this page).
      await t.turn.locator('h2').first().focus();
      await page.keyboard.press('j');
      await expect(t.turn.locator('.compare-col[data-current="true"]')).toHaveCount(1);
      await inspectEarlierStep(page);
      await expect(t.turn.locator('.compare-col[data-current="true"]')).toHaveCount(1);
      await page.reload();
      await expect(t.turn).toBeVisible();
      await expect(t.turn.locator('.compare-col[data-current="true"]')).toHaveCount(0);
      await answerTurn(page, t.turn, kind);
    } else {
      await answerTurn(page, t.turn, kind);
    }
  }
  throw new Error('The run asked more than 60 questions.');
}

test.describe('your unsent answer belongs to its question (F06), continued', () => {
  test('a refused answer keeps your words; a sent one stays locked as Sent, never the starting text, until byway confirms it', async ({ page }) => {
    const runId = await startMemo(page);
    const words = 'F06 sentinel: warmer, plainer, and about the reader first.';
    const t = await untilTurn(page, ['react', 'write', 'directive']);
    await field(t).fill(words);
    // Polling while you type changes nothing (a regression check: this already held).
    await page.waitForTimeout(4000);
    await expect(field(t)).toHaveValue(words);
    // A reload while the question is open: from now on, the cached copy Back shows lists it open.
    await page.reload();
    await expect(field(t)).toHaveValue(words);

    // The first send is refused: the words stay, with the reason.
    let refuse = true;
    let failRefreshes = false;
    await page.route(`**/api/runs/${runId}/checkpoints/**`, async (route) => {
      if (refuse) {
        refuse = false;
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'e2e: the answer was refused once' }) });
        return;
      }
      const response = await fetchOwn(route);
      failRefreshes = true;
      await route.fulfill({ response });
    });
    await page.route(
      (url) => url.pathname === `/api/runs/${runId}` && url.searchParams.has('after'),
      async (route) => {
        if (failRefreshes) await route.abort();
        else await route.continue();
      },
    );
    await t.turn.locator('.turn-foot button.button-primary').click();
    await expect(page.getByRole('alert').filter({ hasText: 'e2e: the answer was refused once' })).toBeVisible();
    await expect(field(t)).toHaveValue(words);

    // The second send is accepted but byway cannot be reached afterwards: the turn shows your words, locked as Sent.
    await t.turn.locator('.turn-foot button.button-primary').click();
    await expect(page.getByText(NOT_ANSWERING)).toBeVisible();
    const primary = t.turn.locator('.turn-foot button.button-primary');
    await expect(primary).toHaveText('Sent');
    await expect(primary).toBeDisabled();
    await expect(field(t)).toHaveValue(words);

    // Sent is a lock: the field takes no more typing, so what is shown stays what was sent.
    await expect(field(t)).not.toBeEditable();
    await field(t).focus();
    await page.keyboard.type(' And a line typed while waiting.');
    await expect(field(t)).toHaveValue(words);

    // Back shows the cached copy from the reload, with the question still open, while byway is still unreachable: it
    // must not unlock the sent answer (only a snapshot byway has just served settles a draft).
    await historyAndBack(page);
    await expect(t.turn).toBeVisible();
    await staysTrue(page, 2500, async () => ((await primary.textContent()) ?? '').trim() === 'Sent', 'Back unlocked the sent answer');
    await expect(primary).toBeDisabled();
    await expect(field(t)).toHaveValue(words);

    // Once byway answers again, the question settles and its draft is gone; nothing is shown as unsent.
    failRefreshes = false;
    // However long the engine takes to settle it: the test's own limit stops a question that never settles.
    await expect(t.turn).toHaveCount(0, { timeout: 0 });
    await expect(page.getByText(NOT_ANSWERING)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Your unsent words' })).toHaveCount(0);
    await expect.poll(() => draftKeys(page)).not.toContain(`byway.draft.${t.id}`);
  });

  test('words typed for a question that closes unsent are shown read-only, with Copy and Discard, and cannot be sent', async ({ page }) => {
    await startMemo(page);
    const words = 'F06 sentinel: the words I had not sent when the run was cancelled.';
    const t = await untilTurn(page, ['react', 'write', 'directive']);
    await field(t).fill(words);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel run' }).click();
    await expect(page.locator('.run-status')).toHaveText('Cancelled');

    const unsent = page.getByRole('region', { name: 'Your unsent words' });
    await expect(unsent).toContainText(words);
    await expect(unsent.getByRole('button', { name: 'Copy' })).toBeVisible();
    await expect(unsent.getByRole('button', { name: /^Discard/ })).toBeVisible();
    await expect(unsent.locator('textarea')).toHaveAttribute('readonly', '');
    await expect(page.locator('section.turn')).toHaveCount(0);
    await expect(unsent.getByRole('button', { name: /Send|Use my words/ })).toHaveCount(0);

    await page.reload();
    await expect(unsent).toContainText(words);
    await unsent.getByRole('button', { name: /^Discard/ }).click();
    await expect(unsent).toHaveCount(0);
    await expect.poll(() => draftKeys(page)).not.toContain(`byway.draft.${t.id}`);
  });
});

test('examples you admire and Start attachments survive a detour, and are cleared once the run starts', async ({ page }) => {
  const example = 'An example memo I admire: two lines, the ask first.';
  await page.goto('/');
  await page.getByLabel('What are you working on?').fill(MEMO);
  await page.getByRole('button', { name: 'Attach a draft or diff' }).click();
  await page.getByLabel('Name of attachment 1').fill('Current draft');
  await page.getByLabel('Text of attachment 1').fill('Q3 status: shipped two of three milestones.');
  await page.getByRole('button', { name: /Get a recommendation/ }).click();
  await expect(page).toHaveURL(/\/recommend\//, { timeout: 60_000 });
  await expect(page.locator('#proposal-title')).toHaveText('Memo Polish', { timeout: 60_000 });

  // Start attachments come back with "Change".
  await page.getByRole('link', { name: 'Change' }).click();
  await expect(page.getByLabel('What are you working on?')).toHaveValue(MEMO);
  await expect(page.getByLabel('Text of attachment 1')).toHaveValue('Q3 status: shipped two of three milestones.');
  await expect(page.getByLabel('Name of attachment 1')).toHaveValue('Current draft');
  await page.goBack();
  await expect(page.locator('#proposal-title')).toHaveText('Memo Polish', { timeout: 60_000 });

  // An example survives a trip to Settings and back.
  await page.getByRole('button', { name: 'Paste an example' }).click();
  await page.getByLabel('Example 1').fill(example);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.goBack();
  await expect(page.locator('#proposal-title')).toHaveText('Memo Polish', { timeout: 60_000 });
  await expect(page.getByLabel('Example 1')).toHaveValue(example);
  await page.getByRole('button', { name: 'Paste an example' }).click();
  await page.getByLabel('Example 2').fill('A second one.');
  await expect(page.getByLabel('Example 1')).toHaveValue(example);

  // Starting the run uses them and clears what was kept.
  await page.getByRole('button', { name: /^Start/ }).click();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]+$/, { timeout: 60_000 });
  const kept = await page.evaluate(() => Object.keys(window.sessionStorage).filter((k) => /^byway\.(examples|start-)/.test(k)));
  expect(kept).toEqual([]);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel run' }).click();
  await expect(page.locator('.run-status')).toHaveText('Cancelled');
});

// F05 (a): the review's acceptance named these and the 2026-10-18 trace found them unwritten.
test.describe('the review’s acceptance cases for F06 and F15, not covered above', () => {
  test('on-screen copy you change survives looking at earlier steps, Esc and a reload, and is what is sent (F06)', async ({ page }) => {
    await describeProblem(page, 'A 30-second video ad for a neighbourhood bakery');
    await startRecommended(page, 'Ad Video Chain');
    // Ad Video Chain asks for its on-screen copy late, as labelled fields (view/onscreen.ts); other questions come first.
    let t: Turn | undefined;
    let after: string | undefined;
    for (let i = 0; i < 30 && !t; i++) {
      const next = await turnAfter(page, after);
      if (next.kind === 'write' && (await next.turn.locator('.onscreen-copy').count()) > 0) t = next;
      else await answerTurn(page, next.turn, next.kind);
      after = next.id;
    }
    if (!t) throw new Error('Ad Video Chain asked for no on-screen copy.');
    const words = 'F06 sentinel: fresh bread before the city wakes';
    const first = () => (t as Turn).turn.locator('.onscreen-copy input').first();
    await first().fill(words);

    await inspectEarlierStep(page);
    await expect(first()).toHaveValue(words);
    await inspectAndEscape(page);
    await expect(first()).toHaveValue(words);
    await page.reload();
    await expect(first()).toHaveValue(words);

    const posted = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/checkpoints/'));
    await t.turn.locator('.turn-foot button.button-primary').click();
    expect(((await posted).postDataJSON() as { text?: string }).text?.split('\n')[0]).toMatch(new RegExp(`: ${words}$`));
    await expect(t.turn).toHaveCount(0, { timeout: 30_000 });
    await cancelRun(page);
  });

  test('a Choose highlight survives opening the current row as a step and closing it, but not a reload (F06, UX-1)', async ({ page }) => {
    // Series Writer from the Library has no route chosen up front, so the run asks who writes the first draft (choose).
    await page.goto('/library');
    await page.getByRole('link', { name: /Use this recipe\s*: Series Writer/ }).click();
    await page.getByLabel('What are you working on?').fill('A weekly newsletter about cycling in the city, for people who commute by bike');
    await page.getByRole('button', { name: /Continue/ }).click();
    await startRecommended(page, 'Series Writer');
    const t = await untilTurn(page, ['choose']);
    const radios = t.turn.locator('input[type="radio"]');
    const value = (await radios.last().getAttribute('value')) ?? '';
    await radios.last().check();

    await currentRowTwice(page);
    await expect(t.turn.locator(`input[value="${value}"]`)).toBeChecked();
    // Kept in memory only: restored after a reload, it would let a stray Enter go a way the person only looked at.
    await page.reload();
    await expect(t.turn).toBeVisible();
    await expect(t.turn.locator('input[type="radio"]:checked')).toHaveCount(0);
    await cancelRun(page);
  });

  test('Nav’s count: an answer for the page left behind never puts back a count that has since changed (F15)', async ({ page }) => {
    const held: { route: Route | null } = { route: null };
    await page.route('**/api/waiting', async (route) => {
      if (held.route === null) {
        held.route = route;
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 2 }) });
    });
    const nav = page.getByRole('navigation', { name: 'Main' });
    const count = nav.getByRole('link', { name: /History/ }).locator('.count');
    await page.goto('/library');
    await expect.poll(() => held.route !== null).toBe(true);
    // Another page: Nav re-reads the count for it, and that answer is the one shown.
    await nav.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(count).toHaveText(/^2\b/);
    // The first page's request answers only now, with a count that is no longer true.
    try {
      await held.route?.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 7 }) });
    } catch {
      // Nav gave up on it when the page changed.
    }
    await staysTrue(page, 2500, async () => /^2\b/.test(((await count.textContent()) ?? '').trim()), 'an older answer put back its count');
  });
});
