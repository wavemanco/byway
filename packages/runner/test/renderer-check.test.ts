import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Browser } from 'playwright';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Gateway } from '@byway/contracts';
import { StepError } from '../src/activities/failures.ts';
import { createActivities } from '../src/activities/index.ts';
import { checkRenderer, launchChromium, launchFailure, playwrightPages, rendererCheckWithin, rendererLine, storeLastCheck, storeOsSandbox, type LaunchSetting, type RendererCheck, type RendererCheckProgress } from '../src/pages.ts';
import { headlessShell, sandboxAdvice, sandboxFailureMessage, type SandboxHost } from '../src/sandbox.ts';
import { FAILURE } from '../src/types.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

/**
 * Playwright's error when Chromium dies at launch and says nothing of why: the browser's log has no line from it, only
 * its exit. On Windows a sandbox that cannot start ends Chromium so (a STATUS_BREAKPOINT exit), with none of the
 * markers Linux prints (sandbox.ts).
 */
const DIED = new Error(
  [
    'browserType.launch: Target page, context or browser has been closed',
    'Browser logs:',
    '',
    '<launching> C:\\pw\\chromium_headless_shell-1243\\chrome-headless-shell-win64\\chrome-headless-shell.exe --disable-field-trial-config --headless',
    '<launched> pid=4242',
    '[pid=4242] <process did exit: exitCode=2147483651, signal=null>',
    'Call log:',
    '  - <launching> C:\\pw\\chromium_headless_shell-1243\\chrome-headless-shell-win64\\chrome-headless-shell.exe',
  ].join('\n'),
);

/**
 * For a test whose answer needs the check's probe of the other setting to finish (a real launch and byway's test page):
 * a bound on the probe that only a probe that hangs reaches, inside the 60 s hang guard every test has (vitest.config.ts) (the owner's choice of 2026-10-21,
 * "Fix the test in this batch (Recommended)"). The product's bound is 15 s (PROBE_MS). Under the unit suite's parallel
 * load a probe ran past it, and the check answered the sandbox 'unknown'; that whole test then took 17.6 s.
 */
const HUNG_PROBE_MS = 50_000;

/**
 * A launch held until the test releases it: then it is the real launch, and each browser it gave is watched until byway
 * closes it, with whether a page was ever opened on it. Every call is kept (`settings`) and launched for real once
 * released, so a renderer that launched again after its close would show there, and so would the page it drew (ADR-0105
 * item 5: a closed renderer launches nothing more).
 */
function held() {
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  const launches: Promise<Browser>[] = [];
  const real: Browser[] = [];
  const settings: boolean[] = [];
  const asked: string[] = [];
  const allClosed = async () => {
    await Promise.all(launches);
    await expect.poll(() => real.every((b) => !b.isConnected()), { timeout: 30_000 }).toBe(true);
  };
  return {
    launch(setting: LaunchSetting): Promise<Browser> {
      settings.push(setting.osSandbox);
      const launched = released.then(async () => {
        const b = await launchChromium(setting);
        real.push(b);
        return new Proxy(b, {
          get(target, prop, receiver) {
            if (prop === 'newContext' || prop === 'close') asked.push(prop);
            return Reflect.get(target, prop, receiver);
          },
        });
      });
      launches.push(launched);
      return launched;
    },
    release,
    /** The setting of each launch asked of it. */
    settings,
    /** Releases the launches and waits until every browser they gave is closed, one launched meanwhile too; what was asked of them. */
    async closedOnceReleased(): Promise<string[]> {
      release();
      await allClosed();
      await allClosed();
      return asked;
    },
  };
}

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

  it('when the check has found nothing yet at the limit, says only that, and what byway waited for before it counted: not that Chromium did not start', async () => {
    vi.useFakeTimers();
    const built = rendererCheckWithin(new Promise<RendererCheck>(() => undefined), 30_000, { built: true, osSandbox: true });
    // Contributor mode builds nothing before the line: the limit counts from when the engine is up.
    const notBuilt = rendererCheckWithin(new Promise<RendererCheck>(() => undefined), 30_000, { built: false, osSandbox: false, progress: {} });
    await vi.advanceTimersByTimeAsync(30_000);
    // Whether it is ready is not known, so the record has no `ready`.
    await expect(built).resolves.toEqual({ osSandbox: true, sandbox: 'unknown', message: 'The check had not finished 30 s after the app was built and the engine was up, so byway could not tell whether it can draw pages.' });
    await expect(notBuilt).resolves.toEqual({ osSandbox: false, sandbox: 'unknown', message: 'The check had not finished 30 s after the engine was up, so byway could not tell whether it can draw pages.' });
  });

  it('at the limit, says what the check had already found: its test page drawn, and the probe of the other setting not yet answered (ADR-0105)', async () => {
    vi.useFakeTimers();
    // Off: the test page was drawn without the sandbox; the probe with it had not answered.
    const off: RendererCheckProgress = { known: { osSandbox: false, ready: true, sandbox: 'unknown' } };
    const drawnOff = rendererCheckWithin(new Promise<RendererCheck>(() => undefined), 30_000, { built: false, osSandbox: false, progress: off });
    // On: the test page could not be drawn inside the sandbox, for no reason Chromium gave; the probe without it had not answered.
    const failedOn: RendererCheck = { osSandbox: true, ready: false, sandbox: 'unknown', message: 'The page renderer could not start (Target page, context or browser has been closed). One possible cause is that its OS sandbox cannot run on this computer; …' };
    const on: RendererCheckProgress = { known: failedOn };
    const notDrawnOn = rendererCheckWithin(new Promise<RendererCheck>(() => undefined), 30_000, { built: true, osSandbox: true, progress: on });
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(drawnOff).resolves.toEqual({ osSandbox: false, ready: true, sandbox: 'unknown' });
    await expect(notDrawnOn).resolves.toEqual(failedOn);
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
    // The probe with the sandbox had not answered in time.
    expect(rendererLine({ osSandbox: false, ready: true, sandbox: 'unknown' })).toBe(`${off}. byway could not tell whether the sandbox can start here now.`);
    expect(rendererLine({ osSandbox: false, ready: false, sandbox: 'unknown', message: 'Chromium is missing.' })).toBe('not available, with its OS sandbox off (switched off in Settings): Chromium is missing.');
  });

  it('a check that had found nothing by its limit: not checked in time, never "not available"', () => {
    const message = 'The check had not finished 30 s after the engine was up, so byway could not tell whether it can draw pages.';
    expect(rendererLine({ osSandbox: true, sandbox: 'unknown', message })).toBe(`not checked in time: ${message}`);
    expect(rendererLine({ osSandbox: false, sandbox: 'unknown', message })).toBe(`not checked in time, with its OS sandbox off (switched off in Settings): ${message}`);
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
  });

  it('on, and the sandbox cannot start: not ready, with why and the fix, and nothing launched without the sandbox when Chromium said why', async () => {
    const w = watched((s) => (s.osSandbox ? SANDBOXED : undefined));
    const advice = sandboxAdvice(linux, { error: SANDBOXED });
    expect(await checkRenderer({ osSandbox: true }, { launch: w.launch, host: linux })).toEqual({ osSandbox: true, ready: false, sandbox: 'fails', message: sandboxFailureMessage(advice), why: advice.why, fix: advice.fix });
    expect(w.settings).toEqual([true]);
  });

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
    expect(await checkRenderer({ osSandbox: true }, { launch, host: linux, probeMs: HUNG_PROBE_MS })).toEqual({ osSandbox: true, ready: false, sandbox: 'fails', message: sandboxFailureMessage(advice), why: advice.why, fix: advice.fix });
    expect(settings).toEqual([true, false]);
  });

  it('on, and Chromium does not start at all: not ready, the sandbox unknown, and the plain message with the install command', async () => {
    const w = watched(() => MISSING);
    const check = await checkRenderer({ osSandbox: true }, { launch: w.launch, host: linux });
    expect(check).toEqual({ osSandbox: true, ready: false, sandbox: 'unknown', message: launchFailure(MISSING).message });
    expect(w.settings).toEqual([true, false]);
  });

  it('on, and Chromium dies at launch with the sandbox and without it, saying nothing of why: the message is the one without the sandbox, which does not blame it', async () => {
    const w = watched(() => DIED);
    const check = await checkRenderer({ osSandbox: true }, { launch: w.launch, host: linux });
    expect(check).toEqual({ osSandbox: true, ready: false, sandbox: 'unknown', message: launchFailure(DIED, { osSandbox: false, host: linux }).message });
    expect(check.message).not.toMatch(/sandbox/i);
    expect(w.settings).toEqual([true, false]);
  });

  it('on, and the probe without the sandbox does not answer: not ready, the sandbox unknown, with what the sandboxed attempt said (one possible cause, why and the fix), told before the probe began', async () => {
    const windows: SandboxHost = { ...linux, os: 'windows', appArmorRestricts: false };
    const probe = held();
    const settings: boolean[] = [];
    const progress: RendererCheckProgress = {};
    let knownAtProbe: RendererCheck | undefined;
    const launch = async (setting: LaunchSetting): Promise<Browser> => {
      settings.push(setting.osSandbox);
      if (setting.osSandbox) throw launchFailure(DIED, { ...setting, host: windows });
      knownAtProbe = progress.known;
      return probe.launch(setting);
    };
    const check = await checkRenderer({ osSandbox: true }, { launch, host: windows, progress, probeMs: 50 });
    const said = launchFailure(DIED, { osSandbox: true, host: windows }).message;
    expect(said).toContain('One possible cause is that its OS sandbox cannot run on this computer; if so: On Windows the sandbox is how Chromium normally runs');
    expect(check).toEqual({ osSandbox: true, ready: false, sandbox: 'unknown', message: said });
    expect(knownAtProbe).toEqual(check);
    expect(settings).toEqual([true, false]);
    // The probe's renderer was closed when its time ran out: its browser is closed as its launch arrives, before any page,
    // and the renderer launches nothing more, so nothing is drawn without the sandbox after the check answered.
    expect(await probe.closedOnceReleased()).not.toContain('newContext');
    expect(settings).toEqual([true, false]);
    expect(probe.settings).toEqual([false]);
  });
  it('off: ready without the sandbox, and whether the sandbox could start now, from its own test page', async () => {
    const starts = watched();
    expect(await checkRenderer({ osSandbox: false }, { launch: starts.launch, host: linux, probeMs: HUNG_PROBE_MS })).toEqual({ osSandbox: false, ready: true, sandbox: 'starts' });
    expect(starts.settings).toEqual([false, true]);
    expect(starts.browsers.map((b) => b.isConnected())).toEqual([false, false]);

    const fails = watched((s) => (s.osSandbox ? SANDBOXED : undefined));
    const advice = sandboxAdvice(linux, { error: SANDBOXED });
    expect(await checkRenderer({ osSandbox: false }, { launch: fails.launch, host: linux })).toEqual({ osSandbox: false, ready: true, sandbox: 'fails', message: sandboxFailureMessage(advice), why: advice.why, fix: advice.fix });

    const missing = watched(() => MISSING);
    expect(await checkRenderer({ osSandbox: false }, { launch: missing.launch, host: linux })).toEqual({ osSandbox: false, ready: false, sandbox: 'unknown', message: launchFailure(MISSING).message });
    expect(missing.settings).toEqual([false]);
  });

  /**
   * The probe of the other setting has a bound of its own (W1, ADR-0105): once the test page is drawn, a probe that does
   * not answer leaves the check ready, with the sandbox unknown, never "not available". The probe's launch is held here,
   * so only that bound can end it, and released at the end.
   */
  it('off, and the probe with the sandbox does not answer: ready without it, the sandbox unknown, told before the probe began', async () => {
    const probe = held();
    const settings: boolean[] = [];
    const progress: RendererCheckProgress = {};
    let knownAtProbe: RendererCheck | undefined;
    const launch = async (setting: LaunchSetting): Promise<Browser> => {
      settings.push(setting.osSandbox);
      if (!setting.osSandbox) return launchChromium(setting);
      knownAtProbe = progress.known;
      return probe.launch(setting);
    };
    const check = await checkRenderer({ osSandbox: false }, { launch, host: linux, progress, probeMs: 50 });
    expect(check).toEqual({ osSandbox: false, ready: true, sandbox: 'unknown' });
    expect(knownAtProbe).toEqual(check);
    expect(settings).toEqual([false, true]);
    expect(rendererLine(check)).toBe("Playwright's Chromium, ready, with its OS sandbox off (switched off in Settings). byway could not tell whether the sandbox can start here now.");
    expect(await probe.closedOnceReleased()).not.toContain('newContext');
    expect(settings).toEqual([false, true]);
    expect(probe.settings).toEqual([true]);
  });

  it("a renderer closed while its launch is on its way launches nothing more: the readiness check waiting on that launch fails plainly, saying byway closed it (ADR-0105 item 5, ADR-0106)", async () => {
    const probe = held();
    const pages = playwrightPages({ launch: probe.launch, osSandbox: () => false });
    const ready = pages.ready();
    ready.catch(() => undefined);
    const closing = pages.close();
    probe.release();
    await closing;
    await expect(ready).rejects.toBeInstanceOf(StepError);
    await expect(ready).rejects.toThrow("byway's test page could not be drawn: byway closed the page renderer as it shut down.");
    // Asked afterwards, a render and a read say the same, and launch nothing either.
    await expect(pages.render('<p>hi</p>', async () => undefined, ['desktop'])).rejects.toThrow('The page could not be drawn: byway closed the page renderer as it shut down.');
    await expect(pages.shownText('<p>hi</p>', async () => undefined)).rejects.toThrow("The page's text could not be read: byway closed the page renderer as it shut down.");
    expect(await probe.closedOnceReleased()).not.toContain('newContext');
    expect(probe.settings).toEqual([false]);
  });

  it("the start-up line's limit, reached while the probe runs, says what the check has found: ready, the sandbox unknown", async () => {
    const probe = held();
    const progress: RendererCheckProgress = {};
    let probing!: () => void;
    const probeBegan = new Promise<void>((r) => (probing = r));
    const launch = async (setting: LaunchSetting): Promise<Browser> => {
      if (!setting.osSandbox) return launchChromium(setting);
      probing();
      return probe.launch(setting);
    };
    // The probe's own bound is far off: only the line's limit can answer.
    const checking = checkRenderer({ osSandbox: false }, { launch, host: linux, progress, probeMs: 600_000 });
    await probeBegan;
    expect(await rendererCheckWithin(checking, 1, { built: false, osSandbox: false, progress })).toEqual({ osSandbox: false, ready: true, sandbox: 'unknown' });
    probe.release();
    await checking;
    await probe.closedOnceReleased();
  });

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

/**
 * A run refused because the page renderer cannot start says what the start-up line and Settings say (ADR-0105). On
 * Windows a sandbox that cannot start ends Chromium at launch without a word of why, so the launch's own message can only
 * name the sandbox as one possible cause; the start-up check tells the causes apart by drawing byway's test page once
 * without the sandbox, and once it has found the sandbox cannot start here, a run refused for a sandboxed start that
 * fails again says so as the line and Settings do: why on this computer, and the fix. Nothing is spent either way.
 */
describe("a run's refusal agrees with the start-up line and Settings (ADR-0105)", () => {
  const windows: SandboxHost = { os: 'windows', root: false, container: false, appArmorRestricts: false, userNamespacesOff: false };
  let dir: string;
  let store: MemoStore;
  let workspaceId: string;
  /** The headless shell byway launches, which the Windows fix names. */
  let onDisk: { executable?: string; folder?: string };
  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'byway-refusal-'));
    store = createTestStore({ dataDir: dir });
    workspaceId = (await store.ensureDefaultWorkspace()).id;
    onDisk = headlessShell((await import('playwright')).chromium.executablePath());
  });
  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /** Chromium on a Windows computer whose sandbox cannot start: inside it, it dies at launch saying nothing; without it, it starts. */
  const blocked = async (setting: LaunchSetting): Promise<Browser> => {
    if (setting.osSandbox) throw launchFailure(DIED, { ...setting, host: windows, ...onDisk });
    return launchChromium(setting);
  };

  async function refusal(): Promise<{ err: unknown; runId: string }> {
    const run = await store.createRun({ id: `run-${Math.random().toString(36).slice(2)}`, workspaceId, recipeId: 'c1', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium: 'web-page', budgetUsd: 5 });
    // The engine's renderer, as the worker builds it, with the launch played by the test seam.
    const pages = playwrightPages({ osSandbox: storeOsSandbox(store), lastCheck: storeLastCheck(store), launch: blocked, host: windows });
    try {
      const acts = createActivities({ gateway: {} as Gateway, store, prompts: fakePrompts(), pages });
      const err = await acts.beginRun({ runId: run.id, recipeId: 'c1', profileId: 'demo', budgetUsd: 5 }).then(
        () => undefined,
        (e: unknown) => e,
      );
      return { err, runId: run.id };
    } finally {
      await pages.close();
    }
  }

  it('the start-up check found the sandbox cannot start: the run is refused with its message, the why and the fix Settings shows, and no install command', async () => {
    const check = await checkRenderer({ osSandbox: true }, { launch: blocked, host: windows, probeMs: HUNG_PROBE_MS });
    const advice = sandboxAdvice(windows, onDisk);
    expect(check).toEqual({ osSandbox: true, ready: false, sandbox: 'fails', message: sandboxFailureMessage(advice), why: advice.why, fix: advice.fix });
    expect(check.fix).toContain(`(${onDisk.executable})`);
    await store.recordRendererCheck({ at: '2026-10-18T14:00:00.000Z', ...check });

    const { err, runId } = await refusal();
    expect((err as Error).message).toBe(check.message);
    expect(err).toMatchObject({ type: FAILURE.step, nonRetryable: true, message: check.message });
    // The start-up line says that message; Settings shows its why and fix.
    expect(rendererLine(check)).toBe(`not available: ${check.message}`);
    expect((err as Error).message).toContain(`${check.why} ${check.fix}`);
    expect((err as Error).message).not.toMatch(/playwright install|possible cause/);
    // Refused before the run began: nothing spent, nothing written.
    expect((await store.getRun(runId))?.status).toBe('queued');
    expect((await store.events(runId)).map((e) => e.type)).not.toContain('run-started');
  });

  it('with no start-up check to go by, the refusal names the sandbox as one possible cause, with the same why and fix, and the install command', async () => {
    const { err } = await refusal();
    const advice = sandboxAdvice(windows, onDisk);
    expect(err).toMatchObject({ type: FAILURE.step, nonRetryable: true });
    expect((err as Error).message).toBe(
      `The page renderer could not start (Target page, context or browser has been closed), so pages, and the cards that show a reviewer the examples beside the work, cannot be drawn. One possible cause is that its OS sandbox cannot run on this computer; if so: ${advice.why} ${advice.fix} If Playwright's Chromium is not installed: pnpm --filter ./apps/web exec playwright install chromium`,
    );
  });

  it('a start-up check that found the sandbox starts, or could not tell, leaves the possible cause; a Chromium that is not there is never the sandbox', async () => {
    for (const sandbox of ['starts', 'unknown'] as const) {
      await store.recordRendererCheck({ at: '2026-10-18T14:00:00.000Z', osSandbox: true, ready: sandbox === 'starts', sandbox });
      expect(((await refusal()).err as Error).message).toContain('One possible cause is that its OS sandbox cannot run on this computer');
    }
    await store.recordRendererCheck({ at: '2026-10-18T14:00:00.000Z', osSandbox: true, ready: false, sandbox: 'fails', message: 'm', why: 'w', fix: 'f' });
    const missing = new Error(`browserType.launch: Executable doesn't exist at ${onDisk.executable ?? 'C:\pw\chrome-headless-shell.exe'}`);
    const pages = playwrightPages({ osSandbox: storeOsSandbox(store), lastCheck: storeLastCheck(store), launch: async (s) => Promise.reject(launchFailure(missing, { ...s, host: windows })), host: windows });
    try {
      await expect(pages.ready()).rejects.toThrow(launchFailure(missing).message);
    } finally {
      await pages.close();
    }
  });
});
