/**
 * A web page's copy deck, and VOICE's exact write-back into the page (F07, ADR-0081). Imported only by copy.ts.
 *
 * The deck: one line ("unit") per block of visible text, in reading order, read with the browser-faithful tokenizer
 * (html-tokens.ts). Head content is not offered except the <title>; <pre>, raw text, CDATA and attribute copy are not
 * offered. A block that holds only links side by side (a nav) gives one line per link. One notation holds on every
 * line: a link's words inside a line are shown in [brackets]; a literal "[", "]", or a backslash before one of them or
 * before a bracket of the notation, is shown escaped with a backslash. A line that is exactly one link's words is shown
 * plain (a "whole-link" line).
 *
 * The write-back has three parts that never call a model:
 * - readPageEdit: the person's answer as an exact positional edit (one line per unit; an empty line deletes its text);
 * - placePageEdit: deterministic placement. Changed text goes into the line's text slots, words aligned to the old
 *   words so formatting follows whole words or pieces (a documented rule, not verified); link words go where the
 *   person put their brackets, and no word crosses a link's edge (words outside brackets never go into an image or
 *   icon link, and a whole-link line's words all stay in its link). A line's edge whitespace stays in the slot that
 *   held it. Elements left empty are removed when the shared rule allows (never one that carries a
 *   hook such as id, data-* or aria-*, never one whose removal would join two runs of text), and the <br> run a
 *   deleted line leaves goes with it. It returns its removals as a witness;
 * - pageEditProblems: the verifier. It checks the witness against the shared rule, compares the markup token for token
 *   (the page before, less exactly the witnessed removals), accounts for every run of text, checks each line's words
 *   and edge whitespace and each link part's words, that no link or button whose words were in a changed line is left
 *   nameless (an image's alt or a label names one that keeps an image or icon), and reads the written page fresh:
 *   each block's words, and which of them are in which link (with its address). It is
 *   independent of placement's alignment and removal choices, not of the reader (which is tested on its own).
 * Reading, placing and verifying are linear in the page, except that placement matches a changed block's old and new
 * words: by a table quadratic in the words of that block (a line of up to about a thousand words), and past that by
 * an edit script whose cost grows with the words changed (capped; see wordPairs). None of them throws.
 */
import { attributesOf, decodeText, escapeText, isHtmlSpace, noHtmlSpace, squashHtml, tokenize, type Token } from './html-tokens.ts';

/** Formatting that sits inside a line of text; any other tag ends the line. */
const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
/** Elements a person sees without text: a link or button holding one keeps a visible face. */
const EMBEDDED = new Set(['img', 'svg', 'picture', 'video', 'audio', 'iframe', 'canvas', 'object', 'embed', 'input', 'select', 'textarea', 'button']);
/** Blocks whose removal (when emptied) leaves no hole: everything else (a cell, a <dd>, a wrapper) is kept empty. */
const TEXT_BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'figcaption']);

/** A hook other parts of the page may use: an element carrying one is never removed. */
const isHook = (name: string): boolean => ['id', 'for', 'name', 'role'].includes(name) || name.startsWith('data-') || (name.startsWith('aria-') && name !== 'aria-label');
/** A name for a link or button without text. */
const isNameAttr = (name: string): boolean => name === 'aria-label' || name === 'aria-labelledby' || name === 'title';
const hookOf = (raw: string): string | undefined => attributesOf(raw).find((a) => isHook(a.name))?.name;
const hasHook = (raw: string): boolean => hookOf(raw) !== undefined;
/** Elements whose non-empty alt is their text alternative, so it names a link or button holding them. */
const ALT_NAMED = new Set(['img', 'area', 'input']);

/** Shown text with the notation's characters escaped. A trailing backslash is escaped when a bracket of the notation follows. */
function escMarks(t: string, followedByMark = false): string {
  let out = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    const next = t[i + 1];
    if (c === '[' || c === ']') out += `\\${c}`;
    else if (c === '\\' && ((next !== undefined && '[]\\'.includes(next)) || (next === undefined && followedByMark))) out += '\\\\';
    else out += c;
  }
  return out;
}

type Seg = { kind: 'out' | 'link'; text: string };
const displayOf = (texts: Seg[]): string => texts.map((t, i) => (t.kind === 'link' ? `[${escMarks(t.text, true)}]` : escMarks(t.text, i < texts.length - 1))).join('');

interface Slot {
  /** Text token indices: the text between two non-text tokens. */
  toks: number[];
  /** The non-text token that ends it. */
  end: number;
  /** Runs of text separated by non-inline tags. */
  region: number;
  /** The open inline elements (their start tokens), outermost first. */
  stack: number[];
  visible: boolean;
  /** The outermost closed <a> holding it (its start token). */
  link?: number;
}
interface El {
  start: number;
  end?: number;
  name: string;
}
interface SlotSeg {
  kind: 'out' | 'link';
  slots: number[];
  link?: number;
}
interface Unit {
  slots: number[];
  segs: SlotSeg[];
  marked: boolean;
  text: string;
  display: string;
  /**
   * The whitespace before the line's first word, per slot that held it (slot order), and after its last word (last
   * slot first). Placement keeps each piece in its own slot, at the same end, wherever the new words go, so the gap
   * beside an empty icon stays where it was.
   */
  lead: Map<number, string>;
  trail: Map<number, string>;
  wholeLink?: number;
  block: number;
}

/** A page read for its copy. */
export interface PageDeck {
  tokens: Token[];
  slots: Slot[];
  els: Map<number, El>;
  units: Unit[];
  slotEndingAt: Int32Array;
  blockOfRegion: Map<number, number>;
}

/** Read a page's copy deck (one pass over its tokens, plus link membership by token index). */
export function readPageCopy(html: string): PageDeck {
  const tokens = tokenize(html);
  const slots: Slot[] = [];
  const els = new Map<number, El>();
  const open: number[] = [];
  const slotEndingAt = new Int32Array(tokens.length + 1).fill(-1);
  let region = 0;
  let inline: number[] = [];
  let inHead = false;
  let inTitle = false;
  let preDepth = 0;
  // The block a region belongs to: the innermost open non-inline element when the region starts (for <br> runs).
  const blockOfRegion = new Map<number, number>();
  const innermostBlock = () => {
    for (let k = open.length - 1; k >= 0; k--) if (!INLINE.has(els.get(open[k]!)!.name)) return open[k]!;
    return -1;
  };
  blockOfRegion.set(0, -1);
  let cur: Omit<Slot, 'end'> = { toks: [], region, stack: [], visible: true };
  tokens.forEach((t, i) => {
    if (t.kind === 'text') {
      cur.toks.push(i);
      return;
    }
    slotEndingAt[i] = slots.length;
    slots.push({ ...cur, end: i });
    if (t.kind === 'tag') {
      const name = t.name;
      if (name === 'head') inHead = !t.closing;
      if (name === 'title') inTitle = !t.closing;
      // A start tag opens an element unless it is void or honours its self-closing flag (in svg or math, and <svg/>
      // and <math/> themselves); browsers ignore "/>" on other HTML elements, so "<a href=x/>" and "<span/>" open one.
      const opens = !t.closing && !VOID.has(name) && !(t.selfClosing && (t.foreign || name === 'svg' || name === 'math'));
      if (!t.closing) {
        if (opens) {
          els.set(i, { start: i, name });
          open.push(i);
          if (name === 'pre') preDepth++;
        }
      } else {
        let k = open.length - 1;
        while (k >= 0 && els.get(open[k]!)!.name !== name) k--;
        if (k >= 0) {
          for (let x = k; x < open.length; x++) if (els.get(open[x]!)!.name === 'pre') preDepth--;
          els.get(open[k]!)!.end = i;
          open.length = k;
        }
      }
      if (!INLINE.has(name)) {
        region++;
        inline = [];
        blockOfRegion.set(region, name === 'br' ? (blockOfRegion.get(region - 1) ?? -1) : innermostBlock());
      } else if (opens) inline = [...inline, i];
      else if (t.closing) {
        const k = inline.map((s) => els.get(s)?.name).lastIndexOf(name);
        if (k >= 0) inline = inline.slice(0, k);
      }
    }
    cur = { toks: [], region, stack: inline, visible: (!inHead || inTitle) && preDepth === 0 };
  });
  slotEndingAt[tokens.length] = slots.length;
  slots.push({ ...cur, end: tokens.length });
  // Link membership: the outermost closed <a> holding the slot (a link spanning a <br> covers slots in two units).
  const aEls = [...els.values()].filter((e) => e.name === 'a' && e.end !== undefined).sort((x, y) => x.start - y.start);
  let ai = 0;
  const aStack: El[] = [];
  slots.forEach((s, k) => {
    const startTok = k === 0 ? -1 : slots[k - 1]!.end;
    while (aStack.length && aStack.at(-1)!.end! < s.end) aStack.pop();
    while (ai < aEls.length && aEls[ai]!.start <= startTok) {
      const e = aEls[ai++]!;
      while (aStack.length && aStack.at(-1)!.end! < e.start) aStack.pop();
      if (e.end! >= s.end) aStack.push(e);
    }
    const outer = aStack.find((e) => e.start <= startTok && s.end <= e.end!);
    if (outer) s.link = outer.start;
  });
  const page: PageDeck = { tokens, slots, els, units: [], slotEndingAt, blockOfRegion };
  const byRegion = new Map<number, number[]>();
  slots.forEach((s, i) => {
    if (!s.visible) return;
    const a = byRegion.get(s.region);
    if (a) a.push(i);
    else byRegion.set(s.region, [i]);
  });
  for (const ids of byRegion.values()) {
    const text = (xs: number[]) => squashHtml(xs.map((s) => slotText(page, s)).join(''));
    const own = ids.filter((i) => slots[i]!.stack.length === 0);
    const tops = [...new Set(ids.filter((i) => slots[i]!.stack.length > 0).map((i) => slots[i]!.stack[0]!))].filter((top) => text(ids.filter((i) => slots[i]!.stack[0] === top)));
    // A block of links side by side (a nav) reads as one line per link, not one glued line.
    const sideBySide = !text(own) && tops.length >= 2 && tops.every((t) => els.get(t)?.name === 'a');
    const groups = sideBySide ? tops.map((top) => ids.filter((i) => slots[i]!.stack[0] === top)) : [ids];
    for (const g of groups) if (text(g)) page.units.push(makeUnit(page, g));
  }
  page.units.sort((a, b) => a.slots[0]! - b.slots[0]!);
  return page;
}

const slotRaw = (p: PageDeck, s: number): string => p.slots[s]!.toks.map((i) => p.tokens[i]!.raw).join('');
const slotText = (p: PageDeck, s: number): string => decodeText(slotRaw(p, s));
/** Slots wholly inside an element: a contiguous range, by token index. */
function inside(p: PageDeck, el: El): number[] {
  const a = p.slotEndingAt[el.start]! + 1;
  const b = p.slotEndingAt[el.end!]!;
  const r: number[] = [];
  for (let s = a; s <= b; s++) r.push(s);
  return r;
}

function makeUnit(p: PageDeck, g: number[]): Unit {
  const segs: SlotSeg[] = [];
  for (const s of g) {
    const link = p.slots[s]!.link;
    const last = segs.at(-1);
    if (last && last.link === link) last.slots.push(s);
    else segs.push(link === undefined ? { kind: 'out', slots: [s] } : { kind: 'link', slots: [s], link });
  }
  // A link without words in this line is not a part of it.
  for (const s of segs) {
    if (s.kind === 'link' && !squashHtml(s.slots.map((x) => slotText(p, x)).join(''))) {
      s.kind = 'out';
      delete s.link;
    }
  }
  const merged: SlotSeg[] = [];
  for (const s of segs) {
    const last = merged.at(-1);
    if (last && last.kind === 'out' && s.kind === 'out') last.slots.push(...s.slots);
    else merged.push({ ...s, slots: [...s.slots] });
  }
  // Alternate out/link/out…, with an empty out segment where two links touch or at an edge.
  const alt: SlotSeg[] = [];
  for (const s of merged) {
    if (s.kind === 'link' && (alt.length === 0 || alt.at(-1)!.kind === 'link')) alt.push({ kind: 'out', slots: [] });
    alt.push(s);
  }
  if (!alt.length || alt.at(-1)!.kind === 'link') alt.push({ kind: 'out', slots: [] });
  const outText = alt.filter((s) => s.kind === 'out').map((s) => s.slots.map((x) => slotText(p, x)).join('')).join('');
  const links = alt.filter((s) => s.kind === 'link');
  const marked = links.length > 1 || (links.length === 1 && squashHtml(outText) !== '');
  const texts = normSegs(alt.map((s) => ({ kind: s.kind, text: s.slots.map((x) => slotText(p, x)).join('') })));
  // Edge whitespace per slot, up to the first (and back to the last) slot with anything else in it. A unit always
  // has such a slot (its text is not empty), so no slot is counted in both.
  const edge = (order: number[], re: RegExp) => {
    const m = new Map<number, string>();
    for (const s of order) {
      const raw = slotRaw(p, s);
      const ws = re.exec(raw)![0];
      m.set(s, ws);
      if (ws.length < raw.length) break;
    }
    return m;
  };
  const region = p.slots[g[0]!]!.region;
  return {
    slots: g,
    segs: marked ? alt : [{ kind: 'out', slots: g }],
    marked,
    text: texts.map((t) => t.text).join(''),
    display: marked ? displayOf(texts) : escMarks(texts.map((t) => t.text).join('')),
    lead: edge(g, /^[ \t\n\f\r]*/),
    trail: edge([...g].reverse(), /[ \t\n\f\r]*$/),
    ...(!marked && links.length === 1 ? { wholeLink: links[0]!.link! } : {}),
    block: p.blockOfRegion.get(region) ?? -1,
  };
}

/** Segments as a reader sees them: whitespace at a link's edges moves outside it; runs collapse to one space; ends trimmed. */
function normSegs(segs: Seg[]): Seg[] {
  const s = segs.map((x) => ({ ...x }));
  s.forEach((x, i) => {
    if (x.kind !== 'link') return;
    if (/^[ \t\n\f\r]/.test(x.text)) {
      x.text = x.text.replace(/^[ \t\n\f\r]+/, '');
      if (s[i - 1]) s[i - 1]!.text += ' ';
    }
    if (/[ \t\n\f\r]$/.test(x.text)) {
      x.text = x.text.replace(/[ \t\n\f\r]+$/, '');
      if (s[i + 1]) s[i + 1]!.text = ` ${s[i + 1]!.text}`;
    }
  });
  let prevSpace = true;
  for (const x of s) {
    let out = '';
    for (const c of x.text) {
      if (isHtmlSpace(c)) {
        if (!prevSpace) {
          out += ' ';
          prevSpace = true;
        }
      } else {
        out += c;
        prevSpace = false;
      }
    }
    x.text = out;
  }
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i]!.text === '') continue;
    s[i]!.text = s[i]!.text.replace(/ $/, '');
    break;
  }
  return s;
}

/** The deck's lines as the person is shown them. */
export const deckLines = (p: PageDeck): string[] => p.units.map((u) => u.display);

// ---- the person's answer as an exact positional edit ---------------------------------------------------------------

export type EditLine = { changed: false } | { changed: true; text: string; segs: Seg[] };
export type PageEdit = { ok: true; lines: EditLine[] };
/** A refused page answer: the problem, and the 1-based lines it names. */
export type PageRefusal = { ok: false; problem: string; lines: number[] };

/** One line's notation: "[" and "]" are a link's edges; a backslash before "[", "]" or "\" makes it text. */
function parseMarked(line: string): Seg[] | string {
  const segs: Seg[] = [{ kind: 'out', text: '' }];
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '\\' && i + 1 < line.length && '[]\\'.includes(line[i + 1]!)) {
      segs.at(-1)!.text += line[++i];
      continue;
    }
    if (c === '[') {
      if (segs.at(-1)!.kind === 'link') return 'a "[" inside brackets';
      segs.push({ kind: 'link', text: '' });
      continue;
    }
    if (c === ']') {
      if (segs.at(-1)!.kind !== 'link') return 'a "]" with no "[" before it';
      segs.push({ kind: 'out', text: '' });
      continue;
    }
    segs.at(-1)!.text += c;
  }
  if (segs.at(-1)!.kind === 'link') return 'a "[" that is never closed';
  return segs;
}

const lfLines = (t: string): string[] => t.replace(/\r\n?/g, '\n').split('\n');

/**
 * Read the person's answer against the deck. `offered` is the text the question first offered and `firstOffer` says
 * the answered checkpoint is that first offer (not a re-ask): an in-flight question whose deck has since been read
 * differently is aligned by its words, and a changed line that no longer lines up is refused on the first offer and
 * read against the current deck on a re-ask.
 */
export function readPageEdit(p: PageDeck, answer: string, offered?: string, firstOffer = true): PageEdit | PageRefusal {
  const n = p.units.length;
  const lines = lfLines(answer);
  // Blank lines past the deck's end are read as nothing (a trailing newline); an empty last line still deletes it.
  while (lines.length > n && !noHtmlSpace(lines.at(-1)!)) lines.pop();
  const off = offered === undefined ? undefined : lfLines(offered);
  if (lines.length !== n) {
    let hint = '';
    if (off && off.length !== n) {
      const cur = deckLines(p);
      for (let i = 0, j = 0; i < off.length && j < cur.length; i++, j++) {
        if (squashHtml(off[i]!) === cur[j]) continue;
        if (j + 1 < cur.length && [`${cur[j]}${cur[j + 1]}`, `${cur[j]} ${cur[j + 1]}`].includes(squashHtml(off[i]!))) {
          hint = ` The page is now read with line ${i + 1} ("${squashHtml(off[i]!)}") as two lines: "${cur[j]}" and "${cur[j + 1]}".`;
          break;
        }
        hint = ` The page is now read differently from line ${i + 1}: it reads "${cur[j]}".`;
        break;
      }
    }
    return {
      ok: false,
      problem: `This page has one line per block of text: ${n} lines, and your text has ${lines.length}. Keep one line per block: merge a line you added into the line next to it, or put back a line you removed (an empty line empties its block).${hint}`,
      lines: [],
    };
  }
  // Alignment of an in-flight offer compares words only, every bracket and backslash dropped (older decks showed
  // literal brackets unescaped, and marks on no line).
  const plainOf = (l: string) => noHtmlSpace(decodeText(l)).replace(/[[\]\\]/g, '');
  const same = off && off.length === n ? off : undefined;
  const lined = (i: number) => !!same && plainOf(same[i]!) === plainOf(p.units[i]!.display);
  const out: EditLine[] = [];
  const problems: string[] = [];
  const named: number[] = [];
  const refuse = (i: number, problem: string) => {
    problems.push(problem);
    named.push(i + 1);
  };
  lines.forEach((raw, i) => {
    const u = p.units[i]!;
    if (noHtmlSpace(raw) && (squashHtml(raw) === u.display || (same && squashHtml(raw) === squashHtml(same[i]!)))) {
      out.push({ changed: false });
      return;
    }
    if (same && !lined(i) && firstOffer) {
      refuse(i, `Line ${i + 1} was read again since this question opened; it now reads "${u.display}": write your change to that line.`);
      return;
    }
    if (!noHtmlSpace(raw)) {
      out.push({ changed: true, text: '', segs: u.segs.map((s) => ({ kind: s.kind, text: '' })) });
      return;
    }
    let segs = parseMarked(raw);
    if (typeof segs === 'string') {
      refuse(i, `Line ${i + 1} has ${segs}; to write a bracket as text, put \\ before it.`);
      return;
    }
    if (!u.marked) {
      const linkSegs = segs.filter((s) => s.kind === 'link');
      if (u.wholeLink !== undefined) {
        // A line that is all one link's words: plain, or one pair of brackets around the whole line.
        if (linkSegs.length === 1 && segs.every((s) => s.kind === 'link' || !noHtmlSpace(s.text))) segs = [{ kind: 'out', text: linkSegs[0]!.text }];
        else if (linkSegs.length) {
          refuse(i, `Line ${i + 1} is all one link's words: write them plain, or put the whole line in [brackets]. To write a bracket as text, put \\ before it.`);
          return;
        }
      } else if (linkSegs.length) {
        refuse(i, `Line ${i + 1} has no link, so it cannot have [brackets]: links cannot be added in this step. To write a bracket as text, put \\ before it: \\[ or \\].`);
        return;
      }
      segs = [{ kind: 'out', text: segs.map((s) => s.text).join('') }];
    }
    const ns = normSegs(segs);
    const display = u.marked ? displayOf(ns) : escMarks(ns.map((t) => t.text).join(''));
    if (display === u.display) {
      out.push({ changed: false });
      return;
    }
    const links = ns.filter((t) => t.kind === 'link').length;
    const want = u.segs.filter((s) => s.kind === 'link').length;
    if (u.marked && links !== want) {
      refuse(i, `Line ${i + 1} has ${want} link${want === 1 ? '' : 's'} in [brackets] and your line has ${links}: keep one pair per link, in order; leave a pair empty, [], to remove its link.`);
      return;
    }
    out.push({ changed: true, text: ns.map((t) => t.text).join(''), segs: ns });
  });
  if (problems.length) return { ok: false, problem: problems.join(' '), lines: named };
  return { ok: true, lines: out };
}

/** The "unchanged" test for a page answer: line for line, HTML whitespace collapsed (pages render collapsed). */
export function samePageCopy(offered: string, answer: string): boolean {
  const o = lfLines(offered);
  const a = lfLines(answer);
  while (a.length > o.length && !noHtmlSpace(a.at(-1)!)) a.pop();
  return a.length === o.length && a.every((l, i) => squashHtml(l) === squashHtml(o[i]!));
}

// ---- links: where each one goes ------------------------------------------------------------------------------------

const hrefOf = (raw: string): string => attributesOf(raw).find((a) => a.name === 'href')?.value ?? '(no address)';

/** Each link part of the deck, by position: its line (0-based), its words as shown, and its address. */
export function linkParts(p: PageDeck): { line: number; words: string; href: string }[] {
  const out: { line: number; words: string; href: string }[] = [];
  p.units.forEach((u, i) => {
    if (u.wholeLink !== undefined) out.push({ line: i, words: squashHtml(u.text), href: hrefOf(p.tokens[u.wholeLink]!.raw) });
    for (const s of u.segs) if (s.kind === 'link') out.push({ line: i, words: squashHtml(s.slots.map((x) => slotText(p, x)).join('')), href: hrefOf(p.tokens[s.link!]!.raw) });
  });
  return out;
}

/** At most this many links are named in the VOICE prompt, each address cut to 60 characters. */
const LEGEND_MAX = 40;

/**
 * What the VOICE prompt adds for a page, from the page itself (never from the person's answer): the line rule, the
 * bracket rule when a line has link words in brackets, and where each link goes, so link words are the person's
 * informed choice.
 */
export function pageVoiceSuffix(p: PageDeck): string {
  const parts = ['One line per block of text; leave a line empty to remove its text.'];
  if (p.units.some((u) => u.marked)) parts.push("Words in [brackets] are a link's words: keep one pair of brackets per link, in order, and leave a pair empty, [], to remove that link. To write a bracket as text, put \\ before it.");
  const links = linkParts(p);
  if (links.length) {
    const addr = (h: string) => (h.length > 60 ? `${h.slice(0, 57)}...` : h);
    const shown = links.slice(0, LEGEND_MAX).map((x) => `line ${x.line + 1} "${x.words}" goes to ${addr(x.href)}`);
    parts.push(`Links stay where they are; only their words change. Where each one goes: ${shown.join('; ')}${links.length > LEGEND_MAX ? `; and ${links.length - LEGEND_MAX} more` : ''}.`);
  }
  return parts.join(' ');
}

/** The page keepsVoice lock: the deck as shown (marks included) and each link part's address, by position. */
export function pageLockView(html: string): string {
  const p = readPageCopy(html);
  return JSON.stringify({ deck: deckLines(p), links: linkParts(p).map((x) => x.href) });
}

// ---- removal: the one rule placement and the verifier share --------------------------------------------------------

/** Something inside the element shows without text: an image, an icon, a control. */
function showsWithoutText(p: PageDeck, el: El): boolean {
  for (let t = el.start + 1; t < el.end!; t++) {
    const tk = p.tokens[t]!;
    if (tk.kind === 'tag' && !tk.closing && EMBEDDED.has(tk.name)) return true;
  }
  return false;
}

/**
 * Something names the element without its words, as a screen reader would name it: its own aria-label,
 * aria-labelledby or title, or inside it an image's alt or an element's own aria-label or aria-labelledby (each
 * non-empty; an empty alt marks an image as decoration).
 */
function namedWithoutText(p: PageDeck, el: El): boolean {
  const filled = (raw: string, names: (n: string) => boolean) => attributesOf(raw).some((a) => names(a.name) && a.value.trim() !== '');
  if (filled(p.tokens[el.start]!.raw, isNameAttr)) return true;
  for (let t = el.start + 1; t < el.end!; t++) {
    const tk = p.tokens[t]!;
    if (tk.kind !== 'tag' || tk.closing) continue;
    if (filled(tk.raw, (n) => n === 'aria-label' || n === 'aria-labelledby' || (n === 'alt' && ALT_NAMED.has(tk.name)))) return true;
  }
  return false;
}

/** An emptied element may go: inline or a text block, with nothing inside that carries a hook or shows without text. */
function removable(p: PageDeck, el: El): boolean {
  if (el.end === undefined) return false;
  if (!INLINE.has(el.name) && !TEXT_BLOCKS.has(el.name)) return false;
  for (let i = el.start; i <= el.end; i++) {
    const t = p.tokens[i]!;
    if (t.kind === 'tag' && !t.closing && (EMBEDDED.has(t.name) || hasHook(t.raw))) return false;
  }
  return true;
}

/**
 * The <br> runs deleted lines leave inside their block: a deleted line takes the run that ends it; a deleted last
 * line takes the run that ends the last kept line before it. Returns token indices.
 */
function brRuns(p: PageDeck, deletedUnits: Set<number>): number[] {
  const out: number[] = [];
  const byBlock = new Map<number, number[]>();
  p.units.forEach((u, i) => {
    const a = byBlock.get(u.block);
    if (a) a.push(i);
    else byBlock.set(u.block, [i]);
  });
  for (const [block, us] of byBlock) {
    if (block < 0 || us.length < 2 || !us.some((i) => deletedUnits.has(i))) continue;
    // The <br> run after unit k: <br> tags (no hooks) between its last slot and the next text or block edge.
    const runAfter = (k: number): number[] => {
      const run: number[] = [];
      for (let t = p.slots[p.units[us[k]!]!.slots.at(-1)!]!.end; t < p.tokens.length; t++) {
        const tk = p.tokens[t]!;
        if (tk.kind === 'tag' && tk.name === 'br') {
          if (hasHook(tk.raw)) return [];
          run.push(t);
        } else if (tk.kind === 'text' && noHtmlSpace(tk.raw)) break;
        else if (tk.kind === 'tag' && !INLINE.has(tk.name)) break;
      }
      return run;
    };
    us.forEach((ui, k) => {
      if (!deletedUnits.has(ui)) return;
      if (k + 1 < us.length) {
        out.push(...runAfter(k));
        return;
      }
      let j = k - 1;
      while (j >= 0 && deletedUnits.has(us[j]!)) j--;
      if (j >= 0) out.push(...runAfter(j));
    });
  }
  return [...new Set(out)];
}

/** Union-find over regions: removing a block or a <br> joins the regions on its two sides; never join two with text. */
class Regions {
  private readonly parent: Int32Array;
  private readonly text: Uint8Array;
  constructor(hasText: (r: number) => boolean, n: number) {
    this.parent = new Int32Array(n + 1);
    this.text = new Uint8Array(n + 1);
    for (let r = 0; r <= n; r++) {
      this.parent[r] = r;
      this.text[r] = hasText(r) ? 1 : 0;
    }
  }
  find(r: number): number {
    let x = r;
    while (this.parent[x] !== x) x = this.parent[x]!;
    let y = r;
    while (this.parent[y] !== x) {
      const n = this.parent[y]!;
      this.parent[y] = x;
      y = n;
    }
    return x;
  }
  wouldJoin(a: number, b: number): boolean {
    const x = this.find(a);
    const y = this.find(b);
    return x !== y && this.text[x] === 1 && this.text[y] === 1;
  }
  join(a: number, b: number): void {
    const x = this.find(a);
    const y = this.find(b);
    if (x === y) return;
    this.parent[x] = y;
    this.text[y] = this.text[x]! | this.text[y]!;
  }
}

/**
 * Tokens that show nothing between two slots of a line, read from the slot on their right going left (an inline
 * element opening, or a comment) or from the slot on their left going right (an inline element closing, or a comment).
 * Words placed across only these from a kept word stay beside it; across anything else (an empty icon's closing tag, a
 * link's end) they would land on the far side of something a person sees. Placement only.
 */
function opensFormatting(p: PageDeck, tok: number): boolean {
  const t = p.tokens[tok];
  return !!t && (t.kind === 'other' || (t.kind === 'tag' && !t.closing && INLINE.has(t.name) && p.els.has(tok)));
}
function closesFormatting(p: PageDeck, tok: number): boolean {
  const t = p.tokens[tok];
  return !!t && (t.kind === 'other' || (t.kind === 'tag' && t.closing && INLINE.has(t.name)));
}

const deletedUnitsOf = (p: PageDeck, edit: PageEdit): Set<number> =>
  new Set(p.units.map((_, i) => i).filter((i) => {
    const l = edit.lines[i]!;
    return l.changed && l.text === '';
  }));

/** The removals an edit makes, given which slots hold text afterwards (placement's own result). */
function removalsFor(p: PageDeck, edit: PageEdit, hasText: (s: number) => boolean): { elements: number[]; brs: number[]; problems: string[] } {
  const problems: string[] = [];
  const emptied = [...p.els.values()].filter((el) => el.end !== undefined && inside(p, el).some((s) => noHtmlSpace(slotText(p, s))) && !inside(p, el).some(hasText));
  const regionHasText = new Map<number, boolean>();
  p.slots.forEach((s, k) => {
    if (s.visible && hasText(k)) regionHasText.set(s.region, true);
  });
  const uf = new Regions((r) => regionHasText.get(r) ?? false, p.slots.at(-1)!.region);
  const regionBefore = (tok: number) => p.slots[p.slotEndingAt[tok]!]!.region;
  const regionAfter = (tok: number) => p.slots[p.slotEndingAt[tok]! + 1]!.region;
  // Outermost removable emptied elements, in document order; a block is kept (empty) when removing it would join text.
  const elements: number[] = [];
  let coveredTo = -1;
  for (const el of emptied.filter((e) => removable(p, e)).sort((a, b) => a.start - b.start)) {
    if (el.start <= coveredTo) continue;
    if (!INLINE.has(el.name)) {
      const a = regionBefore(el.start);
      const b = regionAfter(el.end!);
      if (uf.wouldJoin(a, b)) continue; // its children are not candidates either: the element stays, empty
      uf.join(a, b);
    }
    elements.push(el.start);
    coveredTo = el.end!;
  }
  const brs = brRuns(p, deletedUnitsOf(p, edit))
    .filter((t) => !elements.some((st) => st <= t && t <= p.els.get(st)!.end!))
    .filter((t) => {
      const a = regionBefore(t);
      const b = regionAfter(t);
      if (uf.wouldJoin(a, b)) return false;
      uf.join(a, b);
      return true;
    });
  const gone = elements.map((st) => p.els.get(st)!);
  for (const el of emptied) {
    if (gone.some((g) => g.start <= el.start && g.end! >= el.end!)) continue;
    if (el.name !== 'a' && el.name !== 'button') continue;
    const visible = showsWithoutText(p, el);
    if (!visible || !namedWithoutText(p, el)) {
      const slots = new Set(inside(p, el));
      const at = p.units.findIndex((u) => u.slots.some((s) => slots.has(s)));
      const hook = hookOf(p.tokens[el.start]!.raw);
      problems.push(`Line ${at + 1}: this ${el.name === 'a' ? 'link' : 'button'} cannot be removed in this step${hook ? ` (it carries ${hook}, which other parts of the page may use)` : ''} and would be left ${visible ? 'without a name' : 'empty'}; keep some words for it, or leave the line as it was.`);
    }
  }
  return { elements, brs, problems };
}

// ---- deterministic placement --------------------------------------------------------------------------------------

/** At most this many cells in the word table (4 MB): a line of up to about a thousand words. */
const TABLE_CELLS = 1 << 20;
/** At most this many words added or removed in one changed block for its edit script (about 16 MB of trace). */
const EDIT_MAX = 2000;

type Pairs = [number, number][];

/** A longest common subsequence of two word lists, by the table: ties drop an old word first. */
export function tablePairs(ow: readonly string[], nw: readonly string[]): Pairs {
  const w = nw.length + 1;
  const L = new Int32Array((ow.length + 1) * w);
  for (let a = ow.length - 1; a >= 0; a--) for (let b = nw.length - 1; b >= 0; b--) L[a * w + b] = ow[a] === nw[b] ? 1 + L[(a + 1) * w + b + 1]! : Math.max(L[(a + 1) * w + b]!, L[a * w + b + 1]!);
  const pairs: Pairs = [];
  for (let a = 0, b = 0; a < ow.length && b < nw.length; ) {
    if (ow[a] === nw[b]) {
      pairs.push([a, b]);
      a++;
      b++;
    } else if (L[(a + 1) * w + b]! >= L[a * w + b + 1]!) a++;
    else b++;
  }
  return pairs;
}

/**
 * The matched words of a shortest edit script (Myers, 1986), for a block too long for the table: O((N+M)·D) time and
 * O(D²) memory for D words added or removed. Undefined when more than `maxD` differ.
 */
export function editPairs(a: readonly string[], b: readonly string[], maxD: number): Pairs | undefined {
  const n = a.length;
  const m = b.length;
  // trace[d][k + d] is the furthest x on diagonal k (y = x - k) after d edits.
  const trace: Int32Array[] = [];
  const goesDown = (prev: Int32Array, d: number, k: number) => k === -d || (k !== d && prev[k - 1 + d - 1]! < prev[k + 1 + d - 1]!);
  for (let d = 0; d <= Math.min(maxD, n + m); d++) {
    const v = new Int32Array(2 * d + 1);
    const prev = trace[d - 1];
    for (let k = -d; k <= d; k += 2) {
      let x = d === 0 ? 0 : goesDown(prev!, d, k) ? prev![k + 1 + d - 1]! : prev![k - 1 + d - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[k + d] = x;
      if (x >= n && y >= m) {
        trace.push(v);
        // Walk back: each step is one edit, then the run of matched words that followed it.
        const pairs: Pairs = [];
        let cx = n;
        let cy = m;
        for (let e = d; e > 0; e--) {
          const before = trace[e - 1]!;
          const ck = cx - cy;
          const down = goesDown(before, e, ck);
          const pk = down ? ck + 1 : ck - 1;
          const px = before[pk + e - 1]!;
          const sx = down ? px : px + 1;
          while (cx > sx) pairs.push([--cx, --cy]);
          cx = px;
          cy = px - pk;
        }
        while (cx > 0) pairs.push([--cx, --cy]);
        return pairs.reverse();
      }
    }
    trace.push(v);
  }
  return undefined;
}

/**
 * Old and new words matched, in order. A line of up to about a thousand words uses the table as it always has. A
 * longer block keeps its common first and last words and matches the rest by its edit script, so a few changed words
 * in a very long block stay cheap; past EDIT_MAX changes, the middle is one changed span (its formatting is not kept,
 * as when the person rewrites a whole line).
 */
function wordPairs(ow: readonly string[], nw: readonly string[]): Pairs {
  if ((ow.length + 1) * (nw.length + 1) <= TABLE_CELLS) return tablePairs(ow, nw);
  let pre = 0;
  while (pre < ow.length && pre < nw.length && ow[pre] === nw[pre]) pre++;
  let suf = 0;
  while (suf < ow.length - pre && suf < nw.length - pre && ow[ow.length - 1 - suf] === nw[nw.length - 1 - suf]) suf++;
  const a = ow.slice(pre, ow.length - suf);
  const b = nw.slice(pre, nw.length - suf);
  const mid = (a.length + 1) * (b.length + 1) <= TABLE_CELLS ? tablePairs(a, b) : (editPairs(a, b, EDIT_MAX) ?? []);
  const pairs: Pairs = [];
  for (let i = 0; i < pre; i++) pairs.push([i, i]);
  for (const [x, y] of mid) pairs.push([x + pre, y + pre]);
  for (let i = suf; i > 0; i--) pairs.push([ow.length - i, nw.length - i]);
  return pairs;
}

/**
 * Where a segment sits in its line, for words that have no kept word beside them in it: the first segment's words
 * come before the line's first kept word (in the link after it), the last segment's after its last kept word.
 */
type Side = 'start' | 'end' | 'between';

/**
 * Spread a changed run of text over its slots: words kept from before stay in the slots they were in, so formatting
 * follows whole words or pieces of words; new words go to the shallowest slot around them. Words never cross a link's
 * edge: a segment's words go only into slots of its own link (`own`; undefined for words outside links), so a slot
 * inside an image or icon link that held no words never takes any. Words added at a line's edge go beside its first or
 * last kept word: into the shallowest slot reachable from it across only opening (or, after it, closing) formatting,
 * so an empty icon between keeps its place and its gap.
 */
function alignInto(p: PageDeck, group: number[], next: string, own: number | undefined, side: Side): Map<number, string> {
  const out = new Map<number, string>(group.map((s) => [s, '']));
  if (!group.length || !next) return out;
  const oc: { c: string; s: number }[] = [];
  for (const s of group) {
    for (const c of slotText(p, s)) {
      if (isHtmlSpace(c)) {
        if (oc.length && oc.at(-1)!.c !== ' ') oc.push({ c: ' ', s });
      } else oc.push({ c, s });
    }
  }
  while (oc.length && oc.at(-1)!.c === ' ') oc.pop();
  const holding = group.filter((s) => noHtmlSpace(slotText(p, s)));
  const depth = (s: number) => p.slots[s]!.stack.length;
  const allowed = (s: number) => p.slots[s]!.link === own;
  const indexIn = new Map(group.map((s, i) => [s, i]));
  /** Of `xs` (slot order), the allowed slot of least depth; of equally shallow ones the first, or the last when `nearHi`. */
  const best = (xs: number[], nearHi: boolean): number | undefined => {
    let b: number | undefined;
    for (const y of xs) if (allowed(y) && (b === undefined || depth(y) < depth(b) || (nearHi && depth(y) === depth(b)))) b = y;
    return b;
  };
  const range = (lo: number, hi: number) => group.slice(indexIn.get(lo)!, indexIn.get(hi)! + 1);
  const none = (): never => {
    throw new Error('no slot for these words outside the links beside them');
  };
  /** The shallowest allowed slot of the group in [lo, hi]. */
  const shallowest = (lo: number, hi: number, nearHi = false) => best(range(lo, hi), nearHi) ?? none();
  /** Beside slot `r`, before it: the slots reachable leftwards across only opening formatting. */
  const nearLeft = (r: number) => {
    let i = indexIn.get(r)!;
    while (i > 0 && group[i - 1] === group[i]! - 1 && opensFormatting(p, p.slots[group[i - 1]!]!.end)) i--;
    return best(group.slice(i, indexIn.get(r)! + 1), true) ?? shallowest(group[0]!, r, true);
  };
  /** Beside slot `l`, after it: the slots reachable rightwards across only closing formatting. */
  const nearRight = (l: number) => {
    let i = indexIn.get(l)!;
    while (i + 1 < group.length && group[i + 1] === group[i]! + 1 && closesFormatting(p, p.slots[group[i]!]!.end)) i++;
    return best(group.slice(indexIn.get(l)!, i + 1), false) ?? shallowest(l, group.at(-1)!);
  };
  if (holding.length <= 1) {
    const at = holding[0] ?? (side === 'start' ? nearLeft(group.at(-1)!) : side === 'end' ? nearRight(group[0]!) : shallowest(group[0]!, group.at(-1)!));
    out.set(at, next);
    return out;
  }
  const nc = [...next];
  const wordsOf = (cs: string[]) => {
    const w: { w: string; from: number; to: number }[] = [];
    let i = 0;
    while (i < cs.length) {
      if (cs[i] === ' ') {
        i++;
        continue;
      }
      let j = i;
      while (j < cs.length && cs[j] !== ' ') j++;
      w.push({ w: cs.slice(i, j).join(''), from: i, to: j });
      i = j;
    }
    return w;
  };
  const ow = wordsOf(oc.map((x) => x.c));
  const nw = wordsOf(nc);
  const pairs = wordPairs(ow.map((x) => x.w), nw.map((x) => x.w));
  const ns: (number | undefined)[] = new Array(nc.length).fill(undefined);
  for (const [a, b] of pairs) for (let t = 0; t < nw[b]!.w.length; t++) ns[nw[b]!.from + t] = oc[ow[a]!.from + t]!.s;
  let oa = 0;
  let na = 0;
  for (const [a, b] of [...pairs, [ow.length, nw.length] as [number, number]]) {
    const o1 = a < ow.length ? ow[a]!.from : oc.length;
    const n1 = b < nw.length ? nw[b]!.from : nc.length;
    const boundary = (x: number) => x === oa || x === o1 || oc[x - 1]!.s !== oc[x]!.s || oc[x - 1]!.c === ' ' || oc[x]!.c === ' ';
    let pp = 0;
    let q = 0;
    while (oa + pp < o1 && na + pp < n1 && oc[oa + pp]!.c === ' ' && nc[na + pp] === ' ') pp++;
    while (o1 - q - 1 >= oa + pp && n1 - q - 1 >= na + pp && oc[o1 - q - 1]!.c === ' ' && nc[n1 - q - 1] === ' ') q++;
    const spanSlots = new Set(oc.slice(oa + pp, o1 - q).filter((x) => x.c !== ' ').map((x) => x.s));
    if (spanSlots.size > 1) {
      // A changed span across formatting: keep the common prefix and suffix in their slots, at slot or word edges.
      const p0 = pp;
      const q0 = q;
      while (oa + pp < o1 - q && na + pp < n1 - q && oc[oa + pp]!.c === nc[na + pp]) pp++;
      while (pp > p0 && !boundary(oa + pp)) pp--;
      while (o1 - q - 1 >= oa + pp && n1 - q - 1 >= na + pp && oc[o1 - q - 1]!.c === nc[n1 - q - 1]) q++;
      while (q > q0 && !boundary(o1 - q)) q--;
    }
    for (let k = 0; k < pp; k++) ns[na + k] = oc[oa + k]!.s;
    for (let k = 0; k < q; k++) ns[n1 - 1 - k] = oc[o1 - 1 - k]!.s;
    const om = oc.slice(oa + pp, o1 - q).filter((x) => x.c !== ' ').map((x) => x.s);
    // om is in slot order. Every new character before na + pp is placed by now, and the one at n1 - q is placed (a
    // kept suffix or the next kept word) unless the span runs to the end: so each neighbour is one lookup.
    if (na + pp < n1 - q) {
      let target: number;
      if (om.length) target = shallowest(om[0]!, om.at(-1)!);
      else {
        const left = na + pp > 0 ? ns[na + pp - 1] : undefined;
        const right = n1 - q < nc.length ? ns[n1 - q] : undefined;
        // Words added before the line's first kept word go beside it, and after its last beside that one.
        if (left === undefined) target = right === undefined ? shallowest(group[0]!, group.at(-1)!) : nearLeft(right);
        else if (right === undefined) target = nearRight(left);
        else target = left === right && allowed(left) ? left : shallowest(Math.min(left, right), Math.max(left, right));
      }
      for (let k = na + pp; k < n1 - q; k++) ns[k] = target;
    }
    if (a < ow.length) {
      oa = ow[a]!.to;
      na = nw[b]!.to;
    }
  }
  if (!ns.every((s, k) => k === 0 || s! >= ns[k - 1]!)) throw new Error('placement out of order');
  nc.forEach((c, k) => out.set(ns[k]!, `${out.get(ns[k]!)}${c}`));
  return out;
}

/** What placement removed: the start token of each removed element (outermost only) and each removed <br>. */
export interface Witness {
  removed: number[];
  brs: number[];
}
export interface Placed extends Witness {
  page: string;
  problems: string[];
}

/** Place an edit into the page. Never throws: a fault inside placement is a problem, and the page is returned unchanged. */
export function placePageEdit(before: string, edit: PageEdit): Placed {
  try {
    return place(before, edit);
  } catch (e) {
    return { page: before, problems: [`byway could not place this edit (${(e as Error).message}); change the line again, or leave it as it was offered.`], removed: [], brs: [] };
  }
}

function place(before: string, edit: PageEdit): Placed {
  const p = readPageCopy(before);
  const raws = p.tokens.map((t) => t.raw);
  const newText = new Map<number, string>();
  const inserts = new Map<number, string>();
  const problems: string[] = [];
  p.units.forEach((u, i) => {
    const line = edit.lines[i]!;
    if (!line.changed) return;
    const texts = new Map<number, string>(u.slots.map((s) => [s, '']));
    if (line.text) {
      u.segs.forEach((seg, k) => {
        const t = line.segs[k]!.text;
        if (!t) return;
        if (!seg.slots.length) {
          // Words beside a link where the line had none: right after the link before, or right before the link after.
          const prevLink = u.segs[k - 1];
          const nextLink = u.segs[k + 1];
          const at = prevLink ? p.els.get(prevLink.link!)!.end! + 1 : p.els.get(nextLink!.link!)!.start;
          const slot = p.slotEndingAt[at]!;
          if (slot < 0 || !u.slots.includes(slot) || p.slots[slot]!.link !== undefined) {
            problems.push(`Line ${i + 1}: words cannot be added on this side of the link here, because the link continues on the next or previous line.`);
            return;
          }
          texts.set(slot, `${texts.get(slot) ?? ''}${t}`);
          return;
        }
        // A link part's words stay in its link; words outside links stay outside every link, and on a whole-link line
        // every word is the link's.
        const own = u.marked ? seg.link : u.wholeLink;
        const side: Side = k === 0 ? 'start' : k === u.segs.length - 1 ? 'end' : 'between';
        for (const [s, x] of alignInto(p, seg.slots, t, own, u.marked ? side : 'between')) texts.set(s, `${texts.get(s) ?? ''}${x}`);
      });
    }
    // Edge whitespace goes back into the slot that held it, at the same end: before the line's words at its start,
    // after them at its end, wherever the new words went. The new words carry their own spaces, so a gap beside an
    // empty icon or an arrow inside a link stays on its side of it (a space beside another one, with only formatting
    // between, shows as one).
    for (const [s, ws] of u.lead) texts.set(s, `${ws}${texts.get(s)}`);
    for (const [s, ws] of u.trail) texts.set(s, `${texts.get(s)}${ws}`);
    for (const [s, t] of texts) newText.set(s, t);
  });
  for (const [s, t] of newText) {
    const toks = p.slots[s]!.toks;
    const value = escapeText(t);
    if (toks.length) toks.forEach((ti, k) => (raws[ti] = k === 0 ? value : ''));
    else if (value) inserts.set(p.slots[s]!.end, value);
  }
  const hasText = (s: number) => noHtmlSpace(newText.has(s) ? newText.get(s)! : slotText(p, s)) !== '';
  const rem = removalsFor(p, edit, hasText);
  problems.push(...rem.problems);
  const goneEls = new Map(rem.elements.map((st) => [st, p.els.get(st)!]));
  const goneBr = new Set(rem.brs);
  const out: string[] = [];
  let skip = -1;
  raws.forEach((r, i) => {
    if (i <= skip) return;
    const g = goneEls.get(i);
    if (g) {
      out.push(inserts.get(i) ?? '');
      skip = g.end!;
      return;
    }
    if (goneBr.has(i)) {
      out.push(inserts.get(i) ?? '');
      return;
    }
    out.push((inserts.get(i) ?? '') + r);
  });
  if (inserts.has(raws.length)) out.push(inserts.get(raws.length)!);
  return { page: out.join(''), problems, removed: rem.elements, brs: rem.brs };
}

// ---- the exact verifier ------------------------------------------------------------------------------------------

/** Check a written page against the edit and placement's witness. Never throws: a fault is a problem. */
export function pageEditProblems(before: string, after: string, edit: PageEdit, witness: Witness): string[] {
  try {
    return verify(before, after, edit, witness);
  } catch (e) {
    return [`byway could not check this edit (${(e as Error).message}).`];
  }
}

function verify(before: string, after: string, edit: PageEdit, witness: Witness): string[] {
  const p = readPageCopy(before);
  const a = tokenize(after);
  const B = p.tokens.map((t, i) => ({ t, i })).filter((x) => x.t.kind !== 'text');
  const A = a.map((t, i) => ({ t, i })).filter((x) => x.t.kind !== 'text');
  const changedSlots = new Set(p.units.flatMap((u, i) => (edit.lines[i]!.changed ? u.slots : [])));
  const candidate = (el: El | undefined) => !!el && removable(p, el) && inside(p, el).every((s) => !noHtmlSpace(slotText(p, s)) || changedSlots.has(s));
  const brCandidates = new Set(brRuns(p, deletedUnitsOf(p, edit)));
  // 1. Markup. Each witnessed removal must be one the shared rule allows, and the written page's markup must be the page
  // before, less exactly those removals, token for token. Linear; no search.
  const removed = new Set<El>();
  const removedTok = new Uint8Array(p.tokens.length + 1);
  for (const st of new Set(witness.removed)) {
    const el = p.els.get(st);
    if (!candidate(el)) return ['The page changed beyond its text: it removes an element this edit may not remove.'];
    removed.add(el!);
    for (let t = el!.start; t <= el!.end!; t++) removedTok[t] = 1;
  }
  for (const t of new Set(witness.brs)) {
    if (!brCandidates.has(t)) return ['The page changed beyond its text: it removes a line break this edit may not remove.'];
    removedTok[t] = 1;
  }
  const kept = B.filter((x) => !removedTok[x.i]);
  if (kept.length !== A.length || kept.some((x, k) => x.t.raw !== A[k]!.t.raw)) return ['The page changed beyond its text: its markup is not the page before the edit, less the elements the edit emptied.'];
  const map = new Map<number, number>(kept.map((x, k) => [x.i, A[k]!.i]));
  const inRemoved = new Uint8Array(p.slots.length);
  for (const el of removed) for (const s of inside(p, el)) inRemoved[s] = 1;
  // 2 and 3. Chains: before slots the removals merged into one after slot (they share the next kept token). Every slot
  // of a chain has a known after text except one changed line's run: unchanged slots keep their bytes, a deleted
  // line's slots keep only its edge whitespace. The rest of the after slot is that changed line's text.
  const lineOfSlot = new Int32Array(p.slots.length).fill(-1);
  p.units.forEach((u, i) => {
    for (const s of u.slots) lineOfSlot[s] = i;
  });
  const known = (s: number): string | undefined => {
    const i = lineOfSlot[s]!;
    const line = i >= 0 ? edit.lines[i]! : undefined;
    if (!line || !line.changed) return slotRaw(p, s);
    if (line.text) return undefined;
    const u = p.units[i]!;
    return `${u.lead.get(s) ?? ''}${u.trail.get(s) ?? ''}`;
  };
  const afterTextAt = (beforeTok: number): string => {
    const end = beforeTok === p.tokens.length ? a.length : map.get(beforeTok)!;
    let s = end - 1;
    let t = '';
    while (s >= 0 && a[s]!.kind === 'text') {
      t = a[s]!.raw + t;
      s--;
    }
    return t;
  };
  const chains = new Map<number, number[]>();
  p.slots.forEach((sl, s) => {
    if (inRemoved[s]) return;
    let t = sl.end;
    while (t < p.tokens.length && (removedTok[t] || p.tokens[t]!.kind === 'text')) t++;
    const c = chains.get(t);
    if (c) c.push(s);
    else chains.set(t, [s]);
  });
  const slotAfter = new Map<number, string>(); // each kept before slot's text in the written page
  const alone = new Set<number>(); // kept slots no removal merged with another: their written text is exactly theirs
  for (const ss of chains.values()) if (ss.length === 1) alone.add(ss[0]!);
  const problems: string[] = [];
  for (const [tok, ss] of chains) {
    const got = afterTextAt(tok);
    const unknown = ss.filter((s) => known(s) === undefined);
    const lines = new Set(unknown.map((s) => lineOfSlot[s]));
    const first = unknown.length ? ss.indexOf(unknown[0]!) : ss.length;
    const last = unknown.length ? ss.indexOf(unknown.at(-1)!) : ss.length - 1;
    if (lines.size > 1 || (unknown.length && last - first + 1 !== unknown.length)) {
      problems.push('Two changed lines ended up in one run of text.');
      continue;
    }
    const pre = ss.slice(0, first).map((s) => known(s)!).join('');
    const post = ss.slice(last + 1).map((s) => known(s)!).join('');
    if (!got.startsWith(pre) || !got.endsWith(post) || got.length < pre.length + post.length || (!unknown.length && got !== pre + post)) {
      const del = [...new Set(ss.map((s) => lineOfSlot[s]!).filter((i) => i >= 0 && edit.lines[i]!.changed && !(edit.lines[i] as { text: string }).text))];
      problems.push(del.length ? `${del.map((i) => `Line ${i + 1}`).join(' and ')} must be empty.` : `Text outside your changed lines changed ("${(pre + post).slice(0, 40)}").`);
      continue;
    }
    ss.forEach((s, k) => slotAfter.set(s, k < first || k > last ? known(s)! : ''));
    if (unknown.length) slotAfter.set(ss[last]!, got.slice(pre.length, got.length - post.length));
  }
  // 4. Each changed line reads exactly as written, and each link part exactly its bracketed words.
  p.units.forEach((u, i) => {
    const line = edit.lines[i]!;
    if (!line.changed) return;
    const at = (s: number) => slotAfter.get(s) ?? '';
    // The line's words: each slot's text less the edge whitespace it held (checked on its own below), so the space
    // before an arrow at a link's end, kept where it was while words were added after the link, is not read as a
    // doubled space, and a doubled space anywhere else is.
    const lead = new Map(u.lead);
    const trail = new Map(u.trail);
    const wordsOf = (s: number) => {
      let t = at(s);
      const lw = lead.get(s);
      const tw = trail.get(s);
      if (lw && t.startsWith(lw)) t = t.slice(lw.length);
      if (tw && t.endsWith(tw)) t = t.slice(0, t.length - tw.length);
      return t;
    };
    const text = decodeText(u.slots.map(wordsOf).join('')).replace(/^[ \t\n\f\r]+|[ \t\n\f\r]+$/g, '');
    if (text !== line.text) problems.push(`Line ${i + 1} must read exactly "${line.text}" (it reads "${text}").`);
    // Edge whitespace stays in its slot, at the same end, across every segment of the line: each slot before the
    // first that holds words keeps exactly the whitespace it held, and every other one still starts with it (so a gap
    // beside an empty icon or an image link never moves past it); the same at the end. Slots a removal merged are
    // skipped.
    const words = line.text ? u.slots.filter((s) => noHtmlSpace(at(s))) : [];
    if (words.length) {
      const f = words[0]!;
      const l = words.at(-1)!;
      const leadMoved = [...u.lead].some(([s, ws]) => alone.has(s) && (s < f ? at(s) !== ws : !at(s).startsWith(ws)));
      const trailMoved = [...u.trail].some(([s, ws]) => alone.has(s) && (s > l ? at(s) !== ws : !at(s).endsWith(ws)));
      if (leadMoved || trailMoved) problems.push(`Line ${i + 1}: the space before or after its words moved.`);
    }
    const unitSlots = new Set(u.slots);
    u.segs.forEach((seg, k) => {
      if (seg.kind !== 'link') return;
      const el = p.els.get(seg.link!)!;
      const want = line.segs[k]!.text;
      if (removed.has(el)) {
        if (want) problems.push(`Line ${i + 1}: a link was removed that should read "${want}".`);
        return;
      }
      const got = squashHtml(decodeText(inside(p, el).filter((s) => unitSlots.has(s)).map((s) => slotAfter.get(s) ?? '').join('')));
      if (got !== want) problems.push(`Line ${i + 1}: the link must read exactly "${want}" (it reads "${got}").`);
    });
  });
  // 5. No <a> or <button> whose words were in a changed line is left nameless: it keeps some text, or shows something
  // without text that is named (the removal rule's own test). One that held no words (an image or icon link beside
  // a changed line, whose empty slot after the image belongs to that line) had no name for the edit to take.
  for (const el of p.els.values()) {
    // Removed elements cover their whole token range, so one inside a removed one starts on a removed token.
    if (el.end === undefined || (el.name !== 'a' && el.name !== 'button') || removedTok[el.start]) continue;
    const ss = inside(p, el);
    if (!ss.some((s) => changedSlots.has(s) && noHtmlSpace(slotText(p, s)))) continue;
    if (noHtmlSpace(decodeText(ss.map((s) => slotAfter.get(s) ?? '').join('')))) continue;
    if (!showsWithoutText(p, el) || !namedWithoutText(p, el)) problems.push(`A ${el.name === 'a' ? 'link' : 'button'} in your changed lines is left without a name.`);
  }
  // 6. Read fresh: the written page's blocks hold exactly the expected text, block by block, in order; and each block's
  // words sit in the same links as the person put them, each link with its address (so words that crossed a link's
  // edge are refused, whichever way they got there).
  const wantRegion = new Map<number, { parts: Part[]; line: number }>();
  const linkPart = (el: number | undefined, raw: string): Part => (el === undefined ? { raw } : { el, href: hrefOf(p.tokens[el]!.raw), raw });
  p.units.forEach((u, i) => {
    const line = edit.lines[i]!;
    const r = p.slots[u.slots[0]!]!.region;
    let parts: Part[];
    if (!line.changed) parts = partsOf(p, u.slots);
    else if (!line.text) parts = [];
    else if (u.marked) parts = u.segs.map((seg, k) => linkPart(seg.kind === 'link' ? seg.link : undefined, line.segs[k]!.text));
    else parts = [linkPart(u.wholeLink, line.text)];
    const w = wantRegion.get(r);
    if (w) w.parts.push({ raw: ' ' }, ...parts);
    else wantRegion.set(r, { parts, line: i + 1 });
  });
  const want = [...wantRegion.entries()].sort((x, y) => x[0] - y[0]).map(([, w]) => ({ ...w, form: formOf(w.parts) })).filter((w) => w.form.text);
  const q = readPageCopy(after);
  const gotRegion = new Map<number, number[]>();
  q.slots.forEach((s, k) => {
    if (!s.visible) return;
    const g = gotRegion.get(s.region);
    if (g) g.push(k);
    else gotRegion.set(s.region, [k]);
  });
  const got = [...gotRegion.entries()].sort((x, y) => x[0] - y[0]).map(([, ss]) => formOf(partsOf(q, ss))).filter((g) => g.text);
  if (got.length !== want.length || got.some((g, k) => g.text !== want[k]!.form.text)) problems.push(`The page, read again, does not have your lines block by block (expected ${want.length} blocks of text, found ${got.length}).`);
  else got.forEach((g, k) => {
    if (g.links !== want[k]!.form.links) problems.push(`Line ${want[k]!.line}, read again, does not have its link words where you put them (it reads "${g.shown}").`);
  });
  return [...new Set(problems)];
}

/** A run of a block's text: outside links (no link), or one link's words (`el`, its start token) with its address. */
interface Part {
  el?: number;
  href?: string;
  raw: string;
}

/** A block's slots as runs: consecutive slots of the same link (by element) are one part; text decoded. */
function partsOf(p: PageDeck, slots: number[]): Part[] {
  const parts: Part[] = [];
  for (const s of slots) {
    const el = p.slots[s]!.link;
    const last = parts.at(-1);
    const text = slotText(p, s);
    if (last && last.el === el) last.raw += text;
    else parts.push(el === undefined ? { raw: text } : { el, href: hrefOf(p.tokens[el]!.raw), raw: text });
  }
  return parts;
}

/**
 * A block's text and link membership for comparing two readings: `text` is its words without HTML whitespace, `links`
 * the same with each link's words marked with its address (a link without words drops out, as the deck drops it), and
 * `shown` how the block reads with link words in brackets, for the message. Runs of one link separated only by
 * whitespace are one run: the deck may show one link as two lines (side by side, when the reader nests links), and the
 * written page reads it as one.
 */
function formOf(parts: Part[]): { text: string; links: string; shown: string } {
  const runs: Part[] = [];
  for (const part of parts) {
    // A link without words reads as text outside links.
    const x: Part = part.el !== undefined && noHtmlSpace(part.raw) ? { ...part } : { raw: part.raw };
    const last = runs.at(-1);
    const gap = last && last.el === undefined && !noHtmlSpace(last.raw) ? runs.at(-2) : undefined;
    if (x.el !== undefined && gap && gap.el === x.el) {
      gap.raw += last!.raw + x.raw;
      runs.pop();
    } else if (last && last.el === x.el) last.raw += x.raw;
    else runs.push(x);
  }
  const edge = (re: RegExp, raw: string) => (re.test(raw) ? ' ' : '');
  const shown = runs.map((x) => (x.el === undefined ? escMarks(x.raw) : `${edge(/^[ \t\n\f\r]/, x.raw)}[${escMarks(squashHtml(x.raw), true)}]${edge(/[ \t\n\f\r]$/, x.raw)}`)).join('');
  const links = JSON.stringify(runs.filter((x) => noHtmlSpace(x.raw)).map((x) => (x.el === undefined ? noHtmlSpace(x.raw) : [x.href, noHtmlSpace(x.raw)])));
  return { text: parts.map((x) => noHtmlSpace(x.raw)).join(''), links, shown: squashHtml(shown) };
}
