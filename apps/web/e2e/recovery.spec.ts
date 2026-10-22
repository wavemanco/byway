/**
 * Recovering the Recommendation screen after the model was refused (F14, ADR-0082). The demo's mock provider costs
 * nothing, so the workspace is made to run out on purpose: one synthetic $1 spend line goes into the suite's own
 * ledger through the Ledger class (which holds the cross-process lock and the hash chain; never a raw file write), and
 * the workspace cap is set to a cent. Then the person raises the cap and tries again, without reloading.
 *
 * This spec runs in its own Playwright project, after every other one (playwright.config.ts), because the spend line it
 * leaves would change what later specs see. It needs the suite's data directory, so it is skipped against an external
 * BYWAY_E2E_BASE_URL without BYWAY_E2E_DATA_DIR. The original cap is restored whatever happens.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { PRESENTATIONS } from '@byway/catalog';
import { Ledger } from '@byway/gateway';
import { describeProblem } from './flow.ts';

const dataDir = process.env.BYWAY_E2E_DATA_DIR;
const ledgerPath = dataDir ? path.join(dataDir, 'ledger.jsonl') : '';
const REFUSED = 'byway could not recommend a recipe';

test.skip(!dataDir, 'Needs the suite’s own data directory (BYWAY_E2E_DATA_DIR) to add a spend line.');

/** The workspace the demo has been spending in, read from the ledger it wrote. */
function workspaceId(): string | undefined {
  if (!existsSync(ledgerPath)) return undefined;
  const lines = readFileSync(ledgerPath, 'utf8').split('\n').filter((l) => l.trim());
  for (const line of lines.reverse()) {
    const id = (JSON.parse(line) as { workspaceId?: string }).workspaceId;
    if (id) return id;
  }
  return undefined;
}

async function workspaceCap(page: Page): Promise<number> {
  await page.goto('/settings');
  return Number(await page.getByLabel('Workspace budget in dollars').inputValue());
}

/** Sets the workspace cap the way Settings does (PATCH /api/settings), from the page, so the request is same-origin. */
async function setCap(page: Page, usd: number): Promise<void> {
  const status = await page.evaluate(
    (value) => fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceBudgetUsd: value }) }).then((r) => r.status),
    usd,
  );
  expect(status).toBe(200);
}

const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const recipeIdOf = (name: string) => PRESENTATIONS.find((p) => p.name === name)?.recipeId;

let originalCap = 0;

test.beforeAll(async ({ browser, baseURL }) => {
  const page = await browser.newPage(baseURL ? { baseURL } : {});
  originalCap = await workspaceCap(page);
  if (!workspaceId()) {
    // A fresh server has not called the (mock) model yet; one recommendation writes the first ledger line.
    await describeProblem(page, 'A short note to my team about the new rota');
    await expect(page.locator('#proposal-title')).toBeVisible({ timeout: 60_000 });
  }
  const ws = workspaceId();
  if (!ws) throw new Error('The ledger has no workspace to add spend to.');
  await new Ledger({ path: ledgerPath }).append({
    workspaceId: ws,
    purpose: 'e2e.synthetic-existing-spend',
    kind: 'completion',
    provider: 'mock',
    requestedModel: 'mock-mid',
    servedModel: 'mock-mid',
    usage: { inputTokens: 0, outputTokens: 0 },
    costUsd: 1,
    latencyMs: 0,
    requestSha256: `sha256:${'a'.repeat(64)}`,
    responseSha256: `sha256:${'b'.repeat(64)}`,
  });
  await page.close();
});

test.afterEach(async ({ page }) => {
  await page.goto('/settings');
  await setCap(page, originalCap);
});

test('F14: after a refused recommendation, Try again shows the stored recommendation with its reasons, and Start sends it', async ({ page }) => {
  await page.goto('/settings');
  await setCap(page, 0.01);
  // The page's render only reads what is stored: the first recommendation is the screen's own request, once it is
  // shown, and that is what is refused here (F03).
  const firstAsk = page.waitForResponse((r) => r.url().endsWith('/recommend') && r.request().method() === 'POST');
  await describeProblem(page, 'A landing page for the spring classes at my pottery studio');
  expect((await firstAsk).status()).toBeGreaterThanOrEqual(400);
  await expect(page.getByRole('heading', { name: REFUSED })).toBeVisible({ timeout: 60_000 });

  // Still refused: the panel stays, with the new message. The retry's answer is awaited before the cap changes: the
  // heading is on screen from before the press, and a retry still on its way when the cap is raised is admitted under
  // the raised cap, so the panel and its Try again button go (seen on GitHub's 2-CPU Windows machine).
  const refusedAgain = page.waitForResponse((r) => r.url().endsWith('/recommend') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Try again' }).first().click();
  expect((await refusedAgain).status()).toBeGreaterThanOrEqual(400);
  await expect(page.getByRole('button', { name: 'Try again' }).first()).toBeEnabled();
  await expect(page.getByRole('heading', { name: REFUSED })).toBeVisible();
  await expect(page.locator('#proposal-title')).toHaveCount(0);

  // Raise the cap elsewhere (as Settings would), then try again on this same screen.
  await setCap(page, originalCap);
  await page.getByRole('button', { name: 'Try again' }).first().click();
  await expect(page.locator('#proposal-title')).toHaveText('Landing Page Studio');
  await expect(page.locator('.proposal-kicker')).not.toContainText('Your choice');
  await expect(page.getByRole('heading', { name: 'Why this recipe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How byway decided' })).toBeVisible();
  await expect(page.locator('.start-bar-help')).toContainText(`${usd(originalCap - 1)} left in your workspace`);

  // A later chooser flip re-routes from the recovered recommendation.
  await page.locator('.chooser-q[data-deciding="true"] [role="switch"]').click();
  await expect(page.locator('#proposal-title')).not.toHaveText('Landing Page Studio');
  const shown = ((await page.locator('#proposal-title').textContent()) ?? '').trim();

  // Start sends the recipe that is shown (the request is stopped before a run starts).
  const sent: { body?: { recipeId?: string } } = {};
  await page.route('**/api/runs', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    sent.body = route.request().postDataJSON() as { recipeId?: string };
    await route.abort();
  });
  await page.getByRole('button', { name: /^Start/ }).click();
  await expect.poll(() => sent.body).toBeDefined();
  expect(sent.body?.recipeId).toBe(recipeIdOf(shown));
});

test('F14: Build my own while the recommendation is refused shows your recipe, asks the model nothing behind your back, and Try again stays offered', async ({ page }) => {
  await page.goto('/settings');
  await setCap(page, 0.01);
  await describeProblem(page, 'Tighten my quarterly status memo for the leadership team before Friday');
  await expect(page.getByRole('heading', { name: REFUSED })).toBeVisible({ timeout: 60_000 });
  const intakePath = new URL(page.url()).pathname;
  await setCap(page, originalCap);

  // The screen applies each command's whole result itself and never re-runs its server render (ADR-0082). That render
  // now only reads what is stored, so a re-render would ask the model nothing either; nothing on the screen makes one.
  const rerenders: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === intakePath && r.headers()['rsc'] !== undefined) rerenders.push(r.url());
  });
  await page.getByRole('button', { name: 'Build my own' }).click();
  await expect(page.locator('.proposal-kicker')).toContainText('Your recipe');
  await expect(page.locator('#proposal-title')).toBeVisible();
  const retry = page.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeVisible();
  expect(rerenders).toEqual([]);

  // Trying again recovers the recommendation and keeps the recipe you built on screen.
  await retry.click();
  await expect(page.getByRole('heading', { name: 'Why this recipe' })).toBeVisible();
  await expect(page.locator('.proposal-kicker')).toContainText('Your recipe');
  await page.getByRole('button', { name: 'Back to the recommendation' }).click();
  await expect(page.locator('#proposal-title')).toHaveText('Memo Polish');
  expect(rerenders).toEqual([]);
});
