/**
 * How the page renderer fetches what a rendered page loads from an allowlisted host (spec §3.2; pages.ts). Playwright's
 * own route.fetch reads a whole response into memory before handing it over, so a model-written page naming a large or
 * endless file on a CDN (they serve whatever a package holds) made the engine hold it all, bounded only by the render's
 * deadline. Here each hop is fetched with Node's fetch and its body is read as it streams, counted, and cut off at a cap:
 * a response over it is never handed to the page, and nothing more of it is read.
 *
 * Redirects are not followed here: each hop is returned to the caller, which admits the next URL by its own rule
 * (pages.ts fetchAdmitted), so the allowlist holds on every hop.
 */

/**
 * The most one allowlisted response may hold, 20 MiB. What pages load from these hosts is far smaller: fonts are tens
 * or hundreds of kilobytes, and the largest libraries a page commonly loads whole are a few megabytes (a full Plotly
 * build is under 5 MB). So the cap leaves real libraries plenty of room while no single request can make the renderer
 * hold more than this.
 */
export const MAX_RENDER_FETCH_BYTES = 20 * 1024 * 1024;

/** Request headers a fetch sets itself, or that describe one connection rather than the request. */
const HOP_HEADERS = new Set(['host', 'connection', 'keep-alive', 'proxy-connection', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'expect', 'content-length', 'accept-encoding']);

/**
 * Response headers that no longer describe the body handed on: Node's fetch decodes it (gzip, br), so the encoding and
 * the encoded length are gone, and the page gets it whole, not chunked.
 */
const DECODED = new Set(['content-encoding', 'content-length', 'transfer-encoding']);

/** The statuses a response redirects with; their bodies are never read. */
const REDIRECTS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

export interface Hop {
  status: number;
  headers: Record<string, string>;
  /** Set for a redirect: where it points, unresolved. */
  location?: string;
  /** The body, for anything but a redirect; undefined when it was over the cap. */
  body?: Buffer;
}

export interface HopRequest {
  url: string;
  method: string;
  /** The request's headers as the browser sent them. */
  headers: Record<string, string>;
  body?: Buffer;
  /** Bounds the whole hop, headers and body. */
  signal: AbortSignal;
  maxBytes: number;
}

/** One hop: its status and headers, and its body read up to `maxBytes` (a redirect's body is not read). */
export async function fetchHop(req: HopRequest, fetchImpl: typeof fetch = fetch): Promise<Hop> {
  const headers = Object.fromEntries(Object.entries(req.headers).filter(([name]) => !HOP_HEADERS.has(name.toLowerCase())));
  const res = await fetchImpl(req.url, { method: req.method, headers, ...(req.body ? { body: req.body } : {}), redirect: 'manual', signal: req.signal });
  const out: Record<string, string> = {};
  res.headers.forEach((value, name) => {
    if (!DECODED.has(name)) out[name] = value;
  });
  if (REDIRECTS.has(res.status)) {
    await res.body?.cancel().catch(() => undefined);
    const location = res.headers.get('location');
    return { status: res.status, headers: out, ...(location !== null ? { location } : {}) };
  }
  const length = res.headers.get('content-length');
  if (length !== null && /^\d+$/.test(length.trim()) && Number(length) > req.maxBytes && !res.headers.has('content-encoding')) {
    await res.body?.cancel().catch(() => undefined);
    return { status: res.status, headers: out };
  }
  const body = await readUpTo(res.body, req.maxBytes);
  return { status: res.status, headers: out, ...(body ? { body } : {}) };
}

/** The bytes a body yields, or undefined (and the rest of it cancelled) once they pass `cap`. */
async function readUpTo(body: ReadableStream<Uint8Array> | null, cap: number): Promise<Buffer | undefined> {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => undefined);
      return undefined;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}
