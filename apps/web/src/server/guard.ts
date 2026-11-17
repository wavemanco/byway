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
}

export type GuardResult = { ok: true } | { ok: false; status: number; message: string };

/**
 * The per-start secret (backlog row B-188). `pnpm start` makes a random key each time it starts, hands it to the web
 * server in BYWAY_ACCESS_KEY and prints the start link, `/open?key=<key>`. Opening it sets the access cookie (HttpOnly,
 * SameSite=Strict) and goes on to the start screen; every other request must carry that cookie. So another program
 * on the computer, under any account, cannot use byway's server without the link, which only the terminal shows.
 */
export const ACCESS_COOKIE = 'byway_access';
export const OPEN_PATH = '/open';

export interface AccessInput {
  /** The request's path, without its query. */
  path: string;
  /** The `key` the start link carries, on a request to OPEN_PATH. */
  linkKey: string | null;
  cookieHeader: string | null;
  /** This start's key; undefined when byway was started without one. */
  key: string | undefined;
}

export type AccessResult = { ok: true } | { ok: false; status: number; message: string } | { ok: 'open'; setCookie: string; location: string };

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

export function checkAccess(input: AccessInput): AccessResult {
  if (!input.key) return { ok: false, status: 503, message: 'byway was started without its access key. Start it with pnpm start, which prints the link to open.' };
  if (input.path === OPEN_PATH) {
    if (input.linkKey !== null && sameKey(input.linkKey, input.key)) return { ok: 'open', setCookie: `${ACCESS_COOKIE}=${input.key}; Path=/; HttpOnly; SameSite=Strict`, location: '/' };
    return { ok: false, status: 403, message: 'This is not the link byway printed when it last started. Open the link shown in the window where byway runs.' };
  }
  const cookie = cookieValue(input.cookieHeader, ACCESS_COOKIE);
  if (cookie !== null && sameKey(cookie, input.key)) return { ok: true };
  return { ok: false, status: 401, message: 'byway answers only the browser that opened the link it printed when it started. Open that link, shown in the window where byway runs.' };
}

const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/i;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function checkRequest(input: GuardInput): GuardResult {
  if (!input.host || !LOOPBACK.test(input.host)) {
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
