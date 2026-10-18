/**
 * The renderer's browsers (SEC-5; ADR-0106). Every load (a render's screen, a visitor read) takes the shared browser,
 * which is launched on first use and launched again after a crash, a disconnect or a failed launch (ENG-14). A load
 * counts on the browser it took until it lets it go.
 *
 * A load whose page does not close in time (pages.ts dispose: a stuck renderer, a browser that does not answer, or the
 * engine's own thread paused) retires its browser instead of closing it: new loads launch another, and the loads still
 * on the retired one finish there. It is closed when the last of them lets it go, and at the latest one load's limit
 * plus the close limit after it was retired (the backstop). Every load on it is bounded by those two limits, so the
 * backstop closes it only if a load never lets it go. Closing it is bounded by the close limit too; past that,
 * Playwright's own close goes on.
 *
 * byway's own closes give Playwright a reason, which a call still under way on that browser fails with, and are
 * remembered (closedWith), so a load that fails on a browser byway closed can say so: a call made after the close fails
 * only with "Target page, context or browser has been closed", the text a crash gives.
 */

/** What byway's own closes of the renderer's browser say, first: a load they stop says so (pages.ts drawFailure). */
export const BYWAY_CLOSED = 'byway closed the page renderer';

/** The part of a browser this needs (Playwright's Browser has it). */
export interface KeptBrowser {
  isConnected(): boolean;
  close(options?: { reason?: string }): Promise<void>;
  on(event: 'disconnected', listener: () => void): unknown;
}

export interface RenderBrowsers<B extends KeptBrowser> {
  /**
   * For a load: the shared browser, launched if there is none (or none that works), counted as in use from here until
   * release(b). A failed launch rejects, and the next call launches again.
   */
  take(): Promise<B>;
  /** The shared browser, launched if need be, not counted as in use (the readiness check). */
  find(): Promise<B>;
  /** A load is done with b. If b was retired and this was its last load, b is closed (within the close limit). */
  release(b: B): Promise<void>;
  /** b did not close a page in time: new loads launch another browser, and b is closed once no load uses it. */
  retire(b: B): void;
  /** The reason byway closed b with, if byway closed it. */
  closedWith(b: B): string | undefined;
  /** Close every browser: the one in use (after a launch still on its way) and every retired one. */
  close(): Promise<void>;
}

export interface RenderBrowsersLimits {
  /** How long one load may take (pages.ts timeoutMs). */
  timeoutMs: number;
  /** How long a page's context may take to close, and a browser byway closes (pages.ts closeTimeoutMs). */
  closeTimeoutMs: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms).unref());

export function renderBrowsers<B extends KeptBrowser>(launch: () => Promise<B>, { timeoutMs, closeTimeoutMs }: RenderBrowsersLimits): RenderBrowsers<B> {
  const retiredReason = `${BYWAY_CLOSED} after a page in it took more than ${closeTimeoutMs / 1000} s to close`;
  const shutdownReason = `${BYWAY_CLOSED} as it shut down`;
  /** The shared browser, or its launch on the way. */
  let current: Promise<B> | undefined;
  /** Each browser launched that byway has not closed and that has not gone away: its loads, its launch, its backstop once retired. */
  const kept = new Map<B, { loads: number; launching: Promise<B>; backstop?: NodeJS.Timeout }>();
  const closedBy = new WeakMap<B, string>();

  /** Close b now, with a reason, at most once; waits for the close at most `limit` ms (undefined: until it ends). */
  const shut = async (b: B, reason: string, limit?: number): Promise<void> => {
    const k = kept.get(b);
    if (!k) return;
    clearTimeout(k.backstop);
    kept.delete(b);
    closedBy.set(b, reason);
    const closing = b.close({ reason }).catch(() => undefined);
    await (limit === undefined ? closing : Promise.race([closing, sleep(limit)]));
  };

  const get = async (count: boolean): Promise<B> => {
    for (let c = current; c; c = current) {
      const b = await c.catch(() => undefined);
      const k = b && kept.get(b);
      if (b && k && !k.backstop && b.isConnected()) {
        if (count) k.loads++;
        return b;
      }
      // Gone or retired: forget it, unless a concurrent load already launched a new one (then look again).
      if (current === c) current = undefined;
    }
    const launching: Promise<B> = launch().then((b) => {
      kept.set(b, { loads: 0, launching });
      b.on('disconnected', () => {
        clearTimeout(kept.get(b)?.backstop);
        kept.delete(b);
        if (current === launching) current = undefined;
      });
      return b;
    });
    current = launching;
    launching.catch(() => {
      if (current === launching) current = undefined;
    });
    const b = await launching;
    const k = kept.get(b);
    if (count && k) k.loads++;
    return b;
  };

  return {
    take: () => get(true),
    find: () => get(false),
    async release(b) {
      const k = kept.get(b);
      if (!k) return;
      k.loads--;
      if (k.loads <= 0 && k.backstop) await shut(b, retiredReason, closeTimeoutMs);
    },
    retire(b) {
      const k = kept.get(b);
      if (!k || k.backstop) return;
      // Forgotten without waiting for anything: a relaunch on its way is not this browser.
      if (current === k.launching) current = undefined;
      k.backstop = setTimeout(() => void shut(b, retiredReason, closeTimeoutMs), timeoutMs + closeTimeoutMs);
      k.backstop.unref();
      if (k.loads <= 0) void shut(b, retiredReason, closeTimeoutMs);
    },
    closedWith: (b) => closedBy.get(b),
    async close() {
      const c = current;
      current = undefined;
      await c?.catch(() => undefined);
      await Promise.all([...kept.keys()].map((b) => shut(b, shutdownReason)));
    },
  };
}
