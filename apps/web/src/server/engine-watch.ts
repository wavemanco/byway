/**
 * Watching the run engine while byway runs (OPS-2). If the Temporal server or the worker stops, the web app can no
 * longer start or answer runs, so scripts/serve.ts says so and stops byway instead of carrying on with a dead engine.
 * A few consecutive failed checks are needed, so one slow answer is not mistaken for a stop.
 */

export interface EngineWatchOptions {
  /** Resolves when the engine answers; rejects or times out when it does not. */
  ping: () => Promise<unknown>;
  intervalMs?: number;
  /** Consecutive failed checks before the engine counts as stopped. */
  failures?: number;
  onDown: (reason: string) => void;
}

export interface EngineWatch {
  stop(): void;
}

export function watchEngine(opts: EngineWatchOptions): EngineWatch {
  const interval = opts.intervalMs ?? 5_000;
  const limit = opts.failures ?? 3;
  let failed = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async () => {
    if (stopped) return;
    try {
      await opts.ping();
      failed = 0;
    } catch {
      failed++;
    }
    if (stopped) return;
    if (failed >= limit) {
      stopped = true;
      opts.onDown(`the run engine did not answer ${limit} checks in a row`);
      return;
    }
    timer = setTimeout(() => void tick(), interval);
    timer.unref?.();
  };
  timer = setTimeout(() => void tick(), interval);
  timer.unref?.();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

/** The message serve.ts prints when the engine stops under it. */
export const ENGINE_STOPPED_MESSAGE = 'byway’s run engine stopped, so byway is stopping too. Start it again (pnpm start); what your runs made so far is kept.';
