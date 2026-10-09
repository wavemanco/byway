/**
 * The web app in contributor mode (`pnpm dev`, started by scripts/serve.ts): `next dev` inside byway's guarded server
 * on 127.0.0.1:PORT, the only port it listens on (apps/web/src/server/dev-server.ts; SEC-6). Run with plain Node from
 * apps/web, which strips this file's types itself, as `next dev` was run, so Next loads the app and its config the same
 * way.
 *
 * It tells its parent it is ready over IPC ({ ready: true }), and stops cleanly when the parent asks ('stop'), when the
 * parent goes away (the IPC channel closes), or on SIGINT and SIGTERM. Stopping closes the guarded server first, so no
 * request comes in, then the web app's services, whose gateways hand back the recommending and composing calls they
 * hold at once (apps/web/src/services/shutdown.ts; ADR-0099).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startGuardedDev } from '../apps/web/src/server/dev-server.ts';
import { closeServices, STOPPER_KEY } from '../apps/web/src/services/shutdown.ts';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web');
/** How long a clean stop may take before the process exits anyway. */
const STOP_DEADLINE_MS = 10_000;

async function main(): Promise<void> {
  const raw = process.env.PORT?.trim() ?? '';
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`PORT must be a port number, not "${raw}".`);
  // React and Next choose their development builds from this when they first load.
  if (process.env.NODE_ENV !== 'development') Object.assign(process.env, { NODE_ENV: 'development' });

  // This process stops itself (below), closing the services on the way; the app's instrumentation hook leaves it to us.
  (globalThis as Record<symbol, unknown>)[STOPPER_KEY] = 'dev-web';
  const dev = await startGuardedDev({ dir: WEB, port });
  let stopping = false;
  const stop = (code: number) => {
    if (stopping) return;
    stopping = true;
    setTimeout(() => process.exit(code), STOP_DEADLINE_MS).unref();
    dev
      .close()
      .catch(() => undefined)
      .then(() => closeServices())
      .then(
        () => process.exit(code),
        () => process.exit(code),
      );
  };
  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));
  process.on('message', (message) => {
    if (message === 'stop') stop(0);
  });
  process.on('disconnect', () => stop(0));

  await dev.ready;
  console.log(`  web        ready (next dev behind byway’s guard on 127.0.0.1:${port})`);
  process.send?.({ ready: true });
}

main().catch((err: unknown) => {
  console.error(`The web app did not start: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
