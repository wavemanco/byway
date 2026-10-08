import { mkdirSync, writeFileSync } from 'node:fs';
import { join, posix, win32 } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UnsafeDataDirError, createStore, defaultDataDir, resolveDataDir, unsafeLocationReason } from '../src/index.ts';
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
