/**
 * The per-start secret on byway's web server (backlog row B-188; src/server/guard.ts): `pnpm start` prints a link with
 * a new key and host name at each start; opening it sets the access cookie for that host name only, and every other
 * request must carry that cookie. The production server applies it in proxy.ts and the contributor server in
 * dev-server.ts, both through checkAccess.
 */
import { describe, expect, it } from 'vitest';
import { ACCESS_COOKIE, ACCESS_HOST, checkAccess, checkRequest, cookieValue, OPEN_PATH, RESTARTED_CODE } from '../src/server/guard.ts';
import { openedPage, refusalPage } from '../src/server/refusal-page.ts';

const KEY = 'k'.repeat(43);
const HOST = `byway-${'a1'.repeat(12)}.localhost`;
const ask = (path: string, opts: { linkKey?: string; cookie?: string; key?: string; host?: string; accessHost?: string } = {}) =>
  checkAccess({ path, linkKey: opts.linkKey ?? null, cookieHeader: opts.cookie ?? null, key: 'key' in opts ? opts.key : KEY, host: opts.host ?? `${HOST}:3000`, accessHost: 'accessHost' in opts ? opts.accessHost : HOST });

describe("byway's start link and access cookie", () => {
  it('the start link with this start’s key, at this start’s host name, sets the cookie for that name only, HttpOnly and SameSite=Strict', () => {
    expect(HOST).toMatch(ACCESS_HOST);
    // No Domain: the browser keeps it for this host name alone, which no other program can have it visit.
    expect(ask(OPEN_PATH, { linkKey: KEY })).toEqual({ ok: 'open', setCookie: `${ACCESS_COOKIE}=${KEY}; Path=/; HttpOnly; SameSite=Strict` });
    expect(ask(OPEN_PATH, { linkKey: KEY, host: HOST.toUpperCase() })).toMatchObject({ ok: 'open' });
  });

  it('the start link at any other host name is refused, even with this start’s key: a cookie for 127.0.0.1 or localhost would go to every port', () => {
    for (const host of ['127.0.0.1:3000', 'localhost:3000', '[::1]:3000', `byway-${'b2'.repeat(12)}.localhost:3000`, `x.${HOST}:3000`, `${HOST}.evil.example`, '', 'a b']) {
      expect(ask(OPEN_PATH, { linkKey: KEY, host }), host).toMatchObject({ ok: false, status: 403 });
    }
  });

  it('a server started without its host name refuses the start link, and says how to start byway', () => {
    for (const accessHost of [undefined, '', 'localhost', '127.0.0.1', 'byway-short.localhost']) {
      expect(ask(OPEN_PATH, { linkKey: KEY, accessHost, host: `${accessHost ?? 'x'}:3000` }), String(accessHost)).toMatchObject({ ok: false, status: 503, message: expect.stringMatching(/pnpm start/) });
    }
  });

  it('a start link with another key, or none, is refused, and sets nothing', () => {
    for (const linkKey of [undefined, '', 'j'.repeat(43), `${KEY}x`, KEY.slice(1)]) {
      const r = ask(OPEN_PATH, linkKey === undefined ? {} : { linkKey });
      expect(r, String(linkKey)).toMatchObject({ ok: false, status: 403 });
    }
  });

  it('the start link’s page goes on to the start screen by itself, as byway’s own navigation, and loads nothing', () => {
    const page = openedPage();
    expect(page).toContain('<meta http-equiv="refresh" content="0;url=/">');
    expect(page).toContain('<a href="/">Continue to byway</a>');
    expect(page).toContain('<meta name="referrer" content="no-referrer">');
    expect(page).not.toMatch(/<script|<link|src=/i);
  });

  it('a tab or bookmark at an earlier start’s name is told that byway started again, and to open the new link', () => {
    const old = checkRequest({ method: 'GET', host: `byway-${'b2'.repeat(12)}.localhost:3000`, origin: null, secFetchSite: null, accessHost: HOST });
    expect(old).toMatchObject({ ok: false, status: 403, code: RESTARTED_CODE, message: expect.stringMatching(/started again since this page was opened.*not sent stays behind/) });
    const foreign = checkRequest({ method: 'GET', host: 'rebind.evil.example', origin: null, secFetchSite: null, accessHost: HOST });
    expect(foreign).toMatchObject({ message: expect.stringMatching(/only answers requests addressed to this computer/) });
    expect(foreign).not.toHaveProperty('code');
  });

  it('the guard answers this start’s host name and the loopback names, and no other name', () => {
    const at = (host: string, accessHost: string | undefined = HOST) => checkRequest({ method: 'GET', host, origin: null, secFetchSite: null, accessHost });
    for (const host of [`${HOST}:3000`, HOST, '127.0.0.1:3000', 'localhost:3000', '[::1]:3000']) expect(at(host), host).toEqual({ ok: true });
    for (const host of [`byway-${'b2'.repeat(12)}.localhost:3000`, `x.${HOST}:3000`, `${HOST}.evil.example:3000`, 'rebind.evil.example']) expect(at(host), host).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest({ method: 'GET', host: `${HOST}:3000`, origin: null, secFetchSite: null })).toMatchObject({ ok: false, status: 403 });
    expect(at(`${HOST}:3000`, 'not-a-byway-name.localhost')).toMatchObject({ ok: false, status: 403 });
    // A name not of byway's form is refused even when it is the one byway was given.
    expect(at('not-a-byway-name.localhost:3000', 'not-a-byway-name.localhost')).toMatchObject({ ok: false, status: 403 });
    // A change from byway's own page at its host name passes; one from another byway's does not.
    expect(checkRequest({ method: 'POST', host: `${HOST}:3000`, origin: `http://${HOST}:3000`, secFetchSite: 'same-origin', accessHost: HOST })).toEqual({ ok: true });
    expect(checkRequest({ method: 'POST', host: `${HOST}:3000`, origin: `http://byway-${'b2'.repeat(12)}.localhost:3000`, secFetchSite: 'same-site', accessHost: HOST })).toMatchObject({ ok: false, status: 403 });
  });

  it('every other request, a page, an endpoint or a file, needs the cookie with this start’s key', () => {
    for (const path of ['/', '/api/runs', '/runs/abc', '/_next/static/chunk.js', '/api/artifacts/sha256:x', '/open/', '/%6Fpen']) {
      expect(ask(path), path).toMatchObject({ ok: false, status: 401 });
      expect(ask(path, { cookie: `${ACCESS_COOKIE}=${'j'.repeat(43)}` }), path).toMatchObject({ ok: false, status: 401 });
      expect(ask(path, { cookie: `other=1; ${ACCESS_COOKIE}=${KEY}; theme=dark` }), path).toEqual({ ok: true });
    }
  });

  it('a page’s own request from a browser at 127.0.0.1, which can never hold the cookie, is told byway started again; a page being opened, a script and this start’s name are not (B-188)', () => {
    const at = (host: string, secFetchSite: string | null, secFetchMode: string | null) =>
      checkAccess({ path: '/api/waiting', linkKey: null, cookieHeader: null, key: KEY, host, accessHost: HOST, secFetchSite, secFetchMode });
    // A tab from before byway last started: before B-188 its pages were at 127.0.0.1:3000.
    for (const host of ['127.0.0.1:3000', 'localhost:3000', '[::1]:3000']) {
      expect(at(host, 'same-origin', 'cors'), host).toMatchObject({ ok: false, status: 401, code: RESTARTED_CODE, message: expect.stringMatching(/started again/) });
    }
    // A page being opened there gets the page that says to open the link, not "started again".
    expect(at('127.0.0.1:3000', 'none', 'navigate')).not.toHaveProperty('code');
    // A script sends no Sec-Fetch headers: the plain refusal.
    expect(at('127.0.0.1:3000', null, null)).not.toHaveProperty('code');
    // At this start's own name a browser that has lost its cookie is not a tab from before.
    expect(at(`${HOST}:3000`, 'same-origin', 'cors')).not.toHaveProperty('code');
    // And the cookie still lets everything through, at either address.
    expect(checkAccess({ path: '/api/waiting', linkKey: null, cookieHeader: `${ACCESS_COOKIE}=${KEY}`, key: KEY, host: '127.0.0.1:3000', accessHost: HOST, secFetchSite: 'same-origin', secFetchMode: 'cors' })).toEqual({ ok: true });
  });

  it('a cookie from an earlier start is refused: the key is new at each start', () => {
    expect(ask('/', { cookie: `${ACCESS_COOKIE}=${KEY}`, key: 'n'.repeat(43) })).toMatchObject({ ok: false, status: 401 });
  });

  it('a server started without a key refuses everything, the start link included, and says how to start byway', () => {
    expect(ask('/', { key: undefined, cookie: `${ACCESS_COOKIE}=${KEY}` })).toMatchObject({ ok: false, status: 503, message: expect.stringMatching(/pnpm start/) });
    expect(ask(OPEN_PATH, { key: undefined, linkKey: KEY })).toMatchObject({ ok: false, status: 503 });
    expect(ask('/', { key: '', cookie: `${ACCESS_COOKIE}=` })).toMatchObject({ ok: false, status: 503 });
  });

  it('reads one cookie by its exact name', () => {
    expect(cookieValue(`a=1; ${ACCESS_COOKIE}=v; b=2`, ACCESS_COOKIE)).toBe('v');
    expect(cookieValue(`x${ACCESS_COOKIE}=v`, ACCESS_COOKIE)).toBeNull();
    expect(cookieValue(null, ACCESS_COOKIE)).toBeNull();
  });

  it('the refusal page shows the message escaped, and loads nothing', () => {
    const page = refusalPage('<script>alert(1)</script> & "quotes"');
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;');
    expect(page).not.toMatch(/<script|<link|src=/i);
  });
});
