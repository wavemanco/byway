/**
 * The per-start secret on byway's web server (backlog row B-188; src/server/guard.ts): `pnpm start` prints a link with
 * a new key at each start; opening it sets the access cookie, and every other request must carry that cookie. The
 * production server applies it in proxy.ts and the contributor server in dev-server.ts, both through checkAccess.
 */
import { describe, expect, it } from 'vitest';
import { ACCESS_COOKIE, checkAccess, cookieValue, OPEN_PATH } from '../src/server/guard.ts';
import { refusalPage } from '../src/server/refusal-page.ts';

const KEY = 'k'.repeat(43);
const ask = (path: string, opts: { linkKey?: string; cookie?: string; key?: string } = {}) =>
  checkAccess({ path, linkKey: opts.linkKey ?? null, cookieHeader: opts.cookie ?? null, key: 'key' in opts ? opts.key : KEY });

describe("byway's start link and access cookie", () => {
  it('the start link with this start’s key sets the cookie, HttpOnly and SameSite=Strict, and goes on to the start screen', () => {
    expect(ask(OPEN_PATH, { linkKey: KEY })).toEqual({ ok: 'open', setCookie: `${ACCESS_COOKIE}=${KEY}; Path=/; HttpOnly; SameSite=Strict`, location: '/' });
  });

  it('a start link with another key, or none, is refused, and sets nothing', () => {
    for (const linkKey of [undefined, '', 'j'.repeat(43), `${KEY}x`, KEY.slice(1)]) {
      const r = ask(OPEN_PATH, linkKey === undefined ? {} : { linkKey });
      expect(r, String(linkKey)).toMatchObject({ ok: false, status: 403 });
    }
  });

  it('every other request, a page, an endpoint or a file, needs the cookie with this start’s key', () => {
    for (const path of ['/', '/api/runs', '/runs/abc', '/_next/static/chunk.js', '/api/artifacts/sha256:x', '/open/', '/%6Fpen']) {
      expect(ask(path), path).toMatchObject({ ok: false, status: 401 });
      expect(ask(path, { cookie: `${ACCESS_COOKIE}=${'j'.repeat(43)}` }), path).toMatchObject({ ok: false, status: 401 });
      expect(ask(path, { cookie: `other=1; ${ACCESS_COOKIE}=${KEY}; theme=dark` }), path).toEqual({ ok: true });
    }
  });

  it('a cookie from an earlier start is refused: the key is new at each start', () => {
    expect(checkAccess({ path: '/', linkKey: null, cookieHeader: `${ACCESS_COOKIE}=${KEY}`, key: 'n'.repeat(43) })).toMatchObject({ ok: false, status: 401 });
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
