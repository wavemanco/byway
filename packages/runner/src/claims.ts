/**
 * The claim log (03 C4; 01 VOICE step 6, "the human writes only claims they personally stand behind"): the owner
 * signs off every number, date, name and causal claim of a Markdown document, and their corrections replace the
 * claims where they stood (ENG-2). Pure.
 *
 * What counts as a claim (UX-5): a sentence with a digit, a number word, a weekday or month, a relative date, a
 * capitalised name after its first word, or a causal word. The list over-includes on purpose: missing a claim is the
 * failure that matters, since the prompt says "every". Sentences are read per paragraph, so one wrapped across lines
 * is one claim. Headings are claims too when they carry a fact (ENG-2): a corrected number must not survive in the
 * title or a section heading; a heading that is only a label ("Root cause", "Next Steps") is not offered. Code, link
 * definitions, comments (the demo's revision marker among them, UX-6) and rules are not claims. Each claim is offered
 * once, as "- " and the sentence, without the list, quote or heading marker it had in the document.
 */
import { fences, type Parsed } from './formats.ts';

/** A claim and where it stands in the document. */
export interface Claim {
  /** The sentence, whitespace squashed: what the owner is shown. */
  text: string;
  start: number;
  end: number;
}

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** An ATX heading's opening #s and the space after them: what a heading claim is offered without. */
const HEADING = /^\s{0,3}#{1,6}(?=\s|$)[ \t]*/;
/** Markdown comments ("[//]: # (…)", the demo's marker among them), link definitions, one-line HTML comments. */
const NOT_PROSE = /^\s*(?:\[[^\]]*\]:\s*\S|<!--.*-->\s*$)/;
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;
/** A setext heading's underline: it ends the paragraph above it and is not prose. */
const SETEXT = /^\s{0,3}(?:=+|-+)\s*$/;
const TABLE_ROW = /^\s*(?:>\s?)*\|/;
/** A line that starts a list item: a new paragraph, not the continuation of the one above. */
const LIST_ITEM = /^\s*(?:>\s?)*(?:[-*+]|\d+[.)])\s+/;
/** A line ending in a Markdown hard break (two spaces or a backslash). */
const HARD_BREAK = /(?: {2,}|\\)$/;
/** A line's list, task or quote marker: what the claim is offered without. */
const MARKER = /^\s*(?:>\s?)*(?:(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?/;
/** A continuation line's quote markers and indent. */
const CONTINUATION = /^\s*(?:>\s?)*\s*/;
/** A line left with nothing but its marker (a list or quote marker, or a heading's #s). */
const MARKER_ONLY = /^\s*(?:>\s*)*(?:(?:[-*+]|\d+[.)])\s*(?:\[[ xX]\]\s*)?|#{1,6}(?:\s+#*)?\s*)?$/;

const NUMBER_WORD =
  /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|dozen|half|twice|double|triple|quarter|percent)\b/i;
/** Weekdays and months, capitalised (May is left to the name rule: at a sentence start it is a verb more often). */
const CALENDAR = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\b/;
const RELATIVE =
  /\b(?:today|tomorrow|yesterday|tonight|(?:this|next|last|per|a|an|each|every)\s+(?:hour|day|week|month|quarter|year|sprint|morning|evening)|hourly|daily|weekly|monthly|quarterly|yearly|annually|deadline|overdue)\b/i;
const CAUSAL =
  /\b(?:because|therefore|thus|hence|due to|owing to|thanks to|as a result|so that|which means|this means|means that|leads? to|led to|caus(?:e|es|ed|ing)|result(?:s|ed|ing)? in|driven by|drives?|costs?|saves?|since)\b|,\s*so\b/i;

/** A capitalised word after the sentence's first (a name, a team, a product, an acronym), not right after a colon. */
function namesSomething(sentence: string): boolean {
  const words = sentence.replace(/[*_`]/g, '').split(/\s+/).filter(Boolean);
  return words.slice(1).some((w, i) => {
    if (words[i]!.endsWith(':')) return false;
    const bare = w.replace(/^[("'“‘[]+|[)"'”’\],.;:!?]+$/g, '');
    return bare !== 'I' && /^(?:[A-Z][a-z][\w'’-]*|[A-Z]{2,}[\w-]*)$/.test(bare);
  });
}

export const isClaim = (sentence: string): boolean =>
  /\d/.test(sentence) || NUMBER_WORD.test(sentence) || CALENDAR.test(sentence) || RELATIVE.test(sentence) || CAUSAL.test(sentence) || namesSomething(sentence);

/** The sentences of a text, with their offsets in it. */
function sentences(text: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  const push = (s: number, e: number) => {
    const raw = text.slice(s, e);
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed) out.push({ text: trimmed, start: s + lead, end: s + lead + trimmed.length });
  };
  const sep = /(?<=[.!?][)"'”’*_\]]*)\s+/g;
  let start = 0;
  for (let m = sep.exec(text); m; m = sep.exec(text)) {
    push(start, m.index);
    start = m.index + m[0].length;
  }
  push(start, text.length);
  return out;
}

/** One line's prose inside a paragraph: its text and where that text starts in the document. */
interface Piece {
  at: number;
  text: string;
}

/**
 * A heading is a claim when it carries a fact: a number or a date always; a name or a cause once it says more than a
 * label of one or two words ("Root cause" and "Next Steps" are labels, "Outage at Acme" is a claim).
 */
function isHeadingClaim(text: string): boolean {
  if (/\d/.test(text) || NUMBER_WORD.test(text) || CALENDAR.test(text) || RELATIVE.test(text)) return true;
  return text.split(/\s+/).length > 2 && isClaim(text);
}

/** The document's claims, in order, each with where it stands. */
export function claimsOf(markdown: string): Claim[] {
  const code = fences(markdown).map((b) => [b.start, b.end] as const);
  const out: Claim[] = [];
  // The paragraph being read: a sentence wrapped across its lines is one claim (ENG-2).
  let para: Piece[] = [];
  let paraQuote = 0;
  const flush = () => {
    if (!para.length) return;
    // The lines' prose joined by one space, and where each character of it stands in the document.
    let joined = '';
    const pos: number[] = [];
    for (const [i, p] of para.entries()) {
      if (i) {
        joined += ' ';
        pos.push(para[i - 1]!.at + para[i - 1]!.text.length);
      }
      joined += p.text;
      for (let k = 0; k < p.text.length; k++) pos.push(p.at + k);
    }
    for (const s of sentences(joined)) if (isClaim(s.text)) out.push({ text: squash(s.text), start: pos[s.start]!, end: pos[s.end - 1]! + 1 });
    para = [];
  };
  let at = 0;
  let inComment = false;
  for (const raw of markdown.split('\n')) {
    const lineStart = at;
    at += raw.length + 1;
    const line = raw.replace(/\r$/, '');
    if (code.some(([s, e]) => lineStart >= s && lineStart < e)) {
      flush();
      continue;
    }
    if (inComment) {
      inComment = !line.includes('-->');
      continue;
    }
    if (/^\s*<!--/.test(line) && !line.includes('-->')) {
      flush();
      inComment = true;
      continue;
    }
    if (!line.trim() || NOT_PROSE.test(line) || RULE.test(line) || TABLE_RULE.test(line) || SETEXT.test(line)) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      // The heading's words, without its opening #s or a closing run of #s.
      const start = heading[0].length;
      const end = line.replace(/(?:[ \t]+#+)?[ \t]*$/, '').length;
      const text = start < end ? line.slice(start, end) : '';
      if (text && isHeadingClaim(text)) out.push({ text: squash(text), start: lineStart + start, end: lineStart + end });
      continue;
    }
    const quote = (/^\s*((?:>\s?)*)/.exec(line)?.[1] ?? '').split('>').length - 1;
    // A list item, a table row, or a change of quote starts a new paragraph; any other line continues the one before.
    const row = TABLE_ROW.test(line);
    if (para.length && (row || LIST_ITEM.test(line) || quote !== paraQuote)) flush();
    const lead = para.length ? (CONTINUATION.exec(line)?.[0].length ?? 0) : (MARKER.exec(line)?.[0].length ?? 0);
    if (!para.length) paraQuote = quote;
    para.push({ at: lineStart + lead, text: line.slice(lead) });
    // A table row stands alone, and so does a line ending in a hard break: the line break is kept, so is the claim.
    if (row || HARD_BREAK.test(line)) flush();
  }
  flush();
  return out;
}

/** The claim-log checkpoint's text: one "- " line per claim. */
export const claimLines = (markdown: string): string =>
  claimsOf(markdown)
    .map((c) => `- ${c.text}`)
    .join('\n');

/** A sentence taken out of its line, with the space beside it; a list item left empty goes with it. */
function removeSentence(text: string, start: number, end: number): string {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nl = text.indexOf('\n', end);
  const lineEnd = nl < 0 ? text.length : nl;
  let s = start;
  let e = end;
  const after = /^[ \t]+/.exec(text.slice(e, lineEnd))?.[0].length ?? 0;
  if (after) e += after;
  else s -= /[ \t]+$/.exec(text.slice(lineStart, s))?.[0].length ?? 0;
  const rest = text.slice(lineStart, s) + text.slice(e, lineEnd);
  if (MARKER_ONLY.test(rest)) return text.slice(0, lineStart) + text.slice(Math.min(text.length, lineEnd + 1));
  return text.slice(0, s) + text.slice(e);
}

/**
 * Write the owner's answer back: line i of the answer is claim i, with or without its "- ". A changed line replaces
 * its sentence where it stood; a line emptied to a bare "-" takes the claim out; blank lines are spacing. Anything
 * else in the document stays exactly as it was. An answer with more or fewer lines than claims cannot be placed line
 * by line, so it is refused with what to do.
 */
export function applyClaims(markdown: string, answer: string): Parsed<{ text: string; changed: string[] }> {
  const claims = claimsOf(markdown);
  const lines = answer
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim());
  if (lines.length !== claims.length) {
    return {
      ok: false,
      problem: `The list has ${claims.length} claims, one line per claim, and your answer has ${lines.length} lines. Keep one line per claim, in the same order: correct a claim on its own line, or empty its line (leave just "-") to take that claim out.`,
    };
  }
  const answers = lines.map((l) => squash(l.replace(/^\s*[-*+•](?:\s+|$)/, '')));
  let text = markdown;
  const changed: string[] = [];
  for (let i = claims.length - 1; i >= 0; i--) {
    const claim = claims[i]!;
    const next = answers[i]!;
    if (next === claim.text) continue;
    changed.unshift(next);
    text = next ? text.slice(0, claim.start) + next + text.slice(claim.end) : removeSentence(text, claim.start, claim.end);
  }
  return { ok: true, value: { text, changed } };
}
