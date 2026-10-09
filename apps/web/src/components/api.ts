/** Client-side calls to the route handlers. Errors carry the server's plain-language message. */

export class ApiError extends Error {
  override name = 'ApiError';
  /** The server's refusal code, for the refusals a screen acts on (view/refusals.ts). */
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function send<T>(method: 'POST' | 'PATCH', url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError('byway is not reachable. Check that it is still running, then try again.');
  }
  let data: { error?: string; code?: string };
  try {
    data = (await res.json()) as { error?: string; code?: string };
  } catch {
    // A successful status whose body cannot be read is a failure, never an empty object standing in for the result:
    // the Recommendation commands apply what comes back directly (ADR-0082).
    if (res.ok) throw new ApiError('byway sent an answer that could not be read. Try again.');
    data = {};
  }
  if (!res.ok) throw new ApiError(data.error ?? `The request failed (${res.status}). Try again.`, typeof data.code === 'string' ? data.code : undefined);
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

/**
 * An artifact's raw address: for an element's src (an image, a clip) and, with a file name, a download. Never a link a
 * person opens: a page opened there is inert by design (F05), so "Open" goes to openHref.
 */
export function artifactUrl(id: string, download?: string): string {
  const base = `/artifacts/${encodeURIComponent(id)}`;
  return download === undefined ? base : `${base}?download=1&name=${encodeURIComponent(download)}`;
}

/**
 * Where a page frame loads a generated page: its raw address, asking for its scripts (`?scripts=1`) only when the person
 * turned them on for that page. The server grants the ask only to a same-origin frame (F05, ADR-0085); the frame's
 * sandbox (frameSandbox) is derived from the same switch, as a second layer.
 */
export function pageFrameUrl(id: string, scripts: boolean): string {
  return scripts ? `${artifactUrl(id)}?scripts=1` : artifactUrl(id);
}

/**
 * Every in-app "Open" of an artifact: the whole-artifact viewer, which shows a page in a frame with the per-page scripts
 * switch, text whole, and images and clips as themselves (F05, F13). One rule for every link, so none opens a page's raw
 * address top-level.
 */
export function openHref(id: string): string {
  return `/view/${encodeURIComponent(id)}`;
}
