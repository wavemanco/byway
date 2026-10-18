/**
 * How the page renderer's Chromium is launched (F18; ADR-0084, ADR-0105), without a browser: Playwright is mocked here,
 * so these tests see exactly the options byway hands it. One stated launch for every renderer use: headless, inside its
 * OS sandbox unless the person switched it off in Settings, only the WebRTC flags, and an environment with no provider
 * key, nothing secret-looking and nothing from the secrets file. The production launch takes only the sandbox setting,
 * so no caller can add a flag, and the renderer reads that setting from the store before each load; a setting it cannot
 * read is on. A Chromium that cannot start fails every renderer path (a C1 view, a lineup card, the readiness check)
 * with one plain message that is not retried; a sandbox that cannot start says why on this computer and the fix, naming
 * on Windows the headless shell byway launches; a Chromium that dies inside the sandbox with no word of why names the
 * sandbox as one possible cause.
 *
 * The effective command line of a real Chromium, the readiness check's test page and the start-up check are checked in
 * pages.test.ts and renderer-check.test.ts; the per-system reasons and the drift test on Playwright's words in
 * sandbox.test.ts.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationFailure } from '@temporalio/common';
import type { Gateway } from '@byway/contracts';
import { KEY_VARS, loadEnvFile, type Env } from '@byway/gateway';
import { buildLineup } from '../src/activities/critic.ts';
import type { RunnerDeps } from '../src/activities/deps.ts';
import { StepError, toFailure } from '../src/activities/failures.ts';
import { ArtifactReader } from '../src/activities/prompting.ts';
import { cardHtml } from '../src/cards.ts';
import { checkRenderer, chromiumLaunchOptions, launchChromium, launchFailure, playwrightPages, RENDERER_OS_SANDBOX_DEFAULT, storeOsSandbox } from '../src/pages.ts';
import { sandboxAdvice, sandboxFailureMessage, type SandboxHost } from '../src/sandbox.ts';
import { FAILURE, type View } from '../src/types.ts';
import { png } from './helpers/fake-pages.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

/**
 * Playwright's browsers folder, as a test folder: chromium.executablePath() names the full Chromium in it, as the real
 * Playwright does, while byway launches the headless shell beside it, which is the file the Windows fix names.
 */
const { launch, BROWSERS, FULL_CHROMIUM, EXECUTABLE, playwrightNames } = await vi.hoisted(async () => {
  const { mkdirSync, mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { dirname, join } = await import('node:path');
  const browsers = mkdtempSync(join(tmpdir(), 'byway-ms-playwright-'));
  const shell = join(browsers, 'chromium_headless_shell-1243', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
  mkdirSync(dirname(shell), { recursive: true });
  writeFileSync(shell, '');
  const full = join(browsers, 'chromium-1243', 'chrome-win64', 'chrome.exe');
  return { launch: vi.fn(), BROWSERS: browsers, FULL_CHROMIUM: full, EXECUTABLE: shell, playwrightNames: { path: full } };
});
vi.mock('playwright', () => ({ chromium: { launch, executablePath: () => playwrightNames.path } }));
afterAll(() => rmSync(BROWSERS, { recursive: true, force: true }));

const WEBRTC_FLAGS = ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--webrtc-ip-handling-policy=disable_non_proxied_udp'];
const ON = { osSandbox: true };
const OFF = { osSandbox: false };

/** What Playwright 1.63 throws when its Chromium was never downloaded (coreBundle.js, "Executable doesn't exist at"). */
const MISSING = new Error(
  [
    `browserType.launch: Executable doesn't exist at ${EXECUTABLE}`,
    '╔════════════════════════════════════════════════════════════╗',
    '║ Looks like Playwright was just installed or updated.       ║',
    '║ Please run the following command to download new browsers: ║',
    '║     npx playwright install                                 ║',
    '╚════════════════════════════════════════════════════════════╝',
  ].join('\n'),
);
/** What it throws when Chromium starts and dies at once (the pipe transport closes before the browser answers). */
const DIED = new Error(
  [
    'browserType.launch: Target page, context or browser has been closed',
    'Browser logs:',
    '',
    '<launching> /pw/chrome-headless-shell --disable-field-trial-config --headless',
    '[pid=4242][err] Trace/breakpoint trap',
    'Call log:',
    '  - <launching> /pw/chrome-headless-shell',
  ].join('\n'),
);
/**
 * What it throws when Chromium's sandbox cannot start: the same first line, then Playwright's own words in place of the
 * browser's log (sandbox.test.ts holds this shape to the installed Playwright).
 */
const SANDBOXED = new Error(
  [
    'browserType.launch: Target page, context or browser has been closed',
    'Browser logs:',
    'Chromium sandboxing failed!',
    '================================',
    'To avoid the sandboxing issue, do either of the following:',
    '  - (preferred): Configure your environment to support sandboxing',
    "  - (alternative): Launch Chromium without sandbox using 'chromiumSandbox: false' option",
    '================================',
    '',
    'Call log:',
    '  - [pid=4242][err] No usable sandbox!',
  ].join('\n'),
);

const none = async () => undefined;

beforeEach(() => {
  launch.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the one launch every renderer use goes through', () => {
  it('is headless, inside the OS sandbox or not as the setting says, adds only the WebRTC flags, and hands Chromium no key or secrets-file name', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'byway-launch-'));
    try {
      const file = path.join(dir, '.env.agents');
      // A name the secrets file holds that does not look secret, and a key the shell already exported (kept).
      writeFileSync(file, 'ODD_CREDENTIAL=hunter2\nOPENAI_API_KEY=sk-file\n');
      const env: Env = { PATH: '/bin', SystemRoot: 'C:\\Windows', HOME: '/home/me', GITHUB_TOKEN: 'ghp-x', MY_SECRET: 'x', OPENAI_API_KEY: 'sk-shell', UNSET: undefined };
      for (const name of Object.values(KEY_VARS)) env[name] ??= `${name}-SENTINEL`;
      loadEnvFile(file, env);
      for (const setting of [ON, OFF]) {
        const opts = chromiumLaunchOptions(setting, env);
        expect(Object.keys(opts).sort()).toEqual(['args', 'chromiumSandbox', 'env', 'headless']);
        expect(opts.headless).toBe(true);
        expect(opts.chromiumSandbox).toBe(setting.osSandbox);
        expect(opts.args).toEqual(WEBRTC_FLAGS);
        expect(opts.env).toEqual({ PATH: '/bin', SystemRoot: 'C:\\Windows', HOME: '/home/me' });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('takes only the sandbox setting in production and calls Playwright once, with exactly those options and no key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-SENTINEL');
    vi.stubEnv('MY_SERVICE_TOKEN', 'tok-SENTINEL');
    const browser = { isConnected: () => true, on: () => undefined, close: vi.fn(async () => undefined) };
    launch.mockResolvedValueOnce(browser);
    expect(launchChromium.length).toBe(1);
    expect(await launchChromium(ON)).toBe(browser);
    expect(launch).toHaveBeenCalledTimes(1);
    const [given] = launch.mock.calls[0] as [Record<string, unknown>];
    expect(given).toEqual(chromiumLaunchOptions(ON));
    expect(given.env).toBeDefined();
    expect(JSON.stringify(given)).not.toContain('SENTINEL');
  });
});

describe('the OS sandbox setting (ADR-0105)', () => {
  /** The options each launch was given, when every launch fails at once (so no browser is needed). */
  const launchedWith = () => (launch.mock.calls as [{ chromiumSandbox?: boolean }][]).map(([o]) => o.chromiumSandbox);

  it('is on unless the person switched it off: no setting given, or one that cannot be read, launches inside the sandbox', async () => {
    expect(RENDERER_OS_SANDBOX_DEFAULT).toBe(true);
    launch.mockRejectedValue(DIED);
    await playwrightPages().ready().catch(() => undefined);
    await playwrightPages({ osSandbox: async () => true }).ready().catch(() => undefined);
    await playwrightPages({ osSandbox: async () => false }).ready().catch(() => undefined);
    const broken = playwrightPages({
      osSandbox: async () => {
        throw new Error('the store is closed');
      },
    });
    await broken.ready().catch(() => undefined);
    expect(launchedWith()).toEqual([true, true, false, true]);
  });

  it("is the store's, read through storeOsSandbox before each load", async () => {
    launch.mockRejectedValue(DIED);
    let osSandbox = false;
    let reads = 0;
    const store = { getRendererSettings: async () => (reads++, { osSandbox }) };
    const pages = playwrightPages({ osSandbox: storeOsSandbox(store) });
    await pages.ready().catch(() => undefined);
    osSandbox = true;
    await pages.render('<p>Hi</p>', none, ['desktop']).catch(() => undefined);
    expect(launchedWith()).toEqual([false, true]);
    expect(reads).toBe(2);
  });
});

describe('a Chromium that cannot start', () => {
  it('is one plain step failure, not retried, that names what Playwright said and how to install Chromium', () => {
    for (const err of [MISSING, DIED, 'spawn EACCES']) {
      const failure = launchFailure(err);
      expect(failure).toBeInstanceOf(StepError);
      expect(failure.cause).toBe(err);
      expect(failure.message).toMatch(/^The page renderer could not start/);
      expect(failure.message).toContain('pnpm --filter ./apps/web exec playwright install chromium');
      expect(failure.message).not.toMatch(/\n|browserType\.launch|Call log|╔/);
      const toWorkflow = toFailure(failure);
      expect(toWorkflow).toBeInstanceOf(ApplicationFailure);
      expect((toWorkflow as ApplicationFailure).type).toBe(FAILURE.step);
      expect((toWorkflow as ApplicationFailure).nonRetryable).toBe(true);
    }
    expect(launchFailure(MISSING).message).toContain(`Executable doesn't exist at ${EXECUTABLE}`);
    expect(launchFailure(DIED).message).toContain('Target page, context or browser has been closed');
  });

  it('whose OS sandbox could not start says so, why on this computer and the fix, not the install command, and is not retried either', () => {
    const host: SandboxHost = { os: 'linux', root: false, container: false, appArmorRestricts: true, userNamespacesOff: false };
    const failure = launchFailure(SANDBOXED, { osSandbox: true, host });
    expect(failure).toBeInstanceOf(StepError);
    expect(failure.cause).toBe(SANDBOXED);
    expect(failure.message).toBe(sandboxFailureMessage(sandboxAdvice(host)));
    expect(failure.message).not.toMatch(/playwright install|Target page|chromiumSandbox|\n/);
    expect((toFailure(failure) as ApplicationFailure).nonRetryable).toBe(true);
    // Windows: the fix names Playwright's Chromium.
    const windows: SandboxHost = { ...host, os: 'windows', appArmorRestricts: false };
    expect(launchFailure(SANDBOXED, { osSandbox: true, host: windows, executable: EXECUTABLE }).message).toContain(`Allow Playwright's Chromium (${EXECUTABLE})`);
    // A launch without the sandbox cannot fail for it: the plain message.
    expect(launchFailure(SANDBOXED, { osSandbox: false, host }).message).toMatch(/^The page renderer could not start \(Target page, context or browser has been closed\)/);
  });

  it('that dies inside the sandbox saying nothing of why names the sandbox as one possible cause, with why and the fix, and keeps the install command; a Chromium that is not there does not', () => {
    // On Windows a sandbox that cannot start ends Chromium so: none of the markers Linux prints.
    const windows: SandboxHost = { os: 'windows', root: false, container: false, appArmorRestricts: false, userNamespacesOff: false };
    const advice = sandboxAdvice(windows, { executable: EXECUTABLE });
    const failure = launchFailure(DIED, { osSandbox: true, host: windows, executable: EXECUTABLE });
    expect(failure).toBeInstanceOf(StepError);
    expect(failure.cause).toBe(DIED);
    expect(failure.message).toBe(
      `The page renderer could not start (Target page, context or browser has been closed), so pages, and the cards that show a reviewer the examples beside the work, cannot be drawn. One possible cause is that its OS sandbox cannot run on this computer; if so: ${advice.why} ${advice.fix} If Playwright's Chromium is not installed: pnpm --filter ./apps/web exec playwright install chromium`,
    );
    expect((toFailure(failure) as ApplicationFailure).nonRetryable).toBe(true);
    // Not there, or launched without the sandbox, or with the setting not said: the plain message, no sandbox in it.
    for (const said of [launchFailure(MISSING, { osSandbox: true, host: windows }), launchFailure(DIED, { osSandbox: false, host: windows }), launchFailure(DIED)]) {
      expect(said.message).toMatch(/^The page renderer could not start \(.*\), so pages, and the cards that show a reviewer the examples beside the work, cannot be drawn\. If Playwright's Chromium is not installed: /);
      expect(said.message).not.toMatch(/sandbox/i);
    }
  });

  it('comes out of the production launch as that failure, after one attempt, naming Playwright’s Chromium on this computer', async () => {
    launch.mockRejectedValueOnce(MISSING);
    const err = await launchChromium(ON).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StepError);
    expect((err as Error).message).toBe(launchFailure(MISSING).message);
    expect(launch).toHaveBeenCalledTimes(1);
    launch.mockRejectedValueOnce(SANDBOXED);
    const sandboxed = await launchChromium(ON).catch((e: unknown) => e);
    expect((sandboxed as Error).message).toBe(launchFailure(SANDBOXED, { osSandbox: true, executable: EXECUTABLE }).message);
    expect((sandboxed as Error).message).toMatch(/^The page renderer could not start inside its OS sandbox on this computer/);
    launch.mockRejectedValueOnce(DIED);
    const died = await launchChromium(ON).catch((e: unknown) => e);
    expect((died as Error).message).toBe(launchFailure(DIED, { osSandbox: true, executable: EXECUTABLE }).message);
    expect((died as Error).message).toContain('One possible cause is that its OS sandbox cannot run on this computer');
  });

  it("names, in the Windows fix, the headless shell byway launches, not the full Chromium Playwright names; or Playwright's browsers folder when the shell is not there", async () => {
    const windows: SandboxHost = { os: 'windows', root: false, container: false, appArmorRestricts: false, userNamespacesOff: false };
    launch.mockRejectedValue(SANDBOXED);
    const check = await checkRenderer(ON, { host: windows });
    expect(check.fix).toBe(`Allow Playwright's Chromium (${EXECUTABLE}) in that software, or ask whoever manages this computer, then start byway again.`);
    expect(check.message).not.toContain(FULL_CHROMIUM);
    // A Playwright whose headless shell is not in its folder (another revision, say): the folder, never a file not there.
    playwrightNames.path = path.join(BROWSERS, 'chromium-9999', 'chrome-win64', 'chrome.exe');
    try {
      expect((await checkRenderer(ON, { host: windows })).fix).toBe(`Allow the Chromium in Playwright's browsers folder (${BROWSERS}) in that software, or ask whoever manages this computer, then start byway again.`);
    } finally {
      playwrightNames.path = FULL_CHROMIUM;
    }
  });

  describe('on every renderer path', () => {
    let dir: string;
    let store: MemoStore;
    beforeEach(() => {
      dir = mkdtempSync(path.join(tmpdir(), 'byway-launch-paths-'));
      store = createTestStore({ dataDir: dir });
    });
    afterEach(() => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    });

    it.each([
      ['Chromium died', DIED],
      ['its OS sandbox could not start', SANDBOXED],
    ])('(%s) a view of a page, a card, the readiness check and a lineup of cards all fail with the same message', async (_, cause) => {
      launch.mockRejectedValue(cause);
      const expected = launchFailure(cause, { osSandbox: true, executable: EXECUTABLE }).message;
      // Inside the sandbox, the default: a death with no word of why names the sandbox as one possible cause.
      expect(expected).toContain(cause === DIED ? 'One possible cause is that its OS sandbox cannot run on this computer' : 'could not start inside its OS sandbox on this computer');
      const pages = playwrightPages();
      await expect(pages.render('<!doctype html><p>Hi</p>', none, ['desktop', 'mobile', 'fold'])).rejects.toThrow(expected);
      await expect(pages.render(cardHtml({ images: [], layout: 'grid', text: 'A card' }), none, ['desktop'])).rejects.toBeInstanceOf(StepError);
      await expect(pages.ready()).rejects.toThrow(expected);

      // A storyboard against image references forms cards (BLIND-1): every card goes through the same renderer.
      const deps: RunnerDeps = { gateway: {} as Gateway, store, prompts: fakePrompts(), pages };
      const frames = [(await store.artifacts.put(png(4, 3, [1, 2, 3]), 'image/png')).id];
      const board = (await store.artifacts.putText('Shot 1 (3s): Open on hands.', 'text/plain')).id;
      const view: View = { pool: false, items: [{ textArtifactId: board, imageArtifactIds: frames }] };
      const refs = await Promise.all([10, 20, 30].map(async (c) => (await store.artifacts.put(png(4, 3, [c, c, c]), 'image/png')).id));
      const err = await buildLineup(deps, new ArtifactReader(deps), 'media', { view }, refs, () => 0.5).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StepError);
      expect((err as Error).message).toBe(expected);
      // Every attempt is the same stated launch: nothing ever retries with other options, the sandbox's included.
      for (const [given] of launch.mock.calls as [unknown][]) expect(given).toEqual(chromiumLaunchOptions(ON));
      await pages.close();
    });
  });
});
