/**
 * VOICE's browser arbiter for a web page (F07, ADR-0081). The page reader (page-copy.ts and html-tokens.ts) is a model of
 * how browsers build and show a page, and placement and the in-code verifier both depend on it, so a misread there is a
 * write the verifier cannot see. The arbiter asks the browser: the runner's own Chromium, reading the page as a visitor
 * sees it, with JavaScript on (PageRenderer.shownText: the visitor read). It is the last word on every page write, and it
 * fails closed. The deck (what may be offered) is the page reader's, which runs no script; what is shown, what is hidden
 * from sight, and how each pair of neighbouring characters sits (glued, apart in one flow of text, apart across boxes,
 * or in the other order) is the visitor read's, measured from the characters' boxes.
 *
 * - Where each line shows (`locate`). A copy of the page is marked at each deck line's first and last character (a pair
 *   of noncharacters with the line's number, put into the text, so no element changes; the read takes them out before
 *   it measures anything), and Chromium reads the page and the copy. A line is placed where its two marks each show
 *   once, the start before the end, with exactly the line's characters between them, nothing hidden from sight among
 *   them, and each of its gaps shown as the deck allows: where the line has a space, apart (in the flow or across
 *   boxes); where it has none, glued, or apart because the page's own boxes or styles part them (a `display: block`
 *   cite, tag chips that are inline blocks, a margin); never in the other order. The copy must read as the page does
 *   once the marks are taken out (the same text, separators, links and hidden text); if it does not, no line is placed.
 * - What is offered (`notShown`, `notShownWhy`): a line that is not placed is not offered, stays byte for byte, and the
 *   prompt names it with the reason (not laid out, hidden from sight, partly hidden, not shown as one piece, changed or
 *   copied by a script).
 * - What the written page must show (`expectedShown`): the page before as the visitor read showed it, every character
 *   outside the changed lines the same, shown or hidden from sight in the same place, in the same link, with the same
 *   separators; each changed line showing exactly the person's characters, where the person typed a space apart (in
 *   the flow or across boxes), and where the person typed none glued, except that two characters that stood side by
 *   side in the line before, with the same spacing in the deck (a space or none), keep the separator they had (matched
 *   by a shortest edit script of the line's characters); the separators between a changed line and its
 *   neighbours as before (apart where the person typed a space at that edge); a deleted line's neighbours parted by the
 *   stronger of the two separators it had (glued < in the flow < in the other order < across boxes). The person's
 *   link words are in the link they bracketed (a deleted line has none, so its link words are not checked).
 * - The check (`arbiterProblem`): Chromium's visitor read of the written page must be exactly that, separator for
 *   separator, and the text it hides from sight must be the page's own, run by run, in the same links. Any difference
 *   refuses the write, naming the line; one in what is hidden from sight says so (the person's words put out of sight,
 *   or the page's text pushed out of sight or brought into it), and one outside the changed lines says that other text
 *   would change.
 *
 * Pure but for the reads (`locateLines`, `arbitrate`), which go to the renderer. Activity code only.
 */
import { parseEntities } from 'parse-entities';
import { isHtmlSpace } from './html-tokens.ts';
import { editPairs, readPageCopy, type PageDeck, type PageEdit } from './page-copy.ts';
import {
  HIDDEN_HERE,
  LINE_END,
  LINE_START,
  LINK_CLOSE,
  LINK_DIGIT_0,
  LINK_INDEX_END,
  LINK_OPEN,
  NUMBER_END,
  REVERSED,
  type ArtifactResolver,
  type PageRenderer,
  type RenderOptions,
  type ShownText,
} from './pages.ts';

/** The noncharacters the arbiter's marks use: a page or an answer holding one cannot be checked. */
const MARKS = /[﷐-﷯]/;

const digits = (n: number): string => String(n).replace(/[0-9]/g, (d) => String.fromCharCode(LINK_DIGIT_0 + Number(d)));

/**
 * The page with each deck line marked at its first and last character (whitespace aside, read as decoded text, so a
 * reference such as &#32; counts as the space it is). Marks go inside text that already has characters on that side, so
 * a browser builds the same elements.
 */
export function markLines(html: string): string {
  const p = readPageCopy(html);
  const at = new Int32Array(p.tokens.length + 1);
  p.tokens.forEach((t, i) => (at[i + 1] = at[i]! + t.raw.length));
  const inserts: [number, string][] = [];
  p.units.forEach((u, k) => {
    const toks = u.slots.flatMap((s) => p.slots[s]!.toks);
    const first = edgeOf(toks, p, at, 'first');
    const last = edgeOf(toks, p, at, 'last');
    if (first === undefined || last === undefined) return;
    inserts.push([first, `${LINE_START}${digits(k)}${NUMBER_END}`], [last, `${LINE_END}${digits(k)}${NUMBER_END}`]);
  });
  inserts.sort((x, y) => x[0] - y[0]);
  let out = '';
  let from = 0;
  for (const [pos, mark] of inserts) {
    out += html.slice(from, pos) + mark;
    from = pos;
  }
  return out + html.slice(from);
}

/** The offset in the page before a line's first character that is not whitespace (as decoded), or after its last. */
function edgeOf(toks: number[], p: PageDeck, at: Int32Array, which: 'first' | 'last'): number | undefined {
  const order = which === 'first' ? toks : [...toks].reverse();
  for (const t of order) {
    const pieces: { from: number; to: number; value: string; ref: boolean }[] = [];
    parseEntities(p.tokens[t]!.raw, {
      reference: (value, pos) => void pieces.push({ from: pos.start.offset ?? 0, to: pos.end.offset ?? 0, value, ref: true }),
      text: (value, pos) => void pieces.push({ from: pos.start.offset ?? 0, to: pos.end.offset ?? 0, value, ref: false }),
    });
    // Each character of a text piece is one raw character; a reference is its whole source.
    const chars: { from: number; to: number; c: string }[] = [];
    for (const x of pieces) {
      if (x.ref) chars.push({ from: x.from, to: x.to, c: x.value });
      else for (let i = 0; i < x.value.length; i++) chars.push({ from: x.from + i, to: x.from + i + 1, c: x.value[i]! });
    }
    const shown = (c: string) => [...c].some((ch) => !isHtmlSpace(ch));
    if (which === 'first') {
      const c = chars.find((x) => shown(x.c));
      if (c) return at[t]! + c.from;
    } else {
      const c = chars.findLast((x) => shown(x.c));
      if (c) return at[t]! + c.to;
    }
  }
  return undefined;
}

/** A read with the marks taken out: each character's link address (null outside links), and each line's marks. */
interface Unmarked {
  text: string;
  hrefs: (string | null)[];
  starts: Map<number, number[]>;
  ends: Map<number, number[]>;
}

function unmark(s: string, hrefs: readonly string[] = []): Unmarked {
  const out: Unmarked = { text: '', hrefs: [], starts: new Map(), ends: new Map() };
  const links: number[] = [];
  const number = (i: number, stop: string): [number, number] => {
    let n = 0;
    let j = i;
    while (j < s.length && s[j] !== stop) n = n * 10 + (s.charCodeAt(j++) - LINK_DIGIT_0);
    return [n, j + 1];
  };
  const parts: string[] = [];
  let length = 0;
  for (let i = 0; i < s.length; ) {
    const c = s[i]!;
    if (c === LINK_OPEN) {
      const [n, j] = number(i + 1, LINK_INDEX_END);
      links.push(n);
      i = j;
    } else if (c === LINK_CLOSE) {
      links.pop();
      i++;
    } else if (c === LINE_START || c === LINE_END) {
      const [n, j] = number(i + 1, NUMBER_END);
      const m = c === LINE_START ? out.starts : out.ends;
      const xs = m.get(n);
      if (xs) xs.push(length);
      else m.set(n, [length]);
      i = j;
    } else {
      // A run of plain characters at once (HIDDEN_HERE and REVERSED are plain here).
      let j = i + 1;
      while (j < s.length && s[j] !== LINK_OPEN && s[j] !== LINK_CLOSE && s[j] !== LINE_START && s[j] !== LINE_END) j++;
      const run = s.slice(i, j);
      parts.push(run);
      length += run.length;
      const h = links.length ? (hrefs[links.at(-1)!] ?? null) : null;
      for (let q = 0; q < run.length; q++) out.hrefs.push(h);
      i = j;
    }
  }
  out.text = parts.join('');
  return out;
}

/** The line marks (by line number) in a text: how many starts and ends. */
function markCounts(s: string): Map<number, { starts: number; ends: number }> {
  const u = unmark(s);
  const out = new Map<number, { starts: number; ends: number }>();
  const add = (m: Map<number, number[]>, key: 'starts' | 'ends') => {
    for (const [k, xs] of m) {
      const c = out.get(k) ?? { starts: 0, ends: 0 };
      c[key] += xs.length;
      out.set(k, c);
    }
  };
  add(u.starts, 'starts');
  add(u.ends, 'ends');
  return out;
}

/**
 * How two neighbouring shown characters sit, as the visitor read gives it: glued (G), apart in one flow of text (S),
 * apart across boxes or at a forced break (B), or the second shown before the first (R).
 */
type Gap = 'G' | 'S' | 'B' | 'R';
const RANK: Record<Gap, number> = { G: 0, S: 1, R: 2, B: 3 };
const stronger = (a: Gap, b: Gap): Gap => (RANK[a] >= RANK[b] ? a : b);

/** A read as compared: its characters (by code point), the gap before each, where hidden text stands, each link. */
interface Seq {
  cs: string[];
  /** gaps[k]: between cs[k - 1] and cs[k] ('G' for k = 0). */
  gaps: Gap[];
  /** Text hidden from sight follows cs[k] (before the next shown character). */
  hid: boolean[];
  hidFirst: boolean;
  hrefs: (string | null)[];
  /** Where cs[k] is in the text it was read from. */
  src: number[];
}

function seqOf(text: string, hrefs?: readonly (string | null)[]): Seq {
  const out: Seq = { cs: [], gaps: [], hid: [], hidFirst: false, hrefs: [], src: [] };
  let gap: Gap | undefined;
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    const w = cp > 0xffff ? 2 : 1;
    const c = text.slice(i, i + w);
    if (c === HIDDEN_HERE) {
      if (out.cs.length) out.hid[out.cs.length - 1] = true;
      else out.hidFirst = true;
    } else if (isHtmlSpace(c) || c === REVERSED) {
      const g: Gap = c === REVERSED ? 'R' : c === '\n' || c === '\r' ? 'B' : 'S';
      gap = gap ? stronger(gap, g) : g;
    } else {
      out.gaps.push(out.cs.length ? (gap ?? 'G') : 'G');
      out.cs.push(c);
      out.hid.push(false);
      out.hrefs.push(hrefs?.[i] ?? null);
      out.src.push(i);
      gap = undefined;
    }
    i += w;
  }
  return out;
}

/** Where a line shows: in the page's body text or in its title, from `start` to `end`. */
export interface Span {
  in: 'body' | 'title';
  start: number;
  end: number;
}

/** Why a line is not offered (see notShownWhy). */
export type NotShownWhy = 'unlaid' | 'hidden' | 'part-hidden' | 'layout' | 'changed' | 'script' | 'copied';

/** The page before as Chromium shows it, and where each of its deck lines (by number in the whole deck) shows. */
export interface Location {
  body: string;
  hrefs: (string | null)[];
  title: string;
  /** The page's text a style hides from sight, run by run, with its link (ShownText.hidden). */
  hidden: ShownText['hidden'];
  spans: Map<number, Span>;
  /** Why each line that is not placed is not (when the copy agrees). */
  why: Map<number, NotShownWhy>;
  /** The marked copy reads as the page does: else no line is placed, and none can be changed. */
  agrees: boolean;
}

/** The marked copy of a page Chromium reads to place its lines, or undefined when the page holds the marks' characters. */
export const markedCopy = (html: string): string | undefined => (MARKS.test(html) ? undefined : markLines(html));

/** Read the page and its marked copy in Chromium, and place each deck line where Chromium shows it. */
export async function locateLines(pages: PageRenderer, resolve: ArtifactResolver, html: string, opts: RenderOptions = {}): Promise<Location> {
  const plain = await pages.shownText(html, resolve, opts);
  const copy = markedCopy(html);
  return locate(html, plain, copy === undefined ? undefined : await pages.shownText(copy, resolve, opts));
}

/** The deck line's characters (by code point) and, before each, whether the line has a space there. */
function deckChars(text: string): { cs: string[]; space: boolean[] } {
  const cs: string[] = [];
  const space: boolean[] = [];
  let sp = false;
  for (const c of text) {
    if (isHtmlSpace(c)) sp = true;
    else {
      cs.push(c);
      space.push(cs.length > 1 && sp);
      sp = false;
    }
  }
  return { cs, space };
}

/**
 * Whether a slice of a read (from a line's start mark to its end mark) shows exactly the deck line: its characters, no
 * hidden text among them, and each gap as the deck allows (where the line has a space, apart; where it has none, glued
 * or parted by the page's own boxes; never in the other order).
 */
function showsAsLine(slice: Seq, line: string): boolean {
  const d = deckChars(line);
  if (slice.hidFirst || slice.cs.length !== d.cs.length || !slice.cs.length) return false;
  for (let k = 0; k < d.cs.length; k++) {
    if (slice.cs[k] !== d.cs[k]) return false;
    if (k < d.cs.length - 1 && slice.hid[k]) return false;
    if (k === 0) continue;
    const g = slice.gaps[k]!;
    if (g === 'R' || (d.space[k] && g === 'G')) return false;
  }
  return true;
}

const stripMarks = (hidden: ShownText['hidden']): ShownText['hidden'] => hidden.map(([t, h]) => [unmark(t).text.replace(/[ \t\n\f\r]+/g, ' ').trim(), h] as [string, string | null]).filter(([t]) => t !== '');

/** Place each deck line of `html` in Chromium's reading of its marked copy (see the module comment). */
export function locate(html: string, plain: ShownText, marked: ShownText | undefined): Location {
  const none: Location = { body: plain.text, hrefs: unmark(plain.linked, plain.hrefs).hrefs, title: plain.title, hidden: plain.hidden, spans: new Map(), why: new Map(), agrees: false };
  if (!marked) return none;
  const body = unmark(marked.linked, marked.hrefs);
  const lines = unmark(marked.text);
  const title = unmark(marked.title);
  // The copy must read as the page does, marks aside, hiding the same text, and its links must not change what it shows.
  const plainLinks = unmark(plain.linked, plain.hrefs);
  const same = lines.text === plain.text && body.text === plain.text && plainLinks.text === plain.text && title.text === plain.title && JSON.stringify(stripMarks(marked.hidden)) === JSON.stringify(stripMarks(plain.hidden)) && body.hrefs.every((h, i) => h === plainLinks.hrefs[i]);
  if (!same) return none;
  const p = readPageCopy(html);
  const spans = new Map<number, Span>();
  const why = new Map<number, NotShownWhy>();
  const hiddenMarks = markCounts(marked.hidden.map(([t]) => t).join(' '));
  const unlaidMarks = markCounts(marked.unlaid);
  p.units.forEach((u, k) => {
    for (const [where, read] of [['body', body], ['title', title]] as const) {
      const s = read.starts.get(k);
      const e = read.ends.get(k);
      if (!s || !e || s.length !== 1 || e.length !== 1 || s[0]! > e[0]!) continue;
      if (showsAsLine(seqOf(read.text.slice(s[0], e[0])), u.text)) spans.set(k, { in: where, start: s[0]!, end: e[0]! });
    }
    if (spans.has(k)) return;
    // Why not: where its marks are.
    const shownS = (body.starts.get(k)?.length ?? 0) + (title.starts.get(k)?.length ?? 0);
    const shownE = (body.ends.get(k)?.length ?? 0) + (title.ends.get(k)?.length ?? 0);
    const hid = hiddenMarks.get(k) ?? { starts: 0, ends: 0 };
    const un = unlaidMarks.get(k) ?? { starts: 0, ends: 0 };
    const starts = shownS + hid.starts + un.starts;
    const ends = shownE + hid.ends + un.ends;
    let r: NotShownWhy;
    if (starts > 1 || ends > 1) r = 'copied';
    else if (starts === 0 || ends === 0) r = 'script';
    else if (un.starts && un.ends) r = 'unlaid';
    else if (!shownS && !shownE) r = 'hidden';
    else if (!shownS || !shownE) r = 'part-hidden';
    else {
      const s = (body.starts.get(k) ?? title.starts.get(k))![0]!;
      const e = (body.ends.get(k) ?? title.ends.get(k))![0]!;
      const read = body.starts.has(k) ? body : title;
      const slice = s <= e ? seqOf(read.text.slice(s, e)) : undefined;
      r = !slice ? 'layout' : slice.hid.some((h, x) => h && x < slice.cs.length - 1) ? 'part-hidden' : slice.cs.join('') !== deckChars(u.text).cs.join('') ? 'changed' : 'layout';
    }
    why.set(k, r);
  });
  return { body: body.text, hrefs: body.hrefs, title: title.text, hidden: plain.hidden, spans, why, agrees: true };
}

/** The deck lines (by number in the whole deck) a browser does not show as the deck reads them: they are not offered. */
export function notShown(html: string, loc: Location): Set<number> {
  if (!loc.agrees) return new Set();
  const p = readPageCopy(html);
  return new Set(p.units.map((_, k) => k).filter((k) => !loc.spans.has(k)));
}

/** Why a line is not offered, as the VOICE prompt says it. */
export const WHY_NOT_SHOWN: Record<NotShownWhy, string> = {
  unlaid: 'not shown on this page at all (hidden, closed, or shown only on another screen size)',
  hidden: 'hidden from sight (for screen readers, or until a visitor opens it)',
  'part-hidden': 'part of it is hidden from sight (for screen readers) or cut off',
  layout: 'a browser shows its words run together or in another order',
  changed: 'a browser shows other words there (a script on the page changes it, or other text shows inside it)',
  script: 'a script on the page changes or removes it',
  copied: 'a script on the page shows it more than once',
};

/** The lines not offered (by number in the whole deck), each with why, in deck order. */
export function notShownWhy(html: string, loc: Location): [number, NotShownWhy][] {
  return [...notShown(html, loc)].sort((a, b) => a - b).map((k) => [k, loc.why.get(k) ?? 'layout']);
}

/** One allowed gap or more, as letters (see Gap). */
type Allowed = string;
/** What the written page must show (a Seq whose gaps may each allow more than one way). */
interface Want {
  cs: string[];
  gaps: Allowed[];
  hid: boolean[];
  hidFirst: boolean;
  hrefs: (string | null)[];
  /** For each character, the offered line (1-based) whose words it is, or 0. */
  lineAt: number[];
  /** For each character from the page before, its place in the text read before (-1 for the person's own). */
  src: number[];
}

/** What the written page must show: its body and title, and where each changed line went. */
interface Expected {
  body: Want;
  title: Want;
  /** The text a style hides from sight, as the page before had it: no changed line holds any (the offer rule). */
  hidden: ShownText['hidden'];
  /** Each changed line's place in `body` (a deleted line: where it was), by character. */
  places: { line: number; start: number; end: number; in: 'body' | 'title' }[];
  /** Every placed deck line's span in the text read before, with its offered number (0 when not offered). */
  spans: { line: number; start: number; end: number; in: 'body' | 'title' }[];
}

/** A changed line, ready to go in: its characters, the gap allowed before each, their links, and its edges. */
interface Replacement {
  span: Span;
  line: number;
  cs: string[];
  gaps: Allowed[];
  hrefs: (string | null)[];
  lead: boolean;
  trail: boolean;
}

/**
 * The gap allowed before each of the person's characters (see the module comment): a typed space, apart (in the flow
 * or across boxes); none, glued; except where the pair stood side by side in the line before, with the same spacing in
 * the deck, which keeps the gap it had (matched by a shortest edit script of the line's characters, at most 2,000
 * apart; past that, by the common start and end).
 */
function gapsFor(oldCs: readonly string[], oldGaps: readonly Gap[], oldSpace: readonly boolean[], cs: readonly string[], space: readonly boolean[]): Allowed[] {
  let pairs = editPairs(oldCs, cs, 2000);
  if (!pairs) {
    pairs = [];
    let a = 0;
    while (a < oldCs.length && a < cs.length && oldCs[a] === cs[a]) {
      pairs.push([a, a]);
      a++;
    }
    const tail: [number, number][] = [];
    for (let b = 0; b < oldCs.length - a && b < cs.length - a && oldCs[oldCs.length - 1 - b] === cs[cs.length - 1 - b]; b++) tail.push([oldCs.length - 1 - b, cs.length - 1 - b]);
    pairs.push(...tail.reverse());
  }
  const from = new Int32Array(cs.length).fill(-1);
  for (const [o, n] of pairs) from[n] = o;
  return cs.map((_, n) => {
    if (n === 0) return 'G';
    const o = from[n]!;
    if (o > 0 && from[n - 1] === o - 1 && oldSpace[o] === space[n]) return oldGaps[o]!;
    return space[n] ? 'SB' : 'G';
  });
}

/**
 * The text the written page must show (see the module comment), or a refusal naming the line. `notOffered` is the set
 * the offered deck was read with (readPageCopy), so offered line i is the i-th line not in it.
 */
export function expectedShown(html: string, loc: Location, notOffered: ReadonlySet<number>, edit: PageEdit): Expected | { problem: string; line: number } {
  const full = readPageCopy(html);
  const offered = full.units.map((_, k) => k).filter((k) => !notOffered.has(k));
  const offeredLine = new Map(offered.map((k, i) => [k, i + 1]));
  const before = { body: seqOf(loc.body, loc.hrefs), title: seqOf(loc.title) };
  const repl: Replacement[] = [];
  for (const [i, line] of edit.lines.entries()) {
    if (!line.changed) continue;
    const n = i + 1;
    const k = offered[i]!;
    const u = full.units[k]!;
    const span = loc.spans.get(k);
    const cannot = (why: string) => ({ problem: `byway could not put line ${n} on this page exactly as you wrote it, because ${why}. Leave line ${n} as it was offered.`, line: n });
    if (MARKS.test(line.text)) return { problem: `Line ${n} has a character byway uses to mark a page while it checks it (a noncharacter, U+FDD0 to U+FDEF), which a page does not show: take it out.`, line: n };
    if (!loc.agrees) return cannot('byway could not match this page\'s lines to what a browser shows, so it cannot check a change');
    if (!span) return cannot('a browser does not show that line where byway reads it, so byway cannot check a change to it');
    const seq = before[span.in];
    const k0 = seq.src.findIndex((x) => x >= span.start);
    const k1 = k0 < 0 ? seq.cs.length : (() => { let j = k0; while (j < seq.cs.length && seq.src[j]! < span.end) j++; return j; })();
    // The line's link words as Chromium shows them must be the deck's: each bracketed part one address, nothing else in a link.
    // A deleted line has no words to give a link (the page's other text keeps its links, checked against the written page).
    const partHref: (string | null)[] = [];
    if (span.in === 'body' && line.text) {
      let x = k0;
      let part = -1;
      for (const w of u.words) {
        if (w.kind === 'link') part++;
        for (const c of w.text) {
          if (isHtmlSpace(c)) continue;
          const h = seq.hrefs[x++] ?? null;
          if (w.kind === 'out' ? h !== null : h === null || (partHref[part] !== undefined && partHref[part] !== h)) {
            return cannot(`a browser shows its link words differently from how they were offered (${h === null ? `"${w.text}" is not a link's words there` : `its words are in the link to ${h}`})`);
          }
          if (w.kind === 'link') partHref[part] = h;
        }
      }
    }
    // The person's characters, with their links: a bracketed part goes to its link's address, as the line's k-th link.
    const cs: string[] = [];
    const space: boolean[] = [];
    const hrefs: (string | null)[] = [];
    let part = -1;
    let sp = false;
    const segs = u.marked ? line.segs : [{ kind: u.words[0]!.kind, text: line.text }];
    for (const seg of segs) {
      if (seg.kind === 'link') part++;
      for (const c of seg.text) {
        if (isHtmlSpace(c)) {
          sp = true;
          continue;
        }
        cs.push(c);
        space.push(cs.length > 1 && sp);
        sp = false;
        hrefs.push(seg.kind === 'link' ? (partHref[part] ?? null) : null);
      }
    }
    const old = deckChars(u.text);
    const gaps = gapsFor(seq.cs.slice(k0, k1), seq.gaps.slice(k0, k1), old.space, cs, space);
    repl.push({ span: { in: span.in, start: k0, end: k1 }, line: n, cs, gaps, hrefs, lead: !!line.lead && cs.length > 0, trail: !!line.trail && cs.length > 0 });
  }
  const build = (where: 'body' | 'title') => {
    const src = before[where];
    const rs = repl.filter((r) => r.span.in === where).sort((x, y) => x.span.start - y.span.start);
    const out: Want = { cs: [], gaps: [], hid: [], hidFirst: src.hidFirst, hrefs: [], lineAt: [], src: [] };
    const places: Expected['places'] = [];
    // The gap to put before the next character: the page's own (as merged over deleted lines), or apart for a typed space.
    let pending: Gap | undefined;
    let typed = false;
    const markHid = (h: boolean) => {
      if (!h) return;
      if (out.cs.length) out.hid[out.cs.length - 1] = true;
      else out.hidFirst = true;
    };
    const push = (c: string, gap: Allowed, href: string | null, line: number, from: number) => {
      out.gaps.push(out.cs.length ? gap : 'G');
      out.cs.push(c);
      out.hid.push(false);
      out.hrefs.push(href);
      out.lineAt.push(line);
      out.src.push(from);
    };
    const gapBefore = (own: Gap): Allowed => (typed ? 'SB' : (pending ?? own));
    let k = 0;
    for (const r of rs) {
      for (; k < r.span.start; k++) {
        push(src.cs[k]!, gapBefore(src.gaps[k]!), src.hrefs[k]!, 0, src.src[k]!);
        markHid(src.hid[k]!);
        pending = undefined;
        typed = false;
      }
      // The gap before the line, as the page had it (merged with any deleted line just before).
      const edgeIn = r.span.start < src.cs.length && r.span.start > 0 ? src.gaps[r.span.start]! : undefined;
      if (edgeIn) pending = pending ? stronger(pending, edgeIn) : edgeIn;
      const start = out.cs.length;
      if (r.cs.length) {
        push(r.cs[0]!, r.lead || typed ? 'SB' : (pending ?? 'G'), r.hrefs[0]!, r.line, -1);
        for (let q = 1; q < r.cs.length; q++) push(r.cs[q]!, r.gaps[q]!, r.hrefs[q]!, r.line, -1);
        pending = undefined;
        typed = r.trail;
      }
      // Hidden text right after the line stays right after what stands before it now.
      if (r.span.end > r.span.start) markHid(src.hid[r.span.end - 1]!);
      places.push({ line: r.line, start, end: out.cs.length, in: where });
      // The gap after the line, as the page had it (merged into the pending one for a deleted line).
      const edgeOut = r.span.end < src.cs.length ? src.gaps[r.span.end]! : undefined;
      if (edgeOut) pending = pending ? stronger(pending, edgeOut) : edgeOut;
      k = r.span.end;
    }
    for (; k < src.cs.length; k++) {
      push(src.cs[k]!, gapBefore(src.gaps[k]!), src.hrefs[k]!, 0, src.src[k]!);
      markHid(src.hid[k]!);
      pending = undefined;
      typed = false;
    }
    return { want: out, places };
  };
  const b = build('body');
  const t = build('title');
  const spans: Expected['spans'] = [...loc.spans].map(([k, s]) => ({ line: offeredLine.get(k) ?? 0, start: s.start, end: s.end, in: s.in }));
  return { body: b.want, title: t.want, hidden: loc.hidden, places: [...b.places, ...t.places], spans };
}

/**
 * How the text hidden from sight differs between two pages, run by run (text and link): the first text the written
 * page hides that the page before did not, else the first the page before hid that it does not; undefined when the
 * same text is hidden, in the same links, in the same order.
 */
function hiddenChange(before: ShownText['hidden'], after: ShownText['hidden']): string | undefined {
  const key = ([t, h]: ShownText['hidden'][number]) => `${h ?? ''}\u0000${t}`;
  const count = (xs: ShownText['hidden']) => xs.reduce((m, x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1), new Map<string, number>());
  const was = count(before);
  const now = count(after);
  const more = (xs: ShownText['hidden'], than: Map<string, number>, own: Map<string, number>) => xs.find((x) => (own.get(key(x)) ?? 0) > (than.get(key(x)) ?? 0));
  const hid = more(after, was, now);
  const shown = more(before, now, was);
  if (hid && shown && hid[0] === shown[0]) return `a browser would show the words "${hid[0]}", which a style on this page hides from sight, ${hid[1] === null ? `outside the link (to ${shown[1]}) they were in` : shown[1] === null ? `as words of a link (to ${hid[1]})` : `in the link to ${hid[1]}, not ${shown[1]}`}`;
  if (hid) return `a style on this page would hide "${hid[0]}" from sight there (a browser lays that text out, as for a screen reader, but does not show it)`;
  if (shown) return `a browser would show "${shown[0]}", which a style on this page hid from sight before`;
  if (before.length !== after.length || before.some((x, i) => key(x) !== key(after[i]!))) return 'a browser would hide from sight, in another order, the text a style on this page hides';
  return undefined;
}

const GAP_SHOWN: Record<Gap, string> = { G: '', S: ' ', B: ' / ', R: ' ' };
/** A snippet of a read around character `d`, separators across boxes shown as " / ". */
const around = (s: Seq, d: number): string => {
  const from = Math.max(0, d - 24);
  const to = Math.min(s.cs.length, d + 24);
  let t = '';
  for (let k = from; k < to; k++) t += (k > from ? GAP_SHOWN[s.gaps[k]!] : '') + s.cs[k];
  return `${from > 0 ? '…' : ''}${t}${to < s.cs.length ? '…' : ''}`;
};
/** The expected text from character `a` to `b`, as `around` shows a read. */
const wantText = (w: Want, a: number, b: number): string => {
  let t = '';
  for (let k = Math.max(0, a); k < Math.min(w.cs.length, b); k++) t += (k > a ? (w.gaps[k] === 'G' ? '' : w.gaps[k] === 'B' ? ' / ' : ' ') : '') + w.cs[k];
  return t;
};

/**
 * Whether the written page, as Chromium shows it (`after`), is exactly the expected text: a problem naming the line
 * where they first differ, or undefined.
 */
export function arbiterProblem(exp: Expected, after: ShownText): { problem: string; line: number } | undefined {
  const linkRead = unmark(after.linked, after.hrefs);
  const got = seqOf(after.text, linkRead.text === after.text ? linkRead.hrefs : undefined);
  const want = exp.body;
  const nearest = (k: number): number => {
    const at = want.lineAt[k];
    if (at) return at;
    let best = 0;
    let dist = Infinity;
    for (const pl of exp.places) {
      if (pl.in !== 'body') continue;
      const d = k < pl.start ? pl.start - k : k >= pl.end ? k - pl.end + 1 : 0;
      if (d < dist) {
        dist = d;
        best = pl.line;
      }
    }
    return best || (exp.places[0]?.line ?? 1);
  };
  const say = (line: number, why: string) => ({ problem: `byway could not put line ${line} on this page exactly as you wrote it, because ${why}. Change line ${line} again, or leave it as it was offered.`, line });
  // The title: its characters, and a space where it had one or the person typed one.
  const titleGot = seqOf(after.title);
  const tw = exp.title;
  if (tw.cs.join('') !== titleGot.cs.join('') || tw.cs.some((_, k) => k > 0 && !tw.gaps[k]!.includes(titleGot.gaps[k]!))) {
    const line = exp.places.find((pl) => pl.in === 'title')?.line ?? nearest(0);
    return say(line, `a browser would show the page's title as "${after.title}", not "${tw.cs.map((c, k) => (k > 0 && tw.gaps[k] !== 'G' ? ' ' : '') + c).join('')}"`);
  }
  let d = 0;
  while (d < want.cs.length && d < got.cs.length && want.cs[d] === got.cs[d] && (d === 0 || want.gaps[d]!.includes(got.gaps[d]!)) && want.hid[d] === got.hid[d]) d++;
  // Text a style hides from sight is not in the text compared: the person's words put there would be missing from it,
  // and text the edit pushes out of sight (or brings into it) would differ. Said as such, naming the line nearest.
  const sight = hiddenChange(exp.hidden, after.hidden);
  if (sight) return say(d < want.cs.length || d < got.cs.length ? nearest(Math.min(d, Math.max(want.cs.length - 1, 0))) : (exp.places[0]?.line ?? 1), sight);
  if (want.hidFirst !== got.hidFirst) return say(nearest(0), 'a browser would show the text a style on this page hides from sight in another place');
  if (d < want.cs.length || d < got.cs.length) {
    const line = nearest(Math.min(d, Math.max(want.cs.length - 1, 0)));
    const shows = `it would show "${around(got, d)}"`;
    let why: string;
    if (d >= want.cs.length) why = `a browser would show text your lines do not have: ${shows}`;
    else if (d >= got.cs.length) why = `a browser would not show all of your lines: it would end with "${around(got, d)}"`;
    else if (want.cs[d] !== got.cs[d]) {
      // Characters differ. Outside the changed lines, that is other text of the page changing (as a script on the page
      // may write it from the lines changed).
      const outside = !want.lineAt[d] && !(d > 0 && want.lineAt[d - 1]) && want.src[d]! >= 0;
      const inLine = outside ? exp.spans.find((s) => s.in === 'body' && want.src[d]! >= s.start && want.src[d]! < s.end) : undefined;
      if (outside && inLine?.line) why = `a browser would show line ${inLine.line}, which you did not change, otherwise: ${shows}, where it showed "${wantText(want, Math.max(0, d - 12), d + 12)}"`;
      else if (outside) why = `other text on this page, not one of your lines, would change (as when a script on the page writes it from your lines): ${shows}, where it showed "${wantText(want, Math.max(0, d - 12), d + 12)}"`;
      else why = `a browser would show "${around(got, d)}" there`;
    } else if (want.hid[d] !== got.hid[d]) why = `a browser would show the text a style on this page hides from sight in another place: ${shows}`;
    else {
      const w = want.gaps[d]!;
      const g = got.gaps[d]!;
      if (g === 'G') why = `a browser would run words together that your lines keep apart: ${shows}`;
      else if (g === 'R' || w === 'R') why = `a browser would show words in another order than your lines have them: ${shows}`;
      else if (w === 'G') why = `a browser would show ${g === 'B' ? 'a line break' : 'a space'} that your lines do not have: ${shows}`;
      else if (w === 'B') why = `a browser would show on one line what it showed on separate lines: ${shows}`;
      else why = `a browser would show on separate lines what it showed on one line: ${shows}`;
    }
    return say(line, why);
  }
  // Link membership: the same characters, each in the expected link.
  if (linkRead.text !== after.text) return say(nearest(0), 'byway could not read which words a browser shows as link words on the written page');
  for (let x = 0; x < want.cs.length; x++) {
    if (want.hrefs[x] === got.hrefs[x]) continue;
    const line = nearest(x);
    const word = around(got, x);
    const h = got.hrefs[x];
    const e = want.hrefs[x];
    return say(line, h === null ? `a browser would show the words at "${word}" outside the link (to ${e}) they belong to` : e === null ? `a browser would show the words at "${word}" as words of a link (to ${h})` : `a browser would show the words at "${word}" in the link to ${h}, not ${e}`);
  }
  return undefined;
}

/**
 * The arbiter's last word on a page write: Chromium's reading of the written page against what it must show. A
 * problem (naming the line) refuses the write; undefined lets it be stored.
 */
export async function arbitrate(pages: PageRenderer, resolve: ArtifactResolver, before: string, written: string, loc: Location, notOffered: ReadonlySet<number>, edit: PageEdit, opts: RenderOptions = {}): Promise<{ problem: string; line: number } | undefined> {
  const exp = expectedShown(before, loc, notOffered, edit);
  if ('problem' in exp) return exp;
  if (MARKS.test(written)) return { problem: 'byway could not check this edit against a browser: the page holds characters byway uses to mark it. Leave your lines as they were offered.', line: 0 };
  return arbiterProblem(exp, await pages.shownText(written, resolve, opts));
}
