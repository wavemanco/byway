/**
 * The held-key rule (ADR-0088): the one exact test for "does this text contain a provider key byway holds". It is
 * applied where text crosses a boundary, and a hit is refused, never rewritten:
 * - requests leaving the gateway for a provider (complete, image, video);
 * - a completion's text arriving from a provider, after the call is ledgered;
 * - request bodies arriving from the browser (apps/web parseBody).
 *
 * Why a second rule beside makeRedactor: a refusal blocks the person's submission or a paid answer, so it must not
 * fire on text that only looks like a key. It matches only the exact values of the provider variables (KEY_VARS),
 * whole or by ':'-separated part, and only from 16 characters up. makeRedactor scrubs diagnostic copies, where a false
 * positive costs nothing, so it also removes key shapes and every *_KEY / *_TOKEN / *_SECRET / *_PASSWORD value.
 */
import { GatewayError, type GatewayErrorCode } from '@byway/contracts';
import { KEY_VARS, keyFor, type Env } from './env.ts';

/** Shorter values (or parts) are too generic to refuse text over. */
const MIN_HELD_LENGTH = 16;

/** A GatewayError raised because text held a provider key: names the variable (never the value). */
export type HeldKeyError = GatewayError & { heldKey: string };

/**
 * The exact strings that count as each held key: the whole trimmed value, and each ':'-separated part, so a FAL_KEY
 * (`<key id>:<secret>`) is caught by its secret half alone. Read from `env` at call time, so a key added later counts.
 */
export function heldKeyCandidates(env: Env): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  for (const provider of Object.keys(KEY_VARS) as (keyof typeof KEY_VARS)[]) {
    const value = keyFor(env, provider);
    if (!value) continue;
    const name = KEY_VARS[provider];
    const parts = value.includes(':') ? value.split(':').map((p) => p.trim()) : [];
    for (const candidate of new Set([value, ...parts])) if (candidate.length >= MIN_HELD_LENGTH) out.push({ name, value: candidate });
  }
  return out;
}

/** The variable name of the first held key found in any of `values`, or undefined. The value is never returned. */
export function findHeldKey(env: Env, values: Iterable<string | undefined>): string | undefined {
  const candidates = heldKeyCandidates(env);
  if (candidates.length === 0) return undefined;
  for (const text of values) {
    if (!text) continue;
    for (const { name, value } of candidates) if (text.includes(value)) return name;
  }
  return undefined;
}

/** A non-retryable GatewayError carrying the held-key marker. The message must name the variable, not the value. */
export function heldKeyError(code: Extract<GatewayErrorCode, 'invalid-request' | 'provider-error'>, message: string, name: string): HeldKeyError {
  return Object.assign(new GatewayError(code, message, false), { heldKey: name });
}

/**
 * Whether an error is a held-key refusal. Matched by name and marker, not class, like the other gateway error checks:
 * a server bundle may hold its own copy of the GatewayError class.
 */
export function isHeldKeyError(err: unknown): err is HeldKeyError {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { name?: unknown; heldKey?: unknown };
  return e.name === 'GatewayError' && typeof e.heldKey === 'string';
}
