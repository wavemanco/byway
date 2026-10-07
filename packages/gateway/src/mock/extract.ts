/**
 * Reading what the mock needs out of a rendered prompt. Prompts are WP-P's templates, so the mock looks for a few
 * conventional markers and degrades gracefully: tagged sections (`<problem>…</problem>`), labelled lines
 * (`Problem: …`), fenced blocks, and finally the first substantial line.
 */

/** Contents of every fenced block of a language (```lang … ```), in order. */
export function fencedBlocks(text: string, langs: readonly string[]): string[] {
  const out: string[] = [];
  const re = /```([A-Za-z0-9_-]*)[^\n]*\n([\s\S]*?)\n?```/g;
  for (const m of text.matchAll(re)) {
    if (langs.includes((m[1] ?? '').toLowerCase())) out.push(m[2] ?? '');
  }
  return out;
}

export function lastFenced(text: string, langs: readonly string[]): string | undefined {
  return fencedBlocks(text, langs).at(-1);
}

/** Text inside `<tag>…</tag>`, for the first tag present. */
export function tagged(text: string, tags: readonly string[]): string | undefined {
  for (const tag of tags) {
    const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i').exec(text);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return undefined;
}

/** Text after a `Label:` line, up to the next blank line. */
export function labelled(text: string, labels: readonly string[]): string | undefined {
  for (const label of labels) {
    const m = new RegExp(`^\\s*(?:#+\\s*)?${label}\\s*:\\s*(.*(?:\\n(?!\\s*\\n).*)*)`, 'im').exec(text);
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

/** Candidate labels (A, B, C…) the prompt presents, in order of first appearance. */
export function labelsIn(text: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /\b(?:Candidate|Option|Draft|Version|Variant|Label|Page|Render)\s+([A-Z])\b/g,
    /^\s*(?:\*\*)?\[?([A-Z])(?:\]|\)|:|\.)(?:\*\*)?\s/gm,
    /<candidate[^>]*label="([A-Z])"/gi,
  ];
  for (const re of patterns) for (const m of text.matchAll(re)) if (m[1]) found.add(m[1].toUpperCase());
  return [...found].sort();
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
