/**
 * Guard: only the person turns the page renderer's OS sandbox off, in Settings (ADR-0105, the owner's "Never automatic:
 * byway never turns the sandbox off by itself"). It reads every product source (packages/<name>/src, apps/web's src and
 * app, scripts) and fails on:
 * - a call that switches the setting (`setRendererSandbox(`) anywhere but Settings' route handler logic, which passes
 *   the person's request on;
 * - Chromium's sandbox option (`chromiumSandbox`) anywhere but the one stated launch, which takes it from the setting;
 * - a renderer given a setting of its own (`osSandbox:` with a function) anywhere but the worker, which reads the store's,
 *   and the start-up check, which draws only byway's own test page under each setting to tell whether the sandbox works.
 * The store never writes the setting except through setRendererSandbox (packages/store/test/renderer-settings.test.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder, REPO } from './guards/scan.ts';

const rel = (file: string) => path.relative(REPO, file).replace(/\\/g, '/');

/** Every product source file, as lines (uses() leaves out lines that are only a comment). */
function sources(): { file: string; lines: string[] }[] {
  const packageSrc = filesUnder(path.join(REPO, 'packages'), /\.(ts|tsx)$/).filter((f) => rel(f).split('/')[2] === 'src');
  const web = ['src', 'app'].flatMap((d) => filesUnder(path.join(REPO, 'apps', 'web', d), /\.(ts|tsx)$/));
  const scripts = filesUnder(path.join(REPO, 'scripts'), /\.ts$/).filter((f) => !rel(f).startsWith('scripts/test/'));
  return [...packageSrc, ...web, ...scripts].map((file) => ({ file: rel(file), lines: readFileSync(file, 'utf8').split('\n') }));
}

/** Lines of code (not comments) that match, as "file: line". */
function uses(pattern: RegExp): string[] {
  return sources().flatMap(({ file, lines }) => lines.filter((l) => pattern.test(l) && !/^\s*(\/\/|\/\*|\*)/.test(l)).map((l) => `${file}: ${l.trim()}`));
}

const SCANS = { timeout: 30_000 };

describe('only the person turns the OS sandbox off, in Settings (ADR-0105)', SCANS, () => {
  it('reads the product sources', () => {
    const files = sources().map((s) => s.file);
    for (const f of ['packages/runner/src/pages.ts', 'packages/store/src/store.ts', 'apps/web/src/server/api.ts', 'apps/web/app/api/renderer/route.ts', 'scripts/serve.ts']) expect(files).toContain(f);
    expect(files.some((f) => f.includes('/test/'))).toBe(false);
  });

  it('switches the setting only where Settings passes the person’s request on', () => {
    expect(uses(/\bsetRendererSandbox\(/)).toEqual([
      'packages/contracts/src/store.ts: setRendererSandbox(on: boolean): Promise<RendererSettings>;',
      'packages/store/src/store.ts: async setRendererSandbox(on: boolean): Promise<RendererSettings> {',
      'apps/web/src/server/api.ts: return deps.services.store.setRendererSandbox(input.osSandbox);',
    ]);
    // That call is Settings' route's, and the route takes nothing but the person's on or off.
    expect(uses(/\bupdateRenderer\(/)).toEqual([
      'apps/web/src/server/api.ts: export async function updateRenderer(deps: Deps, input: z.infer<typeof RendererPatch>): Promise<RendererSettings> {',
      'apps/web/app/api/renderer/route.ts: return json(await updateRenderer(deps, body.data));',
    ]);
    expect(uses(/\/api\/renderer\b/)).toEqual(["apps/web/src/components/PageRendererSettings.tsx: setSettings(await patch<RendererSettings>('/api/renderer', { osSandbox }));"]);
  });

  it('sets Chromium’s sandbox option only in the one stated launch, from the setting', () => {
    expect(uses(/\bchromiumSandbox\b/)).toEqual(['packages/runner/src/pages.ts: return { headless: true, chromiumSandbox: setting.osSandbox, args: [...LAUNCH_ARGS], env: withoutSecrets(env, namesFromEnvFile(env)) };']);
  });

  it('gives a renderer its setting only from the store, or, in the start-up check, for byway’s own test page', () => {
    expect(uses(/\bosSandbox: (\(\)|async \(\)|storeOsSandbox)/)).toEqual([
      'packages/runner/src/pages.ts: const pages = playwrightPages({ osSandbox: () => osSandbox, host, ...(opts.launch ? { launch: opts.launch } : {}) });',
      'packages/runner/src/worker.ts: const pages = opts.pages ?? playwrightPages({ osSandbox: storeOsSandbox(opts.store) });',
    ]);
    expect(uses(/\bcheckRenderer\(\{/)).toEqual(['scripts/serve.ts: const rendererChecking = checkRenderer({ osSandbox });']);
  });
});
