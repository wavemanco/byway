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
    expect(matching(serve, /\bcheckRenderer\(/)).toEqual(['const rendererChecking = checkRenderer({ osSandbox });']);
    const started = index(/^const rendererChecking = /);
    expect(started).toBeGreaterThan(index(/startDevEngine\(/));
    expect(started).toBeLessThan(index(BUILD));
  });

  it('starts its limit only once the app is built and the engine is up, and prints the line as soon as the wait ends', () => {
    expect(matching(serve, /\brendererCheckWithin\(/)).toEqual(["const renderer = await rendererCheckWithin(rendererChecking, RENDERER_CHECK_MS, { built: mode === 'start', osSandbox });"]);
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
    expect(main[read + 1]).toBe('const rendererChecking = checkRenderer({ osSandbox });');
    expect(matching(serve, /\bosSandbox\b/)).toHaveLength(3);
  });

  it('prints the line from what the check found, then records it in the store for Settings, which never changes the setting', () => {
    const limit = index(/\brendererCheckWithin\(/);
    expect(main[limit + 1]).toBe('console.log(`  renderer   ${rendererLine(renderer)}`);');
    expect(main[limit + 2]).toMatch(/^await store\.recordRendererCheck\(\{ at: new Date\(\)\.toISOString\(\), \.\.\.renderer \}\)\.catch\(/);
    // Nothing here switches the sandbox: only Settings does (ADR-0105).
    expect(matching(serve, /setRendererSandbox/)).toEqual([]);
  });
});
