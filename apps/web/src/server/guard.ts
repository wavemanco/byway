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
