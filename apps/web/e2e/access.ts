/**
 * The per-start secret for the suite (B-188; apps/web/src/server/guard.ts): the suite's byway is started with this key
 * (BYWAY_ACCESS_KEY), and every browser context and request context the suite opens carries the access cookie that
 * byway's start link would set. Made once in the main process, which `pnpm e2e` does for it (scripts/e2e.ts), and
 * inherited by Playwright's workers.
 */
import { randomBytes } from 'node:crypto';

export const accessKey = (): string => (process.env.BYWAY_E2E_ACCESS_KEY ??= randomBytes(32).toString('base64url'));

/** The suite's byway's host name, which its start link names; the suite's own contexts reach byway at 127.0.0.1. */
export const accessHost = (): string => (process.env.BYWAY_E2E_ACCESS_HOST ??= `byway-${randomBytes(12).toString('hex')}.localhost`);

/** A storage state holding the access cookie, for a browser or request context. */
export const accessState = () => ({
  cookies: [{ name: 'byway_access', value: accessKey(), domain: '127.0.0.1', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Strict' as const }],
  origins: [],
});
