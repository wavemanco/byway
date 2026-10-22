/**
 * The keyboard and focus through state changes, in a real browser (R5). The ARIA in the components is static markup;
 * what it does when a control starts something, is refused, or a view closes only shows here:
 * - a control that starts something keeps focus while it is on its way and after it is refused, and a second press
 *   sends nothing (useAction and ActionButton): the checkpoint panels, Start, the paid Start button, Build my own, the
 *   examples' image input, and "Choose all" / "Clear", which make themselves unavailable;
 * - a control that takes itself off the screen moves focus first: Start's attach button, gone at five attachments;
 * - closing a step opened from the timeline returns focus to the row that opened it;
 * - cases other work owns, as plain tests: a draft that survives opening a step (F06), the viewer's scripts switch (F05),
 *   the compare view of two pages (F13 compare view), and a page's links after its copy is edited (F07; an
 *   owner-tagged expected failure until F07's fix landed, ADR-0081).
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

    // The paid Start button: a second Enter while the start is on its way does nothing (the server also keeps one run per
    // Start id, F03 P3, but the screen must not send a second start at all).
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

// A control that takes itself off the screen drops focus to the page just as a disabled one does, and the disabled guard
// cannot see it: Start's attach button goes once five attachments are listed. A note takes its place and says why; it is
// text, not a control, so it takes no focus.
test('Start: each attachment added by keyboard takes focus in its name field, the fifth too, when the attach button goes and a note says why', async ({ page }) => {
  await page.goto('/');
  const actions = page.locator('form.start .start-actions');
  const attach = actions.getByRole('button', { name: /^Attach (a draft or diff|another)$/ });
  const limit = actions.getByText('byway takes up to five attachments for one problem.', { exact: true });
  for (let n = 1; n <= 5; n++) {
    await expect(limit).toHaveCount(0);
    await tabTo(page, attach);
    await page.keyboard.press('Enter');
    await expectFocus(page, page.getByRole('textbox', { name: `Name of attachment ${n}`, exact: true }));
  }
  await expect(attach).toHaveCount(0);
  await expect(limit).toBeVisible();
  // Removing one brings the button back in the note's place.
  await page.getByRole('button', { name: 'Remove attachment 5' }).click();
  await expect(limit).toHaveCount(0);
  await expect(attach).toHaveText('Attach another');
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

/** Presses Enter on the focused link, which opens a new tab, and returns that tab, loaded. */
async function enterOpens(page: Page): Promise<Page> {
  const tab = page.context().waitForEvent('page');
  await page.keyboard.press('Enter');
  const opened = await tab;
  await opened.waitForLoadState();
  return opened;
}

/** The whole-artifact viewer showing page `id` in a frame, its scripts off and not asked for (ADR-0085). */
async function expectViewerOff(tab: Page, id: string): Promise<void> {
  expect(new URL(tab.url()).pathname).toBe(`/view/${encodeURIComponent(id)}`);
  const frame = tab.locator('.page-frame iframe');
  await expect(frame).toHaveAttribute('sandbox', '');
  expect(await frame.getAttribute('src')).toBe(`/artifacts/${encodeURIComponent(id)}`);
  await expect(tab.getByRole('button', { name: 'Run the page’s scripts' })).toHaveAttribute('aria-pressed', 'false');
}

// F13's compare view (beyond F13's merged human half), by ADR-0085's and ADR-0086's rules. Each version's preview is a
// picture of the page's first screen, out of the Tab order: it is named for assistive technology, says on screen that it
// is only the first screen, and has its own Open to the whole page in the viewer, scripts off.
test('[F13 compare view] each version of a page compare is a named picture of its first screen, said so, and opens whole from the keyboard', async ({ page }) => {
  const sends = await refuseSlowly(page, (p) => p.startsWith(`/api/runs/${data().pages.runId}/checkpoints/`), 'e2e: nothing is kept here');
  await page.goto(`/runs/${data().pages.runId}`);
  const columns = turn(page).locator('.compare-col');
  await expect(columns).toHaveCount(2);
  await expectNamedControls(turn(page));
  for (const [i, label] of [KB.versionA, KB.versionB].entries()) {
    const column = columns.nth(i);
    const id = data().versions[i] as string;
    await expect(column.getByRole('img', { name: new RegExp(`^${label}: `) })).toHaveCount(1);
    await expect(column).toContainText('Only the first screen of the page shows here');
    const open = column.getByRole('link', { name: new RegExp(label) });
    await expect(open).toHaveCount(1);
    await tabTo(page, open, 60);
    const viewer = await enterOpens(page);
    await expectViewerOff(viewer, id);
    await viewer.close();
    await expectFocus(page, open);
  }

  // Flipped, the version shown has its Open, and only it.
  await turn(page).locator('.segmented').getByRole('button', { name: 'Flip' }).click();
  for (const [i, label] of [KB.versionA, KB.versionB].entries()) {
    const open = turn(page).locator('.compare-flip').getByRole('link');
    await expect(open).toHaveCount(1);
    await expect(open).toHaveAccessibleName(new RegExp(label));
    await expect(turn(page).locator('.compare-flip').getByRole('img')).toHaveAccessibleName(new RegExp(`^${label}: `));
    await open.focus();
    const viewer = await enterOpens(page);
    await expectViewerOff(viewer, data().versions[i] as string);
    await viewer.close();
    if (i === 0) await turn(page).locator('.compare-bar > button.button', { hasText: 'Flip' }).click();
  }
  expect(sends.count(), 'answers sent').toBe(0);
});

/** The demo page's nav, as its VOICE editor offers it: one line per link (ADR-0081). */
const NAV_LINES = ['How it works', 'Contact'];
const EDITED_CONTACT = 'Contact us';

/** The hrefs of links in `html` with no accessible name (no text, aria-label, title or image alt): a structural check, never an audit. */
function unnamedLinks(page: Page, html: string): Promise<string[]> {
  return page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const has = (s: string | null) => (s ?? '').trim() !== '';
    const named = (a: Element) => has(a.textContent) || has(a.getAttribute('aria-label')) || has(a.getAttribute('title')) || [...a.querySelectorAll('img')].some((img) => has(img.getAttribute('alt')));
    return [...doc.querySelectorAll('a[href]')].filter((a) => !named(a)).map((a) => a.getAttribute('href') ?? '');
  }, html);
}

/** The words of the first link to `href` in `html`, whitespace collapsed, or null when there is none. */
function linkWords(page: Page, html: string, href: string): Promise<string | null> {
  return page.evaluate(
    ([source, target]) => {
      const doc = new DOMParser().parseFromString(source, 'text/html');
      const a = [...doc.querySelectorAll('a[href]')].find((x) => x.getAttribute('href') === target);
      return a ? (a.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
    },
    [html, href] as const,
  );
}

// Owner: F07 (exact page copy, ADR-0081). The demo page's nav is offered one line per link, and an edit to the second
// link's words is written into that link, so every link on the page keeps a name. Before F07's fix an edited nav line was
// moved whole into the first link and the second left empty, a link with no name (WCAG 2.4.4 and 4.1.2), and VOICE's
// check accepted it; this was an expected failure until then.
test('[F07] after a nav link of a page is edited, every link on the page still has a name', async ({ page }) => {
  test.setTimeout(8 * 60_000);
  await describeProblem(page, 'A landing page for the spring classes at my pottery studio');
  const runId = await startRecommended(page, 'Landing Page Studio');
  let after: string | undefined;
  for (let i = 0; i < 30; i++) {
    const t = await turnAfter(page, after);
    after = t.id;
    const field = t.turn.locator('textarea');
    if (t.kind === 'write' && (await field.count()) > 0) {
      const lines = (await field.inputValue()).split('\n');
      const nav = lines.findIndex((l, k) => l.trim() === NAV_LINES[0] && lines[k + 1]?.trim() === NAV_LINES[1]);
      if (nav >= 0) {
        lines[nav + 1] = EDITED_CONTACT;
        await field.fill(lines.join('\n'));
        await field.press('Control+Enter');
        await answerUntilDone(page, { after: t.id });
        const run = (await (await page.request.get(`/api/runs/${runId}`)).json()) as { view: { run: { outputArtifactId?: string } } };
        const html = await (await page.request.get(`/artifacts/${encodeURIComponent(run.view.run.outputArtifactId ?? '')}`)).text();
        expect(await linkWords(page, html, '#start'), 'the edited link holds the new words').toBe(EDITED_CONTACT);
        expect(await linkWords(page, html, '#how'), 'the other link keeps its words').toBe(NAV_LINES[0]);
        expect(await unnamedLinks(page, html), 'links without a name on the placed page').toEqual([]);
        return;
      }
    }
    await answerTurn(page, t.turn, t.kind);
  }
  throw new Error('The run asked no page-copy question with the nav lines.');
});
