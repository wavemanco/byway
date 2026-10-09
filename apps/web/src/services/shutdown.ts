/**
 * Closing the web process's services when byway stops (ADR-0099, which closes ADR-0095 decision 5's residual).
 *
 * The web process recommends and composes with real models: its gateways admit those calls in the spend book. A gateway
 * that is never closed cannot hand its calls back, so on a stop a call in flight counted as under way until its 60 s
 * lease ran out, as a crashed process's would. Now byway's stop reaches this process and closes the service host: its
 * gateways hand their calls back at once (a call they had sent counts as may have been billed, against the workspace
 * only, until the person clears it), and the store closes.
 *
 * How the stop arrives:
 * - `pnpm start` / `pnpm demo`: scripts/serve.ts starts `next start` with an IPC channel and sends 'stop' over it (a
 *   signal cannot be sent gracefully to a child on Windows). The app's instrumentation hook (apps/web/instrumentation.ts)
 *   calls stopOnRequest when the server starts, so this process closes its services and exits; if byway goes away
 *   instead, the channel closes and it stops the same way.
 * - `pnpm dev`: scripts/dev-web.ts already owns its stop (it closes the guarded server, so no request comes in, then
 *   calls closeServices). It marks the process (STOPPER_KEY) so stopOnRequest leaves the stop to it.
 *
 * The host lives on globalThis (services/index.ts), shared by every server bundle in the process; this module reads it
 * there. It imports nothing from Next or `server-only`, so the scripts can load it too.
 */

/** Where services/index.ts keeps the process's ServiceHost (a promise of it). */
export const SERVICES_KEY = Symbol.for('byway.services');
/** Set once the services are closing: services/index.ts then refuses requests instead of opening them again. */
const STOPPING_KEY = Symbol.for('byway.services.stopping');
/** Set by a process that stops itself and closes the services on the way (scripts/dev-web.ts). */
export const STOPPER_KEY = Symbol.for('byway.web.stopper');

/** How long closing may take before the process exits anyway: the gateways' last outbox writes wait at most 2 s each. */
const STOP_DEADLINE_MS = 10_000;

type Holder = Record<symbol, unknown>;

/** Whether this process's services are closing or closed: it takes no more requests that need them. */
export function stopping(holder: Holder = globalThis as unknown as Holder): boolean {
  return holder[STOPPING_KEY] !== undefined;
}

/**
 * Closes the services this process opened, once (later calls share the first): the host's gateways hand back the calls
 * they hold, then its store closes. Requests that come after are refused (services/index.ts). A host that never opened,
 * or failed to, needs nothing. Never throws: byway is stopping either way.
 */
export function closeServices(holder: Holder = globalThis as unknown as Holder): Promise<void> {
  const already = holder[STOPPING_KEY] as Promise<void> | undefined;
  if (already) return already;
  const closing = (async () => {
    const opened = holder[SERVICES_KEY] as Promise<{ close(): Promise<void> }> | undefined;
    if (!opened) return;
    const host = await opened.catch(() => undefined);
    await host?.close().catch((e: unknown) => console.error(`byway could not close the web app’s services cleanly: ${e instanceof Error ? e.message : String(e)}`));
  })();
  holder[STOPPING_KEY] = closing;
  return closing;
}

/** The part of a Node process stopOnRequest uses (tests pass a stand-in). */
export interface StoppableProcess {
  send?: unknown;
  on(event: 'message', listener: (message: unknown) => void): unknown;
  on(event: 'disconnect', listener: () => void): unknown;
  exit(code: number): void;
}

/**
 * In a web process byway started with an IPC channel (`next start` from scripts/serve.ts): when byway asks ('stop') or
 * goes away (the channel closes), close the services, then exit. Does nothing without a channel (`next start` run by
 * hand, where Next's own signal handling applies) or where the process already stops itself (STOPPER_KEY).
 */
export function stopOnRequest(proc: StoppableProcess = process as unknown as StoppableProcess, holder: Holder = globalThis as unknown as Holder): void {
  if (typeof proc.send !== 'function' || holder[STOPPER_KEY] !== undefined) return;
  holder[STOPPER_KEY] = 'ipc';
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    const deadline = setTimeout(() => proc.exit(0), STOP_DEADLINE_MS);
    deadline.unref?.();
    void closeServices(holder).finally(() => {
      clearTimeout(deadline);
      proc.exit(0);
    });
  };
  proc.on('message', (message) => {
    if (message === 'stop') stop();
  });
  proc.on('disconnect', stop);
}
