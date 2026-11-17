/**
 * The start link in a browser (B-188, its check and its re-check): byway's access cookie belongs to this start's host
 * name, which no other program has, so a page served from another 127.0.0.1 port never gets it; byway holds its port on
 * [::1], where the browser tries that name first; the link works when it is opened from another site's page, as a link
 * kept in a chat or a notes page is; and a run is started and answered at that name, as the person does.
 */
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { accessHost, accessKey } from './access.ts';
import { answerUntilDone, describeProblem, openResult, startRecommended } from './flow.ts';

const base = new URL(process.env.BYWAY_E2E_BASE_URL ?? `http://127.0.0.1:${process.env.BYWAY_E2E_PORT ?? 3210}`);
const named = `http://${accessHost()}:${base.port}`;

// A browser that has not opened byway yet.
test.use({ storageState: { cookies: [], origins: [] } });

test('the start link opened from another site’s page lands on the start screen, and no other 127.0.0.1 port gets the cookie', async ({ page }) => {
  // Another program's web server on this computer, which logs the cookies the browser sends it.
  const seen: string[] = [];
  const other = http.createServer((req, res) => {
    seen.push(`${req.url} ${req.headers.cookie ?? '(no cookie)'}`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(req.url === '/' ? `<a id="go" href="${named}/open?key=${accessKey()}">byway</a>` : '<img src="/pixel">');
  });
  await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve));
  const otherPort = (other.address() as AddressInfo).port;
  try {
    await page.goto(`http://127.0.0.1:${otherPort}/`);
    await page.click('#go');
    await expect(page).toHaveURL(`${named}/`);
    await expect(page.getByLabel('What are you working on?')).toBeVisible();
    // Kept for this start's host name alone.
    expect((await page.context().cookies()).filter((c) => c.name === 'byway_access').map((c) => c.domain)).toEqual([accessHost()]);

    // The person visits the other program's page, as they might any local page: it gets no cookie of byway's.
    await page.goto(`http://127.0.0.1:${otherPort}/collect`);
    await expect.poll(() => seen.some((s) => s.startsWith('/pixel'))).toBe(true);
    expect(seen.filter((s) => s.includes('byway_access'))).toEqual([]);
    // Nor does the browser carry it to byway at 127.0.0.1, where only the link's host name is open.
    expect((await page.goto(`http://127.0.0.1:${base.port}/settings`))?.status()).toBe(401);
  } finally {
    await new Promise((resolve) => other.close(resolve));
  }
});

test('byway holds its port on [::1], so no other program can listen where the browser tries the name first', async () => {
  const taken = await new Promise<string>((resolve) => {
    const s = net.createServer();
    s.once('error', (e: NodeJS.ErrnoException) => resolve(e.code ?? 'error'));
    s.listen({ host: '::1', port: Number(base.port), ipv6Only: true }, () => s.close(() => resolve('bound')));
  });
  test.skip(taken === 'EADDRNOTAVAIL' || taken === 'EAFNOSUPPORT', 'this computer has no IPv6 loopback, so no browser can use it');
  expect(taken).toBe('EADDRINUSE');
  // And a request there reaches byway itself, whose guard asks for the cookie.
  const status = await new Promise<number>((resolve, reject) => {
    http
      .get({ host: '::1', family: 6, port: Number(base.port), path: '/settings', headers: { Host: `${accessHost()}:${base.port}` }, agent: false }, (res) => (res.resume(), resolve(res.statusCode ?? 0)))
      .on('error', reject);
  });
  expect(status).toBe(401);
});

test.describe('at the start’s host name, as the person uses byway', () => {
  test.use({ baseURL: named });

  test('a run is started there and its questions answered, signed by the app, to its result', async ({ page }) => {
    await page.goto(`/open?key=${accessKey()}`);
    await expect(page).toHaveURL(`${named}/`);
    await describeProblem(page, 'Tighten my quarterly status memo for the leadership team before Friday');
    await startRecommended(page, 'Memo Polish');
    const answered = await answerUntilDone(page);
    expect(answered.length).toBeGreaterThan(0);
    await expect(page.locator('.meter-spent')).toHaveText('$0.00');
    await expect((await openResult(page)).locator('.prose')).toContainText(/\w+ \w+ \w+/);
  });
});
