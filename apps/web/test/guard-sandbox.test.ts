/**
 * Guard: only the person turns the page renderer's OS sandbox off, in Settings (ADR-0105 item 7, from the design the
 * owner approved: "Never automatic: byway never turns the sandbox off by itself"). It reads every product source
 * (packages/<name>/src, apps/web's src and app and its own root files but its browser tests' config, and scripts but
 * scripts/test), comments left out, and
 * pins as exact lists every line that mentions a way to switch the setting, build a renderer or launch Chromium,
 * whatever the line's arguments look like:
 * - switching the setting: `setRendererSandbox`, only where Settings' route handler logic passes the person's request
 *   on, with that logic (`updateRenderer`) and its route (`/api/renderer`, which the banner on every screen only reads),
 *   and the setting's table and column (`renderer_settings`, `os_sandbox`), named only by the store's migration, its
 *   queries and the reader of its row, so SQL written elsewhere moves a pin;
 * - Chromium's sandbox option, `chromiumSandbox`: only the one stated launch, which takes it from the setting;
 * - building a renderer: `playwrightPages`, `renderBrowsers`, `checkRenderer` (the start-up check, run only by
 *   scripts/serve.ts) and `storeOsSandbox` (the store's setting, which only the worker gives a renderer);
 * - launching Chromium: `launchChromium`, `chromiumLaunchOptions`, the test-only `launch` seam (`launch:` and `.launch`),
 *   Playwright's own launch calls, every line that names Playwright's packages, Puppeteer or chromium-bidi in quotes (as
 *   an import does), which only pages.ts has besides two lines of the weekly pin report (scripts/playwright-pin.ts,
 *   ADR-0110) that name Playwright's packages to read their versions and load nothing, and every module loaded by a name
 *   its line does not write out (`import(name)`), which no line has, so the names that report holds load nothing
 *   through an import().
 * A line that opens an import or re-export list is pinned by its file alone, so naming one more thing in a list already
 * pinned is not a change, but a new importer is. A second test feeds the pins each way round them found so far (the launch seam, a
 * setting in a named function or shorthand, chromiumLaunchOptions handed to Playwright, Playwright's own launch, whose
 * default is no sandbox, and more) and requires that one pin changes.
 *
 * Every createRequire is pinned too, since the require it makes loads any name, and so is every require (serve.ts's two
 * included) called with an argument that is not one written-out string, which none is (SEC-NOTE-3). A line's leading
 * block comment is taken off before the comment test, and a line that ends in `import` is read with the next, so
 * neither layout hides a line (LC-1, the re-check of block 1's fix round; codeLines).
 *
 * What it does not see: a use that names none of these (a namespace import called by a computed name, a require that
 * createRequire made, passed to another file under another name and called there with a computed name, SQL that builds
 * the table's or the column's name from pieces), a browser driver it does not list, a browser started as a program of
 * its own, and a change to the launch wiring inside the lines it pins (a retry without the sandbox inside pages.ts):
 * launch.test.ts, pages.test.ts and renderer-check.test.ts check that behaviour. The store never writes the setting
 * except through setRendererSandbox (packages/store/test/renderer-settings.test.ts).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder, REPO } from './guards/scan.ts';

const rel = (file: string) => path.relative(REPO, file).replace(/\\/g, '/');
const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

interface Source {
  file: string;
  lines: string[];
}

/** Every product source file, as lines. */
function sources(): Source[] {
  const packageSrc = filesUnder(path.join(REPO, 'packages'), CODE).filter((f) => rel(f).split('/')[2] === 'src');
  const web = ['src', 'app'].flatMap((d) => filesUnder(path.join(REPO, 'apps', 'web', d), CODE));
  // apps/web's own root files (instrumentation.ts runs in the server); playwright.config.ts configures its browser tests.
  const webRoot = readdirSync(path.join(REPO, 'apps', 'web'))
    .filter((n) => CODE.test(n) && !n.endsWith('.d.ts') && n !== 'playwright.config.ts')
    .map((n) => path.join(REPO, 'apps', 'web', n));
  const scripts = filesUnder(path.join(REPO, 'scripts'), CODE).filter((f) => !rel(f).startsWith('scripts/test/'));
  return [...packageSrc, ...web, ...webRoot, ...scripts].map((file) => ({ file: rel(file), lines: readFileSync(file, 'utf8').split('\n') }));
}

const IMPORT_LIST = /^\s*(import|export)\s+(type\s+)?(\{|\*)/;

/**
 * A file's lines of code: a leading block comment (`/* x *\/ import ...`) is taken off, a line that is then a comment
 * (it begins with //, /* or *) is left out, and a line that ends in `import` is read with the next (`import` on one
 * line, its `(name)` on the next).
 */
function codeLines(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let l = (lines[i] as string).replace(/^\s*(?:\/\*.*?\*\/\s*)+/, '');
    if (l.trim() === '' || /^\s*(\/\/|\/\*|\*)/.test(l)) continue;
    if (/\bimport\s*$/.test(l) && i + 1 < lines.length) l = `${l.trimEnd()} ${(lines[++i] as string).trim()}`;
    out.push(l);
  }
  return out;
}

/** Lines of code (not comments) that match, as "file: line"; an import or re-export line as "file: (import or re-export)". */
function uses(pattern: RegExp, files: Source[] = sources()): string[] {
  return files.flatMap(({ file, lines }) =>
    codeLines(lines)
      .filter((l) => pattern.test(l))
      .map((l) => (IMPORT_LIST.test(l) ? `${file}: (import or re-export)` : `${file}: ${l.trim()}`)),
  );
}

const imported = (file: string) => `${file}: (import or re-export)`;
const PAGES = 'packages/runner/src/pages.ts';
const in_ = (file: string) => (line: string) => `${file}: ${line}`;
const pages = in_(PAGES);

interface Pin {
  what: string;
  pattern: RegExp;
  lines: string[];
}

/** Switching the setting: only Settings, passing on the person's request. */
const SWITCH: Pin[] = [
  {
    what: 'setRendererSandbox: the store’s method and its query, and the one call Settings makes',
    pattern: /\bsetRendererSandbox\b/,
    lines: [
      'packages/contracts/src/store.ts: setRendererSandbox(on: boolean): Promise<RendererSettings>;',
      'packages/store/src/queries.ts: setRendererSandbox: p(`INSERT INTO renderer_settings (id, os_sandbox, changed_at, last_check) VALUES (1, ?, ?, NULL)',
      'packages/store/src/store.ts: async setRendererSandbox(on: boolean): Promise<RendererSettings> {',
      'packages/store/src/store.ts: q.setRendererSandbox.run(value ? 1 : 0, this.#stamp());',
      'apps/web/src/server/api.ts: return deps.services.store.setRendererSandbox(input.osSandbox);',
    ],
  },
  {
    what: "updateRenderer: Settings' route, which takes nothing but the person's on or off",
    pattern: /\bupdateRenderer\b/,
    lines: [
      'apps/web/src/server/api.ts: export async function updateRenderer(deps: Deps, input: z.infer<typeof RendererPatch>): Promise<RendererSettings> {',
      imported('apps/web/app/api/renderer/route.ts'),
      'apps/web/app/api/renderer/route.ts: return json(await updateRenderer(deps, body.data));',
    ],
  },
  {
    what: '/api/renderer: switched only by Settings’ switch (PATCH); the banner only reads it (GET)',
    pattern: /\/api\/renderer\b/,
    lines: [
      "apps/web/src/components/PageRendererSettings.tsx: const saved = await patch<RendererSettings>('/api/renderer', { osSandbox });",
      "apps/web/src/components/SandboxBanner.tsx: (signal) => get<RendererSettings>('/api/renderer', signal),",
    ],
  },
  {
    what: 'the setting’s table and column: only the store’s migration, its queries and the reader of its row',
    pattern: /\bos_sandbox\b|\brenderer_settings\b/,
    lines: [
      'packages/store/src/migrations.ts: -- renderer serves every workspace. No row means never set, and the store answers with the sandbox on. os_sandbox is',
      'packages/store/src/migrations.ts: CREATE TABLE renderer_settings (',
      'packages/store/src/migrations.ts: os_sandbox  INTEGER NOT NULL CHECK (os_sandbox IN (0, 1)),',
      "packages/store/src/queries.ts: rendererSettings: p('SELECT * FROM renderer_settings WHERE id = 1'),",
      'packages/store/src/queries.ts: setRendererSandbox: p(`INSERT INTO renderer_settings (id, os_sandbox, changed_at, last_check) VALUES (1, ?, ?, NULL)',
      'packages/store/src/queries.ts: ON CONFLICT (id) DO UPDATE SET os_sandbox = excluded.os_sandbox, changed_at = excluded.changed_at`),',
      'packages/store/src/queries.ts: recordRendererCheck: p(`INSERT INTO renderer_settings (id, os_sandbox, changed_at, last_check) VALUES (1, 1, NULL, ?)',
      'packages/store/src/renderer.ts: osSandbox: Number(r.os_sandbox) === 1,',
    ],
  },
];

/** Chromium's sandbox option: only the one stated launch, from the setting. */
const OPTION: Pin[] = [
  { what: 'chromiumSandbox: the stated launch', pattern: /\bchromiumSandbox\b/, lines: [pages('return { headless: true, chromiumSandbox: setting.osSandbox, args: [...LAUNCH_ARGS], env: withoutSecrets(env, namesFromEnvFile(env)) };')] },
];

/** Building a renderer: the worker's (the store's setting) and the start-up check's (byway's own test page), nothing else. */
const BUILD: Pin[] = [
  {
    what: 'playwrightPages: defined, built by the start-up check and by the worker',
    pattern: /\bplaywrightPages\b/,
    lines: [
      imported('packages/runner/src/index.ts'),
      pages('export function playwrightPages(opts: PlaywrightPagesOptions = {}): PageRenderer {'),
      pages('const pages = playwrightPages({ osSandbox: () => osSandbox, host, ...(opts.launch ? { launch: opts.launch } : {}) });'),
      imported('packages/runner/src/worker.ts'),
      'packages/runner/src/worker.ts: const pages = opts.pages ?? playwrightPages({ osSandbox: storeOsSandbox(opts.store), lastCheck: storeLastCheck(opts.store) });',
    ],
  },
  {
    what: 'renderBrowsers: defined, and used only by playwrightPages',
    pattern: /\brenderBrowsers\b/,
    lines: [
      imported(PAGES),
      pages('const browsers = renderBrowsers((osSandbox) => launch({ osSandbox }), { timeoutMs: timeout, closeTimeoutMs: closeTimeout, ...(opts.osSandbox ? { osSandbox: opts.osSandbox } : {}) });'),
      'packages/runner/src/render-browsers.ts: export function renderBrowsers<B extends KeptBrowser>(launch: (osSandbox: boolean) => Promise<B>, { timeoutMs, closeTimeoutMs, osSandbox, warn = (m) => console.warn(m) }: RenderBrowsersOptions): RenderBrowsers<B> {',
    ],
  },
  {
    what: 'checkRenderer: defined, and run only at start-up under the store’s setting',
    pattern: /\bcheckRenderer\b/,
    lines: [
      imported('packages/runner/src/index.ts'),
      pages('export async function checkRenderer(setting: LaunchSetting, opts: RendererCheckOptions = {}): Promise<RendererCheck> {'),
      imported('scripts/serve.ts'),
      'scripts/serve.ts: const rendererChecking = checkRenderer({ osSandbox }, { progress: rendererProgress });',
    ],
  },
  {
    what: 'storeOsSandbox: the store’s setting, given to a renderer only by the worker',
    pattern: /\bstoreOsSandbox\b/,
    lines: [
      imported('packages/runner/src/index.ts'),
      pages('export const storeOsSandbox ='),
      imported('packages/runner/src/worker.ts'),
      'packages/runner/src/worker.ts: const pages = opts.pages ?? playwrightPages({ osSandbox: storeOsSandbox(opts.store), lastCheck: storeLastCheck(opts.store) });',
    ],
  },
];

/**
 * Launching Chromium: launchChromium, the one stated launch, which only the renderer calls; Playwright loaded only in
 * pages.ts (the pin report names its packages and loads nothing), and no module loaded by a name not written out.
 */
const LAUNCH: Pin[] = [
  {
    what: 'launchChromium: defined, and the renderer’s default launch (not exported from the package)',
    pattern: /\blaunchChromium\b/,
    lines: [pages('const launch = opts.launch ?? launchChromium;'), pages('export async function launchChromium(setting: LaunchSetting): Promise<Browser> {')],
  },
  {
    what: 'chromiumLaunchOptions: defined, and handed to Playwright only by launchChromium',
    pattern: /\bchromiumLaunchOptions\b/,
    lines: [pages('export function chromiumLaunchOptions(setting: LaunchSetting, env: Env = process.env): LaunchOptions {'), pages('return await chromium.launch(chromiumLaunchOptions(setting));')],
  },
  {
    what: 'the launch seam: tests only, passed on by the start-up check, and Playwright’s one launch',
    pattern: /\blaunch\??\s*:|\.launch\b/,
    lines: [
      pages(".replace(/^browserType\\.launch:\\s*/, '')"),
      pages('launch?: (setting: LaunchSetting) => Promise<Browser>;'),
      pages('const launch = opts.launch ?? launchChromium;'),
      pages('return await chromium.launch(chromiumLaunchOptions(setting));'),
      pages('launch?: (setting: LaunchSetting) => Promise<Browser>;'),
      pages('const pages = playwrightPages({ osSandbox: () => osSandbox, host, ...(opts.launch ? { launch: opts.launch } : {}) });'),
      'packages/runner/src/render-browsers.ts: export function renderBrowsers<B extends KeptBrowser>(launch: (osSandbox: boolean) => Promise<B>, { timeoutMs, closeTimeoutMs, osSandbox, warn = (m) => console.warn(m) }: RenderBrowsersOptions): RenderBrowsers<B> {',
    ],
  },
  {
    what: "Playwright's launch calls: the one in launchChromium",
    pattern: /\.(launch|launchPersistentContext|launchServer|connectOverCDP)\s*\(/,
    lines: [pages('return await chromium.launch(chromiumLaunchOptions(setting));')],
  },
  {
    what: 'Playwright, Puppeteer or chromium-bidi, named only by pages.ts and by the pin report, which launches nothing',
    pattern: /['"`](@playwright\/[\w-]+|playwright(-core|-chromium)?|puppeteer[\w-]*|chromium-bidi)['"`/]/,
    lines: [
      imported(PAGES),
      pages("return onDisk((await import('playwright')).chromium);"),
      pages("let chromium: typeof import('playwright').chromium | undefined;"),
      pages("({ chromium } = await import('playwright'));"),
      // The weekly CI report of the Playwright pin (ADR-0110) names the two packages to read their pinned versions from
      // package.json; it imports and launches nothing.
      "scripts/playwright-pin.ts: { file: 'packages/runner/package.json', name: 'playwright' },",
      "scripts/playwright-pin.ts: { file: 'apps/web/package.json', name: '@playwright/test' },",
    ],
  },
  {
    // An import() whose argument is one string literal (comments before it allowed) writes its module out, so the pin
    // above sees it; any other argument (a variable, PINNED[0].name, 'play' + 'wright') is a module loaded by a name the
    // line does not write out. An import( with its argument on a later line counts as one too.
    what: 'modules loaded by an import() of a name the line does not write out: none',
    pattern: /\bimport\s*\((?!\s*(?:\/\*.*?\*\/\s*)*(?:'[^'\\\n]*'|"[^"\\\n]*"|`[^`\\$\n]*`)\s*[,)])/,
    lines: [],
  },
  {
    // A require made by createRequire loads whatever name it is given, so each one made is pinned (SEC-NOTE-3).
    what: 'createRequire: the dev engine’s Temporal version, the dev server’s next, and serve.ts’s Temporal logger and next',
    pattern: /\bcreateRequire\b/,
    lines: [
      imported('packages/runner/src/dev-engine.ts'),
      "packages/runner/src/dev-engine.ts: const sdkVersion = (): string => (createRequire(import.meta.url)('@temporalio/testing/package.json') as { version: string }).version;",
      imported('apps/web/src/server/dev-server.ts'),
      "apps/web/src/server/dev-server.ts: const next = createRequire(import.meta.url)('next') as CreateNextApp;",
      imported('scripts/serve.ts'),
      "scripts/serve.ts: const requireFromRunner = createRequire(path.join(ROOT, 'packages', 'runner', 'package.json'));",
      "scripts/serve.ts: const require = createRequire(path.join(WEB, 'package.json'));",
    ],
  },
  {
    // A require, or one the pin above made (serve.ts's two; dev-engine.ts and dev-server.ts call theirs on the pinned
    // line), called with an argument that is not one written-out string: none. A new createRequire moves the pin above.
    what: 'a require called with a name its line does not write out: none',
    pattern: /\b(?:require|requireFromRunner)(?:\.resolve)?\s*\((?!\s*(?:'[^'\\\n]*'|"[^"\\\n]*"|`[^`\\$\n]*`)\s*[,)])/,
    lines: [],
  },
];

const PINS: Pin[] = [...SWITCH, ...OPTION, ...BUILD, ...LAUNCH];

/** The pins whose lines differ in these sources. */
const moved = (files: Source[]): string[] => PINS.filter((p) => JSON.stringify(uses(p.pattern, files)) !== JSON.stringify(p.lines)).map((p) => p.what);

const SCANS = { timeout: 30_000 };

describe('only the person turns the OS sandbox off, in Settings (ADR-0105)', SCANS, () => {
  it('reads the product sources', () => {
    const files = sources().map((s) => s.file);
    for (const f of ['packages/runner/src/pages.ts', 'packages/runner/src/worker.ts', 'packages/store/src/store.ts', 'apps/web/src/server/api.ts', 'apps/web/app/api/renderer/route.ts', 'apps/web/instrumentation.ts', 'scripts/serve.ts']) expect(files).toContain(f);
    expect(files.some((f) => f.includes('/test/') || f.endsWith('playwright.config.ts'))).toBe(false);
  });

  it.each(SWITCH.map((p) => [p.what, p] as const))('switches the setting only where Settings passes the person’s request on: %s', (_, pin) => {
    expect(uses(pin.pattern)).toEqual(pin.lines);
  });

  it.each(OPTION.map((p) => [p.what, p] as const))('sets Chromium’s sandbox option only in the one stated launch, from the setting: %s', (_, pin) => {
    expect(uses(pin.pattern)).toEqual(pin.lines);
  });

  it.each(BUILD.map((p) => [p.what, p] as const))('builds a renderer only in the worker, from the store, and in the start-up check, for byway’s own test page: %s', (_, pin) => {
    expect(uses(pin.pattern)).toEqual(pin.lines);
  });

  it.each(LAUNCH.map((p) => [p.what, p] as const))('launches Chromium only through launchChromium, the one stated launch: %s', (_, pin) => {
    expect(uses(pin.pattern)).toEqual(pin.lines);
  });

  /**
   * Each way round the pins found so far, as a product file would hold it (round 1's checks of ADR-0105: DOC-1, W2), and
   * a few more forms: each must move a pin.
   */
  it.each([
    ['the test-only launch seam, with a launch of its own (W2)', ["import { launchChromium, playwrightPages } from '../packages/runner/src/pages.ts';", 'const previews = playwrightPages({ launch: () => launchChromium({ osSandbox: false }) });']],
    ['a renderer given a setting in a named function (W2, DOC-1)', ['const off = (): boolean => false;', 'const previews = playwrightPages({ osSandbox: off });']],
    ['chromiumLaunchOptions handed to Playwright (W2)', ["import { chromium } from 'playwright';", 'await chromium.launch(chromiumLaunchOptions({ osSandbox: false }));']],
    ['a setting in a shorthand property (DOC-1)', ['const osSandbox = async function () { return false; };', 'const cards = playwrightPages({ osSandbox });']],
    ['launchChromium called with the sandbox off (DOC-1)', ['const warm = (): Promise<unknown> => launchChromium({ osSandbox: false });']],
    ["Playwright's own launch, whose default is no sandbox (DOC-1)", ["import { chromium } from 'playwright';", 'const warm = () => chromium.launch({ headless: true });']],
    ['Playwright loaded at run time', ["const { chromium } = await import('playwright-core');"]],
    ['Playwright loaded by a name built from pieces', ["const { chromium } = await import('play' + 'wright');"]],
    ['Playwright loaded by the name the pin report holds, from another file (MI-3)', ["import { PINNED } from './playwright-pin.ts';", 'const { chromium } = await import(PINNED[0].name);']],
    ['a module loaded by a name on the next line', ['const m = await import(', '  name,', ');']],
    ['a renderer built over several lines', ['const r = playwrightPages(', '  { osSandbox: () => false },', ');']],
    ['the start-up check run again, off', ['const again = await checkRenderer({ osSandbox: false });']],
    ['a renderer’s browsers launched by hand', ['const b = renderBrowsers(async () => browser, { timeoutMs: 1, closeTimeoutMs: 1 });']],
    ['the store’s setting given to another renderer', ['const read = storeOsSandbox(store);']],
    ['Chromium’s sandbox option set elsewhere', ['const o = { headless: true, chromiumSandbox: false };']],
    ['the setting switched elsewhere', ['await store.setRendererSandbox(false);']],
    ["the setting's column written directly (WB-2)", ["db.exec('UPDATE renderer_settings SET os_sandbox = 0 WHERE id = 1');"]],
    ['Settings’ route called from elsewhere', ["await fetch('/api/renderer', { method: 'PATCH', body: JSON.stringify({ osSandbox: false }) });"]],
    ['an import list that names the launch', ['import {', '  launchChromium,', "} from '../packages/runner/src/pages.ts';"]],
    ['Playwright imported on a line that begins with a block comment (LC-1)', ["/* warm-up */ import { chromium } from 'playwright';"]],
    ['a launch on a line that begins with block comments (LC-1)', ['/* x */ /* y */ const warm = () => chromium.launch({ headless: true });']],
    ['a module loaded by a computed name, its ( on the next line (LC-1)', ['const m = await import', "  ('play' + 'wright');"]],
    ['a require made by createRequire, loading a computed name (SEC-NOTE-3)', ["import { createRequire } from 'node:module';", 'const load = createRequire(import.meta.url);', "const { chromium } = load('play' + 'wright');"]],
    ['a require made elsewhere, called with a computed name (SEC-NOTE-3)', ['const { chromium } = requireFromRunner(PINNED[0].name);']],
    ['require.resolve of a computed name (SEC-NOTE-3)', ['const where = require.resolve(name);']],
  ])('fails on %s', (_, lines) => {
    const files = [...sources(), { file: 'scripts/zz-way-round.ts', lines }];
    expect(moved(files)).not.toEqual([]);
  });

  /** The pin report is allowed its two lines, nothing more: Playwright imported or loaded there moves a pin too (MI-3). */
  it.each([
    ['Playwright imported by the pin report', ["import { chromium } from 'playwright';"]],
    ['Playwright loaded at run time by the pin report', ["const { chromium } = await import('playwright');"]],
    ['Playwright loaded by the name the pin report holds (SEC-NOTE-3)', ['const { chromium } = await import(PINNED[0].name);']],
    ['a pinned line of the pin report written twice', ["  { file: 'packages/runner/package.json', name: 'playwright' },"]],
  ])('fails on %s', (_, lines) => {
    const files = sources().map((s) => (s.file === 'scripts/playwright-pin.ts' ? { ...s, lines: [...s.lines, ...lines] } : s));
    expect(files.some((s) => s.file === 'scripts/playwright-pin.ts')).toBe(true);
    expect(moved(files)).not.toEqual([]);
  });
});
