/**
 * Contributor mode's web server (`pnpm dev`; SEC-6). `next dev` answers its own internal endpoints
 * (`/__nextjs_launch-editor` opens a file in an editor, `/__nextjs_attach-nodejs-inspector` attaches a debugger, the
 * HMR WebSocket, `/_next/*`) before proxy.ts runs, and its own cross-site check lets a request without an Origin
 * through, which is what a DNS-rebinding page sends. So contributor mode never runs `next dev` as its own server:
 * this module creates the Next app in process (`next({ dev: true })`) and serves it from a Node http server on
 * 127.0.0.1 that applies the app's guard (guard.ts) to every request before Next's request handler and to every
 * WebSocket upgrade before Next's upgrade handler. That server is the only thing listening: there is no internal
 * next dev port to find.
 *
 * WebSocket upgrades. In a custom server, `app.getUpgradeHandler()` is not the one that serves HMR (in Next 16 it is
 * the render server's, which ignores upgrades); Next attaches its real upgrade handler itself, on its first request,
 * to the server it was given as `httpServer`, or else to the server the request came in on, where it would run beside
 * the guard rather than behind it. So Next is given a `gate`: an http.Server that never listens, which receives only
 * the upgrades the guard allowed. Any other upgrade listener added to the public server is moved onto the gate too.
 *
 * Node-only and never imported by the app: scripts/dev-web.ts runs it, and scripts/serve.ts starts that.
 */
import http, { type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import type { Duplex } from 'node:stream';
import { checkRequest, type GuardResult } from './guard.ts';

/**
 * The part of Next's custom-server API used here (`next()` in next/dist/server/next.d.ts, Next 16). It is typed here
 * rather than imported because Next's types declare globals (a required, read-only NODE_ENV) that would leak into the
 * type check of scripts/, which runs this module; test/dev-server.test.ts checks it against the installed package.
 */
export interface NextDevOptions {
  dev: true;
  dir: string;
  hostname: string;
  port: number;
  turbopack: true;
  /** The server Next attaches its WebSocket (HMR) handler to, on its first request. */
  httpServer: http.Server;
}

export interface NextDevApp {
  prepare(): Promise<void>;
  getRequestHandler(): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  close(): Promise<void>;
}

export type CreateNextApp = (options: NextDevOptions) => NextDevApp;

/**
 * Next's own endpoints: the dev ones act (open an editor, attach a debugger, restart the dev server, Next's MCP
 * endpoint) or describe this computer (Chrome DevTools' workspace file names the project's folder), and `/_next/*` is
 * its build output and HMR. Only byway's own pages may call them.
 */
const NEXT_INTERNALS = /^\/(?:__nextjs|_next(?:\/|$)|\.well-known\/appspecific\/com\.chrome\.devtools\.json)/i;

function header(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name];
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/** Percent-decodes once; a malformed escape decodes only the characters that matter for a path (., /, \, _). */
function decodeOnce(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path.replace(/%(2e|2f|5c|5f)/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  }
}

/** Removes `.` and `..` segments and empty ones (`//`), with `\` read as `/`. */
function resolveDots(path: string): string {
  const out: string[] = [];
  for (const segment of path.replace(/\\/g, '/').split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') out.pop();
    else out.push(segment);
  }
  return `/${out.join('/')}`;
}

/**
 * The forms of a request's path the guard checks: as sent, and decoded (repeatedly, for double encoding) with its dot
 * segments resolved, the way Next reads it once it has normalized the URL. A check on the raw path alone let
 * `/_next/%2e%2e/__nextjs_launch-editor` through, which Next then served as `/__nextjs_launch-editor`. Checking every
 * form means a path is treated as internal if Next could read it as internal either way.
 */
export function requestPaths(url: string | undefined): string[] {
  let raw = url ?? '/';
  // The absolute form (`GET http://host/path HTTP/1.1`), which Node passes through as the URL.
  if (!raw.startsWith('/')) {
    try {
      raw = new URL(raw).pathname;
    } catch {
      raw = `/${raw}`;
    }
  }
  raw = raw.split(/[?#]/)[0] || '/';
  const forms = new Set([raw]);
  let decoded = raw;
  for (let i = 0; i < 5; i++) {
    forms.add(decoded);
    forms.add(resolveDots(decoded));
    const next = decodeOnce(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  forms.add(resolveDots(decoded));
  return [...forms];
}

/** True when the browser says, or the Origin shows, that a request comes from anywhere but byway's own pages. */
function fromAnotherSite(headers: IncomingHttpHeaders): boolean {
  const site = header(headers, 'sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') return true;
  const origin = header(headers, 'origin');
  if (origin === null) return false;
  try {
    return origin === 'null' || new URL(origin).host.toLowerCase() !== (header(headers, 'host') ?? '').toLowerCase();
  } catch {
    return true;
  }
}

/**
 * The verdict for one request at the socket: the app's own guard (a loopback Host only, so no DNS rebinding; no
 * cross-site writes), with two additions. A WebSocket upgrade is held to the write rules (its Origin must be byway's),
 * since a page on any site may open one. And Next's internals refuse anything from another site, even a GET.
 */
export function guardRequest(req: Pick<IncomingMessage, 'method' | 'url' | 'headers'>, upgrade = false): GuardResult {
  const verdict = checkRequest({
    method: upgrade ? 'UPGRADE' : (req.method ?? 'GET'),
    host: header(req.headers, 'host'),
    origin: header(req.headers, 'origin'),
    secFetchSite: header(req.headers, 'sec-fetch-site'),
  });
  if (!verdict.ok) return verdict;
  if (requestPaths(req.url).some((p) => NEXT_INTERNALS.test(p)) && fromAnotherSite(req.headers)) {
    return { ok: false, status: 403, message: 'Only byway itself may use this.' };
  }
  return { ok: true };
}

function refuse(res: ServerResponse, verdict: Extract<GuardResult, { ok: false }>): void {
  res.writeHead(verdict.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: verdict.message }));
}

function refuseUpgrade(socket: Duplex, status: number, reason: string): void {
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`, () => socket.destroy());
}

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => unknown;
type UpgradeListener = (req: IncomingMessage, socket: Duplex, head: Buffer) => void;

export interface GuardedServer {
  /** Listens on 127.0.0.1 (the caller's job); every request and upgrade passes the guard first. */
  server: http.Server;
  /** Never listens: give it to Next as `httpServer`, so its WebSocket handler gets only upgrades the guard allowed. */
  gate: http.Server;
}

/** The public server: the guard, then `handle` for requests and the gate's upgrade listeners for WebSockets. */
export function createGuardedServer(handle: RequestHandler): GuardedServer {
  const gate = http.createServer();
  const server = http.createServer((req, res) => {
    const verdict = guardRequest(req);
    if (!verdict.ok) return refuse(res, verdict);
    Promise.resolve()
      .then(() => handle(req, res))
      .catch((err: unknown) => {
        console.error('The web app failed to answer a request:', err);
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('byway’s web app failed to answer. The details are in the terminal running pnpm dev.');
      });
  });
  // Long model calls (recommending, composing) answer in their own time; Next keeps its own limits.
  server.requestTimeout = 0;

  const onUpgrade: UpgradeListener = (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    const verdict = guardRequest(req, true);
    if (!verdict.ok) return refuseUpgrade(socket, verdict.status, 'Forbidden');
    // Next sets up its WebSocket handler on its first request; until then there is nothing to connect to, and the
    // HMR client tries again.
    if (gate.listenerCount('upgrade') === 0) return refuseUpgrade(socket, 503, 'Service Unavailable');
    gate.emit('upgrade', req, socket, head);
  };
  // An upgrade listener anyone else adds to the public server would run beside the guard: it is moved onto the gate.
  // 'newListener' fires just before the listener is added, so it is taken off in a microtask, before any I/O.
  server.on('newListener', (event: string | symbol, listener: UpgradeListener) => {
    if (event !== 'upgrade' || listener === onUpgrade) return;
    queueMicrotask(() => {
      server.removeListener('upgrade', listener);
      gate.on('upgrade', listener);
    });
  });
  server.on('upgrade', onUpgrade);
  return { server, gate };
}

export interface GuardedDevOptions {
  /** apps/web. */
  dir: string;
  port: number;
}

export interface GuardedDev {
  server: http.Server;
  /** Resolves once Next is prepared and has its WebSocket handler in place. */
  ready: Promise<void>;
  close(): Promise<void>;
}

/**
 * Starts `next dev` inside the guarded server on 127.0.0.1:`port`. It listens at once, and requests wait until Next is
 * prepared. NODE_ENV must already be "development": React and Next pick their builds when first loaded, so `next` is
 * loaded here (resolved from apps/web), after the caller has set it.
 */
export async function startGuardedDev(opts: GuardedDevOptions): Promise<GuardedDev> {
  const prepared = Promise.withResolvers<RequestHandler>();
  // Until Next is prepared, requests wait; if it fails to prepare, they fail with the plain 500.
  prepared.promise.catch(() => undefined);
  const { server, gate } = createGuardedServer(async (req, res) => (await prepared.promise)(req, res));
  const next = createRequire(import.meta.url)('next') as CreateNextApp;
  // Turbopack, as `next dev` uses by default in Next 16; next.config.ts keeps its file cache off (SEC-3).
  const app = next({ dev: true, dir: opts.dir, hostname: '127.0.0.1', port: opts.port, turbopack: true, httpServer: gate });
  app.prepare().then(() => prepared.resolve(app.getRequestHandler()), prepared.reject);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  // One request of our own, through the guard like any other, so Next sets up its WebSocket handler now rather than on
  // the first page load: a tab left open across a restart reconnects its HMR socket before it requests anything.
  const ready = prepared.promise.then(() => primeNext(opts.port));
  return {
    server,
    ready,
    async close() {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      await app.close();
    },
  };
}

function primeNext(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/_next/static/byway-ready', headers: { host: `127.0.0.1:${port}` }, agent: false }, (res) => {
      res.resume();
      res.on('end', () => resolve());
    });
    req.on('error', reject);
    req.end();
  });
}
