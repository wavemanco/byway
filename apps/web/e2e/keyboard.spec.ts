/**
 * The keyboard and focus through state changes, in a real browser (R5). The ARIA in the components is static markup;
 * what it does when a control starts something, is refused, or a view closes only shows here:
 * - a control that starts something keeps focus while it is on its way and after it is refused, and a second press
 *   sends nothing (useAction and ActionButton): the checkpoint panels, Start, the paid Start button, Build my own, the
 *   examples' image input, and "Choose all" / "Clear", which make themselves unavailable;
 * - closing a step opened from the timeline returns focus to the row that opened it;
 * - cases other work owns: a draft that survives opening a step (F06) and the viewer's scripts switch (F05), both
 *   merged, as plain tests; and, as owner-tagged expected failures that assert today's specific outcome, the compare
 *   view of two pages (F13 compare view) and a page's links after its copy is edited (F07). Each expected failure
 *   returns early (and so goes red) unless it sees exactly today's outcome, and goes red when the owner's fix lands,
 *   which forces it to become a plain test.
 *
 * Sends are refused in the browser (page.route), so no seeded question is ever answered and no run is started here,
 * except the F07 case's own Landing Page Studio run in demo mode.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNamedControls, focusedDescription, tabTo } from './a11y.ts';
import { answerTurn, answerUntilDone, describeProblem, startRecommended, turnAfter } from './flow.ts';
import { KB, seedKeyboard, unseedKeyboard, type KeyboardSeed } from './keyboard-seed.ts';
import { seedDataDir } from './seed.ts';

test.skip(!seedDataDir(), 'Needs the suite’s own data directory (BYWAY_E2E_DATA_DIR) to seed runs.');

let seeded: KeyboardSeed | undefined;

test.beforeAll(async () => {
  seeded = await seedKeyboard();
});

test.afterAll(async () => {
  await unseedKeyboard(seeded);
});

function data(): KeyboardSeed {
  if (!seeded) throw new Error('not seeded');
  return seeded;
}

/** How long a refused POST takes to come back: long enough to look at the control while it is busy. */
const SLOW_MS = 1500;

/**
 * Refuses every POST to a matching path after SLOW_MS, with `message`; counts them. Other methods pass through. `off`
 * lets requests through again.
 */
async function refuseSlowly(page: Page, path: (pathname: string) => boolean, message: string): Promise<{ count(): number; off(): Promise<void> }> {
  let count = 0;
  const matches = (url: URL) => path(url.pathname);
  await page.route(matches, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    count++;
    await new Promise((r) => setTimeout(r, SLOW_MS));
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: message }) });
  });
  return { count: () => count, off: () => page.unroute(matches) };
}

/** `control` has keyboard focus; fails with what has it instead (BODY when focus fell to the page). */
async function expectFocus(page: Page, control: Locator): Promise<void> {
  await expect
    .poll(async () => ((await control.evaluate((el) => el === document.activeElement)) ? 'focused' : `not focused; focus is on ${await focusedDescription(page)}`), { timeout: 5000 })
    .toBe('focused');
}

/** Waits until `sends` has seen `n` requests and the screen has re-rendered for them (the refusal comes SLOW_MS later). */
async function whileOnItsWay(page: Page, sends: { count(): number }, n = 1): Promise<void> {
  await expect.poll(() => sends.count()).toBe(n);
  await page.waitForTimeout(250);
}

/**
 * Presses Enter on `control`, then Enter again while its action is on its way; the action is refused after SLOW_MS
 * with `refusal`. Focus stays on the control throughout, it says it is busy, and only one request was made.
 */
async function pressTwiceWhileRefused(page: Page, control: Locator, sends: { count(): number }, refusal: string): Promise<void> {
  await control.focus();
  await page.keyboard.press('Enter');
  await whileOnItsWay(page, sends);
  await expectFocus(page, control);
  await expect(control).toHaveAttribute('aria-busy', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: refusal })).toBeVisible();
  await expectFocus(page, control);
  await expect(control).not.toHaveAttribute('aria-busy', 'true');
  expect(sends.count(), 'requests sent for two presses').toBe(1);
}

const turn = (page: Page) => page.locator('section.turn');

test.describe('a control that starts something keeps focus, and a second press sends nothing (R5)', () => {
  test('Yes on a confirm, pressed with Enter twice, while the answer is on its way and after it is refused', async ({ page }) => {
    const { runId } = data().confirm;
    const sends = await refuseSlowly(page, (p) => p.startsWith(`/api/runs/${runId}/checkpoints/`), 'e2e: that answer was not sent');
    await page.goto(`/runs/${runId}`);
    await expectNamedControls(turn(page));
    await pressTwiceWhileRefused(page, turn(page).getByRole('button', { name: 'Yes', exact: true }), sends, 'e2e: that answer was not sent');
    // The other answer is still there to give.
    await expect(turn(page).getByRole('button', { name: 'No', exact: true })).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('Send reaction, pressed with Enter twice; the words stay', async ({ page }) => {
    const { runId } = data().react;
    const words = 'R5 sentinel: warmer, and the ask first.';
    const sends = await refuseSlowly(page, (p) => p.startsWith(`/api/runs/${runId}/checkpoints/`), 'e2e: that reaction was not sent');
    await page.goto(`/runs/${runId}`);
    await turn(page).locator('textarea').fill(words);
    await pressTwiceWhileRefused(page, turn(page).locator('.turn-foot button.button-primary'), sends, 'e2e: that reaction was not sent');
    await expect(turn(page).locator('textarea')).toHaveValue(words);
  });

  test('“Choose all” and “Clear” keep focus when pressing them leaves nothing for them to do', async ({ page }) => {
    await page.goto(`/runs/${data().select.runId}`);
    const boxes = turn(page).locator('input[type="checkbox"]');
    const all = turn(page).getByRole('button', { name: 'Choose all' });
    const clear = turn(page).getByRole('button', { name: 'Clear' });
    await expectNamedControls(turn(page));
    await all.focus();
    await page.keyboard.press('Enter');
    for (const box of await boxes.all()) await expect(box).toBeChecked();
    await expectFocus(page, all);
    await expect(all).toHaveAttribute('aria-disabled', 'true');
    // Still in the Tab order: the next stop is Clear.
    await page.keyboard.press('Tab');
    await expectFocus(page, clear);
    await page.keyboard.press('Enter');
    for (const box of await boxes.all()) await expect(box).not.toBeChecked();
    await expectFocus(page, clear);
    await expect(clear).toHaveAttribute('aria-disabled', 'true');
    // Pressed again while there is nothing to clear: nothing happens, and focus stays.
    await page.keyboard.press('Enter');
    await expectFocus(page, clear);
  });

  test('Start, the paid Start button, Build my own and the examples’ image input', async ({ page }) => {
    // Start: Enter twice on "Get a recommendation" asks once.
    await page.goto('/');
    await page.getByLabel('What are you working on?').fill('Tighten my quarterly status memo for the leadership team before Friday');
    const intakes = await refuseSlowly(page, (p) => p === '/api/intakes', 'e2e: no recommendation this time');
    // Located by place, not name: busy, it reads "Working…".
    await pressTwiceWhileRefused(page, page.locator('form.start button[type="submit"]'), intakes, 'e2e: no recommendation this time');
    await intakes.off();
    await page.getByRole('button', { name: /Get a recommendation/ }).click();
    await expect(page).toHaveURL(/\/recommend\//, { timeout: 60_000 });
    await expect(page.locator('#proposal-title')).toHaveText('Memo Polish', { timeout: 60_000 });
    const intakeId = new URL(page.url()).pathname.split('/').pop() as string;

    // The paid Start button: run start has no server-side idempotency, so a second Enter must not start a second run.
    const runs = await refuseSlowly(page, (p) => p === '/api/runs', 'e2e: the run did not start');
    await pressTwiceWhileRefused(page, page.getByRole('button', { name: /^Start/ }), runs, 'e2e: the run did not start');

    // Build my own.
    const composes = await refuseSlowly(page, (p) => p === `/api/intakes/${intakeId}/compose`, 'e2e: composing failed');
    await expect(page.getByRole('button', { name: 'Build my own' })).toBeVisible();
    // Located by place, not name: busy, it reads "Composing…".
    await pressTwiceWhileRefused(page, page.locator('.compose-actions button'), composes, 'e2e: composing failed');

    // The examples' image input: while an image is being added it keeps focus and opens no second picker.
    const refs = await refuseSlowly(page, (p) => p === '/api/refs', 'e2e: that image was not added');
    const input = page.locator('.file-button input[type="file"]');
    await input.focus();
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('Space');
    await (await chooser).setFiles({ name: 'dot.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
    await whileOnItsWay(page, refs);
    await expectFocus(page, input);
    await expect(input).toHaveAttribute('aria-busy', 'true');
    const second = page.waitForEvent('filechooser', { timeout: 1000 }).then(
      () => true,
      () => false,
    );
    await page.keyboard.press('Space');
    expect(await second, 'a picker opened while the image was being added').toBe(false);
    await expect(page.getByRole('alert').filter({ hasText: 'e2e: that image was not added' })).toBeVisible();
    await expectFocus(page, input);
    expect(refs.count()).toBe(1);
  });
});

/** A 1×1 PNG. */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test.describe('a step opened from the timeline (R5)', () => {
  test('closing it with Escape or Back returns focus to the row that opened it, with no question open', async ({ page }) => {
    await page.goto(`/runs/${data().done.runId}`);
    const row = page.locator('.tl-title', { hasText: KB.memoStep });
    await row.focus();
    await page.keyboard.press('Enter');
    await expectFocus(page, page.locator('#detail-title'));
    await expectNamedControls(page.locator('section.detail'));
    await page.keyboard.press('Escape');
    await expect(page.locator('section.detail')).toHaveCount(0);
    await expectFocus(page, row);

    await page.keyboard.press('Enter');
    await expectFocus(page, page.locator('#detail-title'));
    await page.keyboard.press('Tab');
    await expectFocus(page, page.getByRole('button', { name: /^Back/ }));
    await page.keyboard.press('Enter');
    await expect(page.locator('section.detail')).toHaveCount(0);
    await expectFocus(page, row);
  });

  // F06 (ADR-0082, merged): kept as a keyboard check of the same promise.
  test('[F06] with a question open, a step opened and closed by keyboard gives the turn back with your words, in its field', async ({ page }) => {
    await page.goto(`/runs/${data().reactAfterStep.runId}`);
    const words = 'F06 sentinel: typed, then a step looked at by keyboard.';
    const field = turn(page).locator('textarea');
    await field.fill(words);
    await page.locator('.tl-title', { hasText: KB.earlierStep }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('section.detail')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(turn(page)).toBeVisible();
    await expect(field).toHaveValue(words);
    await expectFocus(page, field);
  });
});

// F05 (ADR-0085, merged): the consent control of the whole-artifact viewer, by keyboard.
test('[F05] the viewer’s scripts switch is reached with Tab, named, and turned on and off with Space', async ({ page }) => {
  await page.goto(`/view/${encodeURIComponent(data().plainPage)}`);
  const toggle = page.getByRole('button', { name: 'Run the page’s scripts' });
  const frame = page.locator('.page-frame iframe');
  await expectNamedControls(page.locator('main'));
  await tabTo(page, toggle);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  await expectFocus(page, toggle);
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(frame).toHaveAttribute('sandbox', '');
  await expectFocus(page, toggle);
});

/**
 * Runs `outcome`, turning any throw (a broken setup) into a value. An expected failure checks that value is exactly
 * today's outcome before its one assertion, so it cannot fail for another reason: any other outcome returns early,
 * the test passes, and test.fail reports that as a failure. A timeout is reported as one too.
 */
async function guarded<T>(outcome: () => Promise<T>): Promise<T | { broken: string }> {
  try {
    return await outcome();
  } catch (e) {
    return { broken: e instanceof Error ? e.message : String(e) };
  }
}

// Owner: F13's compare view (the verification's P2 triage beyond F13's merged human half). Today both pages are
// pictures to assistive technology (aria-hidden, out of the Tab order, clipped to their top) with no way to open either
// whole. This fails only on exactly that, and goes red when the view exposes them.
test.fail('[F13 compare view] each version of a page compare can be opened whole from the keyboard', async ({ page }) => {
  const columns = turn(page).locator('.compare-col');
  const today = await guarded(async () => {
    await page.goto(`/runs/${data().pages.runId}`);
    await expect(columns).toHaveCount(2);
    return Promise.all([0, 1].map(async (i) => ({ links: await columns.nth(i).getByRole('link').count(), hidden: await columns.nth(i).locator('iframe').getAttribute('aria-hidden') })));
  });
  if (JSON.stringify(today) !== JSON.stringify([{ links: 0, hidden: 'true' }, { links: 0, hidden: 'true' }])) return;
  for (const [i, label] of [KB.versionA, KB.versionB].entries()) {
    await expect(columns.nth(i).getByRole('link', { name: new RegExp(label) }), `no way to open ${label} whole`).toHaveCount(1, { timeout: 1000 });
  }
});

/** The nav line the demo page's VOICE editor shows: its two links' text run together (F07's probe E). */
const NAV_LINE = /^\s*How it works\s*Contact\s*$/;
const EDITED_NAV = 'How it works | Contact us';

/** The hrefs of links in `html` with no accessible name (no text, aria-label, title or image alt): a structural check, never an audit. */
function unnamedLinks(page: Page, html: string): Promise<string[]> {
  return page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const has = (s: string | null) => (s ?? '').trim() !== '';
    const named = (a: Element) => has(a.textContent) || has(a.getAttribute('aria-label')) || has(a.getAttribute('title')) || [...a.querySelectorAll('img')].some((img) => has(img.getAttribute('alt')));
    return [...doc.querySelectorAll('a[href]')].filter((a) => !named(a)).map((a) => a.getAttribute('href') ?? '');
  }, html);
}

// Owner: F07 (exact page copy). In demo mode the model's write-back returns the page unchanged, so byway places the
// edited line itself; today it moves the whole line into the first link and leaves the second empty (a link with no
// name, WCAG 2.4.4 and 4.1.2), and the VOICE check accepts it. This fails only on exactly that empty link.
test.fail('[F07] after the nav line of a page is edited, every link on the page still has a name', async ({ page }) => {
  test.setTimeout(8 * 60_000);
  const outcome = await guarded(async () => {
    await describeProblem(page, 'A landing page for the spring classes at my pottery studio');
    const runId = await startRecommended(page, 'Landing Page Studio');
    let after: string | undefined;
    for (let i = 0; i < 30; i++) {
      const t = await turnAfter(page, after);
      after = t.id;
      const field = t.turn.locator('textarea');
      if (t.kind === 'write' && (await field.count()) > 0) {
        const lines = (await field.inputValue()).split('\n');
        const nav = lines.findIndex((l) => NAV_LINE.test(l));
        if (nav >= 0) {
          lines[nav] = EDITED_NAV;
          await field.fill(lines.join('\n'));
          await field.press('Control+Enter');
          await answerUntilDone(page, { after: t.id });
          const run = (await (await page.request.get(`/api/runs/${runId}`)).json()) as { view: { run: { outputArtifactId?: string } } };
          const html = await (await page.request.get(`/artifacts/${encodeURIComponent(run.view.run.outputArtifactId ?? '')}`)).text();
          return { placed: html.includes(EDITED_NAV), unnamed: await unnamedLinks(page, html) };
        }
      }
      await answerTurn(page, t.turn, t.kind);
    }
    return { broken: 'no page-copy question with the nav line' };
  });
  if (!('unnamed' in outcome) || !outcome.placed || JSON.stringify(outcome.unnamed) !== JSON.stringify(['#start'])) return;
  expect(outcome.unnamed, 'links without a name on the placed page').toEqual([]);
});
