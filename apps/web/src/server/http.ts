/** Small helpers for route handlers: JSON responses, body parsing, and plain-language errors. */
import type { z } from 'zod';

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function fail(status: number, message: string): Response {
  return json({ error: message }, status);
}

type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Reads a JSON body against a schema; only application/json is accepted (a CSRF form post cannot send it). */
export async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<Parsed<z.infer<T>>> {
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
  return { ok: true, data: parsed.data };
}

/** Errors thrown by services carry messages written for people; anything else gets a generic line. */
export function failFrom(err: unknown, status = 400): Response {
  const message = err instanceof Error && err.message ? err.message : 'Something went wrong.';
  return fail(status, message);
}
