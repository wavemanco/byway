/**
 * Reading what the mock needs out of a rendered prompt. Prompts are WP-P's templates, so the mock looks for a few
 * conventional markers and degrades gracefully: tagged sections (`<problem>…</problem>`), labelled lines
 * (`Problem: …`), fenced blocks, and finally the first substantial line.
 */

/** A top-level fenced block of a prompt. */
export interface Fenced {
  /** The info string's first word, lower case ('' for a bare fence). */
  lang: string;
  body: string;
  /** Offset of the opening fence line. */
  start: number;
  /** Offset just past the block's closing fence line (the end of the text when it was never closed). */
  end: number;
  closed: boolean;
}

/** A fence line: three or more backticks or tildes at the very start of a line, then an optional info string. */
const FENCE_LINE = /^(`{3,}|~{3,})(.*)$/;

/**
 * The prompt's top-level fenced blocks, read line by line by the rules of the runner's reader (packages/runner/src/
 * formats.ts fences, ENG-1), which this copies: the gateway cannot import the runner, which depends on it, and
 * scripts/test/fences-parity.test.ts holds the two to the same blocks. A slot can hold a document with fences of its own
 * (a README's code block), and a template's instructions name a fence in the middle of a line ("One fenced ```json
 * block"), so a block is not cut at the first ``` anywhere, as a lazy regex does:
 * - a fence is a line that starts with three or more backticks (or tildes); a fence in the middle of a line, or
 *   indented, is content;
 * - a block closes at the first later fence line of the same character, at least as long, with nothing after it
 *   (CommonMark), so a longer outer fence (````markdown) holds any shorter one;
 * - inside a block, a fence line with a language (```bash) opens a nested block that the next bare fence closes, so
 *   the outer block does not end at the inner one's close.
 * A block never closed runs to the end of the text.
 */
export function fences(text: string): Fenced[] {
  const out: Fenced[] = [];
  const stack: { char: string; len: number; lang: string; start: number; bodyStart: number }[] = [];
  let at = 0;
  for (const raw of text.split('\n')) {
    const lineStart = at;
    at += raw.length + 1;
    const m = FENCE_LINE.exec(raw.replace(/\r$/, ''));
    if (!m) continue;
    const run = m[1]!;
    const info = m[2]!.trim();
    // "```x```" on one line is inline code, not a fence (a backtick fence's info string has no backticks).
    if (run[0] === '`' && info.includes('`')) continue;
    const top = stack.at(-1);
    if (!top) {
      stack.push({ char: run[0]!, len: run.length, lang: (info.split(/\s+/)[0] ?? '').toLowerCase(), start: lineStart, bodyStart: Math.min(at, text.length) });
      continue;
    }
    if (!info && run[0] === top.char && run.length >= top.len) {
      stack.pop();
      if (!stack.length) {
        const body = text.slice(top.bodyStart, Math.max(top.bodyStart, lineStart - 1)).replace(/\r$/, '');
        out.push({ lang: top.lang, body, start: top.start, end: Math.min(at, text.length), closed: true });
      }
    } else if (info) {
      stack.push({ char: run[0]!, len: run.length, lang: '', start: lineStart, bodyStart: at });
    }
  }
  const open = stack[0];
  if (open) out.push({ lang: open.lang, body: text.slice(open.bodyStart).replace(/\n$/, ''), start: open.start, end: text.length, closed: false });
  return out;
}

/** Contents of every top-level fenced block of a language (```lang … ```), in order. */
export function fencedBlocks(text: string, langs: readonly string[]): string[] {
  return fences(text)
    .filter((b) => langs.includes(b.lang))
    .map((b) => b.body);
}

export function lastFenced(text: string, langs: readonly string[]): string | undefined {
  return fencedBlocks(text, langs).at(-1);
}

/** Text inside `<tag>…</tag>`, for the first tag present. */
export function tagged(text: string, tags: readonly string[]): string | undefined {
  for (const tag of tags) {
    const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i').exec(text); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- every caller passes constant lowercase tag names ('problem', 'questions', ...), never text from a person or a page
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return undefined;
}

/** Text after a `Label:` line, up to the next blank line. */
export function labelled(text: string, labels: readonly string[]): string | undefined {
  for (const label of labels) {
    const m = new RegExp(`^\\s*(?:#+\\s*)?${label}\\s*:\\s*(.*(?:\\n(?!\\s*\\n).*)*)`, 'im').exec(text); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- the only caller passes constant words ('Problem', 'Brief', ...), never text from a person or a page
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return undefined;
}

const INSTRUCTION = /^(you are|you're|write|return|answer|respond|output|use|do not|don't|follow|read|here is|below|the following|#|```|-|\*|\d+\.)/i;

/** The user's problem or brief, as best the mock can find it. */
export function subjectOf(prompt: string): string {
  const found =
    tagged(prompt, ['problem', 'brief', 'intent', 'direction', 'subject']) ??
    labelled(prompt, ['Problem', 'Brief', 'Intent', 'Direction', 'Subject', 'Task']);
  if (found) return oneLine(found);
  const line = prompt
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.split(/\s+/).length >= 4 && !INSTRUCTION.test(l));
  return oneLine(line ?? prompt);
}

export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** A complete HTML document anywhere in the text (fenced or bare). */
export function htmlDocument(text: string): string | undefined {
  const fenced = lastFenced(text, ['html']);
  if (fenced && /<html[\s>]/i.test(fenced)) return fenced.trim();
  const m = /<!doctype html[\s\S]*?<\/html>/i.exec(text);
  return m?.[0];
}

/** Image references a prompt hands the integrator: http(s) URLs to images, artifact routes and artifact ids. */
export function imageRefs(text: string): string[] {
  const refs = new Set<string>();
  const patterns = [
    /https?:\/\/[^\s"'<>)]+\.(?:png|jpe?g|webp|gif|avif)(?:\?[^\s"'<>)]*)?/gi,
    /(?:https?:\/\/[^\s"'<>)]+)?\/(?:api\/)?artifacts?\/[A-Za-z0-9:%._-]+/g,
  ];
  for (const re of patterns) for (const m of text.matchAll(re)) refs.add(m[0]);
  return [...refs];
}

/**
 * The images slot for a web page (spec §3.3 conventions): one `<id> | alt | slot` line per image. The id becomes its
 * artifact route, `/api/artifacts/<id>`; a line that already gives a route or an https URL keeps it.
 */
export function imageLines(text: string): { url: string; alt: string; slot: string }[] {
  const out: { url: string; alt: string; slot: string }[] = [];
  for (const m of text.matchAll(/^[ \t]*(?:[-*][ \t]+)?(\S+)[ \t]*\|[ \t]*([^|\n]*?)[ \t]*\|[ \t]*([^|\n]*?)[ \t]*$/gm)) {
    const ref = m[1] as string;
    const url = /^sha256:[0-9a-f]{64}$/i.test(ref) ? `/api/artifacts/${ref}` : /^(?:\/api\/artifacts\/|https:\/\/)\S+$/.test(ref) ? ref : undefined;
    if (url) out.push({ url, alt: (m[2] as string) || 'Image', slot: m[3] as string });
  }
  return out;
}

/** Candidate labels (A, B, C…) the prompt presents, in order of first appearance. */
export function labelsIn(text: string): string[] {
  const found = new Set<string>();
  const patterns = [
    // The shared convention (spec §3.3): each candidate under a "### A" heading in the options or view slot.
    /^#{1,6}[ \t]+([A-Z])[ \t]*$/gm,
    /\b(?:Candidate|Option|Draft|Version|Variant|Label|Page|Render)\s+([A-Z])\b/g,
    /^\s*(?:\*\*)?\[?([A-Z])(?:\]|\)|:|\.)(?:\*\*)?\s/gm,
    /<candidate[^>]*label="([A-Z])"/gi,
  ];
  for (const re of patterns) for (const m of text.matchAll(re)) if (m[1]) found.add(m[1].toUpperCase());
  return [...found].sort();
}

export interface LabelledItem {
  label: string;
  /** The text under the heading, up to the next heading. */
  text: string;
}

/**
 * Items under "### <label>" headings, in order: single letters (A, B, C…, the options shown) or, with `vanilla`, the
 * unseeded answers of an overlap step (V1, V2, V3…).
 */
export function labelledItems(text: string, vanilla = false): LabelledItem[] {
  const label = vanilla ? 'V\\d{1,2}' : '[A-Z]';
  const re = new RegExp(`^#{1,6}[ \\t]+(${label})[ \\t]*$`, 'gm');
  const heads = [...text.matchAll(re)];
  return heads.map((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const next = heads[i + 1]?.index ?? text.length;
    // The text runs to the next heading of any kind (a slot title, another list).
    const body = text.slice(start, next).split(/^#{1,6}[ \t]/m)[0] ?? '';
    return { label: m[1] as string, text: body.trim() };
  });
}

/** The text with every top-level fenced block removed, so a slot's plain words are read apart from the artifact. */
export function outsideFences(text: string): string {
  let out = '';
  let at = 0;
  for (const b of fences(text)) {
    out += text.slice(at, b.start);
    at = b.end;
  }
  return out + text.slice(at);
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** The deliverable named in a request ("a landing page for …", "a memo about …"), which a title should not repeat. */
const DELIVERABLE =
  /^(?:(?:single|one)[- ]page\s+|short\s+|quick\s+|new\s+)?(?:landing\s+page|web\s?page|website|web\s+site|homepage|home\s+page|site|page|memo|status\s+update|update|note|email|post|essay|piece|story|document|doc)\s+(?:for|about|on|introducing|announcing|to)\s+/i;

/**
 * A short title from free text: request phrasing and the named deliverable removed, first letter capitalized, cut at
 * a word boundary near 72 characters. "Build a landing page for a bakery that…" becomes "Bakery that…".
 */
export function titleFrom(subject: string, fallback: string): string {
  let s = oneLine(subject)
    .replace(/^(please\s+)?(can you\s+)?(i\s+(need|want|would like)\s+(you\s+to\s+)?|we\s+need\s+|help\s+me\s+(to\s+)?)/i, '')
    .replace(/^(build|make|create|design|write|draft|generate|produce|give me|come up with)\s+(me\s+)?/i, '')
    .replace(/^(a|an|the|some|my|our)\s+/i, '')
    .replace(DELIVERABLE, '')
    .replace(/^(a|an|the|some|my|our)\s+/i, '')
    .replace(/[.?!:;,]+$/, '');
  if (s.length > 72) s = `${s.slice(0, 72).replace(/\s+\S*$/, '')}`;
  if (!s) return fallback;
  return s[0]?.toUpperCase() + s.slice(1);
}
