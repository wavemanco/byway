/**
 * Opening and reading artifacts in the real app, on runs seeded into the suite's own store (e2e/seed.ts).
 *
 * F05 (ADR-0085): every "Open" lands on the whole-artifact viewer with the page's scripts off, and nothing reaches the
 * collector (another site) unless the person turns scripts on; even then the page cannot carry itself away. A reload
 * turns scripts off; a frame that reloads itself comes back without them. A page's own address, opened top-level, runs
 * nothing.
 *
 * F13 (ADR-0086): decision views show whole text, not the Run screen's 16 KB excerpt, and row facts count the whole
 * artifact.
 */
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { startCollector, type Collector } from './collector.ts';
import { ENDING_A, ENDING_B, MEMO_TAIL, RAN, seed, seedDataDir, unseed, type Seeded } from './seed.ts';

test.skip(!seedDataDir(), 'Needs the suite’s own data directory (BYWAY_E2E_DATA_DIR) to seed runs.');

let collector: Collector;
let seeded: Seeded | undefined;

test.beforeAll(async () => {
  collector = await startCollector();
  seeded = await seed(collector.origin);
});

test.afterAll(async () => {
  await unseed(seeded);
  await collector?.close();
});

test.beforeEach(async ({ context }) => {
  collector.clear();
  // Messages a page frame posts to the screen showing it (the hostile page says it ran), recorded from the start.
  await context.addInitScript(() => {
    const w = window as unknown as { __messages?: string[] };
    w.__messages = [];
    window.addEventListener('message', (e) => w.__messages?.push(String(e.data))); // nosemgrep: javascript.browser.security.insufficient-postmessage-origin-validation.insufficient-postmessage-origin-validation -- a test's recorder: it only stores the text any frame posts, so the test can see a hostile page ran; nothing acts on it
  });
});

function data(): Seeded {
  if (!seeded) throw new Error('not seeded');
  return seeded;
}

const view = (id: string) => `/view/${encodeURIComponent(id)}`;
const messages = (page: Page) => page.evaluate(() => (window as unknown as { __messages?: string[] }).__messages ?? []);
/** Long enough for a script or the hostile page's one-second meta refresh to have reached the collector. */
const settle = (page: Page) => page.waitForTimeout(2000);

/** Clicks a link that opens a new tab and returns the tab, loaded. */
async function opens(context: BrowserContext, link: Locator): Promise<Page> {
  const tab = context.waitForEvent('page');
  await link.click();
  const page = await tab;
  await page.waitForLoadState();
  return page;
}

/** The viewer showing a page: in a frame with scripts off, asking for none; nothing has left. */
async function expectInertViewer(tab: Page, id: string): Promise<void> {
  expect(new URL(tab.url()).pathname).toBe(view(id));
  const frame = tab.locator('.page-frame iframe');
  await expect(frame).toHaveAttribute('sandbox', '');
  expect(await frame.getAttribute('src')).toBe(`/artifacts/${encodeURIComponent(id)}`);
  await expect(tab.getByRole('button', { name: 'Run the page’s scripts' })).toHaveAttribute('aria-pressed', 'false');
  await settle(tab);
  expect(await messages(tab)).toEqual([]);
  expect(collector.hits()).toEqual([]);
}

async function openStep(page: Page, label: string): Promise<Locator> {
  await page.locator('.tl-title', { hasText: label }).click();
  const detail = page.locator('section.detail');
  await expect(detail.locator('#detail-title')).toHaveText(label);
  return detail;
}

test.describe('every Open goes to the viewer, with the page’s scripts off (F05)', () => {
  test('a step’s Open, and a link to a page in a memo', async ({ page, context }) => {
    await page.goto(`/runs/${data().done.runId}`);
    const detail = await openStep(page, 'Hostile page');
    const tab = await opens(context, detail.locator('.detail-item-head a'));
    await expectInertViewer(tab, data().hostile);
    await tab.close();

    const memo = await openStep(page, 'Long memo');
    const fromMemo = await opens(context, memo.getByRole('link', { name: 'the draft page' }));
    await expectInertViewer(fromMemo, data().hostile);
  });

  test('a draft’s Open on a pick, for a page and for text', async ({ page, context }) => {
    await page.goto(`/runs/${data().pick.runId}`);
    const turn = page.locator('section.turn');
    const pageTab = await opens(context, turn.getByRole('link', { name: /^Open full size\W+Draft one$/ }));
    await expectInertViewer(pageTab, data().hostile);
    const textTab = await opens(context, turn.getByRole('link', { name: /^Open the whole text\W+Draft two$/ }));
    expect(new URL(textTab.url()).pathname).toBe(view(data().memoA));
    await expect(textTab.locator('.result-body')).toContainText(ENDING_A);
  });

  test('a reference’s Open', async ({ page, context }) => {
    await page.goto(`/runs/${data().react.runId}`);
    const tab = await opens(context, page.locator('section.turn .refs-open'));
    await expectInertViewer(tab, data().hostile);
  });

  test('the Result screen’s “Open in a new tab”, beside a download that says what a downloaded page does', async ({ page, context }) => {
    await page.goto(`/runs/${data().done.runId}/result`);
    await expect(page.locator('.result-actions')).toContainText('A downloaded page runs its scripts when you open it from your computer.');
    const tab = await opens(context, page.getByRole('link', { name: 'Open in a new tab' }));
    await expectInertViewer(tab, data().hostile);
  });
});

test.describe('the viewer’s scripts switch (F05)', () => {
  test('turned on, the page runs in a frame that asked for its scripts, and still cannot leave; a reload turns it off', async ({ page }) => {
    await page.goto(view(data().hostile));
    const frame = page.locator('.page-frame iframe');
    await expect(frame).toHaveAttribute('sandbox', '');
    await page.getByRole('button', { name: 'Run the page’s scripts' }).click();
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
    expect(await frame.getAttribute('src')).toBe(`/artifacts/${encodeURIComponent(data().hostile)}?scripts=1`);
    await expect.poll(() => messages(page)).toContain(RAN);
    await settle(page);
    // Its script and its meta refresh both tried to leave; frame-src 'self' kept the frame inside byway.
    expect(collector.hits()).toEqual([]);

    await page.reload();
    await expect(frame).toHaveAttribute('sandbox', '');
    expect(await frame.getAttribute('src')).toBe(`/artifacts/${encodeURIComponent(data().hostile)}`);
    await expect(page.getByRole('button', { name: 'Run the page’s scripts' })).toHaveAttribute('aria-pressed', 'false');
    await settle(page);
    expect(await messages(page)).toEqual([]);
    expect(collector.hits()).toEqual([]);
  });

  test('a page that reloads itself once its scripts are on comes back without them (fails closed)', async ({ page }) => {
    await page.goto(view(data().reloader));
    await page.getByRole('button', { name: 'Run the page’s scripts' }).click();
    await expect.poll(() => messages(page)).toContain('ran:first');
    await settle(page);
    expect(await messages(page)).not.toContain('ran:again');
    expect(collector.hits()).toEqual([]);
    // The switch still reads on over a frame the server served inert (ADR-0085): off and on again asks afresh.
    await expect(page.getByRole('button', { name: 'Run the page’s scripts' })).toHaveAttribute('aria-pressed', 'true');
  });
});

test('a page’s own address, opened top-level, runs nothing, with or without ?scripts=1 (F05)', async ({ page }) => {
  for (const suffix of ['', '?scripts=1']) {
    const res = await page.goto(`/artifacts/${encodeURIComponent(data().hostile)}${suffix}`);
    expect(res?.headers()['content-security-policy']).toMatch(/(^|; )sandbox$/);
    await settle(page);
  }
  expect(await messages(page)).toEqual([]);
  expect(collector.hits()).toEqual([]);
});

test.describe('decision views show whole text, and row facts count the whole artifact (F13)', () => {
  test('a compare of two long memos that differ only in their endings shows both endings', async ({ page }) => {
    await page.goto(`/runs/${data().compare.runId}`);
    const columns = page.locator('.compare-col');
    await expect(columns).toHaveCount(2);
    await expect(columns.nth(0)).toContainText(ENDING_A);
    await expect(columns.nth(1)).toContainText(ENDING_B);
  });

  test('a long memo is whole in its step and in the viewer; a big diff’s row counts every file', async ({ page, context }) => {
    await page.goto(`/runs/${data().done.runId}`);
    await expect(page.locator('.tl-step', { hasText: 'Big diff' }).locator('.thumb-diff')).toContainText('12 files, +480 −480');
    const detail = await openStep(page, 'Long memo');
    await expect(detail).toContainText(MEMO_TAIL);
    const tab = await opens(context, detail.locator('.detail-item-head a'));
    await expect(tab.locator('.result-body')).toContainText(MEMO_TAIL);
  });
});
