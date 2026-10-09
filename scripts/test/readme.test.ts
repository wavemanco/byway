/**
 * The root README's statements about verification and decisions, checked against what they describe (2026-10-08
 * external review, verified: R1 and R3).
 *
 * R1: the README said the unit run needs "no network". It needs Playwright's Chromium (the renderer tests launch it)
 * and starts a local Temporal dev server, whose CLI is downloaded once when no cached copy exists. There is also no
 * single command that runs every check, so `pnpm verify` chains them; nothing runs it automatically (no CI service is
 * configured, which is the owner's call), so it is the gate a person or agent runs before merging.
 *
 * R3: the README named the product's decisions as a hand-maintained range ("ADR-0064 to ADR-0072") that went stale as
 * records were added. It now links the index sections that list them, and every relative link must resolve.
 */
import { describe, expect, it } from 'vitest';
import { brokenLink, read, relativeLinks, section } from './docs.ts';

const readme = read('README.md');
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
    expect(row).not.toMatch(/ADR-0064 to ADR-\d{4}/);
    const targets = relativeLinks(row).map((l) => l.target);
    expect(targets).toContain('docs/adr/README.md#system');
    expect(targets).toContain('docs/adr/README.md#product--program');
  });

  it('every relative link resolves to a file, and every anchor to a heading', () => {
    const links = relativeLinks(readme);
    expect(links.length).toBeGreaterThan(10);
    expect(links.flatMap(({ target }) => brokenLink('README.md', target) ?? [])).toEqual([]);
  });
});
