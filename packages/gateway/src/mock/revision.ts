/**
 * Demo revision markers (demo mode only). The mock's own prose and code-diff answers carry an invisible marker that
 * counts their revisions: a builder or seed writes revision 1, each fix writes the revision it was given plus one, and
 * helpers that pass the work through (asset.integrate) keep it as it is. The mock's GREAT critic reads
 * the markers to rank a revised item higher (see lineup.ts), so a demo rank loop converges the way a real one should
 * when the fixes work. Nothing outside the mock reads them, and no real model ever sees one.
 *
 * - Prose: a Markdown comment line, `[//]: # (byway-demo-revision: N)`, which no Markdown renderer shows.
 * - Code diffs: an HTML comment line, `<!-- byway-demo-revision: N -->`, inside the "Why:" paragraph (the runner keeps
 *   that paragraph whole, and nothing in the diff itself changes).
 * - Web pages already carry `<meta name="byway-revision">` from earlier fixes; a critic sees pages as screenshots, so the
 *   ranking uses what is new in the attachments instead (lineup.ts).
 * - Options and storyboards carry none: the runner parses them into their contract shape (spec §3.3) before a critic
 *   sees them, which would drop an extra JSON field, and the contract allows none.
 */

const MARK = /byway-demo-revision:\s*(\d+)/g;
const PROSE_MARK_LINE = /^[ \t]*\[\/\/\]: # \(byway-demo-revision:\s*\d+\)[ \t]*\n?/gm;
const HTML_MARK_LINE = /^[ \t]*<!-- byway-demo-revision:\s*\d+ -->[ \t]*\n?/gm;

/** The highest revision marked in the text, or undefined when it carries none. */
export function revisionOf(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const found = [...text.matchAll(MARK)].map((m) => Number(m[1]));
  return found.length ? Math.max(...found) : undefined;
}

/** The text without any revision marker line. */
export function withoutMarks(text: string): string {
  return text.replace(PROSE_MARK_LINE, '').replace(HTML_MARK_LINE, '');
}

/** A Markdown document marked as revision n (any earlier marker replaced). */
export function markProse(markdown: string, n: number): string {
  return `${withoutMarks(markdown).trimEnd()}\n\n[//]: # (byway-demo-revision: ${n})`;
}

/** A code-diff answer (fenced diff, then "Why:" paragraph) marked as revision n at the end of its Why paragraph. */
export function markDiffAnswer(answer: string, n: number): string {
  return `${withoutMarks(answer).trimEnd()}\n<!-- byway-demo-revision: ${n} -->`;
}

/** The revision a turn writes: 1 for new work, the given work's revision plus one for a fix, unchanged otherwise. */
export function nextRevision(role: string, given: string | undefined): number | undefined {
  if (role === 'build' || role === 'seed' || role === 'asset') return 1;
  if (role === 'fix') return (revisionOf(given) ?? 1) + 1;
  return revisionOf(given);
}
