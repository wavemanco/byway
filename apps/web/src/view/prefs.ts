/**
 * Display preferences shared by server and client code. Kept out of 'use client' modules: a server component
 * that imports a value from one gets a client reference, not the value.
 */

/** "Show technical names" (spec §5) lives in a cookie so server-rendered screens agree on first paint. */
export const TECHNICAL_COOKIE = 'byway-technical';
