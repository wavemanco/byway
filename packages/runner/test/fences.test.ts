/**
 * ENG-1: fenced answers whose content holds fences of its own. The templates ask for "one fenced ```markdown block"
 * (and a longer fence when the content holds a run of backticks); a document with a code block, or a diff that adds
 * one, must come through whole or be refused (so the model is asked again), never cut short and accepted.
 */
import { describe, expect, it } from 'vitest';
import { fences, parseArtifact, parseCodeDiff, parseHtml, parseMarkdown } from '../src/formats.ts';
import { parseTellsSweep } from '../src/parse.ts';

const T = '```';

const DOC = ['# Fix the invoice rounding', '', 'Run the formatter tests before merging:', '', `${T}bash`, 'pnpm vitest run packages/invoices', T, '', 'Decision needed: approve by Friday.'].join('\n');

describe('fences, line by line', () => {
  it('reads a block that holds a fenced block with a language as one block', () => {
    const blocks = fences(`Here it is.\n\n${T}markdown\n${DOC}\n${T}\n`);
    expect(blocks.map((b) => b.lang)).toEqual(['markdown']);
    expect(blocks[0]!.body).toBe(DOC);
  });

  it('closes a longer fence only at a fence at least as long, so shorter fences inside are content', () => {
    const blocks = fences(`Here is the PR description.\n\n\`\`\`\`markdown\n${DOC}\n\`\`\`\`\n`);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ lang: 'markdown', body: DOC, closed: true });
  });

  it('never takes a diff line that adds a fence for a fence', () => {
    const blocks = fences(`${T}diff\n--- a/README.md\n+++ b/README.md\n@@ -1,1 +1,4 @@\n # Invoices\n+${T}bash\n+pnpm test\n+${T}\n${T}\n\nWhy: document the test command.`);
    expect(blocks.map((b) => b.lang)).toEqual(['diff']);
    expect(blocks[0]!.body.split('\n')).toHaveLength(7);
  });

  it('does not take inline code that opens and closes on one line for a fence', () => {
    expect(fences(`Use ${T}x${T} here.\n${T}json\n{}\n${T}`).map((b) => b.lang)).toEqual(['json']);
  });

  it('reads tilde fences too', () => {
    expect(fences(`~~~markdown\n# T\n${T}js\nx\n${T}\n~~~`)).toMatchObject([{ lang: 'markdown', body: `# T\n${T}js\nx\n${T}` }]);
  });
});

describe('artifact parsers with nested fences (ENG-1)', () => {
  it('keeps a Markdown document whole when it holds a code block', () => {
    expect(parseMarkdown(`${T}markdown\n${DOC}\n${T}`)).toEqual({ ok: true, value: `${DOC}\n` });
  });

  it('takes a 4-backtick outer fence without its preamble or fence lines', () => {
    const r = parseMarkdown(`Here is the PR description.\n\n\`\`\`\`markdown\n${DOC}\n\`\`\`\`\n`);
    expect(r).toEqual({ ok: true, value: `${DOC}\n` });
  });

  it('refuses an answer with fences but no markdown block, instead of storing the whole answer', () => {
    const r = parseMarkdown(`Here is the document.\n\n${T}bash\nnpm test\n${T}\n`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toMatch(/markdown/);
  });

  it('refuses a markdown block that a bare fence inside it closed early', () => {
    // The document's own bare code block closes a 3-backtick outer fence (CommonMark); what follows is not the doc.
    const r = parseMarkdown(`${T}markdown\n# Doc\n\nRun:\n${T}\nnpm test\n${T}\n\nThe ask.\n${T}`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toMatch(/longer fence/);
  });

  it('still reads a document with no fence at all as the whole answer', () => {
    expect(parseMarkdown('# T\n\nBody')).toEqual({ ok: true, value: '# T\n\nBody\n' });
  });

  it('keeps a diff whose added lines hold a fence, and reads the Why after the block it came from', () => {
    const diff = `--- a/README.md\n+++ b/README.md\n@@ -1,1 +1,4 @@\n # Invoices\n+${T}bash\n+pnpm test\n+${T}`;
    const r = parseCodeDiff(`${T}diff\n${diff}\n${T}\n\nWhy: document the test command.`);
    expect(r).toEqual({ ok: true, value: { diff, why: 'Why: document the test command.' } });
  });

  it('reads a diff in a 4-backtick fence without the preamble or fence lines', () => {
    const diff = '--- a/x.ts\n+++ b/x.ts\n@@ -1,1 +1,1 @@\n-a\n+b';
    const r = parseCodeDiff(`Here is the change.\n\n\`\`\`\`diff\n${diff}\n\`\`\`\`\n\nWhy: shorter.`);
    expect(r).toEqual({ ok: true, value: { diff, why: 'Why: shorter.' } });
  });

  it('keeps a page whose own <pre> holds fenced code', () => {
    const page = `<!doctype html>\n<html><body><pre>\n${T}bash\nnpx thing\n${T}\n</pre><p>Try it.</p></body></html>`;
    const r = parseHtml(`${T}html\n${page}\n${T}`);
    expect(r).toEqual({ ok: true, value: page });
    // A bare fence line inside the page closes a 3-backtick outer fence early; the whole document is still found.
    const bare = `<!doctype html>\n<html><body><pre>\n${T}\nnpx thing\n${T}\n</pre></body></html>`;
    expect(parseArtifact('web-page', `${T}html\n${bare}\n${T}`)).toEqual({ ok: true, value: bare });
  });

  it('reads JSON from an unlabelled fence (JSON.parse is the check)', () => {
    expect(parseTellsSweep(`${T}\n{"hits":[]}\n${T}`)).toMatchObject({ ok: true });
  });
});
