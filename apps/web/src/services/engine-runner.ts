/**
 * The web app's Runner (spec §2: the web process is only a Temporal client). It connects to the engine that
 * `pnpm start` / `pnpm demo` / `pnpm dev` started on first use, not at startup, so screens that only read the store
 * (History, a finished run, its result) work while the engine is still starting or after it stopped.
 *
 * The engine can stop after the app connected (OPS-2). Then the Temporal client fails each call with a gRPC transport
 * error (UNAVAILABLE, or DEADLINE_EXCEEDED while it waits), which would otherwise reach the person as "Workflow Update
 * failed" or a generic 500. Such a failure is reported as the engine being unavailable (a 503 with a plain message),
 * and the cached connection is dropped, so the next action connects again once byway has been restarted.
 *
 * A DEADLINE_EXCEEDED can also come from an engine that is running but slow, which may have done what it was asked (B1,
 * ADR-0107), so the message says the engine is not running or did not answer in time. A run start that times out is
 * settled before it gets here: the Runner client asks Temporal whether the run's workflow exists before it marks the run
 * failed (packages/runner/src/client.ts), and the run's own message says what it found.
 */
import type { CheckpointResolution, Runner, RunView, StartRunInput, Store } from '@byway/contracts';

/** The engine could not be reached, or did not answer in time; route handlers answer 503 with this plain message. */
export class EngineUnavailableError extends Error {
  override name = 'EngineUnavailableError';
  constructor(cause: unknown) {
    super('byway’s run engine is not running, or did not answer in time. Restart byway (pnpm start), then try again.', { cause });
  }
}

/**
 * Recognises the error by name: the services live on globalThis and may have been created by another server bundle,
 * whose copy of this module's class is a different object, so `instanceof` cannot be relied on.
 */
export function isEngineUnavailable(err: unknown): boolean {
  return err instanceof Error && err.name === 'EngineUnavailableError';
}

/** gRPC status codes that mean the server was not there or did not answer: 14 UNAVAILABLE, 4 DEADLINE_EXCEEDED. */
const TRANSPORT_CODES = new Set([14, 4]);
const TRANSPORT_TEXT = /\bECONNREFUSED\b|\bECONNRESET\b|\b14 UNAVAILABLE\b|No connection established/;

/** True when an error, or anything in its cause chain, says the engine could not be reached. */
export function isTransportFailure(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e instanceof Error && depth < 8; e = e.cause, depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'number' && TRANSPORT_CODES.has(code)) return true;
    if (typeof code === 'string' && (code === 'ECONNREFUSED' || code === 'ECONNRESET')) return true;
    if (TRANSPORT_TEXT.test(e.message)) return true;
  }
  return false;
}

export function engineRunner(store: Store, connect: () => Promise<Runner>): Runner {
  let connected: Promise<Runner> | undefined;
  const runner = (): Promise<Runner> =>
    (connected ??= connect().catch((err: unknown) => {
      connected = undefined;
      throw new EngineUnavailableError(err);
    }));

  /** Runs one engine call; a transport failure drops the connection and becomes EngineUnavailableError. */
  async function call<T>(use: (r: Runner) => Promise<T>): Promise<T> {
    const r = await runner();
    try {
      return await use(r);
    } catch (err) {
      if (!isTransportFailure(err)) throw err;
      connected = undefined;
      throw new EngineUnavailableError(err);
    }
  }

  return {
    start: (input: StartRunInput) => call((r) => r.start(input)),
    resolve: (resolution: CheckpointResolution) => call((r) => r.resolve(resolution)),
    cancel: (runId: string) => call((r) => r.cancel(runId)),
    pause: (runId: string) => call((r) => r.pause(runId)),
    resume: (runId: string) => call((r) => r.resume(runId)),
    /** The Runner client's view reads only the store, so it is answered here without the engine. */
    async view(runId: string, afterSeq?: number): Promise<RunView> {
      const run = await store.getRun(runId);
      if (!run) throw new Error(`There is no run "${runId}".`);
      const [events, checkpoints] = await Promise.all([store.events(runId, afterSeq ?? 0), store.checkpointsForRun(runId)]);
      return { run, events, checkpoints };
    },
  };
}
