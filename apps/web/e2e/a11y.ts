/**
 * Keyboard and accessibility helpers for the keyboard spec (R5). They read what the browser itself exposes (the focused
 * element, the accessibility tree Playwright snapshots), never an audit library: axe stays out of product checks, and
 * generated pages are never audited as a product check (a study instrument, CR12, ADR-0055).
 */
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * What has keyboard focus, for assertions and failure messages: `BODY` when nothing does (focus fell to the page), else
 * the element's tag, role if set, and accessible name as the page gives it (aria-label, aria-labelledby, or its text).
 */
export async function focusedDescription(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return 'BODY';
    const labelledBy = el.getAttribute('aria-labelledby');
    const byIds = labelledBy ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '';
    const name = (el.getAttribute('aria-label') ?? (byIds || el.textContent) ?? '').replace(/\s+/g, ' ').trim();
    const role = el.getAttribute('role');
    return `${el.tagName.toLowerCase()}${role ? `[${role}]` : ''}: ${name}`;
  });
}

/** Roles a person operates; each must have an accessible name. */
const CONTROL_ROLES = ['button', 'link', 'textbox', 'checkbox', 'radio', 'switch', 'combobox', 'slider', 'spinbutton', 'tab', 'menuitem'];

/**
 * Every control inside `scope` has an accessible name, as the browser computes it (Playwright's accessibility snapshot,
 * where an unnamed control is a role with no quoted name after it). Returns the snapshot's control lines.
 */
export async function expectNamedControls(scope: Locator): Promise<string[]> {
  const snapshot = await scope.ariaSnapshot();
  const controls = snapshot.split('\n').filter((line) => new RegExp(`^\\s*- (${CONTROL_ROLES.join('|')})\\b`).test(line));
  const unnamed = controls.filter((line) => !/^\s*- \w+ "/.test(line));
  expect(unnamed, `controls without a name in:\n${snapshot}`).toEqual([]);
  return controls;
}

/**
 * Presses Tab until `target` has focus (at most `limit` times), as a keyboard user would reach it; fails with what had
 * focus along the way.
 */
export async function tabTo(page: Page, target: Locator, limit = 40): Promise<void> {
  const path: string[] = [];
  for (let i = 0; i < limit; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
    path.push(await focusedDescription(page));
  }
  throw new Error(`Tab did not reach the control in ${limit} presses. Focus went: ${path.join(' → ')}`);
}
