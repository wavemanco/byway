/**
 * The one owner of a screen's request sequence for polled server state (F15, ADR-0082). The Run screen and Nav
 * re-read the server on a timer, when the tab comes back, and after the person acts. Without an owner those requests
 * overlap, and each response is applied, and sets the connection state, in the order it happens to arrive: an older
 * snapshot that arrives late reopens an answered question, and an older request that fails late leaves a permanent
 * "byway is not answering" banner on a run that has ended.
 *
 * The rule here: only the latest-issued request may apply its data or set the connection state.
 * - `now()` issues a request at once and aborts the one before it (an action needs the state after itself).
 * - `poll()` joins the request in flight, if any, so timer and visibility polls never overlap.
 * - A request this instance aborted itself never sets the connection state; one that fails, or takes longer than
 *   `timeoutMs`, sets it to 'lost' when it is still the latest.
 * - `dispose()` makes the instance inert and is final for this instance only; its owner creates a new one.
 *
 * For a local, single-user app this gives the ordering a server-side snapshot revision would: each applied snapshot was
 * read by the server after the previous applied one arrived. Pure (no React, no DOM beyond AbortController).
 */

export type Connection = 'ok' | 'lost';

export interface RefresherOptions<T> {
  fetch(signal: AbortSignal): Promise<T>;
  apply(data: T): void;
  status(connection: Connection): void;
  /** A request that has not answered after this long is abandoned and counts as lost. */
  timeoutMs?: number;
}

export interface Refresher {
  /** Joins the request in flight, or starts one. */
  poll(): Promise<void>;
  /** Starts a request now, superseding (and aborting) any in flight. */
  now(): Promise<void>;
  dispose(): void;
}

/** Long enough for a large snapshot on a slow machine; short enough that one stalled request cannot stop polling. */
export const REQUEST_TIMEOUT_MS = 30_000;

export function createRefresher<T>(opts: RefresherOptions<T>): Refresher {
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  let generation = 0;
  let controller: AbortController | null = null;
  let inflight: Promise<void> | null = null;
  let disposed = false;

  function now(): Promise<void> {
    if (disposed) return Promise.resolve();
    const mine = ++generation;
    controller?.abort();
    const ctl = new AbortController();
    controller = ctl;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, timeoutMs);
    const latest = () => !disposed && mine === generation;
    // The fetch is called in a microtask, so `inflight` is set before anything below can settle (a synchronous
    // throw included) and the finally step always finds it.
    const settled: Promise<void> = Promise.resolve()
      .then(() => opts.fetch(ctl.signal))
      .then(
        (data) => {
          if (!latest()) return;
          opts.apply(data);
          opts.status('ok');
        },
        () => {
          // Superseded or disposed: a newer request, or nobody, owns the state now.
          if (!latest()) return;
          if (ctl.signal.aborted && !timedOut) return;
          opts.status('lost');
        },
      )
      .finally(() => {
        clearTimeout(timer);
        if (inflight === settled) inflight = null;
        if (controller === ctl) controller = null;
      });
    inflight = settled;
    return settled;
  }

  return {
    poll: () => (disposed ? Promise.resolve() : (inflight ?? now())),
    now,
    dispose() {
      disposed = true;
      controller?.abort();
      controller = null;
    },
  };
}
