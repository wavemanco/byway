import type { Browser } from 'playwright';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StepError } from '../src/activities/failures.ts';
import { checkRenderer, launchChromium, launchFailure, rendererCheckWithin, rendererLine, type LaunchSetting, type RendererCheck } from '../src/pages.ts';
import { sandboxAdvice, sandboxFailureMessage, type SandboxHost } from '../src/sandbox.ts';

/**
 * byway's start-up `renderer` line (scripts/serve.ts) waits for Chromium's check, which starts while the app builds and the
 * engine starts. On a busy machine the launch waits for them: on GitHub's 2-CPU Windows machine (run 39058507534) it ran
 * past a limit counted from the check's start, and the line said Chromium could not start although it could. The limit
 * is counted from when the app is built and the engine is up, just before byway prints the line; scripts/test/serve.test.ts
 * holds serve.ts to that order.
 */
describe("the start-up renderer line's wait", () => {
  afterEach(() => vi.useRealTimers());

  const READY: RendererCheck = { osSandbox: true, ready: true, sandbox: 'starts' };
  const after = (ms: number, check: RendererCheck) => new Promise<RendererCheck>((resolve) => setTimeout(() => resolve(check), ms));

  it('counts its limit from when it starts waiting, not from when the check began', async () => {
    vi.useFakeTimers();
    const checking = after(40_000, READY);
    await vi.advanceTimersByTimeAsync(35_000); // the build and the engine take this long
    const said = rendererCheckWithin(checking, 30_000, { built: true, osSandbox: true });
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(said).resolves.toEqual(READY);
  });

  it('says plainly when the check has not finished within the limit, and what byway waited for before it counted', async () => {
    vi.useFakeTimers();
    const built = rendererCheckWithin(new Promise<RendererCheck>(() => undefined), 30_000, { built: true, osSandbox: true });
    // Contributor mode builds nothing before the line: the limit counts from when the engine is up.
    const notBuilt = rendererCheckWithin(new Promise<RendererCheck>(() => undefined), 30_000, { built: false, osSandbox: false });
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(built).resolves.toEqual({ osSandbox: true, ready: false, sandbox: 'unknown', message: "Playwright's Chromium had not started 30 s after the app was built and the engine was up." });
    await expect(notBuilt).resolves.toEqual({ osSandbox: false, ready: false, sandbox: 'unknown', message: "Playwright's Chromium had not started 30 s after the engine was up." });
  });

  it("passes the check's own answer through, a failure included, and leaves no timer behind", async () => {
    vi.useFakeTimers();
    const failed: RendererCheck = { osSandbox: true, ready: false, sandbox: 'unknown', message: 'Chromium is not installed.' };
    await expect(rendererCheckWithin(Promise.resolve(failed), 30_000, { built: true, osSandbox: true })).resolves.toEqual(failed);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('the start-up renderer line says what the check found (ADR-0105)', () => {
  it('on: ready inside the OS sandbox, which scripts/e2e.ts requires, or not available with the reason and fix', () => {
    expect(rendererLine({ osSandbox: true, ready: true, sandbox: 'starts' })).toBe("Playwright's Chromium, ready, inside its OS sandbox");
    expect(rendererLine({ osSandbox: true, ready: false, sandbox: 'fails', message: 'The sandbox could not start.' })).toBe('not available: The sandbox could not start.');
  });

  it('off: says so, and whether the sandbox could start now', () => {
    const off = "Playwright's Chromium, ready, with its OS sandbox off (switched off in Settings)";
    expect(rendererLine({ osSandbox: false, ready: true, sandbox: 'starts' })).toBe(`${off}. The sandbox can start on this computer now: Settings offers to turn it back on.`);
    expect(rendererLine({ osSandbox: false, ready: true, sandbox: 'fails', why: 'byway is running as root.', fix: 'Start byway as an ordinary user.' })).toBe(`${off}. The sandbox still cannot start here: byway is running as root.`);
    expect(rendererLine({ osSandbox: false, ready: true, sandbox: 'unknown' })).toBe(`${off}.`);
    expect(rendererLine({ osSandbox: false, ready: false, sandbox: 'unknown', message: 'Chromium is missing.' })).toBe('not available, with its OS sandbox off (switched off in Settings): Chromium is missing.');
  });
});

/**
 * The start-up check itself, against the real Chromium (ADR-0105). It draws byway's own test page under the setting in
 * force; to say whether the sandbox is the cause of a failure, or could start now while it is off, it draws that page
 * once more with the other setting. The launches are watched through the test seam, which also plays the parts of a
 * computer whose sandbox cannot start and of one with no Chromium at all.
 */
describe('the start-up check (serve.ts prints it as the "renderer" line, and Settings shows it)', () => {
  const linux: SandboxHost = { os: 'linux', root: false, container: false, appArmorRestricts: true, userNamespacesOff: false };
  /** Playwright's error when Chromium's sandbox cannot start (sandbox.test.ts holds it to the installed Playwright). */
  const SANDBOXED = new Error('browserType.launch: Target page, context or browser has been closed\nBrowser logs:\nChromium sandboxing failed!\n====\nCall log:\n  - [pid=1][err] No usable sandbox!');
  const MISSING = new Error("browserType.launch: Executable doesn't exist at /pw/chrome-headless-shell");

  /** The real launch, watched: each launch's setting, and every browser closed again; `fail` decides which fail and how. */
  function watched(fail: (setting: LaunchSetting) => Error | undefined = () => undefined) {
    const settings: boolean[] = [];
    const browsers: Browser[] = [];
    const launch = async (setting: LaunchSetting): Promise<Browser> => {
      settings.push(setting.osSandbox);
      const error = fail(setting);
      if (error) throw launchFailure(error, { ...setting, host: linux });
      const b = await launchChromium(setting);
      browsers.push(b);
      return b;
    };
    return { settings, browsers, launch };
  }

  it('on, and it starts: ready inside the sandbox, from one launch, closed again', async () => {
    const w = watched();
    expect(await checkRenderer({ osSandbox: true }, { launch: w.launch, host: linux })).toEqual({ osSandbox: true, ready: true, sandbox: 'starts' });
    expect(w.settings).toEqual([true]);
    expect(w.browsers.map((b) => b.isConnected())).toEqual([false]);
  }, 60_000);

  it('on, and the sandbox cannot start: not ready, with why and the fix, and nothing launched without the sandbox when Chromium said why', async () => {
    const w = watched((s) => (s.osSandbox ? SANDBOXED : undefined));
    const advice = sandboxAdvice(linux, { error: SANDBOXED });
    expect(await checkRenderer({ osSandbox: true }, { launch: w.launch, host: linux })).toEqual({ osSandbox: true, ready: false, sandbox: 'fails', message: sandboxFailureMessage(advice), why: advice.why, fix: advice.fix });
    expect(w.settings).toEqual([true]);
  }, 60_000);

  it("on, and the page renderer does not start for a reason Chromium did not give: byway's test page drawn without the sandbox tells whether the sandbox is the cause", async () => {
    // Chromium launches inside the sandbox, but its page renderer dies (security software stopping it, say).
    const dying = (b: Browser): Browser =>
      new Proxy(b, {
        get(target, prop, receiver) {
          if (prop === 'newContext') return async () => Promise.reject(new Error('browser.newContext: Target crashed'));
          return Reflect.get(target, prop, receiver);
        },
      });
    const settings: boolean[] = [];
    const launch = async (setting: LaunchSetting) => {
      settings.push(setting.osSandbox);
      const b = await launchChromium(setting);
      return setting.osSandbox ? dying(b) : b;
    };
    const advice = sandboxAdvice(linux);
    expect(await checkRenderer({ osSandbox: true }, { launch, host: linux })).toEqual({ osSandbox: true, ready: false, sandbox: 'fails', message: sandboxFailureMessage(advice), why: advice.why, fix: advice.fix });
    expect(settings).toEqual([true, false]);
  }, 60_000);

  it('on, and Chromium does not start at all: not ready, the sandbox unknown, and the plain message with the install command', async () => {
    const w = watched(() => MISSING);
    const check = await checkRenderer({ osSandbox: true }, { launch: w.launch, host: linux });
    expect(check).toEqual({ osSandbox: true, ready: false, sandbox: 'unknown', message: launchFailure(MISSING).message });
    expect(w.settings).toEqual([true, false]);
  }, 60_000);

  it('off: ready without the sandbox, and whether the sandbox could start now, from its own test page', async () => {
    const starts = watched();
    expect(await checkRenderer({ osSandbox: false }, { launch: starts.launch, host: linux })).toEqual({ osSandbox: false, ready: true, sandbox: 'starts' });
    expect(starts.settings).toEqual([false, true]);
    expect(starts.browsers.map((b) => b.isConnected())).toEqual([false, false]);

    const fails = watched((s) => (s.osSandbox ? SANDBOXED : undefined));
    const advice = sandboxAdvice(linux, { error: SANDBOXED });
    expect(await checkRenderer({ osSandbox: false }, { launch: fails.launch, host: linux })).toEqual({ osSandbox: false, ready: true, sandbox: 'fails', message: sandboxFailureMessage(advice), why: advice.why, fix: advice.fix });

    const missing = watched(() => MISSING);
    expect(await checkRenderer({ osSandbox: false }, { launch: missing.launch, host: linux })).toEqual({ osSandbox: false, ready: false, sandbox: 'unknown', message: launchFailure(MISSING).message });
    expect(missing.settings).toEqual([false]);
  }, 60_000);

  it('never throws, whatever the launch does', async () => {
    const check = await checkRenderer(
      { osSandbox: true },
      {
        host: linux,
        launch: async () => {
          throw new StepError('Chromium refused.');
        },
      },
    );
    expect(check).toEqual({ osSandbox: true, ready: false, sandbox: 'unknown', message: 'Chromium refused.' });
  });
});
