/**
 * Which Temporal CLI the engine runs (SEC-7) and the flags it runs it with (SEC-2). No server is started here; the
 * dev-engine test checks the running server.
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cliFileName, devServerArgs, HTTP_API_OFF, temporalExecutable, trustedBinary, type FileFacts } from '../src/temporal-cli.ts';

const file = (over: Partial<FileFacts> = {}): FileFacts => ({ isFile: true, isSymbolicLink: false, uid: 1000, mode: 0o100755, ...over });

describe('trustedBinary (SEC-7)', () => {
  it('on POSIX, runs only a regular file owned by this user that nobody else can write', () => {
    expect(trustedBinary(file(), 1000)).toBe(true);
    expect(trustedBinary(file({ uid: 1001 }), 1000)).toBe(false);
    expect(trustedBinary(file({ mode: 0o100775 }), 1000)).toBe(false);
    expect(trustedBinary(file({ mode: 0o100757 }), 1000)).toBe(false);
    expect(trustedBinary(file({ isSymbolicLink: true, isFile: false }), 1000)).toBe(false);
    expect(trustedBinary(file({ isFile: false }), 1000)).toBe(false);
  });

  it('on Windows (no POSIX owner), a regular file in the per-user folders is trusted', () => {
    expect(trustedBinary(file({ uid: 0, mode: 0o100666 }), undefined)).toBe(true);
    expect(trustedBinary(file({ isSymbolicLink: true, isFile: false }), undefined)).toBe(false);
  });
});

describe('temporalExecutable (SEC-7)', () => {
  const cacheDir = path.join('/home/me/.byway', 'bin');
  const tmp = '/tmp';
  const name = cliFileName('1.24.0', 'linux');
  const choose = (files: Record<string, FileFacts>) =>
    temporalExecutable({ cacheDir, tmpDir: tmp, version: '1.24.0', platform: 'linux', uid: 1000, stat: (p) => files[p] });

  it('prefers the copy in the per-user cache folder', () => {
    expect(choose({ [path.join(cacheDir, name)]: file(), [path.join(tmp, name)]: file() })).toEqual({ type: 'existing-path', path: path.join(cacheDir, name) });
  });

  it('reuses an earlier download in the temp folder only when this user owns it and nobody else can write it', () => {
    expect(choose({ [path.join(tmp, name)]: file() })).toEqual({ type: 'existing-path', path: path.join(tmp, name) });
    // Planted by another user of a shared /tmp: never run; download into the per-user folder instead.
    expect(choose({ [path.join(tmp, name)]: file({ uid: 1001 }) })).toEqual({ type: 'cached-download', downloadDir: cacheDir });
    expect(choose({ [path.join(tmp, name)]: file({ isSymbolicLink: true, isFile: false }) })).toEqual({ type: 'cached-download', downloadDir: cacheDir });
  });

  it('downloads into the per-user cache folder, never the shared temp folder, when nothing is there', () => {
    expect(choose({})).toEqual({ type: 'cached-download', downloadDir: cacheDir });
  });

  it('refuses a copy in its own cache folder that it cannot trust (the SDK would run it as found)', () => {
    expect(() => choose({ [path.join(cacheDir, name)]: file({ uid: 1001 }) })).toThrow(/not owned by you|writable/);
  });
});

describe('devServerArgs (SEC-2)', () => {
  it('turns the HTTP API off with a Host allowlist that matches nothing real', () => {
    expect(devServerArgs()).toEqual(HTTP_API_OFF);
    expect(HTTP_API_OFF.join(' ')).toMatch(/frontend\.httpAllowedHosts=\["[^"]+\.invalid"\]/);
  });

  it('pins the HTTP port when asked (tests use it to find the listener)', () => {
    expect(devServerArgs({ httpPort: 7999 })).toEqual([...HTTP_API_OFF, '--http-port', '7999']);
  });
});
