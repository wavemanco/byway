/**
 * Why the page renderer's OS sandbox cannot start, and what to do, for the operating system byway runs on (sandbox.ts;
 * ADR-0105): Windows; Linux as root, in a container, with AppArmor restricting user namespaces (Ubuntu 24.04 and later)
 * or with them switched off; and a slot for macOS, which byway does not support yet. The facts about the machine are
 * handed in, so every case is checked on any machine. How a sandbox failure is told from Playwright's error is checked
 * against the installed Playwright too (the drift test, below).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { browsersFolderOf, headlessShell, isChromiumMissing, isSandboxFailure, possibleSandboxCause, sandboxAdvice, sandboxFailureMessage, sandboxHost, SANDBOX_FAILED, type HostProbe, type SandboxHost } from '../src/sandbox.ts';

/** A machine as sandboxHost() reads it: its platform, user id, files and environment. */
function probe(over: Partial<HostProbe> & { files?: Record<string, string> } = {}): HostProbe {
  const files = over.files ?? {};
  return {
    platform: over.platform ?? 'linux',
    ...(over.uid !== undefined ? { uid: over.uid } : { uid: 1000 }),
    read: over.read ?? ((p) => files[p]),
    exists: over.exists ?? ((p) => p in files),
    env: over.env ?? {},
  };
}

const linux = (over: Partial<SandboxHost> = {}): SandboxHost => ({ os: 'linux', root: false, container: false, appArmorRestricts: false, userNamespacesOff: false, ...over });

describe('what byway reads about the machine', () => {
  it('names the operating system, with a slot for macOS', () => {
    expect(sandboxHost(probe({ platform: 'win32' })).os).toBe('windows');
    expect(sandboxHost(probe({ platform: 'linux' })).os).toBe('linux');
    expect(sandboxHost(probe({ platform: 'darwin' })).os).toBe('macos');
    expect(sandboxHost(probe({ platform: 'freebsd' })).os).toBe('other');
  });

  it('on Linux: root, a container, AppArmor restricting user namespaces, and user namespaces switched off', () => {
    expect(sandboxHost(probe())).toEqual(linux());
    expect(sandboxHost(probe({ uid: 0 })).root).toBe(true);
    const containers: Record<string, string>[] = [{ '/.dockerenv': '' }, { '/run/.containerenv': '' }, { '/proc/1/cgroup': '12:pids:/docker/3f2a\n' }, { '/proc/1/cgroup': '1:name=systemd:/kubepods/pod1/abc\n' }];
    for (const files of containers) {
      expect(sandboxHost(probe({ files })).container, JSON.stringify(files)).toBe(true);
    }
    expect(sandboxHost(probe({ env: { container: 'podman' } })).container).toBe(true);
    expect(sandboxHost(probe({ files: { '/proc/1/cgroup': '0::/init.scope\n' } })).container).toBe(false);
    expect(sandboxHost(probe({ files: { '/proc/sys/kernel/apparmor_restrict_unprivileged_userns': '1\n' } })).appArmorRestricts).toBe(true);
    expect(sandboxHost(probe({ files: { '/proc/sys/kernel/apparmor_restrict_unprivileged_userns': '0\n' } })).appArmorRestricts).toBe(false);
    expect(sandboxHost(probe({ files: { '/proc/sys/kernel/unprivileged_userns_clone': '0\n' } })).userNamespacesOff).toBe(true);
    expect(sandboxHost(probe({ files: { '/proc/sys/user/max_user_namespaces': '0\n' } })).userNamespacesOff).toBe(true);
    expect(sandboxHost(probe({ files: { '/proc/sys/kernel/unprivileged_userns_clone': '1\n', '/proc/sys/user/max_user_namespaces': '63432\n' } })).userNamespacesOff).toBe(false);
  });

  it('reads nothing of Linux’s on Windows or macOS, and a file it cannot read is not a finding', () => {
    const looked: string[] = [];
    const watching = (platform: NodeJS.Platform) =>
      probe({
        platform,
        uid: 0,
        read: (p) => {
          looked.push(p);
          return '1';
        },
        exists: (p) => (looked.push(p), true),
      });
    expect(sandboxHost(watching('win32'))).toEqual({ os: 'windows', root: false, container: false, appArmorRestricts: false, userNamespacesOff: false });
    expect(sandboxHost(watching('darwin'))).toEqual({ os: 'macos', root: false, container: false, appArmorRestricts: false, userNamespacesOff: false });
    expect(looked).toEqual([]);
    const throwing = probe({
      read: () => {
        throw new Error('EACCES');
      },
      exists: () => {
        throw new Error('EACCES');
      },
    });
    expect(sandboxHost(throwing)).toEqual(linux());
  });
});

describe('why the sandbox cannot start, and the fix, for each system', () => {
  it('Windows: something on the computer blocks it, and the fix names Playwright’s Chromium, or the folder it is in', () => {
    const exe = 'C:\\Users\\me\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1243\\chrome-headless-shell-win64\\chrome-headless-shell.exe';
    const advice = sandboxAdvice({ os: 'windows', root: false, container: false, appArmorRestricts: false, userNamespacesOff: false }, { executable: exe });
    expect(advice.why).toBe('On Windows the sandbox is how Chromium normally runs, so something on this computer is blocking it, most often security software or a company policy.');
    expect(advice.fix).toBe(`Allow Playwright's Chromium (${exe}) in that software, or ask whoever manages this computer, then start byway again.`);
    // The file is not there (a Playwright installed otherwise): the folder Playwright keeps its browsers in.
    const folder = 'C:\\Users\\me\\AppData\\Local\\ms-playwright';
    expect(sandboxAdvice({ ...linux(), os: 'windows' }, { folder }).fix).toBe(`Allow the Chromium in Playwright's browsers folder (${folder}) in that software, or ask whoever manages this computer, then start byway again.`);
    expect(sandboxAdvice({ ...linux(), os: 'windows' }).fix).toBe("Allow Playwright's Chromium in that software, or ask whoever manages this computer, then start byway again.");
  });

  it('Linux: root first, then a container, then AppArmor (Ubuntu 24.04 and later), then user namespaces switched off, then unknown', () => {
    expect(sandboxAdvice(linux({ root: true, container: true, appArmorRestricts: true }))).toEqual({
      why: 'byway is running as root, and Chromium does not start its sandbox for root.',
      fix: 'Start byway as an ordinary user.',
    });
    expect(sandboxAdvice(linux({ container: true, appArmorRestricts: true }))).toEqual({
      why: "byway is running in a container, and a container's default security settings often stop Chromium starting its sandbox.",
      fix: 'Run byway outside the container. Renderer in the README says more.',
    });
    expect(sandboxAdvice(linux({ appArmorRestricts: true, userNamespacesOff: true }))).toEqual({
      why: "This Linux lets only the programs an AppArmor profile allows create the user namespaces Chromium's sandbox needs (Ubuntu does this by default from 24.04).",
      fix: "Allow them for Playwright's Chromium alone, installed in a folder only root can change: in the byway folder, run sh scripts/linux/allow-chromium-sandbox.sh (it asks for your password for sudo), then start byway again with PLAYWRIGHT_BROWSERS_PATH=/opt/byway/ms-playwright, as the script says.",
    });
    expect(sandboxAdvice(linux({ userNamespacesOff: true }))).toEqual({
      why: "Unprivileged user namespaces, which Chromium's sandbox needs, are switched off on this Linux.",
      fix: 'Someone with admin rights has to switch them on. Renderer in the README says more.',
    });
    expect(sandboxAdvice(linux())).toEqual({ why: 'byway could not tell why on this Linux.', fix: 'Renderer in the README lists the usual causes and their fixes.' });
  });

  it('Linux: Chromium’s own word that it was started as root counts, whatever byway read', () => {
    const asRoot = new Error('browserType.launch: Target page, context or browser has been closed\nCall log:\n  - [pid=1][err] Running as root without --no-sandbox is not supported. See https://crbug.com/638180.');
    expect(sandboxAdvice(linux({ appArmorRestricts: true }), { error: asRoot }).why).toBe('byway is running as root, and Chromium does not start its sandbox for root.');
  });

  it('macOS and other systems: a slot that says byway does not support them yet, and never claims macOS', () => {
    expect(sandboxAdvice({ ...linux(), os: 'macos' })).toEqual({ why: 'byway does not support macOS yet.', fix: 'byway runs on Windows and Linux.' });
    expect(sandboxAdvice({ ...linux(), os: 'other' })).toEqual({ why: 'byway does not support this operating system.', fix: 'byway runs on Windows and Linux.' });
  });

  it('the message: what failed, what it stops, why and the fix, on one line and never advising to switch the sandbox off', () => {
    const advice = sandboxAdvice(linux({ appArmorRestricts: true }));
    const message = sandboxFailureMessage(advice);
    expect(message).toBe(`The page renderer could not start inside its OS sandbox on this computer, so pages, and the cards that show a reviewer the examples beside the work, cannot be drawn. ${advice.why} ${advice.fix}`);
    for (const host of [linux(), linux({ root: true }), linux({ container: true }), linux({ userNamespacesOff: true }), { ...linux(), os: 'windows' as const }, { ...linux(), os: 'macos' as const }]) {
      const said = sandboxFailureMessage(sandboxAdvice(host));
      expect(said).not.toMatch(/\n|chromiumSandbox|--no-sandbox|switch (it|the sandbox) off|turn (it|the sandbox) off/i);
    }
  });

  it('a page renderer that did not start with the sandbox on, for no reason Chromium gave: the sandbox is named as one possible cause, memory as another', () => {
    const advice = sandboxAdvice({ ...linux(), os: 'windows' });
    expect(possibleSandboxCause('Target crashed', advice)).toBe(
      `The page renderer started but could not draw byway's test page (Target crashed). One possible cause is that its OS sandbox cannot run on this computer; if so: ${advice.why} ${advice.fix} Another is a computer short of memory.`,
    );
  });
});

/**
 * The file the Windows fix names: the Chromium byway launches. byway launches Chromium headless, which Playwright runs as
 * its headless shell, not the full Chromium that Playwright's chromium.executablePath() names (ADR-0105). The real launch
 * is compared with this in pages.test.ts (the drift test).
 */
describe('which Chromium the fix names', () => {
  const files = (...present: string[]) => (p: string) => present.includes(p);

  it('the headless shell beside the full Chromium Playwright names, of the same revision, on each system Playwright lays out', () => {
    const win = 'C:\\Users\\me\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
    const winShell = 'C:\\Users\\me\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1243\\chrome-headless-shell-win64\\chrome-headless-shell.exe';
    expect(headlessShell(win, files(winShell))).toEqual({ executable: winShell });
    const lin = '/home/me/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
    const linShell = '/home/me/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
    expect(headlessShell(lin, files(linShell))).toEqual({ executable: linShell });
    const arm = '/home/me/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
    const armShell = '/home/me/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux-arm64/chrome-headless-shell';
    expect(headlessShell(arm, files(armShell))).toEqual({ executable: armShell });
    const mac = '/Users/me/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
    const macShell = '/Users/me/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
    expect(headlessShell(mac, files(macShell))).toEqual({ executable: macShell });
  });

  it('never names a file that is not there: then the browsers folder, and nothing for a path laid out otherwise', () => {
    expect(headlessShell('C:\\pw\\chromium-1243\\chrome-win64\\chrome.exe', files())).toEqual({ folder: 'C:\\pw' });
    // Only the full Chromium downloaded: the file Playwright names is not the one byway runs.
    expect(headlessShell('C:\\pw\\chromium-1243\\chrome-win64\\chrome.exe', files('C:\\pw\\chromium-1243\\chrome-win64\\chrome.exe'))).toEqual({ folder: 'C:\\pw' });
    expect(headlessShell('/opt/chrome/chrome', files('/opt/chrome/chrome'))).toEqual({});
    expect(headlessShell('', files())).toEqual({});
    const throwing = () => {
      throw new Error('EACCES');
    };
    expect(headlessShell('/pw/chromium-1243/chrome-linux64/chrome', throwing)).toEqual({ folder: '/pw' });
  });

  it("follows Playwright's browsers folder where PLAYWRIGHT_BROWSERS_PATH moves it", async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'byway-browsers-'));
    try {
      // Playwright's own answer in a process started with the variable set (it reads it once, as it loads).
      const named = await new Promise<string>((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', "import('playwright').then(({ chromium }) => process.stdout.write(chromium.executablePath()))"], {
          cwd: fileURLToPath(new URL('..', import.meta.url)),
          env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: folder },
          stdio: ['ignore', 'pipe', 'inherit'],
        });
        let out = '';
        child.stdout.on('data', (d: Buffer) => (out += d.toString()));
        child.on('error', reject);
        child.on('close', () => resolve(out));
      });
      expect(named.startsWith(folder)).toBe(true);
      expect(browsersFolderOf(named)).toBe(folder);
      expect(headlessShell(named)).toEqual({ folder });
      const shell = headlessShell(named, () => true).executable!;
      expect(path.dirname(path.dirname(path.dirname(shell)))).toBe(folder);
      mkdirSync(path.dirname(shell), { recursive: true });
      writeFileSync(shell, '');
      expect(headlessShell(named)).toEqual({ executable: shell });
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

/**
 * Where byway takes Chromium from: Playwright's browsers folder, which PLAYWRIGHT_BROWSERS_PATH moves. On a Linux whose
 * AppArmor restricts user namespaces, the README's script installs Chromium in a folder only root can change and
 * attaches its profile to that folder alone (ADR-0105); the start-up line names the folder in use, and the install
 * command a missing Chromium gives depends on it (launch.test.ts).
 */
describe("Playwright's browsers folder", () => {
  it('is the folder above the full Chromium Playwright names, on each system Playwright lays out, and nothing for a path laid out otherwise', () => {
    expect(browsersFolderOf('C:\\Users\\me\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe')).toBe('C:\\Users\\me\\AppData\\Local\\ms-playwright');
    expect(browsersFolderOf('/opt/byway/ms-playwright/chromium-1243/chrome-linux64/chrome')).toBe('/opt/byway/ms-playwright');
    expect(browsersFolderOf('/Users/me/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')).toBe('/Users/me/Library/Caches/ms-playwright');
    expect(browsersFolderOf('/opt/chrome/chrome')).toBeUndefined();
    expect(browsersFolderOf('chromium-1243/chrome-linux64/chrome')).toBeUndefined();
    expect(browsersFolderOf('')).toBeUndefined();
  });
});

describe('telling a sandbox that cannot start from other failures', () => {
  it('reads Playwright’s own words, or Chromium’s markers, anywhere in the error: its first line only says the browser closed', () => {
    const pipe = (log: string) => Object.assign(new Error(`browserType.launch: Target page, context or browser has been closed\nBrowser logs:\n${log}\nCall log:\n  - <launched> pid=1`), {});
    expect(isSandboxFailure(pipe(`${SANDBOX_FAILED}\n=====`))).toBe(true);
    for (const marker of ['No usable sandbox!', 'See https://crbug.com/357670', 'See https://crbug.com/638180.']) expect(isSandboxFailure(pipe(`[pid=1][err] ${marker}`)), marker).toBe(true);
    expect(isSandboxFailure(Object.assign(new Error('Protocol error'), { logs: SANDBOX_FAILED }))).toBe(true);
    expect(isSandboxFailure(pipe('[pid=1][err] Trace/breakpoint trap'))).toBe(false);
    expect(isSandboxFailure(new Error("browserType.launch: Executable doesn't exist at /pw/chrome"))).toBe(false);
    expect(isSandboxFailure('spawn EACCES')).toBe(false);
    expect(isSandboxFailure(undefined)).toBe(false);
  });

  /**
   * The drift test: the installed Playwright's own error when a Chromium dies saying its sandbox cannot start. A stand-in
   * for Chromium (Node, printing Chromium's words and exiting) is launched through Playwright, so no real sandbox has to
   * fail on this machine. If a Playwright upgrade rewrites its message differently, or stops recognising one of Chromium's
   * markers, this fails, and sandbox.ts is brought up to date with it (ADR-0105).
   */
  it.each([
    ['No usable sandbox!', 'restricted user namespaces (Linux)'],
    ['[FATAL] See https://crbug.com/357670', 'the other sandbox bug Playwright names'],
    ['Running as root without --no-sandbox is not supported. See https://crbug.com/638180.', 'root'],
  ])('the installed Playwright says "%s" (%s) as byway reads it', async (said) => {
    const { chromium } = await import('playwright');
    const err = await chromium
      .launch({ executablePath: process.execPath, ignoreDefaultArgs: true, args: ['-e', `console.error(${JSON.stringify(said)}); process.exit(1)`] })
      .then(
        async (b) => (await b.close(), undefined),
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    // With the pipe transport, the first line only says the browser closed (ADR-0084); Playwright's words come after it.
    expect(message.split('\n')[0]).toBe('browserType.launch: Target page, context or browser has been closed');
    expect(message).toContain(`Browser logs:\n${SANDBOX_FAILED}\n`);
    expect(isSandboxFailure(err)).toBe(true);
  });

  it('the installed Playwright’s error for a Chromium that is not there is read as that, never as the sandbox', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'byway-no-browsers-'));
    try {
      // A Playwright whose browsers folder is empty, in a process of its own (Playwright reads the variable as it loads).
      const said = await new Promise<string>((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', "import('playwright').then(({ chromium }) => chromium.launch({ headless: true })).then((b) => b.close(), (e) => process.stdout.write(String(e && e.message)))"], {
          cwd: fileURLToPath(new URL('..', import.meta.url)),
          env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: folder },
          stdio: ['ignore', 'pipe', 'inherit'],
        });
        let out = '';
        child.stdout.on('data', (d: Buffer) => (out += d.toString()));
        child.on('error', reject);
        child.on('close', () => resolve(out));
      });
      const err = new Error(said);
      expect(isChromiumMissing(err)).toBe(true);
      expect(isSandboxFailure(err)).toBe(false);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
    expect(isChromiumMissing(new Error('browserType.launch: Target page, context or browser has been closed'))).toBe(false);
  });

  it('the installed Playwright’s error for a Chromium that dies for another reason is not read as the sandbox', async () => {
    const { chromium } = await import('playwright');
    const err = await chromium.launch({ executablePath: process.execPath, ignoreDefaultArgs: true, args: ['-e', 'console.error("Trace/breakpoint trap"); process.exit(1)'] }).catch((e: unknown) => e);
    expect((err as Error).message.split('\n')[0]).toBe('browserType.launch: Target page, context or browser has been closed');
    expect(isSandboxFailure(err)).toBe(false);
  });
});
