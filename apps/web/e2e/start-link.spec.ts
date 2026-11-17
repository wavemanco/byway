/**
 * The start link in a browser (B-188 and its check): byway's access cookie belongs to this start's host name, which no
 * other program can have the browser visit, so a page served from another 127.0.0.1 port never gets it; and the link
 * works when it is opened from another site's page, as a link kept in a chat or a notes page is.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { accessHost, accessKey } from './access.ts';

// A browser that has not opened byway yet.
test.use({ storageState: { cookies: [], origins: [] } });

test('the start link opened from another site’s page lands on the start screen, and no other 127.0.0.1 port gets the cookie', async ({ page, baseURL }) => {
  const { port } = new URL(baseURL ?? 'http://127.0.0.1:3210');
  // Another program's web server on this computer, which logs the cookies the browser sends it.
  const seen: string[] = [];
  const other = http.createServer((req, res) => {
    seen.push(`${req.url} ${req.headers.cookie ?? '(no cookie)'}`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(req.url === '/' ? `<a id="go" href="http://${accessHost()}:${port}/open?key=${accessKey()}">byway</a>` : '<img src="/pixel">');
  });
  await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve));
  const otherPort = (other.address() as AddressInfo).port;
  try {
    await page.goto(`http://127.0.0.1:${otherPort}/`);
    await page.click('#go');
    await expect(page).toHaveURL(`http://${accessHost()}:${port}/`);
    await expect(page.getByLabel('What are you working on?')).toBeVisible();
    // Kept for this start's host name alone.
    expect((await page.context().cookies()).filter((c) => c.name === 'byway_access').map((c) => c.domain)).toEqual([accessHost()]);

    // The person visits the other program's page, as they might any local page: it gets no cookie of byway's.
    await page.goto(`http://127.0.0.1:${otherPort}/collect`);
    await expect.poll(() => seen.some((s) => s.startsWith('/pixel'))).toBe(true);
    expect(seen.filter((s) => s.includes('byway_access'))).toEqual([]);
    // Nor does the browser carry it to byway at 127.0.0.1, where only the link's host name is open.
    expect((await page.goto(`http://127.0.0.1:${port}/settings`))?.status()).toBe(401);
  } finally {
    await new Promise((resolve) => other.close(resolve));
  }
});
