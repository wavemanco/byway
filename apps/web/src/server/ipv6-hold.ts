/**
 * byway's web port on IPv6 loopback (B-188's re-check). Chrome and Edge open the start link's .localhost name on [::1]
 * first, and the web server listens on 127.0.0.1 only, so a program listening on [::1] at byway's port would receive the
 * start link, key included, and could pass everything on to byway unseen. byway holds that address itself while it runs,
 * and passes each connection on to 127.0.0.1, where the guard sees it as any other.
 */
import net from 'node:net';

export const ipv6TakenMessage = (port: number): string =>
  `Port ${port} on [::1] (IPv6 loopback) is already in use by another program. byway holds it so that no other program receives the link it prints: stop that program, or choose another port with PORT.`;

/**
 * Whether anything accepts a connection at host:`port` now (B-188's re-check 2). On Windows a bind beside another
 * program's 0.0.0.0 or [::] listener succeeds, so a bind check misses that program; a connection does not. Nothing is
 * sent; refused, unreachable or no answer within `timeoutMs` counts as nothing there.
 */
export function answersAt(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (yes: boolean) => {
      socket.destroy();
      resolve(yes);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

export interface Ipv6Hold {
  close(): Promise<void>;
}

/**
 * Holds [::1]:`port` and passes each connection on to 127.0.0.1:`port`. Undefined when this computer has no IPv6
 * loopback, where no browser can reach [::1] either; throws ipv6TakenMessage when another program holds it.
 */
export async function holdIpv6Loopback(port: number): Promise<Ipv6Hold | undefined> {
  const open = new Set<net.Socket>();
  const server = net.createServer((client) => {
    const upstream = net.connect({ host: '127.0.0.1', port });
    open.add(client).add(upstream);
    const end = () => {
      client.destroy();
      upstream.destroy();
      open.delete(client);
      open.delete(upstream);
    };
    for (const s of [client, upstream]) s.on('error', end).on('close', end);
    client.pipe(upstream).pipe(client);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen({ host: '::1', port, ipv6Only: true }, () => resolve());
    });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'EADDRNOTAVAIL' || code === 'EAFNOSUPPORT') return undefined;
    if (code === 'EADDRINUSE' || code === 'EACCES') throw new Error(ipv6TakenMessage(port));
    throw e;
  }
  server.on('error', () => undefined);
  return {
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of open) s.destroy();
        server.close(() => resolve());
      }),
  };
}
