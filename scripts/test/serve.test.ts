/**
 * The order behind byway's start-up `renderer` line (scripts/serve.ts; ADR-0084's later note): the renderer check starts
 * early, while the app builds and the engine starts, and the time byway gives it starts only once the app is built and
 * the engine is up, just before the line is printed. Counted from the check's start, the limit ran out on GitHub's
 * 2-CPU Windows machine while the launch waited for the build (run 39058507534), and byway said Chromium could not start
 * although it could. The limit itself, `rendererCheckWithin`, is tested in packages/runner/test/renderer-check.test.ts;
 * serve.ts runs `main()` when it is loaded, so its order is read from its text, as ci.test.ts reads the workflow's.
 */
import { describe, expect, it } from 'vitest';
import { read } from './docs.ts';

/** A file's lines of code, trimmed, without blank lines or lines that are only a comment. */
const codeLines = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(\/\/|\/\*|\*)/.test(l));

const serve = codeLines(read('scripts/serve.ts'));
const main = serve.slice(serve.indexOf('async function main(): Promise<void> {'));
const index = (pattern: RegExp): number => main.findIndex((l) => pattern.test(l));
const matching = (lines: string[], pattern: RegExp): string[] => lines.filter((l) => pattern.test(l));

const BUILD = /^if \(mode === 'start'\) await build\(env\);$/;
const ENGINE_UP = /^engine = await engineStarting;$/;

describe("serve.ts's renderer line (ADR-0084)", () => {
  it('reads main() and the steps it orders', () => {
    expect(main[0]).toBe('async function main(): Promise<void> {');
    for (const step of [BUILD, ENGINE_UP, /startDevEngine\(/]) expect(index(step), String(step)).toBeGreaterThan(0);
  });

  it('starts the check while the app builds and the engine starts, with no limit of its own', () => {
    expect(matching(serve, /\bcheckRenderer\(/)).toEqual(['const rendererChecking = checkRenderer({ osSandbox }, { progress: rendererProgress });']);
    const started = index(/^const rendererChecking = /);
    expect(started).toBeGreaterThan(index(/startDevEngine\(/));
    expect(started).toBeLessThan(index(BUILD));
  });

  it('starts its limit only once the app is built and the engine is up, and prints the line as soon as the wait ends', () => {
    expect(matching(serve, /\brendererCheckWithin\(/)).toEqual(["const renderer = await rendererCheckWithin(rendererChecking, RENDERER_CHECK_MS, { built: mode === 'start', osSandbox, progress: rendererProgress });"]);
    const limit = index(/\brendererCheckWithin\(/);
    expect(limit).toBeGreaterThan(index(BUILD));
    expect(limit).toBeGreaterThan(index(ENGINE_UP));
    expect(main[limit + 1]).toMatch(/^console\.log\(`  renderer {3}/);
  });

  it('bounds the check by nothing else: the check and the limit are each used once more, there', () => {
    expect(matching(serve, /\brendererChecking\b/)).toHaveLength(2);
    expect(matching(serve, /\bRENDERER_CHECK_MS\b/)).toHaveLength(2);
  });
});

describe("serve.ts's renderer line and the OS sandbox setting (ADR-0105)", () => {
  it("checks under the store's setting, read just before (a setting it cannot read counts as on), and the wait says the same setting", () => {
    const read = index(/^const \{ osSandbox \} = await store\.getRendererSettings\(\)\.catch\(\(\) => \(\{ osSandbox: true \}\)\);$/);
    expect(read).toBeGreaterThan(0);
    expect(main[read + 1]).toBe('const rendererProgress: RendererCheckProgress = {};');
    expect(main[read + 2]).toBe('const rendererChecking = checkRenderer({ osSandbox }, { progress: rendererProgress });');
    expect(matching(serve, /\bosSandbox\b/)).toHaveLength(3);
  });

  it('at its limit, says what the check had found by then: the progress the check is told, used nowhere else', () => {
    expect(matching(serve, /\brendererProgress\b/)).toEqual([
      'const rendererProgress: RendererCheckProgress = {};',
      'const rendererChecking = checkRenderer({ osSandbox }, { progress: rendererProgress });',
      "const renderer = await rendererCheckWithin(rendererChecking, RENDERER_CHECK_MS, { built: mode === 'start', osSandbox, progress: rendererProgress });",
    ]);
  });

  it('prints the line from what the check found, then records it in the store for Settings, which never changes the setting', () => {
    const limit = index(/\brendererCheckWithin\(/);
    expect(main[limit + 1]).toBe('console.log(`  renderer   ${rendererLine(renderer)}`);');
    expect(main[limit + 2]).toMatch(/^await store\.recordRendererCheck\(\{ at: new Date\(\)\.toISOString\(\), \.\.\.renderer \}\)\.catch\(/);
    // Nothing here switches the sandbox: only Settings does (ADR-0105).
    expect(matching(serve, /setRendererSandbox/)).toEqual([]);
  });
});

describe("serve.ts's renderer line and Playwright's browsers folder (ADR-0105)", () => {
  it("names, under the renderer line, the browsers folder byway takes Chromium from, as Playwright resolves it (PLAYWRIGHT_BROWSERS_PATH moves it), so a person can check it is the folder the README's Linux profile covers", () => {
    const record = index(/^await store\.recordRendererCheck\(/);
    expect(record).toBeGreaterThan(0);
    expect(main[record + 1]).toBe('const browsers = await browsersFolder();');
    expect(main[record + 2]).toBe("if (browsers) console.log(`             Playwright's browsers folder: ${browsers}`);");
    expect(matching(serve, /\bbrowsersFolder\b/)).toEqual([expect.stringMatching(/^import \{ .*\bbrowsersFolder\b.* \} from '\.\.\/packages\/runner\/src\/index\.ts';$/), 'const browsers = await browsersFolder();']);
  });
});

/**
 * DEV-1: the e2e suite's byway builds the runner's workflow bundle into a file of its own inside packages/runner/dist,
 * so it shares no file with a byway you are running from the same checkout. serve.ts reads the file's name from
 * BYWAY_WORKFLOWS_BUNDLE and hands the engine what it built; without it the worker builds dist/workflows.js itself.
 */
describe("serve.ts's workflow bundle, and the e2e suite's own (DEV-1)", () => {
  const e2e = codeLines(read('scripts/e2e.ts'));

  it('builds the bundle into the file BYWAY_WORKFLOWS_BUNDLE names inside packages/runner/dist, and the engine runs that file', () => {
    expect(matching(serve, /\bBYWAY_WORKFLOWS_BUNDLE\b/)).toEqual(['const bundle = process.env.BYWAY_WORKFLOWS_BUNDLE?.trim();']);
    expect(matching(serve, /\bbuildWorkflows\(/)).toEqual(['const workflowsBuilt = bundle ? buildWorkflows({ outfile: path.join(path.dirname(DEFAULT_WORKFLOWS_BUNDLE), bundle) }) : Promise.resolve(undefined);']);
    expect(matching(serve, /\bstartDevEngine\(/)).toEqual(['const engineStarting = workflowsBuilt.then((workflowsPath) => startDevEngine({ dataDir, gateway, store, prompts, port: temporalPort, ...(workflowsPath ? { workflowsPath } : {}) }));']);
  });

  it('the e2e byway names a bundle of its own, and removes it with the data directory once byway has stopped', () => {
    const remove = "rmSync(path.join(ROOT, 'packages', 'runner', 'dist', WORKFLOWS_BUNDLE), { force: true, maxRetries: 20, retryDelay: 250 });";
    expect(matching(e2e, /\bWORKFLOWS_BUNDLE\b/)).toEqual(['const WORKFLOWS_BUNDLE = `e2e-${process.pid}.js`;', 'BYWAY_WORKFLOWS_BUNDLE: WORKFLOWS_BUNDLE,', remove]);
    const at = e2e.indexOf(remove);
    expect(at).toBeGreaterThan(e2e.indexOf('} finally {'));
    expect(e2e[at - 1]).toBe('rmSync(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });');
  });
});
