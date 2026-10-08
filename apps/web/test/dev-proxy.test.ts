/**
 * The guard in front of `next dev` (SEC-6, C8): every request and WebSocket upgrade passes the app's guard before it
 * reaches Next, including Next's own dev endpoints that run before proxy.ts. A plain HTTP server stands in for Next.
 */
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createGuardProxy, guardRequest } from '../src/server/dev-proxy.ts';

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

/** Every socket either side opens is tracked, so upgraded connections are closed after each test too. */
const listen = (s: http.Server) =>
  new Promise<number>((resolve) => {
    servers.push(s);
    s.on('connection', (socket: net.Socket) => sockets.add(socket));
    s.listen(0, '127.0.0.1', () => resolve((s.address() as AddressInfo).port));
  });

/** Stands in for next dev: records what reached it, echoes requests, and accepts WebSocket upgrades. */
async function fakeNext() {
  const seen: string[] = [];
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url} host=${req.headers.host}`);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`next saw ${req.method} ${req.url}`);
  });
  server.on('upgrade', (req, socket) => {
    seen.push(`UPGRADE ${req.url} host=${req.headers.host}`);
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
    socket.on('data', (d) => socket.write(`echo:${d.toString()}`));
  });
  return { port: await listen(server), seen };
}

function request(port: number, path: string, headers: Record<string, string>, method = 'GET'): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers, agent: false }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** A raw upgrade handshake; resolves with the status line and, when switched, the first echoed frame. */
function upgrade(port: number, headers: Record<string, string>): Promise<{ status: string; echo?: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      sockets.add(socket);
      const lines = Object.entries({ Connection: 'Upgrade', Upgrade: 'websocket', ...headers }).map(([k, v]) => `${k}: ${v}`);
      socket.write(`GET /_next/hmr HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`);
    });
    let data = '';
    socket.on('data', (d) => {
      data += d.toString();
      const status = data.split('\r\n')[0] ?? '';
      if (!status.includes(' 101 ')) {
        socket.destroy();
        resolve({ status });
      } else if (!data.includes('echo:')) socket.write('ping');
      else {
        socket.destroy();
        resolve({ status, echo: data.slice(data.indexOf('echo:')) });
      }
    });
    socket.on('error', reject);
  });
}

async function setup() {
  const next = await fakeNext();
  const port = await listen(createGuardProxy({ targetPort: next.port }));
  return { next, port, own: `127.0.0.1:${port}` };
}

describe('the guard in front of next dev', () => {
  it('passes byway’s own requests through unchanged, Host included', async () => {
    const { next, port, own } = await setup();
    const res = await request(port, '/settings?x=1', { Host: own });
    expect(res).toEqual({ status: 200, body: 'next saw GET /settings?x=1' });
    expect(next.seen).toEqual([`GET /settings?x=1 host=${own}`]);
  });

  it('refuses a foreign Host on every path, Next’s internal endpoints included, before Next sees it', async () => {
    const { next, port } = await setup();
    for (const path of ['/__nextjs_launch-editor?file=C:%5Cnope.txt&lineNumber=1', '/__nextjs_attach-nodejs-inspector', '/_next/static/chunks/a.js', '/_next/mcp', '/']) {
      const res = await request(port, path, { Host: 'rebind.evil.example:3000' });
      expect(res.status, path).toBe(403);
    }
    expect(next.seen).toEqual([]);
  });

  it('refuses cross-site writes, and dev endpoints called from another site even with a loopback Host', async () => {
    const { next, port, own } = await setup();
    expect((await request(port, '/api/settings', { Host: own, Origin: 'http://evil.example' }, 'PATCH')).status).toBe(403);
    expect((await request(port, '/__nextjs_launch-editor?file=x', { Host: own, 'Sec-Fetch-Site': 'same-site' })).status).toBe(403);
    expect((await request(port, '/__nextjs_launch-editor?file=x', { Host: own, 'Sec-Fetch-Site': 'same-origin' })).status).toBe(200);
    expect(next.seen).toEqual([`GET /__nextjs_launch-editor?file=x host=${own}`]);
  });

  it('guards the HMR WebSocket upgrade: a foreign Host or Origin is refused, byway’s own is connected', async () => {
    const { next, port, own } = await setup();
    expect((await upgrade(port, { Host: 'rebind.evil.example:3000' })).status).toMatch(/ 403 /);
    expect((await upgrade(port, { Host: own, Origin: 'http://evil.example' })).status).toMatch(/ 403 /);
    expect(next.seen).toEqual([]);
    const ok = await upgrade(port, { Host: own, Origin: `http://${own}` });
    expect(ok.status).toMatch(/ 101 /);
    expect(ok.echo).toBe('echo:ping');
  });

  it('says plainly when next dev is not answering yet', async () => {
    // A port nothing listens on: the one a listener just released.
    const gone = http.createServer();
    const closed = await listen(gone);
    servers.splice(servers.indexOf(gone), 1);
    await new Promise<void>((resolve) => gone.close(() => resolve()));
    const port = await listen(createGuardProxy({ targetPort: closed }));
    const res = await request(port, '/', { Host: `127.0.0.1:${port}` });
    expect(res.status).toBe(502);
    expect(res.body).toMatch(/not answering yet/);
  });

  it('decides from the request alone', () => {
    expect(guardRequest({ method: 'GET', url: '/', headers: { host: 'localhost:3000' } }).ok).toBe(true);
    expect(guardRequest({ method: 'GET', url: '/', headers: {} }).ok).toBe(false);
    expect(guardRequest({ method: 'GET', url: '/_next/hmr', headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } }, true).ok).toBe(true);
  });
});
