import { afterEach, describe, expect, it, vi } from 'vitest';
import { rendererCheckWithin, type RendererCheck } from '../src/pages.ts';

/**
 * byway's start-up `renderer` line (scripts/serve.ts) waits for Chromium's check, which starts while the app builds and the
 * engine starts. On a busy machine the launch waits for them: on GitHub's 2-CPU Windows machine (run 39058507534) it ran
 * past a limit counted from the check's start, and the line said Chromium could not start although it could. The limit
 * is counted from when the app is built and the engine is up, just before byway prints the line; scripts/test/serve.test.ts
 * holds serve.ts to that order.
 */
describe("the start-up renderer line's wait", () => {
  afterEach(() => vi.useRealTimers());

  const after = (ms: number, check: RendererCheck) => new Promise<RendererCheck>((resolve) => setTimeout(() => resolve(check), ms));

  it('counts its limit from when it starts waiting, not from when the check began', async () => {
    vi.useFakeTimers();
    const checking = after(40_000, { ready: true });
    await vi.advanceTimersByTimeAsync(35_000); // the build and the engine take this long
    const said = rendererCheckWithin(checking, 30_000, { built: true });
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(said).resolves.toEqual({ ready: true });
  });

  it('says plainly when the check has not finished within the limit, and what byway waited for before it counted', async () => {
    vi.useFakeTimers();
    const built = rendererCheckWithin(new Promise<RendererCheck>(() => undefined), 30_000, { built: true });
    // Contributor mode builds nothing before the line: the limit counts from when the engine is up.
    const notBuilt = rendererCheckWithin(new Promise<RendererCheck>(() => undefined), 30_000, { built: false });
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(built).resolves.toEqual({ ready: false, message: "Playwright's Chromium had not started 30 s after the app was built and the engine was up." });
    await expect(notBuilt).resolves.toEqual({ ready: false, message: "Playwright's Chromium had not started 30 s after the engine was up." });
  });

  it("passes the check's own answer through, a failure included, and leaves no timer behind", async () => {
    vi.useFakeTimers();
    const failed: RendererCheck = { ready: false, message: 'Chromium is not installed.' };
    await expect(rendererCheckWithin(Promise.resolve(failed), 30_000, { built: true })).resolves.toEqual(failed);
    expect(vi.getTimerCount()).toBe(0);
  });
});
