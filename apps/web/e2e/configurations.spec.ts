/**
 * The configurations end to end in demo mode (spec §7 Phase 3): each starts from a problem typed on Start, takes the
 * recommended recipe, answers every "Your turn" in the app and ends on the Result screen with the deliverable. The
 * runner, prompts, store and gateway are the real ones; only the models are the gateway's mock.
 */
import http from 'node:http';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { PRESENTATIONS } from '@byway/catalog';
import { answerUntilDone, describeProblem, exportText, openResult, startRecommended, timelineLabels, watchForKeys } from './flow.ts';

interface Case {
  code: string;
  recipeId: string;
  name: string;
  problem: string;
  /** What the deliverable must look like on the Result screen. */
  deliverable(result: Locator, page: Page): Promise<void>;
}

const CASES: Case[] = [
  {
    code: 'C1',
    recipeId: 'c1',
    name: 'Landing Page Studio',
    problem: 'A landing page for the spring classes at my pottery studio',
    async deliverable(result, page) {
      // The page itself, in a sandboxed frame without same-origin access, its scripts off until asked for (SEC-4).
      const frame = result.locator('iframe');
      const note = result.locator('.scripts-note');
      await expect(frame).toHaveAttribute('sandbox', '');
      await expect(page.frameLocator('.result-body iframe').locator('body')).not.toBeEmpty();
      await expect(note).toContainText('A page running its scripts can send what it contains to other sites.');
      await result.getByRole('button', { name: 'Run the page’s scripts' }).click();
      await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
      // The frame asks the route for the page's scripts (F05): the address follows the switch too.
      await expect(frame).toHaveAttribute('src', /\?scripts=1$/);
      await expect(note).toContainText('A page running its scripts can send what it contains to other sites.');
      await expect(page.frameLocator('.result-body iframe').locator('body')).not.toBeEmpty();

      // SEC-4: the choice lasts only while this page is open. Nothing about it is kept in the browser, a reload starts
      // with scripts off, and the switch an earlier byway remembered (byway.pageScripts) turns nothing on, here or on
      // the Run screen's large preview (the re-check's proof of concept).
      const resultUrl = page.url();
      expect(await page.evaluate(() => Object.keys(window.localStorage).filter((k) => /script/i.test(k)))).toEqual([]);
      await page.evaluate(() => window.localStorage.setItem('byway.pageScripts', '1'));
      await page.reload();
      await expect(frame).toHaveAttribute('sandbox', '');
      await page.goto(resultUrl.replace(/\/result$/, ''));
      await expect(page.locator('.state-preview iframe')).toHaveAttribute('sandbox', '');
      for (const f of await page.locator('iframe').all()) await expect(f).toHaveAttribute('sandbox', '');
      await page.goto(resultUrl);
      await expect(frame).toHaveAttribute('sandbox', '');

      // SEC-1: next.config headers apply only in the running server, so the page's own address is checked here. The
      // artifact route sandboxes it; /api/artifacts never serves it, so the page cannot move there to run as byway.
      // F05: at its own address the page is inert, and asking for its scripts without being a same-origin frame (this
      // request sends no Fetch Metadata) changes nothing.
      const src = (await frame.getAttribute('src')) ?? '';
      expect(src).toMatch(/^\/artifacts\/sha256[^?]*$/);
      const own = await page.request.get(src);
      expect(own.headers()['content-security-policy']).toMatch(/(^|; )sandbox$/);
      const asked = await page.request.get(`${src}?scripts=1`);
      expect(asked.headers()['content-security-policy']).toMatch(/(^|; )sandbox$/);
      expect(asked.headers()['cache-control']).toBe('no-store');
      const elsewhere = await page.request.get(`/api${src}`);
      const unsandboxedPage = elsewhere.status() === 200 && (elsewhere.headers()['content-type'] ?? '').startsWith('text/html') && !/sandbox/.test(elsewhere.headers()['content-security-policy'] ?? '');
      expect(unsandboxedPage).toBe(false);
      expect(elsewhere.status()).toBe(404);
    },
  },
  {
    code: 'C4',
    recipeId: 'c4',
    name: 'Memo Polish',
    problem: 'Tighten my quarterly status memo for the leadership team before Friday',
    async deliverable(result) {
      await expect(result.locator('.prose')).toContainText(/\w+ \w+ \w+/);
    },
  },
  {
    code: 'C6a',
    recipeId: 'c6a',
    name: 'Fiction Second Reader',
    problem: 'A short story I am writing about a lighthouse keeper who stops lighting the lamp',
    async deliverable(result) {
      await expect(result.locator('.prose')).toContainText(/\w+ \w+ \w+/);
    },
  },
  {
    code: 'C5',
    recipeId: 'c5',
    name: 'Ad Video Chain',
    problem: 'A 30-second video ad for a neighbourhood bakery',
    async deliverable(result) {
      // The storyboard, each shot with its frame; demo clips are labelled placeholders (ADR-0069).
      const shots = result.locator('.shot');
      await expect(shots.first()).toBeVisible();
      expect(await shots.count()).toBeGreaterThan(1);
      await expect(result.locator('.shot img').first()).toBeVisible();
      await expect(result.locator('.shot figcaption', { hasText: 'Clip' }).first()).toBeVisible();
    },
  },
];

for (const c of CASES) {
  test(`${c.code} ${c.name}: problem to deliverable, every turn answered in the app`, async ({ page }) => {
    const keys = watchForKeys(page);
    await describeProblem(page, c.problem);
    await startRecommended(page, c.name);
    const answered = await answerUntilDone(page);
    test.info().annotations.push({ type: 'turns', description: answered.map((a) => a.kind).join(', ') });
    expect(answered.length).toBeGreaterThan(0);

    // The timeline names steps as the recipe's presentation does, never by protocol codes or step ids.
    const presentation = PRESENTATIONS.find((p) => p.recipeId === c.recipeId);
    const presented = new Set(presentation?.stages.flatMap((s) => s.steps.map((step) => step.label)));
    const labels = await timelineLabels(page);
    expect(labels.length).toBeGreaterThan(1);
    expect(labels.filter((l) => !presented.has(l))).toEqual([]);

    // Demo mode spends nothing: the meter reads the gateway's $0 ledger entries through the run's cost events.
    await expect(page.locator('.meter-spent')).toHaveText('$0.00');

    const result = await openResult(page);
    await c.deliverable(result, page);
    // The export carries its images: nothing in it points back at byway (EXP-1).
    expect(await exportText(page)).not.toContain('/api/artifacts/');

    expect(keys.checked()).toBeGreaterThan(0);
    expect(keys.leaks).toEqual([]);
  });
}

test('C3 from the Library: no route chosen up front, so the run asks who writes the first draft (choose)', async ({ page }) => {
  const keys = watchForKeys(page);
  await page.goto('/library');
  await page.getByRole('link', { name: /Use this recipe\s*: Series Writer/ }).click();
  await page.getByLabel('What are you working on?').fill('A weekly newsletter about cycling in the city, for people who commute by bike');
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page).toHaveURL(/\/recommend\/.+\?recipe=c3/);
  await startRecommended(page, 'Series Writer');
  const answered = await answerUntilDone(page);
  expect(answered.map((a) => a.kind)).toContain('choose');
  await expect(page.locator('.meter-spent')).toHaveText('$0.00');
  const result = await openResult(page);
  await expect(result.locator('.prose')).toContainText(/\w+ \w+ \w+/);
  // Custom imagery's pictures travel inside the Markdown export, not as byway addresses (EXP-1).
  const exported = await exportText(page);
  expect(exported).not.toContain('/api/artifacts/');
  expect(exported).not.toMatch(/\]\(\/artifacts\//);
  expect(keys.leaks).toEqual([]);
});

test('Settings in demo mode: the banner, the demo profile, and providers shown without their keys', async ({ page }) => {
  const keys = watchForKeys(page);
  await page.goto('/settings');
  await expect(page.getByRole('note')).toContainText('Demo mode — sample outputs, no AI calls');
  await expect(page.getByRole('heading', { name: 'Providers' })).toBeVisible();
  await expect(page.locator('.providers')).toContainText('Anthropic');
  // Started with pnpm demo: demo mode is on and cannot be switched off here.
  const demo = page.getByRole('switch', { name: 'Demo mode' });
  await expect(demo).toBeChecked();
  await expect(demo).toBeDisabled();
  expect(keys.checked()).toBeGreaterThan(0);
  expect(keys.leaks).toEqual([]);
});

// C1 (UX-1): a declined optional reads Skipped, with its note, on the Run screen and in the Result's Skipped list (the
// runner emits step-finished { skipped: true } on the optional's id).
test('C4: an optional step you decline reads Skipped, and the Result lists it as not done', async ({ page }) => {
  await describeProblem(page, 'Tighten my quarterly status memo for the leadership team before Friday');
  await startRecommended(page, 'Memo Polish');
  const turn = page.locator('section.turn[data-kind="confirm"]');
  await expect(turn).toBeVisible({ timeout: 120_000 });
  const declined = (await turn.getAttribute('data-checkpoint')) ?? undefined;
  await turn.getByRole('button', { name: 'No', exact: true }).click();
  await answerUntilDone(page, declined ? { after: declined } : {});
  const skipped = page.locator('.tl-step[data-status="skipped"]');
  await expect(skipped.first()).toContainText('You chose not to run this step.');
  await expect(page.locator('.tl-step[data-status="stopped"]')).toHaveCount(0);
  await openResult(page);
  await expect(page.locator('.made-skipped')).toContainText('You chose not to run this step.');
});

test('the local guard refuses a foreign Host on every path, Next.js internals included (SEC-6, DNS rebinding)', async ({ baseURL }) => {
  const { hostname, port } = new URL(baseURL ?? 'http://127.0.0.1:3210');
  // Node's http, because a browser or Playwright's request client sets Host itself.
  const status = (path: string, host: string) =>
    new Promise<number>((resolve, reject) => {
      const req = http.request({ hostname, port: Number(port), path, headers: { host }, agent: false }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end();
    });
  for (const path of ['/', '/settings', '/api/settings', '/__nextjs_launch-editor?file=package.json&lineNumber=1', '/__nextjs_attach-nodejs-inspector', '/_next/image?url=%2Fapi%2Fsettings&w=64&q=75']) {
    expect(await status(path, 'rebind.evil.example'), path).toBe(403);
  }
  expect(await status('/settings', `${hostname}:${port}`)).toBe(200);
});
