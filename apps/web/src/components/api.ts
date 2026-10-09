/** Client-side calls to the route handlers. Errors carry the server's plain-language message. */

export class ApiError extends Error {
  override name = 'ApiError';
}

async function send<T>(method: 'POST' | 'PATCH', url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError('byway is not reachable. Check that it is still running, then try again.');
  }
  let data: { error?: string };
  try {
    data = (await res.json()) as { error?: string };
  } catch {
    // A successful status whose body cannot be read is a failure, never an empty object standing in for the result:
    // the Recommendation commands apply what comes back directly (ADR-0082).
    if (res.ok) throw new ApiError('byway sent an answer that could not be read. Try again.');
    data = {};
  }
  if (!res.ok) throw new ApiError(data.error ?? `The request failed (${res.status}). Try again.`);
  return data as T;
}

export const post = <T>(url: string, body: unknown) => send<T>('POST', url, body);
export const patch = <T>(url: string, body: unknown) => send<T>('PATCH', url, body);

/**
 * Reads JSON the screens poll (view/refresh.ts). A successful status whose body cannot be read (cut off by the
 * caller's signal, or not JSON) is a failure, never an empty object standing in for the data.
 */
export async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...(signal ? { signal } : {}) });
  let data: { error?: string };
  try {
    data = (await res.json()) as { error?: string };
  } catch (err) {
    if (signal?.aborted) throw err;
    if (res.ok) throw new ApiError('byway sent an answer that could not be read. Try again.');
    data = {};
  }
  if (!res.ok) throw new ApiError(data.error ?? `The request failed (${res.status}).`);
  return data as T;
}

export function artifactUrl(id: string, download?: string): string {
  const base = `/artifacts/${encodeURIComponent(id)}`;
  return download === undefined ? base : `${base}?download=1&name=${encodeURIComponent(download)}`;
}
