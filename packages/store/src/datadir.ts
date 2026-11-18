/**
 * Where product data lives (spec §2 "Data", ADR-0066): `BYWAY_DATA_DIR`, else `%LOCALAPPDATA%\byway` on Windows and
 * `~/.byway` elsewhere. Never inside OneDrive (a synced live database corrupts, ADR-0063) and never inside a git working
 * tree (product data must not be committed or mix with research material, ADR-0041 rule 3).
 */
import { existsSync, realpathSync, statSync } from 'node:fs';
import { homedir as osHomedir } from 'node:os';
import path from 'node:path';
import { UnsafeDataDirError } from './errors.ts';

export type Env = Readonly<Record<string, string | undefined>>;

export interface DataDirOptions {
  /** Defaults to `process.env`. */
  env?: Env;
  /** Defaults to `process.platform`. */
  platform?: NodeJS.Platform;
  /** Defaults to `os.homedir()`. */
  homedir?: string;
  /** Skip the OneDrive and git checks. Only for deliberate setups and tests. */
  allowUnsafeLocation?: boolean;
}

export interface UnsafeLocation {
  kind: 'onedrive' | 'git';
  /** The OneDrive folder or repository root that contains the path. */
  root: string;
  message: string;
}

/** The data directory the environment asks for, without any safety check. */
export function defaultDataDir(opts: Omit<DataDirOptions, 'allowUnsafeLocation'> = {}): string {
  const env = opts.env ?? process.env;
  const fromEnv = env.BYWAY_DATA_DIR?.trim();
  // The variable names a path on this machine, so the host's own path rules apply to it.
  if (fromEnv) return path.resolve(fromEnv);
  const platform = opts.platform ?? process.platform;
  const home = opts.homedir ?? osHomedir();
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA?.trim() || path.win32.join(home, 'AppData', 'Local');
    return path.win32.join(localAppData, 'byway');
  }
  return path.posix.join(home, '.byway');
}

/** Resolves the data directory and refuses an unsafe one unless `allowUnsafeLocation` is set. */
export function resolveDataDir(opts: DataDirOptions = {}): string {
  const dir = defaultDataDir(opts);
  if (!opts.allowUnsafeLocation) assertSafeDataDir(dir, opts.env ?? process.env);
  return dir;
}

/** Throws {@link UnsafeDataDirError} when `dir` is inside OneDrive or a git working tree. */
export function assertSafeDataDir(dir: string, env: Env = process.env): void {
  const unsafe = unsafeLocationReason(dir, env);
  if (unsafe) throw new UnsafeDataDirError(path.resolve(dir), unsafe.kind, unsafe.message);
}

/**
 * Why `dir` is an unsafe place for product data, or undefined when it is fine. The folder need not exist yet. Both the
 * path as written and its real location (through junctions and symlinks of the part that exists) are checked.
 */
export function unsafeLocationReason(dir: string, env: Env = process.env): UnsafeLocation | undefined {
  const abs = path.resolve(dir);
  const candidates = [abs];
  const real = realLocation(abs);
  if (real !== undefined && real !== abs) candidates.push(real);
  for (const p of candidates) {
    const oneDrive = oneDriveRoot(p, env);
    if (oneDrive !== undefined) {
      return {
        kind: 'onedrive',
        root: oneDrive,
        message:
          `Refusing to keep byway data in ${abs}: it is inside the OneDrive folder ${oneDrive}, and syncing a live ` +
          'database and its artifact files risks conflicts and corruption. Set BYWAY_DATA_DIR to a local folder outside OneDrive.',
      };
    }
    const repo = gitRoot(p);
    if (repo !== undefined) {
      return {
        kind: 'git',
        root: repo,
        message:
          `Refusing to keep byway data in ${abs}: it is inside the git repository ${repo}, where product data could be ` +
          'committed or mixed with research files. Set BYWAY_DATA_DIR to a folder outside any repository.',
      };
    }
  }
  return undefined;
}

/** OneDrive folders: the ones Windows names in the environment, plus any path segment called OneDrive… */
function oneDriveRoot(p: string, env: Env): string | undefined {
  for (const name of ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial']) {
    const root = env[name]?.trim();
    if (root && isInside(p, path.resolve(root))) return path.resolve(root);
  }
  // "OneDrive", "OneDrive - Contoso" (business) and "OneDrive-Personal" (macOS CloudStorage), not "OneDriveTemp".
  const parts = p.split(/[\\/]+/);
  const i = parts.findIndex((s) => /^onedrive(?:$|[\s-])/i.test(s));
  return i < 0 ? undefined : parts.slice(0, i + 1).join(path.sep);
}

/** The nearest folder at or above `p` holding a `.git` entry (a folder, or the file of a linked worktree). */
function gitRoot(p: string): string | undefined {
  for (let d = p; ; d = path.dirname(d)) {
    if (existsSync(path.join(d, '.git'))) return d;
    if (path.dirname(d) === d) return undefined;
  }
}

/** `p` with its longest existing prefix replaced by that prefix's real path. */
function realLocation(p: string): string | undefined {
  const rest: string[] = [];
  for (let d = p; ; d = path.dirname(d)) {
    if (existsSync(d)) {
      try {
        return path.join(realpathSync.native(d), ...rest.reverse());
      } catch {
        return undefined;
      }
    }
    if (path.dirname(d) === d) return undefined;
    rest.push(path.basename(d));
  }
}

/**
 * Whether two paths name the same folder, by where they really lead: a junction or symbolic link, the `\\?\` form, case
 * and a trailing separator do not tell them apart (B-188's re-check 3).
 */
export function sameLocation(a: string, b: string): boolean {
  // Two folders that exist are the same when the file system says so: a volume and a file id, whatever path reached them
  // (a network path to this computer and the \\?\Volume{…} form too; B-188's check 4).
  const identity = (p: string) => {
    try {
      const s = statSync(p, { bigint: true });
      return s.ino === 0n ? undefined : `${s.dev}:${s.ino}`;
    } catch {
      return undefined;
    }
  };
  const [ia, ib] = [identity(a), identity(b)];
  if (ia !== undefined && ib !== undefined) return ia === ib;
  // Otherwise by real path, a folder not made yet by the path it will have.
  const real = (p: string) => {
    const plain = path.resolve(p.replace(/^\\\\\?\\(?=[a-z]:)/i, ''));
    return (realLocation(plain) ?? plain).replace(/^\\\\\?\\(?=[a-z]:)/i, '');
  };
  return path.relative(real(a), real(b)) === '';
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`));
}
