/**
 * proxy.ts, the whole guard of the production server (`pnpm start`; B-188, SEC-6): the unit suite's own check of its
 * answers, so a change that drops or weakens one fails `pnpm test`, not only the browser suite.
 */
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { proxy } from '../proxy.ts';
import { TEST_ACCESS_HOST, TEST_ACCESS_KEY } from './fixtures/http.ts';

const env = { key: process.env.BYWAY_ACCESS_KEY, host: process.env.BYWAY_ACCESS_HOST };
afterEach(() => {
  for (const [name, value] of [['BYWAY_ACCESS_KEY', env.key], ['BYWAY_ACCESS_HOST', env.host]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const at = (host: string, path: string, headers: Record<string, string> = {}) => proxy(new NextRequest(`http://${host}${path}`, { headers: { host, ...headers } }));
const started = () => {
  process.env.BYWAY_ACCESS_KEY = TEST_ACCESS_KEY;
  process.env.BYWAY_ACCESS_HOST = TEST_ACCESS_HOST;
};
const COOKIE = `byway_access=${TEST_ACCESS_KEY}`;
const passes = (res: Response) => res.headers.get('x-middleware-next') === '1';

describe("proxy.ts, the production server's guard", () => {
  it('lets a request with this start’s cookie through, at 127.0.0.1 or this start’s host name', () => {
    started();
    expect(passes(at('127.0.0.1:3000', '/settings', { cookie: COOKIE }))).toBe(true);
    expect(passes(at(`${TEST_ACCESS_HOST}:3000`, '/api/runs', { cookie: COOKIE }))).toBe(true);
  });

  it('refuses a request without the cookie, or with another key: a page gets the refusal page, anything else JSON', async () => {
    started();
    for (const cookie of [undefined, `byway_access=${'x'.repeat(43)}`]) {
      const api = at(`${TEST_ACCESS_HOST}:3000`, '/api/runs', cookie ? { cookie } : {});
      expect(api.status).toBe(401);
      expect(passes(api)).toBe(false);
      expect(await api.json()).toEqual({ error: expect.stringMatching(/opened the link/) });
      const page = at('127.0.0.1:3000', '/', { accept: 'text/html', ...(cookie ? { cookie } : {}) });
      expect(page.status).toBe(401);
      expect(await page.text()).toMatch(/^<!doctype html>.*opened the link/s);
    }
  });

  it('opens with the start link only at this start’s host name: there it sets the cookie and goes on by itself', async () => {
    started();
    const opened = at(`${TEST_ACCESS_HOST}:3000`, `/open?key=${TEST_ACCESS_KEY}`);
    expect(opened.status).toBe(200);
    expect(opened.headers.get('set-cookie')).toBe(`${COOKIE}; Path=/; HttpOnly; SameSite=Strict`);
    expect(opened.headers.get('cache-control')).toBe('no-store');
    expect(opened.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await opened.text()).toContain('<meta http-equiv="refresh" content="0;url=/">');
    for (const [host, key] of [['127.0.0.1:3000', TEST_ACCESS_KEY], [`${TEST_ACCESS_HOST}:3000`, 'wrong']]) {
      const refused = at(host!, `/open?key=${key}`);
      expect(refused.status, host).toBe(403);
      expect(refused.headers.get('set-cookie')).toBeNull();
    }
  });

  it('tells a browser at an earlier start’s name, on a page, that byway started again', async () => {
    started();
    const old = at(`byway-${'b2'.repeat(12)}.localhost:3000`, '/runs/x', { accept: 'text/html', cookie: COOKIE });
    expect(old.status).toBe(403);
    expect(old.headers.get('content-type')).toMatch(/^text\/html/);
    expect(await old.text()).toMatch(/^<!doctype html>.*started again since this page was opened/s);
    // And a screen polling from it gets the refusal's code, so it can say so (view/refresh.ts).
    const polled = at(`byway-${'b2'.repeat(12)}.localhost:3000`, '/api/runs/x', { cookie: COOKIE });
    expect(await polled.json()).toEqual({ error: expect.stringMatching(/started again/), code: 'RESTARTED' });
  });

  it('tells a tab from before byway last started, at 127.0.0.1, that it did, on its polls; a page opened there gets the link page (B-188)', async () => {
    started();
    const polled = at('127.0.0.1:3000', '/api/waiting', { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' });
    expect(polled.status).toBe(401);
    expect(await polled.json()).toEqual({ error: expect.stringMatching(/started again/), code: 'RESTARTED' });
    const opened = at('127.0.0.1:3000', '/', { accept: 'text/html', 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate' });
    expect(opened.status).toBe(401);
    expect(await opened.text()).toMatch(/opened the link/);
    expect(await at('127.0.0.1:3000', '/api/waiting').json()).toEqual({ error: expect.stringMatching(/opened the link/) });
  });

  it('refuses a foreign Host before anything else, and everything when byway was started without its key', () => {
    started();
    expect(at('rebind.evil.example', '/settings', { cookie: COOKIE }).status).toBe(403);
    delete process.env.BYWAY_ACCESS_KEY;
    expect(at('127.0.0.1:3000', '/settings', { cookie: COOKIE }).status).toBe(503);
    expect(at(`${TEST_ACCESS_HOST}:3000`, `/open?key=${TEST_ACCESS_KEY}`).status).toBe(503);
  });
});
