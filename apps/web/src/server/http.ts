/** Small helpers for route handlers: JSON responses, body parsing, and plain-language errors. */
import type { z } from 'zod';
import { HELD_KEY_REFUSAL, heldKeyRefusal, type HeldKeyItem, type HeldKeyPart } from '../view/refusals.ts';

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * A refusal: its message for people, and, for the few a screen acts on, a code (view/refusals.ts), the request's
 * top-level fields it concerns and, for a held key, the key's variable name and where each key was (`parts`).
 */
export function fail(status: number, message: string, code?: string, fields?: string[], key?: string, parts?: HeldKeyPart[]): Response {
  return json(
    { error: message, ...(code === undefined ? {} : { code }), ...(fields === undefined ? {} : { fields }), ...(key === undefined ? {} : { key }), ...(parts === undefined ? {} : { parts }) },
    status,
  );
}

type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Names a provider key byway holds that appears in a parsed body, or undefined (ServiceHost.heldKeyIn). */
export type HeldKeyIn = (value: unknown) => string | undefined;

/**
 * The top-level fields of a parsed body that hold a key, with the key each holds and, for a list, the items that hold
 * one: Start keeps its text and each of its attachments in the tab, and stops keeping only the part that held the key
 * (ADR-0088), and the refusal says which part that was. Names fields, positions and keys' variable names, never values.
 */
function partsHolding(data: unknown, heldKeyIn: HeldKeyIn): HeldKeyPart[] {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return [];
  return Object.entries(data).flatMap(([field, value]) => {
    const key = heldKeyIn(value);
    if (key === undefined) return [];
    return [Array.isArray(value) ? { field, key, items: itemsHolding(value, heldKeyIn) } : { field, key }];
  });
}

/** The items of a list that hold a key: their positions in it, their own fields that hold one, and the key. */
function itemsHolding(list: readonly unknown[], heldKeyIn: HeldKeyIn): HeldKeyItem[] {
  return list.flatMap((item, index) => {
    const key = heldKeyIn(item);
    if (key === undefined) return [];
    const fields = typeof item === 'object' && item !== null && !Array.isArray(item) ? Object.entries(item).flatMap(([field, value]) => (heldKeyIn(value) === undefined ? [] : [field])) : [];
    return [{ index, fields, key }];
  });
}

/**
 * Reads a JSON body against a schema; only application/json is accepted (a CSRF form post cannot send it). A body
 * holding one of byway's provider keys is refused before anything is stored or sent (ADR-0088). `heldKeyIn` is
 * required, so a route that skips the check does not compile. It runs on what the schema keeps: fields the schema
 * strips are never stored. It is the only reader of a request body: test/guard-body.test.ts fails on any other.
 */
export async function parseBody<T extends z.ZodType>(request: Request, schema: T, heldKeyIn: HeldKeyIn): Promise<Parsed<z.infer<T>>> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return { ok: false, response: fail(415, 'Send the request as JSON.') };
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: fail(400, 'The request body is not valid JSON.') };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'The request is not valid.';
    return { ok: false, response: fail(400, message) };
  }
  const held = heldKeyIn(parsed.data);
  if (held) {
    const parts = partsHolding(parsed.data, heldKeyIn);
    return { ok: false, response: fail(400, heldKeyRefusal(parts, held), HELD_KEY_REFUSAL, parts.map((p) => p.field), held, parts) };
  }
  return { ok: true, data: parsed.data };
}
