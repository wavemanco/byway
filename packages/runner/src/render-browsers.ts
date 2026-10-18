/**
 * The renderer's browsers (SEC-5; ADR-0106). Every load (a render's screen, a visitor read, the readiness check's test
 * page) takes the shared browser, which is launched on first use and launched again after a crash, a disconnect or a
 * failed launch (ENG-14). A load counts on the browser it took until it lets it go.
 *
 * A load whose page does not close in time (pages.ts dispose: a stuck renderer, a browser that does not answer, or the
 * engine's own thread paused) retires its browser instead of closing it: new loads launch another, and the loads still
 * on the retired one finish there. It is closed when the last of them lets it go, and at the latest one load's limit
 * plus the close limit after it was retired (the backstop). Every load on it is bounded by those two limits, so the
 * backstop closes it only if a load never lets it go. Closing it is bounded by the close limit too; past that,
 * Playwright's own close goes on.
 *
 * The OS sandbox setting (ADR-0105) is read before each load: the person's, from the store, and on when it cannot be
 * read. A browser is launched with the setting read for the load that launches it, and one launched with the other
 * setting is retired in the same way, so a change applies from the next load on and the loads under way finish as they
 * started.
 *
 * byway's own closes give Playwright a reason, which a call still under way on that browser fails with, and are
 * remembered (closedWith), so a load that fails on a browser byway closed can say so: a call made after the close fails
 * only with "Target page, context or browser has been closed", the text a crash gives.
 *
 * close() is final: once it has run, nothing is launched again. A load or readiness check that asks for a browser
 * afterwards fails with byway's reason (RendererClosed); one already waiting on a launch when close() ran gets
 * that browser, which close() then closes.
 */

/** What byway's own closes of the renderer's browser say, first: a load they stop says so (pages.ts drawFailure). */
export const BYWAY_CLOSED = 'byway closed the page renderer';

/** A load that failed on a browser byway itself closed, or asked for one after byway closed the renderer: its message is the reason byway gave. */
export class RendererClosed extends Error {}

/** The part of a browser this needs (Playwright's Browser has it). */
export interface KeptBrowser {
  isConnected(): boolean;
  close(options?: { reason?: string }): Promise<void>;
  on(event: 'disconnected', listener: () => void): unknown;
}

export interface RenderBrowsers<B extends KeptBrowser> {
  /**
   * For a load: the shared browser, launched if there is none (or none that works, or none with the setting read now),
   * counted as in use from here until release(b). A failed launch rejects, and the next call launches again.
   */
  take(): Promise<B>;
  /** The shared browser, found or launched as for take(), not counted as in use (the readiness check). */
  find(): Promise<B>;
  /** A load is done with b. If b was retired and this was its last load, b is closed (within the close limit). */
  release(b: B): Promise<void>;
  /** b did not close a page in time: new loads launch another browser, and b is closed once no load uses it. */
  retire(b: B): void;
  /** The reason byway closed b with, if byway closed it. */
  closedWith(b: B): string | undefined;
  /** The OS sandbox setting b was launched with. */
  osSandboxOf(b: B): boolean | undefined;
  /**
   * Close every browser: the one in use (after a launch still on its way) and every retired one. Final: take() and find()
   * then launch nothing, and fail with byway's reason.
   */
  close(): Promise<void>;
}

export interface RenderBrowsersOptions {
  /** How long one load may take (pages.ts timeoutMs). */
  timeoutMs: number;
  /** How long a page's context may take to close, and a browser byway closes (pages.ts closeTimeoutMs). */
  closeTimeoutMs: number;
  /**
   * The person's OS sandbox setting, read before each load (the store's; ADR-0105). None: on. A read that fails counts
   * as on, so byway never draws without the sandbox by mistake.
   */
  osSandbox?: () => boolean | Promise<boolean>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms).unref());

export function renderBrowsers<B extends KeptBrowser>(launch: (osSandbox: boolean) => Promise<B>, { timeoutMs, closeTimeoutMs, osSandbox }: RenderBrowsersOptions): RenderBrowsers<B> {
  const retiredReason = `${BYWAY_CLOSED} after a page in it took more than ${closeTimeoutMs / 1000} s to close`;
  const changedReason = `${BYWAY_CLOSED} after its OS sandbox setting changed`;
  const shutdownReason = `${BYWAY_CLOSED} as it shut down`;
  /** The shared browser, or its launch on the way. */
  let current: Promise<B> | undefined;
  /** Set by close(): nothing is launched after it. */
  let closed = false;
  /**
   * Each browser launched that byway has not closed and that has not gone away: its loads, its launch, the setting it was
   * launched with, and once retired its backstop and the reason it will be closed with.
   */
  const kept = new Map<B, { loads: number; launching: Promise<B>; osSandbox: boolean; backstop?: NodeJS.Timeout; reason?: string }>();
  const closedBy = new WeakMap<B, string>();
  const launchedWith = new WeakMap<B, boolean>();

  const wanted = async (): Promise<boolean> => {
    if (!osSandbox) return true;
    try {
      return (await osSandbox()) !== false;
    } catch {
      return true;
    }
  };

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

  /** b is retired with `reason`: new loads launch another, and b is closed once no load uses it, or at the backstop. */
  const retireWith = (b: B, reason: string): void => {
    const k = kept.get(b);
    if (!k || k.backstop) return;
    // Forgotten without waiting for anything: a relaunch on its way is not this browser.
    if (current === k.launching) current = undefined;
    k.reason = reason;
    k.backstop = setTimeout(() => void shut(b, reason, closeTimeoutMs), timeoutMs + closeTimeoutMs);
    k.backstop.unref();
    if (k.loads <= 0) void shut(b, reason, closeTimeoutMs);
  };

  const get = async (count: boolean): Promise<B> => {
    // The setting is read for this load. With no browser at all, the launch it leads to is on its way (current) at
    // once, before the read ends, so a close() meanwhile closes it too.
    const reading = wanted();
    for (let c = current; c; c = current) {
      const b = await c.catch(() => undefined);
      const want = await reading;
      const k = b && kept.get(b);
      if (b && k && !k.backstop && b.isConnected()) {
        if (k.osSandbox === want) {
          if (count) k.loads++;
          return b;
        }
        // Launched with the other setting: retired, so the loads on it finish there and this one launches anew.
        retireWith(b, changedReason);
        continue;
      }
      // Gone or retired: forget it, unless a concurrent load already launched a new one (then look again).
      if (current === c) current = undefined;
    }
    // Nothing is launched after close(): a load that asks then, or that waited meanwhile (for the setting, or for a browser
    // close() has since closed), fails with byway's reason.
    if (closed) throw new RendererClosed(shutdownReason);
    const launching: Promise<B> = reading.then(async (want) => {
      const b = await launch(want);
      kept.set(b, { loads: 0, launching, osSandbox: want });
      launchedWith.set(b, want);
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
      if (k.loads <= 0 && k.backstop) await shut(b, k.reason ?? retiredReason, closeTimeoutMs);
    },
    retire: (b) => retireWith(b, retiredReason),
    closedWith: (b) => closedBy.get(b),
    osSandboxOf: (b) => launchedWith.get(b),
    async close() {
      closed = true;
      const c = current;
      current = undefined;
      await c?.catch(() => undefined);
      await Promise.all([...kept.keys()].map((b) => shut(b, shutdownReason)));
    },
  };
}
