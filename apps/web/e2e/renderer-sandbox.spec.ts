/**
 * Settings' switch for the page renderer's OS sandbox, end to end in demo mode (ADR-0105). byway starts with the sandbox
 * on (scripts/e2e.ts requires the start-up line to say so). Turning it off asks first and says the risk; while it is
 * off, every screen carries a banner that links to Settings, and Settings offers to turn it back on, because byway's
 * start-up check found the sandbox could start. All of it by keyboard, with focus where the person is. The suite's
 * other specs draw pages, so the sandbox is put back on after this one, whatever happens in it. No wall-clock waits:
 * only Playwright's own polling of what the page shows.
 */
import { expect, test, type Page } from '@playwright/test';
import { expectNamedControls, tabTo } from './a11y.ts';

const RISK =
  'Turn the sandbox off? With the sandbox off, a malicious page or image, together with a bug in Chromium, could run as you on this computer, next to your API keys and spending records. byway shows a banner on every screen while it is off.';
const OFF_BANNER = "The page renderer's OS sandbox is off, so pages and images byway draws run without it.";

const banner = (page: Page) => page.getByRole('note').filter({ hasText: OFF_BANNER });

test.afterEach(async ({ page }) => {
  // The rest of the suite draws pages with the sandbox on, as byway's default is.
  const res = await page.request.patch('/api/renderer', { data: { osSandbox: true } });
  expect(res.ok()).toBe(true);
});

test("Settings: the page renderer's OS sandbox is on; turning it off asks first, says the risk, and leaves a banner on every screen until it is back on", async ({ page }) => {
  await page.goto('/settings');
  const section = page.locator('#renderer');
  const sandbox = section.getByRole('switch', { name: 'Page renderer’s OS sandbox' });
  await expect(sandbox).toHaveAttribute('aria-checked', 'true');
  await expect(banner(page)).toHaveCount(0);
  // What byway's start-up check found on this computer.
  await expect(section).toContainText("At byway's last start-up, the page renderer drew a test page inside its OS sandbox.");
  await expectNamedControls(section);

  // Asked first, with focus on the answer that changes nothing.
  await tabTo(page, sandbox);
  await page.keyboard.press('Space');
  const confirm = section.getByRole('group', { name: 'Turn the OS sandbox off?' });
  await expect(confirm).toContainText(RISK);
  await expect(confirm.getByRole('button', { name: 'Keep it on' })).toBeFocused();
  await expect(sandbox).toHaveAttribute('aria-checked', 'true');
  // Keep it on: nothing changes, and focus is back on the switch.
  await page.keyboard.press('Enter');
  await expect(confirm).toHaveCount(0);
  await expect(sandbox).toBeFocused();
  await expect(sandbox).toHaveAttribute('aria-checked', 'true');

  // Asked again, and turned off: the danger button is one Shift+Tab back from "Keep it on".
  await page.keyboard.press('Space');
  await expect(confirm.getByRole('button', { name: 'Keep it on' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(confirm.getByRole('button', { name: 'Turn it off' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(sandbox).toHaveAttribute('aria-checked', 'false');
  await expect(sandbox).toBeFocused();
  await expect(section.getByRole('status')).toHaveText('The OS sandbox is off.');

  // While it is off, every screen says so and links to Settings.
  await expect(banner(page)).toBeVisible();
  for (const where of ['/', '/history', '/library']) {
    await page.goto(where);
    await expect(banner(page)).toBeVisible();
  }
  await banner(page).getByRole('link', { name: 'Page renderer settings' }).click();
  await expect(page).toHaveURL(/\/settings#renderer$/);

  // byway's start-up check found the sandbox could start here, so Settings offers to turn it back on.
  await expect(section).toContainText("At byway's last start-up, the OS sandbox could start on this computer.");
  const offer = section.getByRole('button', { name: 'Turn the sandbox back on' });
  await tabTo(page, offer);
  await page.keyboard.press('Enter');
  await expect(sandbox).toHaveAttribute('aria-checked', 'true');
  // The offer is gone, so focus is on the switch, not the page.
  await expect(offer).toHaveCount(0);
  await expect(sandbox).toBeFocused();
  await expect(banner(page)).toHaveCount(0);

  // Off once more, then on from the switch itself: turning it on asks nothing.
  await page.keyboard.press('Space');
  await expect(confirm.getByRole('button', { name: 'Keep it on' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(sandbox).toHaveAttribute('aria-checked', 'false');
  await expect(sandbox).toBeFocused();
  await expect(banner(page)).toBeVisible();
  await page.keyboard.press('Space');
  await expect(sandbox).toHaveAttribute('aria-checked', 'true');
  await expect(confirm).toHaveCount(0);
  await expect(sandbox).toBeFocused();
  await expect(banner(page)).toHaveCount(0);
});
