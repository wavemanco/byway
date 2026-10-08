/**
 * The web app's Runner (spec §2: the web process is only a Temporal client). It connects to the engine that
 * `pnpm dev` / `pnpm demo` started on first use, not at startup, so screens that only read the store (History, a
 * finished run, its result) work while the engine is still starting or after it stopped. A failed connection is not
 * remembered: the next action tries again.
 */
import type { CheckpointResolution, Runner, RunView, StartRunInput, Store } from '@byway/contracts';

/** The engine could not be reached; route handlers answer 503 with this plain message. */
export class EngineUnavailableError extends Error {
  override name = 'EngineUnavailableError';
  constructor(cause: unknown) {
    super('byway’s run engine is not reachable. Start byway with “pnpm dev” (or “pnpm demo”), then try again.', { cause });
  }
}

export function engineRunner(store: Store, connect: () => Promise<Runner>): Runner {
  let connected: Promise<Runner> | undefined;
  const runner = (): Promise<Runner> =>
    (connected ??= connect().catch((err: unknown) => {
      connected = undefined;
      throw new EngineUnavailableError(err);
    }));

  return {
    start: async (input: StartRunInput) => (await runner()).start(input),
    resolve: async (resolution: CheckpointResolution) => (await runner()).resolve(resolution),
    cancel: async (runId: string) => (await runner()).cancel(runId),
    pause: async (runId: string) => (await runner()).pause(runId),
    resume: async (runId: string) => (await runner()).resume(runId),
    /** The Runner client's view reads only the store, so it is answered here without the engine. */
    async view(runId: string, afterSeq?: number): Promise<RunView> {
      const run = await store.getRun(runId);
      if (!run) throw new Error(`There is no run "${runId}".`);
      const [events, checkpoints] = await Promise.all([store.events(runId, afterSeq ?? 0), store.checkpointsForRun(runId)]);
      return { run, events, checkpoints };
    },
  };
}
