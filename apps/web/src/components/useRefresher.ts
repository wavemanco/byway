'use client';

/**
 * React ownership of the refresh sequencer (view/refresh.ts, ADR-0082). One refresher per key (the run, or Nav's page),
 * created and disposed by one effect keyed only on that key. The key-only effect matters: the poll delay changes with
 * the run's status (running, waiting, running), and StrictMode runs every effect's setup, cleanup and setup again in
 * development, so an instance tied to anything else would be disposed under a live screen and stop applying snapshots.
 *
 * The timer is a separate effect (usePolling) keyed on the delay. It re-arms only after a poll settles, skips its polls
 * while the tab is hidden, and never disposes the refresher.
 */
import { useEffect, useMemo, useRef } from 'react';
import { createRefresher, type Connection, type Refresher } from '../view/refresh.ts';

export interface RefreshHandle {
  /** Joins the request in flight, or starts one. */
  poll(): Promise<void>;
  /** Re-reads now, superseding any request in flight: after the person acts. */
  now(): Promise<void>;
}

export function useRefresher<T>(key: string, fetch: (signal: AbortSignal) => Promise<T>, apply: (data: T) => void, status: (connection: Connection) => void): RefreshHandle {
  // The latest callbacks, so the refresher never needs re-creating when they change.
  const callbacks = useRef({ fetch, apply, status });
  callbacks.current = { fetch, apply, status };
  const instance = useRef<Refresher | null>(null);

  useEffect(() => {
    const refresher = createRefresher<T>({
      fetch: (signal) => callbacks.current.fetch(signal),
      apply: (data) => callbacks.current.apply(data),
      status: (connection) => callbacks.current.status(connection),
    });
    instance.current = refresher;
    // The server-rendered snapshot (or a stale one from the browser's back/forward cache) is re-read through the same
    // ordered path, so it is superseded like any other.
    void refresher.now();
    return () => {
      refresher.dispose();
      if (instance.current === refresher) instance.current = null;
    };
  }, [key]);

  return useMemo<RefreshHandle>(
    () => ({
      poll: () => instance.current?.poll() ?? Promise.resolve(),
      now: () => instance.current?.now() ?? Promise.resolve(),
    }),
    [],
  );
}

/**
 * Polls every `delay` ms (null: not at all), and when the tab becomes visible again. A hidden tab skips its polls; the
 * screen catches up when you come back.
 */
export function usePolling(handle: RefreshHandle, delay: number | null): void {
  useEffect(() => {
    if (delay === null) return;
    let cancelled = false;
    let timer = 0;
    const tick = async () => {
      if (document.visibilityState === 'visible') await handle.poll();
      if (!cancelled) timer = window.setTimeout(() => void tick(), delay);
    };
    timer = window.setTimeout(() => void tick(), delay);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void handle.poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [handle, delay]);
}
