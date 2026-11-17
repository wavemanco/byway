/**
 * byway's web port on IPv6 loopback (B-188's re-check). Chrome and Edge open the start link's .localhost name on [::1]
 * first, and the web server listens on 127.0.0.1 only, so a program listening on [::1] at byway's port would receive the
 * start link, key included, and could pass everything on to byway unseen. byway holds that address itself while it runs,
 * and passes each connection on to 127.0.0.1, where the guard sees it as any other.
 */
import net from 'node:net';

export const ipv6TakenMessage = (port: number): string =>
  `Port ${port} on [::1] (IPv6 loopback) is already in use by another program. byway holds it so that no other program receives the link it prints: stop that program, or choose another port with PORT.`;

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
