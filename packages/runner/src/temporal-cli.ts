/**
 * The Temporal CLI binary the local engine runs, and the flags it runs it with.
 *
 * Which binary (SEC-7). The SDK's default download lands in the OS temp folder and is reused whenever a file of that
 * name exists; on Linux that folder is the shared, world-writable /tmp, so another local user could plant a binary
 * that then runs as this user, with the provider keys in its environment. So the engine downloads into a folder only
 * this user writes (`<data dir>/bin`), and runs an earlier download from the temp folder only when it is a regular
 * file (not a link) owned by this user that nobody else can write. On Windows the temp folder is per-user already.
 *
 * Which flags (SEC-2). The dev server also serves an HTTP API on a random port, which skips the usual HTTP security
 * checks: a hostile web page could terminate or start runs with blind cross-site POSTs, and DNS rebinding could read
 * every run's inputs. byway talks to Temporal over gRPC only, so a Host allowlist that matches no real host turns that
 * API off (every request gets 403).
 */
import { lstatSync } from 'node:fs';
import path from 'node:path';
import type { EphemeralServerExecutable } from '@temporalio/testing';

/** A Host allowlist entry no request can carry (the `.invalid` TLD never resolves). */
const NO_HOST = 'byway-no-http.invalid';

/** Dev-server flags that switch its HTTP API off. */
export const HTTP_API_OFF: readonly string[] = ['--dynamic-config-value', `frontend.httpAllowedHosts=["${NO_HOST}"]`];

export interface DevServerArgsOptions {
  /** Pin the HTTP API's port (it still answers nothing but 403); by default the CLI picks a random free one. */
  httpPort?: number;
}

/** The extra arguments byway starts the dev server with. */
export function devServerArgs(opts: DevServerArgsOptions = {}): string[] {
  return [...HTTP_API_OFF, ...(opts.httpPort !== undefined ? ['--http-port', String(opts.httpPort)] : [])];
}

/** The SDK's file name for a downloaded CLI. */
export const cliFileName = (version: string, platform: NodeJS.Platform = process.platform): string => `temporal-sdk-typescript-${version}${platform === 'win32' ? '.exe' : ''}`;

/** What `trustedBinary` needs to know about a file (from lstat, so a link is seen as a link). */
export interface FileFacts {
  isFile: boolean;
  isSymbolicLink: boolean;
  uid: number;
  mode: number;
}

/**
 * A binary this user may run: a regular file, not a link; on POSIX also owned by this user and not writable by group
 * or others. `uid` is undefined on Windows, which has no POSIX owner; there the folders checked are per-user.
 */
export function trustedBinary(f: FileFacts, uid: number | undefined): boolean {
  if (f.isSymbolicLink || !f.isFile) return false;
  if (uid === undefined) return true;
  return f.uid === uid && (f.mode & 0o022) === 0;
}

/** lstat as FileFacts; undefined when there is no such file. */
export function fileFacts(file: string): FileFacts | undefined {
  try {
    const st = lstatSync(file);
    return { isFile: st.isFile(), isSymbolicLink: st.isSymbolicLink(), uid: st.uid, mode: st.mode };
  } catch {
    return undefined;
  }
}

export interface ExecutableOptions {
  /** A folder only this user writes, e.g. `<data dir>/bin`: downloads go here. */
  cacheDir: string;
  /** Where an earlier SDK download may sit (the OS temp folder). */
  tmpDir: string;
  /** The @temporalio/testing version, which names the download. */
  version: string;
  platform?: NodeJS.Platform;
  /** This user's uid; undefined on Windows. */
  uid?: number | undefined;
  stat?: (file: string) => FileFacts | undefined;
}

/**
 * The executable to start: a trusted copy in the cache folder, else a trusted earlier download in the temp folder
 * (no network needed), else a download into the cache folder. Never the SDK's default, which reuses whatever file
 * sits in the temp folder.
 */
export function temporalExecutable(opts: ExecutableOptions): EphemeralServerExecutable {
  const stat = opts.stat ?? fileFacts;
  const uid = 'uid' in opts ? opts.uid : process.getuid?.();
  const name = cliFileName(opts.version, opts.platform);
  const cached = path.join(opts.cacheDir, name);
  const own = stat(cached);
  if (own) {
    if (!trustedBinary(own, uid)) {
      throw new Error(`The Temporal CLI at ${cached} is not owned by you or is writable by others, so byway will not run it. Delete it and start byway again to download a fresh copy.`);
    }
    return { type: 'existing-path', path: cached };
  }
  const earlier = path.join(opts.tmpDir, name);
  const found = stat(earlier);
  if (found && trustedBinary(found, uid)) return { type: 'existing-path', path: earlier };
  return { type: 'cached-download', downloadDir: opts.cacheDir };
}
