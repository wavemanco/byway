/**
 * The renderer's browsers (render-browsers.ts; SEC-5, ADR-0106), with stand-in browsers and fake timers: no Chromium,
 * and no test waits on the clock. A load counts on the browser it takes until it lets it go; a retired browser is
 * closed when its last load lets it go, or at the backstop; byway's own closes give a reason and are remembered; and
 * nothing waits for a launch it did not ask for.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BYWAY_CLOSED, renderBrowsers, type KeptBrowser } from '../src/render-browsers.ts';

/** A stand-in browser: its closes (with the reason each was given), and a disconnect a crash would cause. */
class Fake implements KeptBrowser {
  closes: (string | undefined)[] = [];
  connected = true;
  /** While set, a close does not finish until it settles, as for a browser too stuck to close. */
  holdClose: Promise<void> | undefined;
  readonly name: string;
  private gone: (() => void)[] = [];
  constructor(name: string) {
    this.name = name;
  }
  isConnected() {
    return this.connected;
  }
  on(_event: 'disconnected', listener: () => void) {
    this.gone.push(listener);
    return this;
  }
  async close(options?: { reason?: string }) {
    this.closes.push(options?.reason);
    if (this.holdClose) await this.holdClose;
    this.crash();
  }
  /** The browser goes away (a crash, or a close finishing). */
  crash() {
    if (!this.connected) return;
    this.connected = false;
    for (const f of this.gone.splice(0)) f();
  }
}

const TIMEOUT = 30_000;
const CLOSE = 5_000;
const RETIRED = `${BYWAY_CLOSED} after a page in it took more than 5 s to close`;
const SHUTDOWN = `${BYWAY_CLOSED} as it shut down`;

/**
 * A launcher that hands out stand-ins named b1, b2, …, and keeps the OS sandbox setting each launch was given; `next`
 * may hand back a launch of its own instead.
 */
function launcher() {
  const launched: Fake[] = [];
  const settings: boolean[] = [];
  let next: (() => Promise<Fake>) | undefined;
  const launch = async (osSandbox: boolean) => {
    settings.push(osSandbox);
    const own = next;
    next = undefined;
    if (own) return own();
    const b = new Fake(`b${launched.length + 1}`);
    launched.push(b);
    return b;
  };
  return { launched, settings, launch, then: (f: () => Promise<Fake>) => (next = f) };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the renderer\'s browsers (ADR-0106)', () => {
  it('loads share one browser; a retired one is closed only when the last load on it lets it go, with byway\'s reason, and new loads get another', async () => {
    const { launched, launch } = launcher();
    const browsers = renderBrowsers(launch, { timeoutMs: TIMEOUT, closeTimeoutMs: CLOSE });
    const a = await browsers.take();
    const b = await browsers.take();
    expect(a).toBe(b);
    expect(launched.length).toBe(1);
    browsers.retire(a);
    // A load after the retirement gets a browser of its own; the two already on the retired one keep it.
    const c = await browsers.take();
    expect(c).not.toBe(a);
    expect(launched.length).toBe(2);
    await browsers.release(a);
    expect(launched[0]!.closes).toEqual([]);
    await browsers.release(b);
    expect(launched[0]!.closes).toEqual([RETIRED]);
    expect(browsers.closedWith(a)).toBe(RETIRED);
    // The browser in use was neither closed nor marked.
    expect(launched[1]!.closes).toEqual([]);
    expect(browsers.closedWith(c)).toBeUndefined();
    // Retired twice, released again: closed once.
    browsers.retire(a);
    await browsers.release(a);
    expect(launched[0]!.closes).toEqual([RETIRED]);
  });

  it('a retired browser whose loads never let it go is closed by the backstop, one deadline and one close limit after it was retired', async () => {
    const { launched, launch } = launcher();
    const browsers = renderBrowsers(launch, { timeoutMs: TIMEOUT, closeTimeoutMs: CLOSE });
    const a = await browsers.take();
    browsers.retire(a);
    await vi.advanceTimersByTimeAsync(TIMEOUT + CLOSE - 1);
    expect(launched[0]!.closes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(launched[0]!.closes).toEqual([RETIRED]);
    expect(browsers.closedWith(a)).toBe(RETIRED);
    // The load that held it then lets it go: no second close.
    await browsers.release(a);
    expect(launched[0]!.closes).toEqual([RETIRED]);
  });

  it('closing a retired browser waits at most the close limit, and a load\'s release with it', async () => {
    const { launched, launch } = launcher();
    const browsers = renderBrowsers(launch, { timeoutMs: TIMEOUT, closeTimeoutMs: CLOSE });
    const a = await browsers.take();
    launched[0]!.holdClose = new Promise<void>(() => undefined);
    browsers.retire(a);
    let released = false;
    const releasing = browsers.release(a).then(() => (released = true));
    await vi.advanceTimersByTimeAsync(CLOSE - 1);
    expect(released).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await releasing;
    expect(released).toBe(true);
    expect(launched[0]!.closes).toEqual([RETIRED]);
  });

  it('retiring and releasing never wait for a launch: a relaunch still on its way holds neither', async () => {
    const { launched, launch, then } = launcher();
    const browsers = renderBrowsers(launch, { timeoutMs: TIMEOUT, closeTimeoutMs: CLOSE });
    const a = await browsers.take();
    const b = await browsers.take();
    browsers.retire(a);
    // A new load launches a browser that does not start until the test says so.
    const started = Promise.withResolvers<Fake>();
    then(() => started.promise);
    let c: Fake | undefined;
    const taking = browsers.take().then((x) => (c = x as Fake));
    // A second late close on the retired browser, and both loads letting it go: none waits for that launch.
    browsers.retire(b);
    await browsers.release(a);
    await browsers.release(b);
    expect(launched[0]!.closes).toEqual([RETIRED]);
    expect(c).toBeUndefined();
    started.resolve(new Fake('b2'));
    await taking;
    expect(c?.name).toBe('b2');
  });

  it('a browser that went away (a crash) is launched again, and a retired one that crashes needs no backstop', async () => {
    const { launched, launch } = launcher();
    const browsers = renderBrowsers(launch, { timeoutMs: TIMEOUT, closeTimeoutMs: CLOSE });
    const a = (await browsers.take()) as Fake;
    a.crash();
    const b = await browsers.take();
    expect(b).not.toBe(a);
    browsers.retire(b);
    (b as Fake).crash();
    await vi.advanceTimersByTimeAsync(TIMEOUT + CLOSE);
    expect(launched[1]!.closes).toEqual([]);
    // Neither was closed by byway.
    expect(browsers.closedWith(a)).toBeUndefined();
    expect(browsers.closedWith(b)).toBeUndefined();
    await browsers.release(a);
    await browsers.release(b);
    expect(launched.map((x) => x.closes)).toEqual([[], []]);
  });

  it('a failed launch fails the load that asked for it, and the next load launches again; find() does not count as a load', async () => {
    const { launched, launch, then } = launcher();
    const browsers = renderBrowsers(launch, { timeoutMs: TIMEOUT, closeTimeoutMs: CLOSE });
    then(async () => {
      throw new Error('Chromium could not start');
    });
    await expect(browsers.take()).rejects.toThrow('Chromium could not start');
    const found = await browsers.find();
    expect(launched).toEqual([found]);
    // find() took no count: retiring the browser it found closes it at once.
    browsers.retire(found);
    await vi.advanceTimersByTimeAsync(0);
    expect(launched[0]!.closes).toEqual([RETIRED]);
    expect(await browsers.take()).not.toBe(found);
  });

  it('close() closes the browser in use and every retired one, with its own reason, after a launch on its way; the next load launches again', async () => {
    const { launched, launch, then } = launcher();
    const browsers = renderBrowsers(launch, { timeoutMs: TIMEOUT, closeTimeoutMs: CLOSE });
    const a = await browsers.take();
    browsers.retire(a);
    const started = Promise.withResolvers<Fake>();
    const late = new Fake('late');
    then(() => started.promise);
    const taking = browsers.take();
    const closing = browsers.close();
    started.resolve(late);
    await closing;
    expect(launched[0]!.closes).toEqual([SHUTDOWN]);
    expect(late.closes).toEqual([SHUTDOWN]);
    expect(browsers.closedWith(late)).toBe(SHUTDOWN);
    // The load that was waiting for that launch got the browser byway then closed, and knows why.
    expect(await taking).toBe(late);
    await browsers.release(a);
    expect(launched[0]!.closes).toEqual([SHUTDOWN]);
    const next = await browsers.take();
    expect(next).not.toBe(late);
    expect(launched.length).toBe(2);
  });
});

describe('the OS sandbox setting, read before each load (ADR-0105)', () => {
  const CHANGED = `${BYWAY_CLOSED} after its OS sandbox setting changed`;

  /** The person's setting as the store holds it, and how often the renderer asked for it. */
  function setting(initial: boolean) {
    const s = { on: initial, reads: 0, read: async () => (s.reads++, s.on) };
    return s;
  }

  it('is on when nothing gives it, and a browser is launched with the setting read for the load that launches it', async () => {
    const { settings, launch } = launcher();
    const plain = renderBrowsers(launch, { timeoutMs: TIMEOUT, closeTimeoutMs: CLOSE });
    const a = await plain.take();
    expect(settings).toEqual([true]);
    expect(plain.osSandboxOf(a)).toBe(true);

    const second = launcher();
    const off = setting(false);
    const browsers = renderBrowsers(second.launch, { timeoutMs: TIMEOUT, closeTimeoutMs: CLOSE, osSandbox: off.read });
    const b = await browsers.take();
    await browsers.find();
    await browsers.take();
    expect(second.settings).toEqual([false]);
    expect(browsers.osSandboxOf(b)).toBe(false);
    // Read for every load and every readiness check: a change is seen by the next one.
    expect(off.reads).toBe(3);
  });

  it('a change retires the browser in use: the next load launches with the new setting, and the loads still on the old one finish there before it is closed', async () => {
    const { launched, settings, launch } = launcher();
    const s = setting(true);
    const browsers = renderBrowsers(launch, { timeoutMs: TIMEOUT, closeTimeoutMs: CLOSE, osSandbox: s.read });
    const a = await browsers.take();
    const b = await browsers.take();
    s.on = false;
    const c = await browsers.take();
    expect(c).not.toBe(a);
    expect(settings).toEqual([true, false]);
    expect(browsers.osSandboxOf(c)).toBe(false);
    // The two loads on the sandboxed browser were not cut short: it stays open until both let it go.
    await browsers.release(a);
    expect(launched[0]!.closes).toEqual([]);
    await browsers.release(b);
    expect(launched[0]!.closes).toEqual([CHANGED]);
    expect(browsers.closedWith(a)).toBe(CHANGED);
    // Switched back on: the same again, the other way.
    s.on = true;
    const d = await browsers.take();
    expect(settings).toEqual([true, false, true]);
    expect(browsers.osSandboxOf(d)).toBe(true);
    await browsers.release(c);
    expect(launched[1]!.closes).toEqual([CHANGED]);
    expect(launched[2]!.closes).toEqual([]);
  });

  it('a browser no load holds is closed as soon as the setting changes, and the readiness check follows the setting too', async () => {
    const { launched, settings, launch } = launcher();
    const s = setting(false);
    const browsers = renderBrowsers(launch, { timeoutMs: TIMEOUT, closeTimeoutMs: CLOSE, osSandbox: s.read });
    const a = await browsers.find();
    s.on = true;
    const b = await browsers.find();
    expect(b).not.toBe(a);
    expect(settings).toEqual([false, true]);
    await vi.advanceTimersByTimeAsync(0);
    expect(launched[0]!.closes).toEqual([CHANGED]);
  });

  it('loads racing after a change launch one browser between them', async () => {
    const { launched, settings, launch } = launcher();
    const s = setting(true);
    const browsers = renderBrowsers(launch, { timeoutMs: TIMEOUT, closeTimeoutMs: CLOSE, osSandbox: s.read });
    await browsers.take();
    s.on = false;
    const [x, y, z] = await Promise.all([browsers.take(), browsers.take(), browsers.find()]);
    expect(new Set([x, y, z]).size).toBe(1);
    expect(settings).toEqual([true, false]);
    expect(launched.length).toBe(2);
  });

  it('a setting that cannot be read counts as on: byway never draws without the sandbox by mistake', async () => {
    const { settings, launch } = launcher();
    const browsers = renderBrowsers(launch, {
      timeoutMs: TIMEOUT,
      closeTimeoutMs: CLOSE,
      osSandbox: async () => {
        throw new Error('the store is closed');
      },
    });
    const a = await browsers.take();
    expect(settings).toEqual([true]);
    expect(browsers.osSandboxOf(a)).toBe(true);
  });

  it('a browser retired for a late close keeps that reason when the setting changes too', async () => {
    const { launched, launch } = launcher();
    const s = setting(true);
    const browsers = renderBrowsers(launch, { timeoutMs: TIMEOUT, closeTimeoutMs: CLOSE, osSandbox: s.read });
    const a = await browsers.take();
    browsers.retire(a);
    s.on = false;
    await browsers.take();
    await browsers.release(a);
    expect(launched[0]!.closes).toEqual([RETIRED]);
  });
});
