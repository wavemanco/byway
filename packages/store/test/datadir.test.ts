import { mkdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, posix, win32 } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UnsafeDataDirError, createStore, defaultDataDir, resolveDataDir, sameLocation, unsafeLocationReason } from '../src/index.ts';
import { openStore, tempDir } from './helpers.ts';

describe('defaultDataDir', () => {
  it('uses %LOCALAPPDATA%\\byway on Windows', () => {
    const dir = defaultDataDir({ env: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, platform: 'win32', homedir: 'C:\\Users\\u' });
    expect(dir).toBe(win32.join('C:\\Users\\u\\AppData\\Local', 'byway'));
  });

  it('falls back to the profile AppData\\Local on Windows when LOCALAPPDATA is unset', () => {
    expect(defaultDataDir({ env: {}, platform: 'win32', homedir: 'C:\\Users\\u' })).toBe('C:\\Users\\u\\AppData\\Local\\byway');
  });

  it('uses ~/.byway elsewhere', () => {
    expect(defaultDataDir({ env: {}, platform: 'linux', homedir: '/home/u' })).toBe(posix.join('/home/u', '.byway'));
    expect(defaultDataDir({ env: {}, platform: 'darwin', homedir: '/Users/u' })).toBe('/Users/u/.byway');
  });

  it('honours BYWAY_DATA_DIR over the platform default', () => {
    const custom = tempDir();
    expect(defaultDataDir({ env: { BYWAY_DATA_DIR: custom }, platform: 'linux', homedir: '/home/u' })).toBe(custom);
  });

  it('ignores an empty BYWAY_DATA_DIR', () => {
    expect(defaultDataDir({ env: { BYWAY_DATA_DIR: '  ' }, platform: 'linux', homedir: '/home/u' })).toBe('/home/u/.byway');
  });
});

describe('sameLocation (B-188: a fixed demo key never guards the default data folder)', () => {
  it('tells one folder by where it really leads: case, a trailing separator, a link to it and the \\\\?\\ form are the same folder', () => {
    const root = tempDir();
    const real = join(root, 'byway');
    mkdirSync(real);
    const link = join(root, 'alias');
    symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir');
    expect(sameLocation(real, real)).toBe(true);
    expect(sameLocation(link, real)).toBe(true);
    expect(sameLocation(`${real}${process.platform === 'win32' ? '\\' : '/'}`, real)).toBe(true);
    if (process.platform === 'win32') {
      expect(sameLocation(real.toUpperCase(), real)).toBe(true);
      expect(sameLocation(`\\\\?\\${real}`, real)).toBe(true);
    }
    // A folder not made yet is compared by the path it will have.
    expect(sameLocation(join(link, 'later'), join(real, 'later'))).toBe(true);
    const other = join(root, 'other');
    mkdirSync(other);
    expect(sameLocation(other, real)).toBe(false);
    expect(sameLocation(join(real, 'inside'), real)).toBe(false);
  });

  it('knows the folder by the file system’s own identity once it exists, through a network path to this computer too (B-188’s check 4)', () => {
    const root = tempDir();
    const real = join(root, 'byway');
    mkdirSync(real);
    expect(sameLocation(`\\\\?\\${real}`, real)).toBe(process.platform === 'win32');
    if (process.platform !== 'win32') return;
    // \\localhost\C$ reaches the same folder where administrative shares are on, as they are by default.
    const unc = `\\\\localhost\\${real[0]}$${real.slice(2)}`;
    let reachable = true;
    try {
      statSync(unc);
    } catch {
      reachable = false;
    }
    if (reachable) {
      expect(sameLocation(unc, real)).toBe(true);
      expect(sameLocation(`\\\\?\\UNC\\localhost\\${real[0]}$${real.slice(2)}`, real)).toBe(true);
    }
    expect(sameLocation(unc, root)).toBe(false);
  });
});

describe('a data folder named two ways on Windows (B-188’s check 5)', () => {
  it('is refused when a part of its path ends in a dot or a space, which Windows keeps for Node and drops for SQLite', () => {
    for (const dir of ['/data/byway.', '/data/Local./byway', '/data/byway ', '/data/Local /byway']) {
      expect(unsafeLocationReason(dir, {}, 'win32'), dir).toMatchObject({ kind: 'name', message: expect.stringMatching(/ends in a dot or a space/) });
    }
    for (const dir of ['/data/byway', '/data/by.way', '/data/.byway', '/data/by way']) expect(unsafeLocationReason(dir, {}, 'win32'), dir).toBeUndefined();
    // Elsewhere such a name is one folder to every program.
    expect(unsafeLocationReason('/data/byway.', {}, 'linux')).toBeUndefined();
  });

  it('is refused, on every system, when its path holds a #, % or ?, which the engine’s Temporal server reads as part of its database’s address (B-188’s check 6)', () => {
    for (const platform of ['win32', 'linux'] as const) {
      for (const dir of ['/data/a#b/byway', '/data/by%41way', '/data/what?/byway']) {
        expect(unsafeLocationReason(dir, {}, platform), `${platform} ${dir}`).toMatchObject({ kind: 'name', message: expect.stringMatching(/no #, % or \?/) });
      }
    }
    if (process.platform === 'win32') expect(unsafeLocationReason(`\\\\?\\${join(tempDir(), 'byway')}`)).toBeUndefined();
  });

  it('stops byway before it opens anything there', () => {
    if (process.platform !== 'win32') return;
    const dotted = `${join(tempDir(), 'byway')}.`;
    expect(() => resolveDataDir({ env: { BYWAY_DATA_DIR: dotted } })).toThrow(UnsafeDataDirError);
  });
});

describe('resolveDataDir', () => {
  it('returns BYWAY_DATA_DIR when it is a safe location', () => {
    const custom = join(tempDir(), 'data');
    expect(resolveDataDir({ env: { BYWAY_DATA_DIR: custom } })).toBe(custom);
  });

  it('refuses a folder inside a git working tree', () => {
    const repo = tempDir();
    mkdirSync(join(repo, '.git'));
    const inside = join(repo, 'nested', 'byway-data');
    expect(() => resolveDataDir({ env: { BYWAY_DATA_DIR: inside } })).toThrow(UnsafeDataDirError);
    expect(() => resolveDataDir({ env: { BYWAY_DATA_DIR: inside } })).toThrow(/git repository/);
  });

  it('refuses a folder inside a linked git worktree (a .git file)', () => {
    const tree = tempDir();
    writeFileSync(join(tree, '.git'), 'gitdir: elsewhere\n');
    expect(unsafeLocationReason(join(tree, 'data'), {})?.kind).toBe('git');
  });

  it('refuses a folder inside the OneDrive folder named by the environment', () => {
    const oneDrive = tempDir('byway-od-');
    const inside = join(oneDrive, 'Documents', 'byway');
    const env = { OneDrive: oneDrive, BYWAY_DATA_DIR: inside };
    expect(() => resolveDataDir({ env })).toThrow(UnsafeDataDirError);
    expect(() => resolveDataDir({ env })).toThrow(/OneDrive/);
  });

  it('refuses any path with a OneDrive folder in it, including business and macOS names', () => {
    const base = tempDir();
    for (const name of ['OneDrive', 'OneDrive - Contoso', 'OneDrive-Personal', 'onedrive']) {
      expect(unsafeLocationReason(join(base, name, 'byway'), {})?.kind).toBe('onedrive');
    }
    expect(unsafeLocationReason(join(base, 'OneDriveTemp', 'byway'), {})).toBeUndefined();
  });

  it('allows an unsafe location only with the explicit option', () => {
    const repo = tempDir();
    mkdirSync(join(repo, '.git'));
    const inside = join(repo, 'data');
    expect(resolveDataDir({ env: { BYWAY_DATA_DIR: inside }, allowUnsafeLocation: true })).toBe(inside);
  });

  it('accepts the OS temp directory (where the tests live)', () => {
    expect(unsafeLocationReason(tempDir(), {})).toBeUndefined();
  });
});

describe('createStore location check', () => {
  it('refuses to open a store inside a git working tree', () => {
    const repo = tempDir();
    mkdirSync(join(repo, '.git'));
    expect(() => createStore({ dataDir: join(repo, 'data') })).toThrow(UnsafeDataDirError);
  });

  it('opens there with allowUnsafeLocation, creating byway.sqlite and the artifact folder', () => {
    const repo = tempDir();
    mkdirSync(join(repo, '.git'));
    const store = openStore({ dataDir: join(repo, 'data'), allowUnsafeLocation: true });
    expect(store.dbPath).toBe(join(repo, 'data', 'byway.sqlite'));
  });
});
