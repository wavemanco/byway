/**
 * Whether byway has answered a request from this tab that it started again at a new address (guard.ts RESTARTED_CODE;
 * B-188's re-checks): any screen's poll or action can learn it (components/api.ts), and the layout's notice
 * (components/RestartedNotice.tsx) says it on every screen. Nothing at this address answers again, so it never clears.
 */

/** The refusal code of guard.ts's RESTARTED_CODE, which this side cannot import (guard.ts is the server's). */
export const RESTARTED = 'RESTARTED';

let restarted = false;
const listeners = new Set<() => void>();

export function markRestarted(): void {
  if (restarted) return;
  restarted = true;
  for (const listener of listeners) listener();
}

export const isRestarted = (): boolean => restarted;

export function onRestarted(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
