/**
 * The suite's own turn helpers (flow.ts), on a page of their own: a "Your turn" panel can go at any moment (the run
 * moved on, or finished), and a helper that then waits a minute for it fails a run that is done. Here the last panel
 * goes exactly between being found and being read, deterministically: the page is wrapped so that reading the panel's
 * checkpoint id removes the panel and shows the run as done.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { answerUntilDone } from './flow.ts';

/** `page`, whose locators remove the turn panel and show "done" right after its checkpoint id `id` is read. */
function vanishingOnRead(page: Page, id: string): Page {
  let fired = false;
  const wrap = (loc: Locator): Locator =>
    new Proxy(loc, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target) as unknown;
        if (prop === 'first' || prop === 'last' || prop === 'nth' || prop === 'locator') {
          return (...args: unknown[]) => wrap((value as (...a: unknown[]) => Locator).apply(target, args));
        }
        if (prop === 'getAttribute') {
          return async (name: string, options?: { timeout?: number }) => {
            const got = await target.getAttribute(name, options);
            if (!fired && name === 'data-checkpoint' && got === id) {
              fired = true;
              await page.evaluate(() => {
                document.querySelector('section.turn')?.remove();
                const done = document.createElement('section');
                done.className = 'state-done';
                done.textContent = 'Your text is ready.';
                document.body.append(done);
              });
            }
            return got;
          };
        }
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
  return new Proxy(page, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown;
      if (prop === 'locator') return (...args: unknown[]) => wrap((value as (...a: unknown[]) => Locator).apply(target, args));
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}

test('answerUntilDone ends when the last turn goes between being found and being read, instead of waiting for it', async ({ page }) => {
  // Well under the one-minute action timeout a helper would wait on a panel that is gone.
  test.setTimeout(30_000);
  await page.setContent('<main><section class="turn" data-checkpoint="cp-2" data-kind="confirm"><h2>One last question?</h2></section></main>');
  const started = Date.now();
  const answered = await answerUntilDone(vanishingOnRead(page, 'cp-2'), { after: 'cp-1', stepTimeoutMs: 20_000 });
  expect(answered).toEqual([]);
  expect(Date.now() - started).toBeLessThan(15_000);
});
