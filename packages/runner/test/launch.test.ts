/**
 * How the page renderer's Chromium is launched (F18; ADR-0084), without a browser: Playwright is mocked here, so these
 * tests see exactly the options byway hands it. One stated launch for every renderer use: headless, the sandbox policy
 * the owner has yet to decide (kept as it was), only the WebRTC flags, and an environment with no provider key, nothing
 * secret-looking and nothing from the secrets file. The production launch takes no parameter, so no caller can add a
 * flag. A Chromium that cannot start fails every renderer path (a C1 view, a lineup card, the readiness check) with one
 * plain message that is not retried, and the start-up check says the same without throwing.
 *
 * The effective command line of a real Chromium is checked in pages.test.ts.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationFailure } from '@temporalio/common';
import type { Gateway } from '@byway/contracts';
import { KEY_VARS, loadEnvFile, type Env } from '@byway/gateway';
import { buildLineup } from '../src/activities/critic.ts';
import type { RunnerDeps } from '../src/activities/deps.ts';
import { StepError, toFailure } from '../src/activities/failures.ts';
import { ArtifactReader } from '../src/activities/prompting.ts';
import { cardHtml } from '../src/cards.ts';
import { checkRenderer, chromiumLaunchOptions, launchChromium, launchFailure, playwrightPages, RENDERER_OS_SANDBOX } from '../src/pages.ts';
import { FAILURE, type View } from '../src/types.ts';
import { png } from './helpers/fake-pages.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock('playwright', () => ({ chromium: { launch } }));

const WEBRTC_FLAGS = ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--webrtc-ip-handling-policy=disable_non_proxied_udp'];

/** What Playwright 1.63 throws when its Chromium was never downloaded (coreBundle.js, "Executable doesn't exist at"). */
const MISSING = new Error(
  [
    "browserType.launch: Executable doesn't exist at C:\\pw\\chromium_headless_shell-1243\\chrome-headless-shell-win64\\chrome-headless-shell.exe",
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

const none = async () => undefined;
/** A browser that launched: enough for ready() and close(). */
const fakeBrowser = () => ({ isConnected: () => true, on: () => undefined, close: vi.fn(async () => undefined) });

beforeEach(() => {
  launch.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the one launch every renderer use goes through', () => {
  it('is headless, keeps the stated sandbox policy, adds only the WebRTC flags, and hands Chromium no key or secrets-file name', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'byway-launch-'));
    try {
      const file = path.join(dir, '.env.agents');
      // A name the secrets file holds that does not look secret, and a key the shell already exported (kept).
      writeFileSync(file, 'ODD_CREDENTIAL=hunter2\nOPENAI_API_KEY=sk-file\n');
      const env: Env = { PATH: '/bin', SystemRoot: 'C:\\Windows', HOME: '/home/me', GITHUB_TOKEN: 'ghp-x', MY_SECRET: 'x', OPENAI_API_KEY: 'sk-shell', UNSET: undefined };
      for (const name of Object.values(KEY_VARS)) env[name] ??= `${name}-SENTINEL`;
      loadEnvFile(file, env);
      const opts = chromiumLaunchOptions(env);
      expect(opts.headless).toBe(true);
      expect(opts.chromiumSandbox).toBe(RENDERER_OS_SANDBOX);
      expect(opts.args).toEqual(WEBRTC_FLAGS);
      expect(opts.env).toEqual({ PATH: '/bin', SystemRoot: 'C:\\Windows', HOME: '/home/me' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps the sandbox setting byway always had until the owner decides it (review verification §4 item 2)', () => {
    // Off: Playwright's default, which adds --no-sandbox. Changing it is the owner's call, and this test says so.
    expect(RENDERER_OS_SANDBOX).toBe(false);
  });

  it('takes no parameter in production and calls Playwright once, with exactly those options and no key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-SENTINEL');
    vi.stubEnv('MY_SERVICE_TOKEN', 'tok-SENTINEL');
    const browser = fakeBrowser();
    launch.mockResolvedValueOnce(browser);
    expect(launchChromium.length).toBe(0);
    expect(await launchChromium()).toBe(browser);
    expect(launch).toHaveBeenCalledTimes(1);
    const [given] = launch.mock.calls[0] as [Record<string, unknown>];
    expect(given).toEqual(chromiumLaunchOptions());
    expect(given.env).toBeDefined();
    expect(JSON.stringify(given)).not.toContain('SENTINEL');
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
    expect(launchFailure(MISSING).message).toContain("Executable doesn't exist at C:\\pw\\");
    expect(launchFailure(DIED).message).toContain('Target page, context or browser has been closed');
  });

  it('comes out of the production launch as that failure, after one attempt', async () => {
    launch.mockRejectedValueOnce(MISSING);
    const err = await launchChromium().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StepError);
    expect((err as Error).message).toBe(launchFailure(MISSING).message);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  describe('on every renderer path', () => {
    let dir: string;
    let store: MemoStore;
    beforeEach(() => {
      dir = mkdtempSync(path.join(tmpdir(), 'byway-launch-paths-'));
      store = createTestStore({ dataDir: dir });
      launch.mockRejectedValue(DIED);
    });
    afterEach(() => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    });

    it('a view of a page, a card, the readiness check and a lineup of cards all fail with the same message', async () => {
      const expected = launchFailure(DIED).message;
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
      // Every attempt is the same stated launch: nothing ever retries with other options.
      for (const [given] of launch.mock.calls as [unknown][]) expect(given).toEqual(chromiumLaunchOptions());
      await pages.close();
    });
  });
});

describe('the start-up check (serve.ts prints it as the "renderer" line)', () => {
  it('says ready when the stated launch works, and closes the browser it started', async () => {
    const browser = fakeBrowser();
    launch.mockResolvedValueOnce(browser);
    expect(await checkRenderer()).toEqual({ ready: true });
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('says why when it does not, and never throws', async () => {
    launch.mockRejectedValueOnce(MISSING);
    expect(await checkRenderer()).toEqual({ ready: false, message: launchFailure(MISSING).message });
  });
});
