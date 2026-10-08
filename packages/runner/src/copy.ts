/**
 * VOICE (01 VOICE, spec §3.2): a human writes every reader-facing line. The runner extracts the copy from the
 * artifact for a `write` checkpoint, writes the edited copy back without touching anything else, and checks that the
 * person's lines arrived verbatim. The same extraction holds later machine writes to the person's words (keepsVoice).
 *
 * - web-page: one line per block of visible text, in reading order. Written back by `helper.voice.apply`, checked by a
 *   diff (only text changed, every line verbatim); when the model's write fails the check and the lines map one to one,
 *   the runner places them itself, which the same check then verifies.
 * - prose: the whole Markdown document; the edited text becomes the artifact.
 * - options: each option's title, pitch and rationale under its label.
 * - media: the voice-over script.
 * - code-diff: the "Why:" paragraph.
 * Structured media map lines to fields, so they are written back exactly, with no model call.
 */
import type { Medium } from '@byway/contracts';
import { joinCodeDiff, parseOptions, parseStoryboard, serializeJson, splitCodeDiff, type Parsed } from './formats.ts';
import { labelOf } from '@byway/prompts/pure';

// ---- HTML tokens -------------------------------------------------------------------------------------------------

type Token = { kind: 'tag'; raw: string; name: string; closing: boolean } | { kind: 'text'; raw: string } | { kind: 'other'; raw: string };

const RAW_TEXT = new Set(['script', 'style', 'noscript', 'template', 'textarea']);
/** Formatting that sits inside a line of text; any other tag ends the line. */
const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr']);

export function tokenize(html: string): Token[] {
  const out: Token[] = [];
  const re = /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>|[^<]+|</g;
  let rawUntil: string | undefined;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[0];
    if (rawUntil) {
      // Inside <script>, <style>…: everything up to the matching close tag is opaque.
      const close = html.toLowerCase().indexOf(`</${rawUntil}`, m.index);
      const end = close < 0 ? html.length : close;
      if (end > m.index) out.push({ kind: 'other', raw: html.slice(m.index, end) });
      re.lastIndex = end;
      rawUntil = undefined;
      continue;
    }
    if (m[1]) {
      const name = m[1].toLowerCase();
      const closing = raw.startsWith('</');
      out.push({ kind: 'tag', raw, name, closing });
      if (!closing && RAW_TEXT.has(name) && !raw.endsWith('/>')) rawUntil = name;
    } else if (raw.startsWith('<!') || raw === '<') {
      out.push(raw === '<' ? { kind: 'text', raw } : { kind: 'other', raw });
    } else {
      out.push({ kind: 'text', raw });
    }
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', middot: '·' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

const escapeText = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const squash = (text: string): string => text.replace(/\s+/g, ' ').trim();

interface CopyLine {
  text: string;
  /** Indices of the text tokens that make up the line. */
  tokens: number[];
}

/** Lines of visible copy: text runs split at every non-inline tag, outside <head> except the <title>. */
function copyLines(tokens: Token[]): CopyLine[] {
  const lines: CopyLine[] = [];
  let current: CopyLine = { text: '', tokens: [] };
  let inHead = false;
  let inTitle = false;
  const flush = () => {
    const text = squash(current.text);
    if (text) lines.push({ text, tokens: current.tokens });
    current = { text: '', tokens: [] };
  };
  tokens.forEach((t, i) => {
    if (t.kind === 'tag') {
      if (t.name === 'head') inHead = !t.closing;
      if (t.name === 'title') inTitle = !t.closing;
      if (!INLINE.has(t.name)) flush();
      return;
    }
    if (t.kind !== 'text' || (inHead && !inTitle)) return;
    current.text += decodeEntities(t.raw);
    current.tokens.push(i);
  });
  flush();
  return lines;
}

/** The page's visible copy, one line per block, in reading order. */
export const pageCopy = (html: string): string[] => copyLines(tokenize(html)).map((l) => l.text);

/** The page with its text removed: tags and everything opaque, in order. Two pages with equal skeletons differ only in text. */
export function skeleton(html: string): string {
  return tokenize(html)
    .filter((t) => t.kind !== 'text')
    .map((t) => (t.kind === 'tag' ? t.raw.replace(/\s+/g, ' ') : t.raw.trim()))
    .join('\n');
}

/**
 * Place edited copy into the page line by line: each changed line's text goes into its first text token and the
 * line's other text tokens are emptied, so every tag stays where it was. Needs the same number of lines.
 */
export function placePageCopy(html: string, edited: readonly string[]): Parsed<string> {
  const tokens = tokenize(html);
  const lines = copyLines(tokens);
  if (edited.length !== lines.length) {
    return { ok: false, problem: `The page has ${lines.length} lines of copy and the edit has ${edited.length}, so they cannot be placed line by line.` };
  }
  const raws = tokens.map((t) => t.raw);
  lines.forEach((line, i) => {
    const next = squash(edited[i] ?? '');
    if (next === line.text) return;
    line.tokens.forEach((ti, k) => {
      const raw = raws[ti] ?? '';
      if (k === 0) {
        const lead = /^\s*/.exec(raw)?.[0] ?? '';
        const trail = /\s*$/.exec(raw)?.[0] ?? '';
        raws[ti] = `${lead}${escapeText(next)}${trail}`;
      } else {
        raws[ti] = '';
      }
    });
  });
  return { ok: true, value: raws.join('') };
}

/** Problems with a VOICE write-back on a page: anything but text changed, or a line of the person's is missing. */
export function pageVoiceProblems(before: string, after: string, edited: readonly string[]): string[] {
  const problems: string[] = [];
  if (skeleton(before) !== skeleton(after)) problems.push('The page changed beyond its text: keep every tag and attribute exactly as it was.');
  const have = new Set(pageCopy(after));
  const missing = edited.map(squash).filter((l) => l && !have.has(l));
  if (missing.length) problems.push(`These lines must appear exactly as written: ${missing.map((l) => `"${l.slice(0, 80)}"`).join('; ')}.`);
  return problems;
}

// ---- Per medium ---------------------------------------------------------------------------------------------------

const splitLines = (text: string): string[] => text.replace(/\r\n/g, '\n').split('\n');

/** The copy a `write` checkpoint offers for VOICE. */
export function extractCopy(medium: Medium, artifact: string): string {
  switch (medium) {
    case 'web-page':
      return pageCopy(artifact).join('\n');
    case 'prose':
      return artifact.trimEnd();
    case 'options': {
      const r = parseOptions(artifact);
      if (!r.ok) return '';
      return r.value.options.map((o, i) => `### ${labelOf(i)}\nTitle: ${o.title}\nPitch: ${o.pitch}\nRationale: ${o.rationale}`).join('\n\n');
    }
    case 'media': {
      const r = parseStoryboard(artifact);
      return r.ok ? r.value.voiceover.trim() : '';
    }
    case 'code-diff':
      return splitCodeDiff(artifact).why;
  }
}

/** Parse "### A / Title: / Pitch: / Rationale:" blocks back into fields. */
function parseOptionCopy(text: string, count: number): Parsed<{ title: string; pitch: string; rationale: string }[]> {
  const blocks = text.split(/^###[ \t]+/m).slice(1);
  if (blocks.length !== count) return { ok: false, problem: `Keep one "### A" block per option (${count}).` };
  const out: { title: string; pitch: string; rationale: string }[] = [];
  for (const [i, block] of blocks.entries()) {
    const lines = splitLines(block);
    if (lines[0]?.trim() !== labelOf(i)) return { ok: false, problem: `Keep the options in order under their labels (expected ${labelOf(i)}).` };
    const field = (name: string) => {
      const at = lines.findIndex((l) => l.startsWith(`${name}:`));
      if (at < 0) return undefined;
      const rest = [lines[at]!.slice(name.length + 1)];
      for (const l of lines.slice(at + 1)) {
        if (/^(Title|Pitch|Rationale):/.test(l)) break;
        rest.push(l);
      }
      return rest.join('\n').trim();
    };
    const title = field('Title');
    const pitch = field('Pitch');
    const rationale = field('Rationale');
    if (!title || !pitch || !rationale) return { ok: false, problem: `Option ${labelOf(i)} needs a Title:, a Pitch: and a Rationale: line.` };
    out.push({ title, pitch, rationale });
  }
  return { ok: true, value: out };
}

/**
 * Write edited copy back into a structured or text artifact exactly (prose, options, media, code-diff). Web pages are
 * not handled here: they go through `helper.voice.apply` and {@link pageVoiceProblems}.
 */
export function applyCopy(medium: Exclude<Medium, 'web-page'>, artifact: string, edited: string): Parsed<string> {
  switch (medium) {
    case 'prose':
      return edited.trim() ? { ok: true, value: `${edited.trimEnd()}\n` } : { ok: false, problem: 'The text is empty.' };
    case 'options': {
      const doc = parseOptions(artifact);
      if (!doc.ok) return doc;
      const fields = parseOptionCopy(edited, doc.value.options.length);
      if (!fields.ok) return fields;
      return { ok: true, value: serializeJson({ options: doc.value.options.map((o, i) => ({ ...o, ...fields.value[i] })) }) };
    }
    case 'media': {
      const sb = parseStoryboard(artifact);
      if (!sb.ok) return sb;
      return { ok: true, value: serializeJson({ ...sb.value, voiceover: edited.trim() }) };
    }
    case 'code-diff': {
      const why = edited.trim();
      if (!why) return { ok: false, problem: 'The "Why:" paragraph is empty.' };
      return { ok: true, value: joinCodeDiff({ diff: splitCodeDiff(artifact).diff, why: why.startsWith('Why:') ? why : `Why: ${why}` }) };
    }
  }
}

/**
 * The person's words a machine write must keep (keepsVoice, port rule 6): every non-empty line of their copy must still
 * be in the artifact's copy. With `before` (the artifact the write started from), only the lines that were there count:
 * a write may not remove the person's words, but it is not asked to add words that were never placed (a copy deck
 * handed in before any VOICE step, say). Returns the lines that went missing.
 */
export function lostVoiceLines(medium: Medium, artifact: string, voice: string, before?: string): string[] {
  const copyOf = (text: string) => squash(medium === 'web-page' ? pageCopy(text).join('\n') : extractCopy(medium, text));
  const now = copyOf(artifact);
  const was = before === undefined ? undefined : copyOf(before);
  return splitLines(voice)
    .map(squash)
    .filter((l) => l && !/^###\s/.test(l))
    .filter((l) => {
      const bare = l.replace(/^(Title|Pitch|Rationale):\s*/, '');
      return (was === undefined || was.includes(bare)) && !now.includes(bare);
    });
}

/** Sentences that carry numbers, dates or other checkable claims, for a claim-log sign-off (03 C4). */
export function claimLines(markdown: string): string {
  const sentences = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(squash)
    .filter((s) => /\d/.test(s) && !s.startsWith('#'));
  return sentences.map((s) => `- ${s}`).join('\n');
}
