/**
 * The root README's statements about verification and decisions, checked against what they describe (2026-10-08
 * external review, verified: R1 and R3).
 *
 * R1: the README said the unit run needs "no network". It needs Playwright's Chromium (the renderer tests launch it)
 * and starts a local Temporal dev server, whose CLI is downloaded once when no cached copy exists. There is also no
 * single command that runs every check, so `pnpm verify` chains them. It is the gate a person or agent runs before
 * merging; since ADR-0103, CI also runs it on Windows and Linux for every push to main, reporting only (ci.test.ts).
 *
 * R3: the README named the product's decisions as a hand-maintained range ("ADR-0064 to ADR-0072") that went stale as
 * records were added. It now links the index sections that list them, and every relative link must resolve.
 */
import { describe, expect, it } from 'vitest';
import { brokenLink, read, relativeLinks, section } from './docs.ts';

// The technical README became docs/developers.md on 2026-10-30 (ADR-0116); its links resolve from docs/.
const readme = read('docs/developers.md');
const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;

/** The commands in a section's first fenced code block, without their comments. */
function codeCommands(text: string): string[] {
  const block = /```\w*\n([\s\S]*?)```/.exec(text)?.[1] ?? '';
  return block
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

describe('README: running the checks (R1)', () => {
  const tests = section(readme, '## Tests') ?? '';

  it('says what the unit run needs instead of promising no network', () => {
    expect(tests).not.toMatch(/no network/i);
    expect(tests).toMatch(/Chromium/);
    expect(tests).toMatch(/Temporal CLI/);
    expect(tests).toMatch(/no model or provider calls/i);
  });

  it('`pnpm verify` runs the typecheck, the unit tests and the end-to-end suite, in that order, stopping at the first failure', () => {
    const steps = (scripts.verify ?? '').split('&&').map((s) => s.trim());
    expect(steps).toEqual(['pnpm -s typecheck', 'pnpm test', 'pnpm e2e']);
    // Each step is a root script that exists, so renaming one breaks this rather than the gate.
    for (const step of steps) expect(Object.keys(scripts), step).toContain(step.split(' ').at(-1));
  });

  it('the Tests section and the Scripts table document `pnpm verify` beside the commands it runs', () => {
    expect(codeCommands(tests)).toEqual(['pnpm verify', 'pnpm -s typecheck', 'pnpm vitest run', 'pnpm e2e']);
    expect(section(readme, '## Scripts')).toMatch(/^\| `pnpm verify` \|/m);
  });
});

describe('README: decisions and links (R3)', () => {
  it('names no hand-maintained range for the product decisions, and links the index sections that list them', () => {
    const row = readme.split('\n').find((l) => l.startsWith('| [docs/adr/]')) ?? '';
    expect(row).not.toBe('');
    expect(row).not.toMatch(/ADR-0064 to ADR-\d{4}/);
    const targets = relativeLinks(row).map((l) => l.target);
    expect(targets).toContain('adr/README.md#system');
    expect(targets).toContain('adr/README.md#product--program');
  });

  it('every relative link resolves to a file, and every anchor to a heading', () => {
    const links = relativeLinks(readme);
    expect(links.length).toBeGreaterThan(10);
    expect(links.flatMap(({ target }) => brokenLink('docs/developers.md', target) ?? [])).toEqual([]);
  });
});

// The README for people using byway (the owner, 2026-10-30), with the licence and the pull-request policy (ADR-0116).
describe('README: for the people who use byway', () => {
  const user = read('README.md');

  it('every relative link resolves to a file, and every anchor to a heading', () => {
    const links = relativeLinks(user);
    expect(links.length).toBeGreaterThan(5);
    expect(links.flatMap(({ target }) => brokenLink('README.md', target) ?? [])).toEqual([]);
  });

  it('keeps the two sections byway\'s own messages send people to: "Back up and restore" and "Renderer"', () => {
    expect(section(user, '## Back up and restore')).toMatch(/whole folder/);
    expect(user).toMatch(/^## Renderer\b/m);
    expect(user).toContain('sh scripts/linux/allow-chromium-sandbox.sh');
  });

  it('says the licence is MIT, as LICENSE and package.json do, and that pull requests come from contributors only', () => {
    expect(read('LICENSE')).toMatch(/^MIT License\n/);
    expect((JSON.parse(read('package.json')) as { license: string }).license).toBe('MIT');
    expect(section(user, '## Licence')).toMatch(/\[MIT License\]\(LICENSE\)/);
    expect(section(user, '## Contributing')).toMatch(/accepts pull requests only from its existing contributors/);
  });
});
