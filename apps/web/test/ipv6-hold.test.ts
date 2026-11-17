/**
 * byway holds its web port on IPv6 loopback (B-188's re-check; src/server/ipv6-hold.ts): a connection to [::1] reaches the
 * server on 127.0.0.1, and no other program can take [::1] at that port while byway runs, or before byway starts.
 */
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { holdIpv6Loopback, ipv6TakenMessage, type Ipv6Hold } from '../src/server/ipv6-hold.ts';

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

/** A server on 127.0.0.1 standing in for byway's web server; its port. */
async function web(): Promise<number> {
  const server = http.createServer((req, res) => res.end(`byway saw ${req.headers.host}`));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => new Promise((r) => server.close(r)));
  return (server.address() as AddressInfo).port;
}

const bind6 = (port: number) =>
  new Promise<net.Server>((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen({ host: '::1', port, ipv6Only: true }, () => resolve(s));
  });

const hasIpv6 = await bind6(0).then(
  (s) => (s.close(), true),
  () => false,
);

describe.skipIf(!hasIpv6)("byway's web port on IPv6 loopback", () => {
  it('passes a connection to [::1] on to byway at 127.0.0.1, Host and all', async () => {
    const port = await web();
    const hold = (await holdIpv6Loopback(port)) as Ipv6Hold;
    closers.push(() => hold.close());
    const body = await new Promise<string>((resolve, reject) => {
      http
        .get({ host: '::1', port, family: 6, path: '/', headers: { Host: `byway-name.localhost:${port}` }, agent: false }, (res) => {
          let b = '';
          res.setEncoding('utf8').on('data', (d: string) => (b += d)).on('end', () => resolve(b));
        })
        .on('error', reject);
    });
    expect(body).toBe(`byway saw byway-name.localhost:${port}`);
  });

  it('leaves no other program [::1] at the port while it is held', async () => {
    const port = await web();
    const hold = (await holdIpv6Loopback(port)) as Ipv6Hold;
    closers.push(() => hold.close());
    await expect(bind6(port)).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });

  it('refuses to start, plainly, when another program already holds [::1] at the port', async () => {
    const port = await web();
    const squatter = await bind6(port);
    closers.push(() => new Promise((r) => squatter.close(r)));
    await expect(holdIpv6Loopback(port)).rejects.toThrow(ipv6TakenMessage(port));
  });

  it('lets the port go when byway stops', async () => {
    const port = await web();
    const hold = (await holdIpv6Loopback(port)) as Ipv6Hold;
    await hold.close();
    const again = await bind6(port);
    await new Promise((r) => again.close(r));
  });
});
