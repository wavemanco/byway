/**
 * The guard in front of `next dev` (contributor mode, `pnpm dev`; SEC-6). `next dev` answers its own internal endpoints
 * (`/__nextjs_launch-editor`, `/__nextjs_attach-nodejs-inspector`, `/_next/mcp`, the HMR WebSocket and `/_next/*`)
 * before proxy.ts runs, and its own cross-site check lets a request without an Origin through, which is what a DNS
 * rebinding page sends. So in contributor mode `next dev` listens on an internal loopback port and this small reverse
 * proxy listens on the public one, applying the app's guard (src/server/guard.ts) to every request and every
 * WebSocket upgrade before anything reaches Next.
 *
 * Node-only and never imported by the app: scripts/serve.ts starts it.
 */
import http, { type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import { checkRequest, type GuardResult } from './guard.ts';

/** Next's dev-only endpoints: they act (open an editor, attach a debugger), so only byway's own pages may call them. */
const DEV_INTERNALS = /^\/(?:__nextjs|_next\/mcp)/;

function header(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name];
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/**
 * The verdict for one request at the socket: the app's own guard (loopback Host only, so no DNS rebinding; no
 * cross-site writes), with two additions. A WebSocket upgrade is held to the write rules (its Origin must be byway's),
 * since a page on any site may open one. And Next's dev internals refuse anything a browser marks as coming from
 * another site, even a GET.
 */
export function guardRequest(req: Pick<IncomingMessage, 'method' | 'url' | 'headers'>, upgrade = false): GuardResult {
  const verdict = checkRequest({
    method: upgrade ? 'UPGRADE' : (req.method ?? 'GET'),
    host: header(req.headers, 'host'),
    origin: header(req.headers, 'origin'),
    secFetchSite: header(req.headers, 'sec-fetch-site'),
  });
  if (!verdict.ok) return verdict;
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  const site = header(req.headers, 'sec-fetch-site');
  if (DEV_INTERNALS.test(path) && site !== null && site !== 'same-origin' && site !== 'none') {
    return { ok: false, status: 403, message: 'Only byway itself may use this.' };
  }
  return { ok: true };
}

function refuse(res: ServerResponse, verdict: Extract<GuardResult, { ok: false }>): void {
  res.writeHead(verdict.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: verdict.message }));
}

function headLines(raw: string[]): string {
  let out = '';
  for (let i = 0; i + 1 < raw.length; i += 2) out += `${raw[i]}: ${raw[i + 1]}\r\n`;
  return out;
}

export interface GuardProxyOptions {
  /** The internal port `next dev` listens on. */
  targetPort: number;
  targetHost?: string;
}

/** An HTTP server that forwards guarded requests and WebSocket upgrades to the target, unchanged (Host included). */
export function createGuardProxy(opts: GuardProxyOptions): http.Server {
  const host = opts.targetHost ?? '127.0.0.1';
  const agent = new http.Agent({ keepAlive: true });
  const server = http.createServer((req, res) => {
    const verdict = guardRequest(req);
    if (!verdict.ok) return refuse(res, verdict);
    const upstream = http.request({ host, port: opts.targetPort, method: req.method, path: req.url, headers: req.headers, agent }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.statusMessage, up.headers);
      up.pipe(res);
    });
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('byway’s web app is not answering yet. Try again in a moment.');
    });
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
  });
  // Long model calls (recommending, composing) answer in their own time; Next keeps its own limits.
  server.requestTimeout = 0;

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on('error', () => socket.destroy());
    const verdict = guardRequest(req, true);
    if (!verdict.ok) {
      socket.end(`HTTP/1.1 ${verdict.status} Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      return;
    }
    const up = net.connect(opts.targetPort, host, () => {
      up.write(`${req.method ?? 'GET'} ${req.url ?? '/'} HTTP/${req.httpVersion}\r\n${headLines(req.rawHeaders)}\r\n`);
      if (head.length > 0) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    up.on('error', () => socket.destroy());
    socket.on('close', () => up.destroy());
  });
  return server;
}
