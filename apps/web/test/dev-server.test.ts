/**
 * Contributor mode's web server (SEC-6, C8): every request and WebSocket upgrade passes the app's guard before Next
 * sees it, including Next's own dev endpoints, which answer before proxy.ts runs. Plain handlers stand in for Next here;
 * dev-server.real.test.ts runs the real next dev.
 */
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { createGuardedServer, guardRequest, requestPaths, type NextDevApp, type NextDevOptions } from '../src/server/dev-server.ts';
import { request, upgrade } from './fixtures/http.ts';

/** Next's own `next()`, from the installed package: dev-server.ts types the part it uses locally (see there). */
type InstalledNext = typeof import('next').default;

const servers: http.Server[] = [];
const sockets = new Set<net.Socket>();

afterEach(async () => {
  for (const s of sockets) s.destroy();
  sockets.clear();
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }
});

const listen = (s: http.Server) =>
  new Promise<number>((resolve) => {
    servers.push(s);
    s.on('connection', (socket: net.Socket) => sockets.add(socket));
    s.listen(0, '127.0.0.1', () => resolve((s.address() as AddressInfo).port));
  });

/**
 * Stands in for Next: answers requests, and on its first request attaches its WebSocket handler the way Next's custom
 * server does, to the server it was given (`gate`) or else to the one the request came in on.
 */
function fakeNext(gate: http.Server | undefined) {
  const seen: string[] = [];
  let attached = false;
  const onUpgrade = (req: http.IncomingMessage, socket: Duplex) => {
    seen.push(`UPGRADE ${req.url} host=${req.headers.host}`);
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
    socket.on('data', (d) => socket.write(`echo:${d.toString()}`));
  };
  const handle = (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (!attached) {
      attached = true;
      (gate ?? (req.socket as net.Socket & { server: http.Server }).server).on('upgrade', onUpgrade);
    }
    seen.push(`${req.method} ${req.url} host=${req.headers.host}`);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`next saw ${req.method} ${req.url}`);
  };
  return { handle, seen };
}

async function setup(attachTo: 'gate' | 'public' = 'gate') {
  let next: ReturnType<typeof fakeNext> | undefined;
  const { server, gate } = createGuardedServer((req, res) => next!.handle(req, res));
  next = fakeNext(attachTo === 'gate' ? gate : undefined);
  const port = await listen(server);
  return { next, server, port, own: `127.0.0.1:${port}` };
}

const REFUSED_PATHS = [
  '/__nextjs_launch-editor?file=C:%5Cnope.txt&lineNumber=1',
  '/__nextjs_attach-nodejs-inspector',
  '/__nextjs_original-stack-frames',
  '/_next/static/chunks/a.js',
  '/_next/mcp',
  '/_next/%2e%2e/__nextjs_launch-editor',
  '/',
];

describe('contributor mode’s guarded server', () => {
  it('passes byway’s own requests to Next unchanged, Host included', async () => {
    const { next, port, own } = await setup();
    const res = await request(port, '/settings?x=1', { Host: own });
    expect(res).toEqual({ status: 200, body: 'next saw GET /settings?x=1' });
    expect(next.seen).toEqual([`GET /settings?x=1 host=${own}`]);
  });

  it('refuses a foreign Host on every path, Next’s internal endpoints included, before Next sees it', async () => {
    const { next, port } = await setup();
    for (const path of REFUSED_PATHS) {
      for (const method of ['GET', 'POST']) {
        const res = await request(port, path, { Host: 'rebind.evil.example:3000' }, method);
        expect(res.status, `${method} ${path}`).toBe(403);
        expect(res.body).toContain('only answers requests addressed to this computer');
      }
    }
    expect(next.seen).toEqual([]);
  });

  it('refuses Next’s internals to another site even with a loopback Host, encoded dot segments included', async () => {
    const { next, port, own } = await setup();
    const crossSite = { Host: own, 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'no-cors' };
    for (const path of [
      '/__nextjs_launch-editor?file=C:%5Cnope.txt',
      '/__nextjs_attach-nodejs-inspector',
      '/__nextjs_restart_dev',
      '/_next/static/chunks/a.js',
      '/.well-known/appspecific/com.chrome.devtools.json',
      // The re-check's bypass: Next decodes %2e%2e after a check on the raw path.
      '/_next/%2e%2e/__nextjs_launch-editor',
      '/_next/%2E%2E/__nextjs_launch-editor',
      '/x/%2e%2e/__nextjs_launch-editor',
      '/x/..%2f__nextjs_launch-editor',
      '/x/%252e%252e/__nextjs_launch-editor',
      '/%5F%5Fnextjs_launch-editor',
      '//__nextjs_launch-editor',
      '/./__nextjs_launch-editor',
      '/x\\..\\__nextjs_launch-editor',
    ]) {
      const res = await request(port, path, crossSite);
      expect(res.status, path).toBe(403);
      expect(res.body, path).toContain('Only byway itself may use this.');
    }
    // A same-site page (another port on this computer) and an opaque origin are other sites too.
    expect((await request(port, '/__nextjs_launch-editor?file=x', { Host: own, 'Sec-Fetch-Site': 'same-site' })).status).toBe(403);
    expect((await request(port, '/__nextjs_launch-editor?file=x', { Host: own, Origin: 'null' })).status).toBe(403);
    expect((await request(port, '/__nextjs_launch-editor?file=x', { Host: own, Origin: 'http://127.0.0.1:9999' })).status).toBe(403);
    expect(next.seen).toEqual([]);
    // byway's own pages may use them.
    expect((await request(port, '/__nextjs_launch-editor?file=x', { Host: own, 'Sec-Fetch-Site': 'same-origin' })).status).toBe(200);
    expect((await request(port, '/_next/static/chunks/a.js', { Host: own, 'Sec-Fetch-Site': 'same-origin', Origin: `http://${own}` })).status).toBe(200);
  });

  it('refuses cross-site writes anywhere', async () => {
    const { next, port, own } = await setup();
    expect((await request(port, '/api/settings', { Host: own, Origin: 'http://evil.example' }, 'PATCH')).status).toBe(403);
    expect((await request(port, '/api/runs', { Host: own, 'Sec-Fetch-Site': 'cross-site' }, 'POST')).status).toBe(403);
    expect(next.seen).toEqual([]);
  });

  for (const attachTo of ['gate', 'public'] as const) {
    it(`guards the HMR upgrade before Next’s handler, even one Next attaches to the ${attachTo === 'gate' ? 'server it was given' : 'public server itself'}`, async () => {
      const { next, server, port, own } = await setup(attachTo);
      // Next attaches its WebSocket handler on its first request.
      expect((await request(port, '/', { Host: own })).status).toBe(200);
      // Only the guard listens for upgrades on the public server.
      expect(server.listenerCount('upgrade')).toBe(1);
      expect((await upgrade(port, { Host: 'rebind.evil.example:3000' })).status).toMatch(/ 403 /);
      expect((await upgrade(port, { Host: own, Origin: 'http://evil.example' })).status).toMatch(/ 403 /);
      expect((await upgrade(port, { Host: own, Origin: 'null' })).status).toMatch(/ 403 /);
      expect((await upgrade(port, { Host: own, Origin: `http://${own}`, 'Sec-Fetch-Site': 'cross-site' })).status).toMatch(/ 403 /);
      expect(next.seen.filter((s) => s.startsWith('UPGRADE'))).toEqual([]);
      const ok = await upgrade(port, { Host: own, Origin: `http://${own}` }, { echo: true });
      expect(ok.status).toMatch(/ 101 /);
      expect(ok.echo).toBe('echo:ping');
    });
  }

  it('says an upgrade must wait while Next has not set up its WebSocket handler yet', async () => {
    const { port, own } = await setup();
    expect((await upgrade(port, { Host: own, Origin: `http://${own}` })).status).toMatch(/ 503 /);
  });

  it('answers a plain 500 when Next throws, and stays up', async () => {
    const { server } = createGuardedServer(() => {
      throw new Error('boom');
    });
    const port = await listen(server);
    const res = await request(port, '/', { Host: `127.0.0.1:${port}` });
    expect(res.status).toBe(500);
    expect(res.body).not.toContain('boom');
    expect((await request(port, '/', { Host: `127.0.0.1:${port}` })).status).toBe(500);
  });
});

describe('the Next custom-server API dev-server.ts relies on', () => {
  it('matches the installed next: its options are ones next() takes, and next() returns what it calls', () => {
    // Checked by the type checker (pnpm typecheck): a change in Next's API fails here, not at a contributor's start.
    const options = (o: NextDevOptions): Parameters<InstalledNext>[0] => o;
    const app = (a: ReturnType<InstalledNext>): NextDevApp => a;
    expect([typeof options, typeof app]).toEqual(['function', 'function']);
  });
});

describe('the guard’s view of a path', () => {
  it('decodes and resolves dot segments the way Next will, keeping the raw form too', () => {
    expect(requestPaths('/_next/%2e%2e/__nextjs_launch-editor?file=x')).toContain('/__nextjs_launch-editor');
    expect(requestPaths('/a/b/../../__nextjs_x')).toContain('/__nextjs_x');
    expect(requestPaths('/a/%252e%252e/__nextjs_x')).toContain('/__nextjs_x');
    expect(requestPaths('http://127.0.0.1:3000/__nextjs_launch-editor')).toContain('/__nextjs_launch-editor');
    expect(requestPaths('/%E0%A4%A')).toContain('/%E0%A4%A');
    expect(requestPaths('/settings')).toEqual(['/settings']);
  });

  it('decides from the request alone', () => {
    expect(guardRequest({ method: 'GET', url: '/', headers: { host: 'localhost:3000' } }).ok).toBe(true);
    expect(guardRequest({ method: 'GET', url: '/', headers: {} }).ok).toBe(false);
    expect(guardRequest({ method: 'GET', url: '/_next/hmr', headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } }, true).ok).toBe(true);
    expect(guardRequest({ method: 'GET', url: '/_next/hmr', headers: { host: '127.0.0.1:3000' } }, true).ok).toBe(true);
    expect(guardRequest({ method: 'GET', url: '/_next/%2e%2e/__nextjs_launch-editor', headers: { host: '127.0.0.1:3000', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' } }).ok).toBe(false);
  });
});
