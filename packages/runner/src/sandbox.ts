/**
 * The page renderer's OS sandbox when it cannot start (ADR-0105): how byway tells, why on this computer, and the fix.
 *
 * Telling. Chromium says so on its error output ("No usable sandbox!", or a pointer to crbug.com/357670 or
 * crbug.com/638180, the second when it was started as root) and exits; Playwright rewrites that log to
 * "Chromium sandboxing failed!" with advice of its own. With its pipe transport the error's first line only says
 * "Target page, context or browser has been closed" (ADR-0084), so the whole error is read, the log and the call log
 * included. sandbox.test.ts holds these words to the installed Playwright (the drift test).
 *
 * On Windows Chromium prints none of those words: a sandbox that cannot start ends it with no word of why. So a failure
 * with the sandbox on that names no cause, other than a Chromium that is not there (isChromiumMissing), is said with
 * the sandbox as one possible cause (maybeTheSandbox), and byway's start-up check tells the causes apart (pages.ts).
 *
 * Why, and the fix, per operating system: Windows (the sandbox is Chromium's normal mode there, so something on the
 * computer blocks it; the fix names the Chromium byway launches, Playwright's headless shell: headlessShell); Linux as
 * root, in a container, with AppArmor restricting unprivileged user namespaces (Ubuntu's default from 24.04; 23.10
 * brought the restriction in without turning it on), or with them switched off; and macOS, which byway does not
 * support yet (the slot the owner asked for: "MacOS later"). Nothing here suggests switching the sandbox off: that is
 * the person's choice in Settings, which says what it risks.
 */
import { existsSync, readFileSync } from 'node:fs';

/** Playwright's words for a Chromium whose sandbox could not start (playwright-core's doRewriteStartupLog). */
export const SANDBOX_FAILED = 'Chromium sandboxing failed!';

/** Chromium's own words that make Playwright say SANDBOX_FAILED (the same list as Playwright's). */
export const CHROMIUM_SANDBOX_MARKERS: readonly string[] = ['No usable sandbox!', 'crbug.com/357670', 'crbug.com/638180'];

/** Chromium's word that it was started as root. */
const AS_ROOT = 'crbug.com/638180';

export type SandboxOs = 'windows' | 'linux' | 'macos' | 'other';

/** What byway knows about the computer, for the reason it gives. */
export interface SandboxHost {
  os: SandboxOs;
  /** Linux: byway runs as root (user id 0). */
  root: boolean;
  /** Linux: byway runs inside Docker or another container. */
  container: boolean;
  /** Linux: AppArmor restricts unprivileged user namespaces (kernel.apparmor_restrict_unprivileged_userns = 1). */
  appArmorRestricts: boolean;
  /** Linux: unprivileged user namespaces are switched off (kernel.unprivileged_userns_clone or user.max_user_namespaces is 0). */
  userNamespacesOff: boolean;
}

/** How sandboxHost() reads the computer: the platform, the user id, files and the environment. Tests pass their own. */
export interface HostProbe {
  platform: NodeJS.Platform;
  uid?: number;
  /** A file's text, or undefined when it cannot be read. */
  read(path: string): string | undefined;
  exists(path: string): boolean;
  env: Record<string, string | undefined>;
}

const thisComputer = (): HostProbe => ({
  platform: process.platform,
  ...(process.getuid ? { uid: process.getuid() } : {}),
  read: (p) => readFileSync(p, 'utf8'),
  exists: existsSync,
  env: process.env,
});

const OS: Partial<Record<NodeJS.Platform, SandboxOs>> = { win32: 'windows', linux: 'linux', darwin: 'macos' };

/** Reads what the reason depends on. Only Linux is looked into; a file that cannot be read is not a finding. */
export function sandboxHost(probe: HostProbe = thisComputer()): SandboxHost {
  const os = OS[probe.platform] ?? 'other';
  const host: SandboxHost = { os, root: false, container: false, appArmorRestricts: false, userNamespacesOff: false };
  if (os !== 'linux') return host;
  const read = (p: string): string | undefined => {
    try {
      return probe.read(p)?.trim();
    } catch {
      return undefined;
    }
  };
  const exists = (p: string): boolean => {
    try {
      return probe.exists(p);
    } catch {
      return false;
    }
  };
  host.root = probe.uid === 0;
  host.container = exists('/.dockerenv') || exists('/run/.containerenv') || Boolean(probe.env.container) || /\/(docker|kubepods|containerd|lxc|libpod)\b/.test(read('/proc/1/cgroup') ?? '');
  host.appArmorRestricts = read('/proc/sys/kernel/apparmor_restrict_unprivileged_userns') === '1';
  host.userNamespacesOff = read('/proc/sys/kernel/unprivileged_userns_clone') === '0' || read('/proc/sys/user/max_user_namespaces') === '0';
  return host;
}

/**
 * The whole text of an error: its message and, when Playwright kept it apart, the browser's log, and the same of what
 * caused it (byway's plain step failure keeps Playwright's error as its cause).
 */
function wholeText(err: unknown, depth = 0): string {
  if (typeof err === 'string') return err;
  if (!(err instanceof Error) || depth > 4) return '';
  const logs = (err as { logs?: unknown }).logs;
  return `${err.message}\n${typeof logs === 'string' ? logs : ''}\n${wholeText(err.cause, depth + 1)}`;
}

/** Whether an error says Chromium's OS sandbox could not start. */
export function isSandboxFailure(err: unknown): boolean {
  const text = wholeText(err);
  return text.includes(SANDBOX_FAILED) || CHROMIUM_SANDBOX_MARKERS.some((m) => text.includes(m));
}

/** Playwright's words when the Chromium it would launch was never downloaded ("Executable doesn't exist at …"). */
const CHROMIUM_MISSING = "Executable doesn't exist";

/** Whether an error says Playwright's Chromium is not there, which no sandbox causes. */
export function isChromiumMissing(err: unknown): boolean {
  return wholeText(err).includes(CHROMIUM_MISSING);
}

/**
 * Playwright's Chromium on this computer as byway launches it, for the Windows fix: the file, or, when that file is not
 * there, the folder Playwright keeps its browsers in; neither when byway cannot tell.
 */
export interface ChromiumOnDisk {
  executable?: string;
  folder?: string;
}

/** The full Chromium Playwright names, read as `<folder>/chromium-<revision>/chrome-<platform>/…`; nothing for a path laid out otherwise. */
function layout(fullChromium: string): { sep: string; parts: string[]; at: number; platform: string; folder: string } | undefined {
  const sep = fullChromium.includes('\\') ? '\\' : '/';
  const parts = fullChromium.split(/[\\/]/);
  const at = parts.findLastIndex((p) => /^chromium-\d+$/.test(p));
  const platform = parts[at + 1];
  if (at < 1 || !platform?.startsWith('chrome-')) return undefined;
  const folder = parts.slice(0, at).join(sep);
  return folder ? { sep, parts, at, platform, folder } : undefined;
}

/**
 * Playwright's browsers folder, which byway takes Chromium from, from the full Chromium Playwright names
 * (`chromium.executablePath()`, which follows PLAYWRIGHT_BROWSERS_PATH): the folder above `chromium-<revision>`; nothing
 * for a path laid out otherwise.
 */
export function browsersFolderOf(fullChromium: string): string | undefined {
  return layout(fullChromium)?.folder;
}

/**
 * The Chromium byway launches, from the full Chromium Playwright names (`chromium.executablePath()`, which follows
 * PLAYWRIGHT_BROWSERS_PATH). byway launches Chromium headless, which Playwright runs as its headless shell: a download
 * of its own, beside full Chromium in Playwright's browsers folder and of the same revision, so
 * `<folder>/chromium-<revision>/chrome-<platform>/…` gives
 * `<folder>/chromium_headless_shell-<revision>/chrome-headless-shell-<platform>/chrome-headless-shell[.exe]`. The file
 * when it is there, else the folder; nothing for a path laid out otherwise. pages.test.ts holds this to the file a real
 * launch runs.
 */
export function headlessShell(fullChromium: string, exists: (path: string) => boolean = existsSync): ChromiumOnDisk {
  const laidOut = layout(fullChromium);
  if (!laidOut) return {};
  const { sep, parts, at, platform, folder } = laidOut;
  const revision = parts[at]!.slice('chromium-'.length);
  const file = `chrome-headless-shell${parts.at(-1)?.endsWith('.exe') ? '.exe' : ''}`;
  const executable = [folder, `chromium_headless_shell-${revision}`, platform.replace(/^chrome-/, 'chrome-headless-shell-'), file].join(sep);
  try {
    if (exists(executable)) return { executable };
  } catch {
    // Not readable: as though it were not there.
  }
  return { folder };
}

export interface SandboxAdvice {
  /** Why the sandbox cannot start on this computer. */
  why: string;
  /** What to do about it. */
  fix: string;
}

/** The script README's Renderer section gives for Ubuntu 24.04 and later, and that CI runs (ADR-0105). */
export const APPARMOR_SCRIPT = 'scripts/linux/allow-chromium-sandbox.sh';

/**
 * Why the sandbox cannot start here, and the fix. `executable` is the Chromium byway launches (headlessShell), named in
 * the Windows fix, or `folder` Playwright's browsers folder when that file is not there; `error` is the failure, whose
 * word that Chromium was started as root counts whatever byway read.
 */
export function sandboxAdvice(host: SandboxHost, opts: ChromiumOnDisk & { error?: unknown } = {}): SandboxAdvice {
  switch (host.os) {
    case 'windows': {
      const what = opts.executable ? `Playwright's Chromium (${opts.executable})` : opts.folder ? `the Chromium in Playwright's browsers folder (${opts.folder})` : "Playwright's Chromium";
      return {
        why: 'On Windows the sandbox is how Chromium normally runs, so something on this computer is blocking it, most often security software or a company policy.',
        fix: `Allow ${what} in that software, or ask whoever manages this computer, then start byway again.`,
      };
    }
    case 'linux':
      if (host.root || wholeText(opts.error).includes(AS_ROOT)) return { why: 'byway is running as root, and Chromium does not start its sandbox for root.', fix: 'Start byway as an ordinary user.' };
      if (host.container) {
        return {
          why: "byway is running in a container, and a container's default security settings often stop Chromium starting its sandbox.",
          fix: 'Run byway outside the container. Renderer in the README says more.',
        };
      }
      if (host.appArmorRestricts) {
        return {
          why: "This Linux lets only the programs an AppArmor profile allows create the user namespaces Chromium's sandbox needs (Ubuntu does this by default from 24.04).",
          fix: `Allow them for Playwright's Chromium: in the byway folder, run sh ${APPARMOR_SCRIPT}, then start byway again. It asks for your password for sudo; Renderer in the README says what else its profile allows.`,
        };
      }
      if (host.userNamespacesOff) return { why: "Unprivileged user namespaces, which Chromium's sandbox needs, are switched off on this Linux.", fix: 'Someone with admin rights has to switch them on. Renderer in the README says more.' };
      return { why: 'byway could not tell why on this Linux.', fix: 'Renderer in the README lists the usual causes and their fixes.' };
    case 'macos':
      return { why: 'byway does not support macOS yet.', fix: 'byway runs on Windows and Linux.' };
    default:
      return { why: 'byway does not support this operating system.', fix: 'byway runs on Windows and Linux.' };
  }
}

/** A sandbox that could not start, as one plain message: what failed, what it stops, why here and the fix. */
export function sandboxFailureMessage(advice: SandboxAdvice): string {
  return `The page renderer could not start inside its OS sandbox on this computer, so pages, and the cards that show a reviewer the examples beside the work, cannot be drawn. ${advice.why} ${advice.fix}`;
}

/** The sandbox named as one possible cause of a failure Chromium gave no reason for, with why here and the fix. */
export function maybeTheSandbox(advice: SandboxAdvice): string {
  return `One possible cause is that its OS sandbox cannot run on this computer; if so: ${advice.why} ${advice.fix}`;
}

/**
 * A page renderer that did not start with the sandbox on, for no reason Chromium gave (a renderer process that security
 * software stops, for example): the sandbox is one possible cause, memory another. `said` is Playwright's first line.
 */
export function possibleSandboxCause(said: string, advice: SandboxAdvice): string {
  return `The page renderer started but could not draw byway's test page (${said}). ${maybeTheSandbox(advice)} Another is a computer short of memory.`;
}
