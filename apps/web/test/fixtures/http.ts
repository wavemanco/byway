/**
 * Raw HTTP for the guard tests (SEC-6): Node's http and net, because a browser or fetch sets Host itself, and a
 * WebSocket upgrade has to be written by hand to see the guard's answer before anything else.
 */
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';

export function request(port: number, path: string, headers: Record<string, string>, method = 'GET'): Promise<{ status: number; body: string }> {
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

export interface UpgradeOptions {
  path?: string;
  /** After a 101, write "ping" and wait for the stand-in's "echo:" answer (a real WebSocket server would not echo). */
  echo?: boolean;
}

/** A raw WebSocket handshake. Resolves with the status line (and the echo, when asked); the socket is always closed. */
export function upgrade(port: number, headers: Record<string, string>, opts: UpgradeOptions = {}): Promise<{ status: string; echo?: string }> {
  return new Promise((resolve, reject) => {
    let data = '';
    const status = () => data.split('\r\n')[0] ?? '';
    const done = (result: { status: string; echo?: string }) => {
      socket.destroy();
      resolve(result);
    };
    const socket = net.connect(port, '127.0.0.1', () => {
      const all = { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': randomBytes(16).toString('base64'), ...headers };
      const lines = Object.entries(all).map(([k, v]) => `${k}: ${v}`);
      socket.write(`GET ${opts.path ?? '/_next/hmr?id=byway-test'} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`);
    });
    socket.setTimeout(20_000, () => done({ status: status() || 'no answer' }));
    socket.on('data', (d) => {
      data += d.toString();
      if (!data.includes('\r\n')) return;
      if (!status().includes(' 101 ') || !opts.echo) return done({ status: status() });
      if (!data.includes('echo:')) socket.write('ping');
      else done({ status: status(), echo: data.slice(data.indexOf('echo:')) });
    });
    socket.on('close', () => resolve({ status: status() }));
    socket.on('error', reject);
  });
}
