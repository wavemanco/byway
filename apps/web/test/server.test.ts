import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import config, { configFor } from '../next.config.ts';
import { artifactHeaders, isArtifactId, pageScriptsGranted } from '../src/server/artifacts.ts';
import { checkRequest } from '../src/server/guard.ts';
import { sniffImage } from '../src/server/refs.ts';
import { ProblemInput, RefInput, RendererPatch, ResolutionInput, SettingsPatch, StartInput } from '../src/server/schemas.ts';
import { REPO } from './guards/scan.ts';

const ID = `sha256:${'a'.repeat(64)}`;

describe('request guard', () => {
  const req = (over: Partial<Parameters<typeof checkRequest>[0]> = {}) =>
    checkRequest({ method: 'GET', host: '127.0.0.1:3000', origin: null, secFetchSite: null, ...over });

  it('answers only on loopback hosts, which also stops DNS rebinding', () => {
    expect(req().ok).toBe(true);
    expect(req({ host: 'localhost:3000' }).ok).toBe(true);
    expect(req({ host: '[::1]:3000' }).ok).toBe(true);
    expect(req({ host: 'evil.example:3000' })).toMatchObject({ ok: false, status: 403 });
    expect(req({ host: null })).toMatchObject({ ok: false });
  });

  it('refuses cross-site writes', () => {
    expect(req({ method: 'POST', origin: 'http://127.0.0.1:3000', secFetchSite: 'same-origin' }).ok).toBe(true);
    expect(req({ method: 'POST', origin: 'https://evil.example', secFetchSite: 'cross-site' })).toMatchObject({ ok: false, status: 403 });
    expect(req({ method: 'POST', origin: 'http://localhost:3000' })).toMatchObject({ ok: false, status: 403 });
    expect(req({ method: 'POST', origin: 'null' })).toMatchObject({ ok: false, status: 403 });
    expect(req({ method: 'DELETE', secFetchSite: 'same-site' })).toMatchObject({ ok: false });
    // Reads stay open to same-machine tools such as curl.
    expect(req({ method: 'GET', secFetchSite: 'cross-site' }).ok).toBe(true);
  });
});

describe('artifact route headers', () => {
  it('recognises content-addressed ids only', () => {
    expect(isArtifactId(ID)).toBe(true);
    expect(isArtifactId('sha256:../../etc/passwd')).toBe(false);
    expect(isArtifactId('a'.repeat(64))).toBe(false);
  });

  it('serves pages inert by default: a sandbox with no scripts and no same origin, and no network writes (F05)', () => {
    const h = artifactHeaders('text/html', 'http://127.0.0.1:3000');
    const csp = h['Content-Security-Policy'] ?? '';
    expect(csp).toContain("default-src 'none'");
    // A bare sandbox: no scripts, and no automatic features either (a meta refresh cannot carry the page away).
    expect(csp).toMatch(/(^|; )sandbox$/);
    expect(csp).not.toContain('allow-scripts');
    expect(csp).not.toContain('allow-same-origin');
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    // Generated images load from the artifact route and from /api/artifacts/<id>, the address the runner gives the model.
    expect(csp).toContain('img-src http://127.0.0.1:3000/artifacts/ http://127.0.0.1:3000/api/artifacts/ data: blob:');
    expect(csp).toContain('media-src http://127.0.0.1:3000/artifacts/ http://127.0.0.1:3000/api/artifacts/ data: blob:');
    expect(h['Content-Type']).toBe('text/html; charset=utf-8');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Cache-Control']).toContain('immutable');
  });

  it('runs a page’s scripts only for a frame that asked with consent, and never caches that answer (F05)', () => {
    const origin = 'http://127.0.0.1:3000';
    const granted = artifactHeaders('text/html', origin, undefined, { asked: true, granted: true });
    expect(granted['Content-Security-Policy']).toMatch(/(^|; )sandbox allow-scripts$/);
    expect(granted['Content-Security-Policy']).not.toContain('allow-same-origin');
    expect(granted['Cache-Control']).toBe('no-store');
    // Asked for, but not by a same-origin frame: inert, and not cached either.
    const refused = artifactHeaders('text/html', origin, undefined, { asked: true, granted: false });
    expect(refused['Content-Security-Policy']).toMatch(/(^|; )sandbox$/);
    expect(refused['Cache-Control']).toBe('no-store');
    // Other media never run scripts, whatever was asked.
    expect(artifactHeaders('image/svg+xml', origin, undefined, { asked: true, granted: true })['Content-Security-Policy']).not.toContain('allow-scripts');
  });

  it('grants a page’s scripts only to ?scripts=1 asked by a same-origin frame (Fetch Metadata), so a top-level open never runs them (F05)', () => {
    const url = (q: string) => new URL(`http://127.0.0.1:3000/artifacts/${ID}${q}`);
    const frame = new Headers({ 'sec-fetch-dest': 'iframe', 'sec-fetch-site': 'same-origin' });
    expect(pageScriptsGranted(url('?scripts=1'), frame)).toBe(true);
    expect(pageScriptsGranted(url(''), frame)).toBe(false);
    expect(pageScriptsGranted(url('?scripts=true'), frame)).toBe(false);
    expect(pageScriptsGranted(url('?scripts=1&download=1'), frame)).toBe(false);
    const asks: Record<string, string>[] = [
      {},
      { 'sec-fetch-dest': 'document', 'sec-fetch-site': 'same-origin' },
      { 'sec-fetch-dest': 'document', 'sec-fetch-site': 'none' },
      { 'sec-fetch-dest': 'iframe', 'sec-fetch-site': 'cross-site' },
      { 'sec-fetch-dest': 'iframe', 'sec-fetch-site': 'same-site' },
      { 'sec-fetch-dest': 'iframe' },
      { 'sec-fetch-dest': 'empty', 'sec-fetch-site': 'same-origin' },
    ];
    for (const headers of asks) {
      expect(pageScriptsGranted(url('?scripts=1'), new Headers(headers)), JSON.stringify(headers)).toBe(false);
    }
  });

  it('never lets other media run scripts', () => {
    for (const type of ['image/svg+xml', 'text/markdown', 'application/json', 'text/x-diff', 'image/png']) {
      const csp = artifactHeaders(type, 'http://127.0.0.1:3000')['Content-Security-Policy'] ?? '';
      expect(csp, type).toContain("default-src 'none'");
      expect(csp, type).toMatch(/sandbox(;|$)/);
      expect(csp, type).not.toContain('script-src');
    }
  });

  it('offers downloads with a safe file name', () => {
    const h = artifactHeaders('text/markdown', 'http://127.0.0.1:3000', 'Memo: Q3 "offsite"');
    expect(h['Content-Disposition']).toBe('attachment; filename="memo-q3-offsite.md"');
  });
});

describe('examples you admire', () => {
  it('recognises PNG, JPEG and WebP by their bytes, and nothing else', () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImage(new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]))).toBe('image/webp');
    expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeUndefined();
  });

  it('accepts pasted text or an image of an allowed type, and refuses the rest', () => {
    expect(RefInput.safeParse({ text: 'An example' }).success).toBe(true);
    expect(RefInput.safeParse({ text: '   ' }).success).toBe(false);
    expect(RefInput.safeParse({ image: { mediaType: 'image/png', base64: 'iVBORw0KGgo=' } }).success).toBe(true);
    expect(RefInput.safeParse({ image: { mediaType: 'image/svg+xml', base64: 'PHN2Zz4=' } }).success).toBe(false);
    expect(RefInput.safeParse({ image: { mediaType: 'image/png', base64: 'not base64!' } }).success).toBe(false);
  });
});

describe('request schemas', () => {
  it('accepts a problem with attachments and rejects empty or huge input', () => {
    expect(ProblemInput.safeParse({ text: 'A memo', attachments: [{ name: 'Draft', text: 'hi' }] }).success).toBe(true);
    expect(ProblemInput.safeParse({ text: '   ' }).success).toBe(false);
    expect(ProblemInput.safeParse({ text: 'x'.repeat(20_001) }).success).toBe(false);
  });

  it('checks starts, answers and settings', () => {
    expect(StartInput.safeParse({ intakeId: '0b7f2f5e-3c1a-4d2e-9f00-5a3c2b1d4e6f', recipeId: 'c4', budgetUsd: 2 }).success).toBe(true);
    expect(StartInput.safeParse({ intakeId: '0b7f2f5e-3c1a-4d2e-9f00-5a3c2b1d4e6f', budgetUsd: 0 }).success).toBe(false);
    // The run id a Start names (F03 P3): a lowercase UUID, as crypto.randomUUID() makes; anything else is a 400.
    expect(StartInput.safeParse({ intakeId: '0b7f2f5e-3c1a-4d2e-9f00-5a3c2b1d4e6f', recipeId: 'c4', budgetUsd: 2, runId: '5d6e7f80-91a2-4b3c-8d4e-5f6a7b8c9d0e' }).success).toBe(true);
    for (const runId of ['run-1', '', '5D6E7F80-91A2-4B3C-8D4E-5F6A7B8C9D0E', '../5d6e7f80-91a2-4b3c-8d4e-5f6a7b8c9d0e', 7]) {
      expect(StartInput.safeParse({ intakeId: '0b7f2f5e-3c1a-4d2e-9f00-5a3c2b1d4e6f', recipeId: 'c4', budgetUsd: 2, runId }).success, String(runId)).toBe(false);
    }
    expect(StartInput.safeParse({ intakeId: '0b7f2f5e-3c1a-4d2e-9f00-5a3c2b1d4e6f', recipeId: 'c4', budgetUsd: 2, refs: [ID] }).success).toBe(true);
    expect(StartInput.safeParse({ intakeId: '0b7f2f5e-3c1a-4d2e-9f00-5a3c2b1d4e6f', recipeId: 'c4', budgetUsd: 2, refs: ['../x'] }).success).toBe(false);
    expect(StartInput.safeParse({ intakeId: '0b7f2f5e-3c1a-4d2e-9f00-5a3c2b1d4e6f', recipeId: 'c4', budgetUsd: 2, refs: Array(10).fill(ID) }).success).toBe(false);
    expect(SettingsPatch.safeParse({ showTechnicalNames: true }).success).toBe(true);
    expect(ResolutionInput.safeParse({ choice: ['a'] }).success).toBe(true);
    expect(ResolutionInput.safeParse({ approved: 'yes' }).success).toBe(false);
    expect(SettingsPatch.safeParse({ workspaceBudgetUsd: 50, demoMode: true }).success).toBe(true);
    expect(SettingsPatch.safeParse({ workspaceBudgetUsd: -1 }).success).toBe(false);
    // The page renderer's OS sandbox (ADR-0105): on or off, said as such, and nothing else in the same request.
    expect(RendererPatch.safeParse({ osSandbox: false }).success).toBe(true);
    expect(RendererPatch.safeParse({ osSandbox: true }).success).toBe(true);
    for (const body of [{}, { osSandbox: 'off' }, { osSandbox: 0 }, { osSandbox: false, demoMode: true }, { osSandbox: null }]) expect(RendererPatch.safeParse(body).success, JSON.stringify(body)).toBe(false);
    // The Settings patch does not take it: the sandbox has its own route and its own confirmation.
    expect(SettingsPatch.safeParse({ osSandbox: false }).data).toEqual({});
  });
});

describe('app-wide response headers (next.config.ts)', () => {
  /** next.config `source` patterns here are plain regular expressions in one group, so they can be checked as such. */
  async function appRule() {
    const headers = (await config.headers?.()) ?? [];
    const rule = headers.find((h) => h.headers.some((x) => x.key === 'Content-Security-Policy'));
    if (!rule) throw new Error('no app CSP rule');
    return { matches: (p: string) => new RegExp(`^${rule.source}$`).test(p), csp: rule.headers.find((x) => x.key === 'Content-Security-Policy')?.value ?? '' };
  }

  it('leaves both artifact routes to their own sandboxing headers (SEC-1)', async () => {
    const { matches } = await appRule();
    expect(matches('/')).toBe(true);
    expect(matches('/api/settings')).toBe(true);
    expect(matches('/runs/abc/result')).toBe(true);
    expect(matches(`/artifacts/${ID}`)).toBe(false);
    expect(matches(`/api/artifacts/${ID}`)).toBe(false);
  });
});

describe('app screens load images only from byway (SEC-4)', () => {
  it('limits images and media on the app’s own pages to its origin, data: and blob:', async () => {
    const headers = (await config.headers?.()) ?? [];
    const csp = headers.flatMap((h) => h.headers).find((x) => x.key === 'Content-Security-Policy')?.value ?? '';
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("media-src 'self' data: blob:");
  });

  it('lets the app’s frames show only byway’s own addresses, so a framed page cannot be carried to another site (F05)', async () => {
    const headers = (await config.headers?.()) ?? [];
    const csp = headers.flatMap((h) => h.headers).find((x) => x.key === 'Content-Security-Policy')?.value ?? '';
    expect(csp).toContain("frame-src 'self'");
  });
});

describe('how the app is built and served (C8, SEC-3, DEV-1)', () => {
  it('keeps no Turbopack cache, which would snapshot the environment and its keys under the repo', () => {
    expect(configFor({}).experimental?.turbopackFileSystemCacheForDev).toBe(false);
    expect(configFor({}).experimental?.turbopackFileSystemCacheForBuild).toBe(false);
  });

  it('builds into BYWAY_NEXT_DIST_DIR when set, so the e2e suite never rebuilds under a byway you are running', () => {
    expect(configFor({})).toMatchObject({ distDir: '.next', typescript: { tsconfigPath: 'tsconfig.json' } });
    // Its own tsconfig too: Next.js adds a build folder's type paths to the tsconfig it builds with.
    expect(configFor({ BYWAY_NEXT_DIST_DIR: '.next-e2e' })).toMatchObject({ distDir: '.next-e2e', typescript: { tsconfigPath: 'tsconfig.e2e.json' } });
    expect(configFor({ BYWAY_NEXT_DIST_DIR: '.next-dev-test' })).toMatchObject({ distDir: '.next-dev-test', typescript: { tsconfigPath: 'tsconfig.dev-test.json' } });
    expect(() => configFor({ BYWAY_NEXT_DIST_DIR: '../outside' })).toThrow(/BYWAY_NEXT_DIST_DIR/);
  });

  it('runs the real next dev test in a folder of its own: a suite building into .next-e2e at the same time stops a next dev there', () => {
    // Next 16 allows one dev server per build folder ("Another next dev server is already running"), and the e2e suite
    // and the Playwright config build into .next-e2e; the real next dev test uses .next-dev-test, which nothing else does.
    const real = readFileSync(path.join(REPO, 'apps', 'web', 'test', 'dev-server.real.test.ts'), 'utf8');
    expect(real).toContain("BYWAY_NEXT_DIST_DIR: '.next-dev-test'");
    for (const other of ['scripts/e2e.ts', 'apps/web/playwright.config.ts']) expect(readFileSync(path.join(REPO, other), 'utf8')).not.toContain('.next-dev-test');
  });
});
