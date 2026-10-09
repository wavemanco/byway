/**
 * The page tokenizer every copy reader shares (ADR-0081). It reads a page the way a browser's tokenizer does where
 * that decides what a person sees as copy, without building the tree:
 * - a tag ends where WHATWG ends it: quotes delimit attribute values only, so `title="a > b"` does not end the tag; a
 *   stray quote in a name or an unquoted value is part of it; input that ends inside a tag is opaque;
 * - comments end at "-->" or "--!>"; "<!-->" is empty; "</>" is dropped; "</" before a non-letter starts a bogus
 *   comment; "<" before anything but a letter, "!", "/" or "?" is text;
 * - script, style, noscript, template, iframe, xmp, noembed, noframes and textarea are opaque up to their end tag
 *   (textarea is RCDATA, but its default value is not offered); a script's "<!--" escapes are followed, so a
 *   "</script>" inside a script comment that opened a "<script" string does not end it; plaintext is opaque to the
 *   end of the input; "/>" on these is ignored in HTML content, as browsers ignore it;
 * - <title> is RCDATA: one text token, decoded and offered;
 * - inside an open <svg> or <math>, "<![CDATA[" up to "]]>" is one opaque token; elsewhere it is a bogus comment.
 * Character references are decoded by parse-entities with browser rules: total, never throws, U+FFFD for references
 * out of range. parse-entities switches to DOM decoding under the "browser" export condition, so this module must
 * never be bundled for a browser or the workflow sandbox.
 */
import { parseEntities } from 'parse-entities';

/**
 * A tag's `selfClosing` is WHATWG's self-closing flag: a "/" right before the ">", outside any value (so `href=/shop/`
 * does not set it). `foreign` marks a tag read inside an open <svg> or <math>. Readers decide what the flag does:
 * browsers honour it on void elements, on <svg> and <math>, and inside them, and ignore it on other HTML elements.
 * Both are absent rather than false, so token lists compare as before.
 */
export type Token = { kind: 'tag'; raw: string; name: string; closing: boolean; selfClosing?: true; foreign?: true } | { kind: 'text'; raw: string } | { kind: 'other'; raw: string };

/** Opaque up to their end tag: raw text, or RCDATA the deck does not offer (textarea's default value). */
const RAW_TEXT = new Set(['script', 'style', 'noscript', 'template', 'textarea', 'iframe', 'xmp', 'noembed', 'noframes']);
/** RCDATA the deck offers: its content is one text token (references decoded, no tags). */
const RCDATA_TEXT = new Set(['title']);

/** HTML whitespace (a no-break space is text, not whitespace). */
export const isHtmlSpace = (c: string | undefined): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r';
const isAlpha = (c: string | undefined): boolean => !!c && /[A-Za-z]/.test(c);
/** What may follow an end tag's name for it to end raw text: whitespace, "/" or ">" (or the end of the input). */
const endsName = (c: string | undefined): boolean => c === undefined || isHtmlSpace(c) || c === '/' || c === '>';
/** `h` has `word` at `at`, ignoring ASCII case. */
const hasAt = (h: string, at: number, word: string): boolean => h.length >= at + word.length && h.slice(at, at + word.length).toLowerCase() === word;

/** Text of HTML whitespace collapsed to one space, trimmed. */
export const squashHtml = (t: string): string => t.replace(/[ \t\n\f\r]+/g, ' ').replace(/^ | $/g, '');
/** Text without any HTML whitespace. */
export const noHtmlSpace = (t: string): string => t.replace(/[ \t\n\f\r]+/g, '');
/** Decode character references as a browser does in text (total; never throws). */
export const decodeText = (raw: string): string => parseEntities(raw);
/** Text written into a page: the three characters that could start markup or a reference, escaped. */
export const escapeText = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One attribute of a tag, as the tokenizer reads it. Values are decoded; a name with no value has ''. */
export interface Attribute {
  name: string;
  value: string;
}

/**
 * Walk a tag from its name at `i`: the index just past the ">" that ends it (`end`, or -1 when the input ends inside
 * the tag), whether its self-closing flag is set, and its attributes. The one scanner for tag ends and attribute
 * values.
 */
function scanTag(h: string, i: number, attrs?: Attribute[]): { end: number; selfClosing: boolean } {
  const cut = { end: -1, selfClosing: false }; // the input ends inside the tag
  let k = i;
  while (k < h.length && !isHtmlSpace(h[k]) && h[k] !== '/' && h[k] !== '>') k++; // tag name
  for (;;) {
    const from = k;
    while (k < h.length && (isHtmlSpace(h[k]) || h[k] === '/')) k++; // before attribute name (and a self-closing "/")
    if (k >= h.length) return cut;
    // The flag is set only by a "/" this state read itself, right before ">": never one that ended a value.
    if (h[k] === '>') return { end: k + 1, selfClosing: k > from && h[k - 1] === '/' };
    const nameAt = k;
    k++; // an attribute name's first character may be anything, "=" and quotes included
    while (k < h.length && !isHtmlSpace(h[k]) && h[k] !== '/' && h[k] !== '>' && h[k] !== '=') k++;
    const name = h.slice(nameAt, k).toLowerCase();
    while (k < h.length && isHtmlSpace(h[k])) k++; // after attribute name
    if (k >= h.length) return cut;
    if (h[k] !== '=') {
      attrs?.push({ name, value: '' });
      continue;
    }
    k++;
    while (k < h.length && isHtmlSpace(h[k])) k++; // before attribute value
    if (k >= h.length) return cut;
    const q = h[k];
    let value = '';
    if (q === '"' || q === "'") {
      const close = h.indexOf(q, k + 1);
      if (close < 0) return cut;
      value = h.slice(k + 1, close);
      k = close + 1;
    } else if (q === '>') {
      attrs?.push({ name, value: '' });
      return { end: k + 1, selfClosing: false };
    } else {
      const valueAt = k;
      while (k < h.length && !isHtmlSpace(h[k]) && h[k] !== '>') k++; // unquoted value
      value = h.slice(valueAt, k);
    }
    attrs?.push({ name, value: parseEntities(value, { attribute: true }) });
  }
}

/** A start or end tag's attributes, read with the tokenizer's own scanner. */
export function attributesOf(raw: string): Attribute[] {
  const attrs: Attribute[] = [];
  const at = raw.startsWith('</') ? 2 : 1;
  scanTag(raw, at, attrs);
  return attrs;
}

/**
 * Where raw text started at `from` ends: the "</name" (then whitespace, "/" or ">") that closes it. Only an HTML
 * script follows the script data escapes; inside <svg> or <math> a script is not raw text in browsers, and the plain
 * search is the closest fail-closed reading there.
 */
function rawTextEnd(h: string, from: number, name: string, html: boolean): number {
  if (name === 'script' && html) return scriptDataEnd(h, from);
  let at = from;
  for (;;) {
    at = h.indexOf('</', at);
    if (at < 0) return h.length;
    if (hasAt(h, at + 2, name) && endsName(h[at + 2 + name.length])) return at;
    at += 2;
  }
}

/**
 * Where a script's content ends, following WHATWG's script data states: "<!--" escapes, inside which "<script" opens
 * a double escape where "</script>" does not end the element, until "-->" or the double escape closes.
 */
function scriptDataEnd(h: string, from: number): number {
  type State = 'data' | 'escaped' | 'escapedDash' | 'escapedDashDash' | 'double' | 'doubleDash' | 'doubleDashDash';
  let s: State = 'data';
  const endTagAt = (k: number) => h[k] === '<' && h[k + 1] === '/' && hasAt(h, k + 2, 'script') && endsName(h[k + 8]);
  let k = from;
  while (k < h.length) {
    const c = h[k];
    switch (s) {
      case 'data':
        if (endTagAt(k)) return k;
        if (h.startsWith('<!--', k)) {
          s = 'escapedDashDash';
          k += 4;
          continue;
        }
        k++;
        continue;
      case 'escaped':
      case 'escapedDash':
      case 'escapedDashDash':
        if (c === '-') s = s === 'escaped' ? 'escapedDash' : 'escapedDashDash';
        else if (c === '<') {
          if (endTagAt(k)) return k;
          if (hasAt(h, k + 1, 'script') && endsName(h[k + 7]) && h[k + 7] !== undefined) {
            s = 'double';
            k += 7;
            continue;
          }
          s = 'escaped';
        } else if (c === '>' && s === 'escapedDashDash') s = 'data';
        else s = 'escaped';
        k++;
        continue;
      default:
        if (c === '-') s = s === 'double' ? 'doubleDash' : 'doubleDashDash';
        else if (c === '<' && h[k + 1] === '/' && hasAt(h, k + 2, 'script') && endsName(h[k + 8]) && h[k + 8] !== undefined) {
          s = 'escaped';
          k += 8;
          continue;
        } else if (c === '>' && s === 'doubleDashDash') s = 'data';
        else s = 'double';
        k++;
        continue;
    }
  }
  return h.length;
}

/** The page's tokens, in order; joined, their raw text is the page byte for byte. */
export function tokenize(h: string): Token[] {
  const out: Token[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ kind: 'text', raw: text });
    text = '';
  };
  let i = 0;
  let foreign = 0; // open <svg>/<math> elements: inside them "<![CDATA[" is a CDATA section, not a bogus comment
  while (i < h.length) {
    if (h[i] !== '<') {
      const n = h.indexOf('<', i);
      const end = n < 0 ? h.length : n;
      text += h.slice(i, end);
      i = end;
      continue;
    }
    const n1 = h[i + 1];
    if (n1 === '!') {
      flush();
      let end: number;
      if (foreign > 0 && h.startsWith('<![CDATA[', i)) {
        // Opaque (never offered, never touched) up to "]]>".
        const close = h.indexOf(']]>', i + 9);
        end = close < 0 ? h.length : close + 3;
      } else if (h.startsWith('<!--', i)) {
        if (h.startsWith('>', i + 4)) end = i + 5;
        else if (h.startsWith('->', i + 4)) end = i + 6;
        else {
          const a = h.indexOf('-->', i + 4);
          const b = h.indexOf('--!>', i + 4);
          end = a < 0 && b < 0 ? h.length : a < 0 ? b + 4 : b < 0 ? a + 3 : Math.min(a + 3, b + 4);
        }
      } else {
        const g = h.indexOf('>', i + 2);
        end = g < 0 ? h.length : g + 1;
      }
      out.push({ kind: 'other', raw: h.slice(i, end) });
      i = end;
      continue;
    }
    if (n1 === '?') {
      flush();
      const g = h.indexOf('>', i + 2);
      const end = g < 0 ? h.length : g + 1;
      out.push({ kind: 'other', raw: h.slice(i, end) });
      i = end;
      continue;
    }
    const closing = n1 === '/';
    const nameAt = closing ? i + 2 : i + 1;
    if (!isAlpha(h[nameAt])) {
      if (closing && h[nameAt] === '>') {
        flush();
        out.push({ kind: 'other', raw: '</>' });
        i = nameAt + 1;
        continue;
      }
      if (closing && nameAt < h.length) {
        flush();
        const g = h.indexOf('>', nameAt);
        const end = g < 0 ? h.length : g + 1;
        out.push({ kind: 'other', raw: h.slice(i, end) });
        i = end;
        continue;
      }
      text += '<';
      i++;
      continue;
    }
    const { end, selfClosing } = scanTag(h, nameAt);
    flush();
    if (end < 0) {
      // The input ends inside a tag: browsers drop it.
      out.push({ kind: 'other', raw: h.slice(i) });
      break;
    }
    const raw = h.slice(i, end);
    let ne = nameAt;
    while (ne < h.length && !isHtmlSpace(h[ne]) && h[ne] !== '/' && h[ne] !== '>') ne++;
    const name = h.slice(nameAt, ne).toLowerCase();
    out.push({ kind: 'tag', raw, name, closing, ...(selfClosing ? { selfClosing: true as const } : {}), ...(foreign > 0 ? { foreign: true as const } : {}) });
    i = end;
    if ((name === 'svg' || name === 'math') && !selfClosing) foreign = closing ? Math.max(0, foreign - 1) : foreign + 1;
    if (!closing && name === 'plaintext' && foreign === 0) {
      if (i < h.length) out.push({ kind: 'other', raw: h.slice(i) });
      break;
    }
    // In HTML content a "/>" on a non-void element is ignored, so "<textarea/>" still opens raw text.
    const raws = RAW_TEXT.has(name) || (RCDATA_TEXT.has(name) && foreign === 0);
    if (!closing && raws && (foreign === 0 || !selfClosing)) {
      const stop = rawTextEnd(h, i, name, foreign === 0);
      if (stop > i) out.push(RCDATA_TEXT.has(name) ? { kind: 'text', raw: h.slice(i, stop) } : { kind: 'other', raw: h.slice(i, stop) });
      i = stop;
    }
  }
  flush();
  return out;
}
