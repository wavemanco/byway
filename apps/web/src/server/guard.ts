/**
 * The local app's request guard, applied to every request by proxy.ts. byway binds 127.0.0.1, but a web page
 * in the same browser can still reach it: a Host check stops DNS-rebinding reads, and an Origin /
 * Sec-Fetch-Site check stops cross-site writes (CSRF) to the route handlers.
 */

export interface GuardInput {
  method: string;
  host: string | null;
  origin: string | null;
  secFetchSite: string | null;
  /** This start's host name (ACCESS_HOST), from BYWAY_ACCESS_HOST; undefined when byway was started without one. */
  accessHost?: string | undefined;
}

export type GuardResult = { ok: true } | { ok: false; status: number; message: string };

/**
 * The per-start secret (backlog row B-188). `pnpm start` makes a random key and a random host name each time it starts,
 * hands them to the web server in BYWAY_ACCESS_KEY and BYWAY_ACCESS_HOST, and prints the start link,
 * `http://<host name>:<port>/open?key=<key>`. Opening it sets the access cookie (HttpOnly, SameSite=Strict) for that
 * host name only, and goes on to the start screen; every other request must carry that cookie. A browser sends a
 * cookie to every port of the host it belongs to, so a cookie for 127.0.0.1 would reach any program listening on
 * another 127.0.0.1 port; the host name, a name under .localhost that Chrome, Edge and Firefox send to this computer
 * themselves, is new at each start, so another program has no name to have the browser send it the cookie at (byway also
 * holds its port on [::1], ipv6-hold.ts, where those browsers try such a name first). So a program under another Windows
 * account cannot use byway's server without the link. A program under the person's own account can read the key from
 * byway's environment, and a generated page whose scripts the person turned on can read the name from its own address;
 * Temporal's port is a door of its own: ADR-0117 item 5 says what stays open.
 */
export const ACCESS_COOKIE = 'byway_access';
export const OPEN_PATH = '/open';
/** This start's host name: `byway-` and 24 random hex digits, under .localhost (scripts/serve.ts makes it). */
export const ACCESS_HOST = /^byway-[0-9a-f]{24}\.localhost$/;

export interface AccessInput {
  /** The request's path, without its query. */
  path: string;
  /** The `key` the start link carries, on a request to OPEN_PATH. */
  linkKey: string | null;
  cookieHeader: string | null;
  /** This start's key; undefined when byway was started without one. */
  key: string | undefined;
  /** The request's Host header. */
  host: string | null;
  /** This start's host name (ACCESS_HOST); undefined when byway was started without one. */
  accessHost: string | undefined;
}

export type AccessResult = { ok: true } | { ok: false; status: number; message: string } | { ok: 'open'; setCookie: string };

/** Two secrets compared in constant time, by every runtime the guard runs in. */
function sameKey(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The value of one cookie in a Cookie header, or null. */
export function cookieValue(header: string | null, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return null;
}

/** The name in a Host header, lower-cased and without its port, or null when it is not a plain name. */
function hostName(host: string | null): string | null {
  const m = /^([a-z0-9.-]+)(?::\d{1,5})?$/i.exec(host ?? '');
  return m ? m[1]!.toLowerCase() : null;
}

const RESTARTED = 'byway has started again since this page was opened, at a new address. Open the link it printed this time, shown in the window where byway runs.';

const NOT_THE_LINK = 'This is not the link byway printed when it last started. Open the link shown in the window where byway runs, as it is shown.';

export function checkAccess(input: AccessInput): AccessResult {
  if (!input.key) return { ok: false, status: 503, message: 'byway was started without its access key. Start it with pnpm start, which prints the link to open.' };
  if (input.path === OPEN_PATH) {
    if (input.accessHost === undefined || !ACCESS_HOST.test(input.accessHost)) return { ok: false, status: 503, message: 'byway was started without its access address. Start it with pnpm start, which prints the link to open.' };
    // Only at this start's host name: the cookie belongs to the host it is set on, and 127.0.0.1's would go to every port.
    if (hostName(input.host) !== input.accessHost) return { ok: false, status: 403, message: NOT_THE_LINK };
    if (input.linkKey !== null && sameKey(input.linkKey, input.key)) return { ok: 'open', setCookie: `${ACCESS_COOKIE}=${input.key}; Path=/; HttpOnly; SameSite=Strict` };
    return { ok: false, status: 403, message: NOT_THE_LINK };
  }
  const cookie = cookieValue(input.cookieHeader, ACCESS_COOKIE);
  if (cookie !== null && sameKey(cookie, input.key)) return { ok: true };
  return { ok: false, status: 401, message: 'byway answers only the browser that opened the link it printed when it started. Open that link, shown in the window where byway runs.' };
}

const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/i;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function checkRequest(input: GuardInput): GuardResult {
  const own = input.accessHost !== undefined && ACCESS_HOST.test(input.accessHost) && hostName(input.host) === input.accessHost;
  if (!input.host || !(own || LOOPBACK.test(input.host))) {
    // An earlier start's name: a tab or bookmark kept from before byway started again.
    if (ACCESS_HOST.test(hostName(input.host) ?? '')) return { ok: false, status: 403, message: RESTARTED };
    return { ok: false, status: 403, message: 'byway only answers requests addressed to this computer (127.0.0.1).' };
  }
  if (SAFE_METHODS.has(input.method.toUpperCase())) return { ok: true };
  if (input.secFetchSite && input.secFetchSite !== 'same-origin' && input.secFetchSite !== 'none') {
    return { ok: false, status: 403, message: 'Changes can only come from byway itself.' };
  }
  if (input.origin !== null) {
    let host: string | null = null;
    try {
      host = input.origin === 'null' ? null : new URL(input.origin).host;
    } catch {
      host = null;
    }
    if (host?.toLowerCase() !== input.host.toLowerCase()) {
      return { ok: false, status: 403, message: 'Changes can only come from byway itself.' };
    }
  }
  return { ok: true };
}
