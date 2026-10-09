/** Small helpers for route handlers: JSON responses, body parsing, and plain-language errors. */
import type { z } from 'zod';
import { HELD_KEY_REFUSAL } from '../view/refusals.ts';

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** A refusal: its message for people, and, for the few a screen acts on, a code (view/refusals.ts). */
export function fail(status: number, message: string, code?: string): Response {
  return json(code === undefined ? { error: message } : { error: message, code }, status);
}

type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Names a provider key byway holds that appears in a parsed body, or undefined (ServiceHost.heldKeyIn). */
export type HeldKeyIn = (value: unknown) => string | undefined;

/**
 * Reads a JSON body against a schema; only application/json is accepted (a CSRF form post cannot send it). A body
 * holding one of byway's provider keys is refused before anything is stored or sent (ADR-0088). `heldKeyIn` is
 * required, so a route that skips the check does not compile. It runs on what the schema keeps: fields the schema
 * strips are never stored.
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
  if (held) return { ok: false, response: fail(400, `This text contains your ${held}. Remove it and try again — byway never stores or sends its keys.`, HELD_KEY_REFUSAL) };
  return { ok: true, data: parsed.data };
}

/** Errors thrown by services carry messages written for people; anything else gets a generic line. */
export function failFrom(err: unknown, status = 400): Response {
  const message = err instanceof Error && err.message ? err.message : 'Something went wrong.';
  return fail(status, message);
}
