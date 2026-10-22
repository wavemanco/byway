/**
 * ENG-1: the gateway's mock reads a prompt's fenced blocks with a copy of the runner's line-by-line reader
 * (packages/gateway/src/mock/extract.ts and packages/runner/src/formats.ts, each `fences`). The gateway cannot import
 * the runner, which depends on it, and moving the reader into a package both import could change the workflow bundle
 * (@byway/canonical reaches it through @byway/recipe; ADR-0078). So the two copies are held here to the same blocks on
 * the same texts: the cases the runner's reader tells apart, and every prompt template as written. It is a repo-level
 * check because it spans two packages, as claims-oracle.test.ts does.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fences as mockFences } from '../../packages/gateway/src/mock/extract.ts';
import { fences as runnerFences } from '../../packages/runner/src/formats.ts';
import { REPO } from './docs.ts';

const T = '```';
const DOC = ['# Fix the invoice rounding', '', 'Run the formatter tests before merging:', '', `${T}bash`, 'pnpm vitest run packages/invoices', T, '', 'Decision needed: approve by Friday.'].join('\n');

/** What the rules tell apart (packages/runner/test/fences.test.ts), and what a prompt holds. */
const CASES: [string, string][] = [
  ['a block that holds a fenced block with a language', `Here it is.\n\n${T}markdown\n${DOC}\n${T}\n`],
  ['a longer outer fence', `Here is the PR description.\n\n\`\`\`\`markdown\n${DOC}\n\`\`\`\`\n`],
  ['a diff line that adds a fence', `${T}diff\n--- a/README.md\n+++ b/README.md\n@@ -1,1 +1,4 @@\n # Invoices\n+${T}bash\n+pnpm test\n+${T}\n${T}\n\nWhy: document the test command.`],
  ['inline code on one line', `Use ${T}x${T} here.\n${T}json\n{}\n${T}`],
  ['tilde fences', `~~~markdown\n# T\n${T}js\nx\n${T}\n~~~`],
  ['a bare fence inside that closes a 3-backtick block early', `${T}markdown\n# Doc\n\nRun:\n${T}\nnpm test\n${T}\n\nThe ask.\n${T}`],
  ['a block never closed', `Before.\n${T}json\n{"a": 1}\n`],
  ['a fence named in the middle of a line, then a slot', `One fenced ${T}json block, shaped like this:\n\n    {"images":[]}\n\nThe options:\n${T}json\n{"options":[]}\n${T}`],
  ['an indented fence', `  ${T}json\n  {}\n  ${T}\n${T}html\n<p>x</p>\n${T}`],
  ['line ends with a carriage return', `${T}markdown\r\n# T\r\n\r\nBody\r\n${T}\r\nAfter.`],
  ['an empty block, and two blocks in a row', `${T}json\n${T}\n${T}markdown\n# T\n${T}`],
  ['no fence at all', '# T\n\nBody'],
];

const TEMPLATES = path.join(REPO, 'packages', 'prompts', 'templates');
const templates = readdirSync(TEMPLATES)
  .filter((f) => f.endsWith('.md'))
  .map((f): [string, string] => [f, readFileSync(path.join(TEMPLATES, f), 'utf8')]);

describe("the gateway mock's fence reader and the runner's read the same blocks (ENG-1)", () => {
  it.each(CASES)('%s', (_name, text) => {
    expect(mockFences(text)).toEqual(runnerFences(text));
  });

  it('the cases reach every rule: a nested block, a longer fence, an early close, a block never closed, and none', () => {
    const read = CASES.map(([, text]) => runnerFences(text));
    expect(read.some((b) => b.some((x) => x.body.includes(`${T}bash`)))).toBe(true);
    expect(read.some((b) => b.some((x) => x.body.includes(`\n${T}\n`) && x.closed))).toBe(true);
    expect(read.some((b) => b.length > 1 && b.at(-1)!.lang === '')).toBe(true);
    expect(read.some((b) => b.some((x) => !x.closed))).toBe(true);
    expect(read.some((b) => b.length === 0)).toBe(true);
  });

  it.each(templates)('the template %s', (_name, text) => {
    expect(mockFences(text)).toEqual(runnerFences(text));
  });

  it('reads every template', () => {
    expect(templates.length).toBeGreaterThan(20);
    expect(templates.some(([, text]) => runnerFences(text).length > 0)).toBe(true);
  });
});
