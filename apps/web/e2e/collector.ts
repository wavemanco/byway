/**
 * A stand-in for "another site" in the consent tests (F05, ADR-0085): a server on its own loopback port, so it is a
 * different origin from byway, that records every request it gets. A generated page that leaks reaches it by navigating
 * itself (a script, a meta refresh or a followed link) with what it holds in the address.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface Collector {
  /** The collector's origin, e.g. http://127.0.0.1:53123. */
  readonly origin: string;
  /** Every path and query it was asked for, in order. */
  hits(): string[];
  clear(): void;
  close(): Promise<void>;
}

export async function startCollector(): Promise<Collector> {
  const seen: string[] = [];
  const server = http.createServer((req, res) => {
    seen.push(req.url ?? '/');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('collected');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    hits: () => [...seen],
    clear: () => void seen.splice(0),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
