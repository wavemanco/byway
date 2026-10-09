/**
 * VOICE's browser arbiter for a web page (F07, ADR-0081). The page reader (page-copy.ts and html-tokens.ts) is a model of
 * how browsers build and show a page, and placement and the in-code verifier both depend on it, so a misread there is a
 * write the verifier cannot see. The arbiter asks the browser: the runner's own Chromium, with JavaScript off
 * (PageRenderer.shownText). It is the last word on every page write, and it fails closed.
 *
 * - Where each line shows (`locate`). A copy of the page is marked at each deck line's first and last character (a pair
 *   of noncharacters with the line's number, put into the text, so no element changes), and Chromium reads the page
 *   and the copy. A line is shown where its two marks each appear once, the start before the end, with exactly the
 *   line's words between them (each run of whitespace read as one space, a line break included). The copy must read
 *   as the page does once the marks are taken out; if it does not, no line is placed.
 * - What is offered (`notShown`): a line a browser does not show so (hidden, a tooltip, or read where it is not shown)
 *   is not offered, and stays byte for byte.
 * - What the written page must show (`expectedShown`): the page before as Chromium showed it, with each changed or
 *   deleted line's words replaced by the person's (brackets taken out), and everything else, the separators between
 *   lines included, as the page had it. A gap between two of the person's words is one space, except inside a line
 *   Chromium showed broken over screen lines (by a style the deck does not read), where it may be a space or a line
 *   break. Each shown character's link (by address) is as the page had it, and the person's link words are in the link
 *   they bracketed.
 * - The check (`arbiterProblem`): Chromium's reading of the written page, with each run of whitespace read as one space
 *   or, when it holds a line break, one line break, and its ends trimmed, must equal the expected text exactly, and
 *   every shown character must be in the expected link. Any difference refuses the write, naming the line.
 *
 * Pure but for the reads (`locateLines`, `arbitrate`), which go to the renderer. Activity code only.
 */
import { parseEntities } from 'parse-entities';
import { isHtmlSpace, squashHtml } from './html-tokens.ts';
import { readPageCopy, type PageDeck, type PageEdit } from './page-copy.ts';
import { LINK_CLOSE, LINK_DIGIT_0, LINK_INDEX_END, LINK_OPEN, type ArtifactResolver, type PageRenderer, type RenderOptions, type ShownText } from './pages.ts';

/** A line's marks in the arbiter's copy of a page: its start, its end, then its number in digits, then the end of the number. */
const LINE_START = '﷓';
const LINE_END = '﷔';
const NUMBER_END = '﷕';
/** In an expected text: a gap that may show as a space or a line break. */
const ANY_GAP = '﷖';
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

/** A shown text with the marks taken out: each character's link address (null outside links), and each line's marks. */
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
      // A run of plain characters at once.
      let j = i + 1;
      while (j < s.length && !MARKS.test(s[j]!)) j++;
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

/** Where a line shows: in the page's body text or in its title, from `start` to `end`. */
export interface Span {
  in: 'body' | 'title';
  start: number;
  end: number;
}

/** The page before as Chromium shows it, and where each of its deck lines (by number in the whole deck) shows. */
export interface Location {
  body: string;
  hrefs: (string | null)[];
  title: string;
  spans: Map<number, Span>;
  /** The marked copy reads as the page does: else no line is placed, and none can be changed. */
  agrees: boolean;
}

/** A shown text as compared: each run of whitespace one gap (a line break when it holds one), ends trimmed. */
interface Shape {
  /** Characters and gaps: ' ', '\n', or ANY_GAP (either). */
  cs: string[];
  hrefs: (string | null)[];
  /** For each, the index in the text it was read from. */
  src: number[];
}

function shape(text: string, hrefs?: readonly (string | null)[]): Shape {
  const out: Shape = { cs: [], hrefs: [], src: [] };
  let gap = '';
  let gapAt = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (isHtmlSpace(c) || c === ANY_GAP) {
      const kind = c === '\n' || c === '\r' ? '\n' : c === ANY_GAP ? ANY_GAP : ' ';
      if (!gap) gapAt = i;
      gap = gap === '\n' || kind === '\n' ? '\n' : gap === ANY_GAP || kind === ANY_GAP ? ANY_GAP : ' ';
      continue;
    }
    if (gap && out.cs.length) {
      out.cs.push(gap);
      out.hrefs.push(null);
      out.src.push(gapAt);
    }
    gap = '';
    out.cs.push(c);
    out.hrefs.push(hrefs?.[i] ?? null);
    out.src.push(i);
  }
  return out;
}
const flat = (s: Shape) => s.cs.join('');
const plainOf = (s: string) => flat(shape(s));

/** The marked copy of a page Chromium reads to place its lines, or undefined when the page holds the marks' characters. */
export const markedCopy = (html: string): string | undefined => (MARKS.test(html) ? undefined : markLines(html));

/** Read the page and its marked copy in Chromium, and place each deck line where Chromium shows it. */
export async function locateLines(pages: PageRenderer, resolve: ArtifactResolver, html: string, opts: RenderOptions = {}): Promise<Location> {
  const plain = await pages.shownText(html, resolve, opts);
  const copy = markedCopy(html);
  return locate(html, plain, copy === undefined ? undefined : await pages.shownText(copy, resolve, opts));
}

/** Place each deck line of `html` in Chromium's reading of its marked copy (see the module comment). */
export function locate(html: string, plain: ShownText, marked: ShownText | undefined): Location {
  const none: Location = { body: plain.text, hrefs: unmark(plain.linked, plain.hrefs).hrefs, title: plain.title, spans: new Map(), agrees: false };
  if (!marked) return none;
  const body = unmark(marked.linked, marked.hrefs);
  const lines = unmark(marked.text);
  const title = unmark(marked.title);
  // The copy must read as the page does, marks aside, and its links must not change what it shows.
  if (plainOf(lines.text) !== plainOf(plain.text) || plainOf(body.text) !== plainOf(plain.text) || plainOf(title.text) !== plainOf(plain.title)) return none;
  const p = readPageCopy(html);
  const spans = new Map<number, Span>();
  p.units.forEach((u, k) => {
    for (const [where, read] of [['body', body], ['title', title]] as const) {
      const s = read.starts.get(k);
      const e = read.ends.get(k);
      if (!s || !e) continue;
      if (s.length === 1 && e.length === 1 && s[0]! <= e[0]! && squashHtml(read.text.slice(s[0], e[0])) === u.text) spans.set(k, { in: where, start: s[0]!, end: e[0]! });
    }
  });
  return { body: body.text, hrefs: body.hrefs, title: title.text, spans, agrees: true };
}

/** The deck lines (by number in the whole deck) a browser does not show as the deck reads them: they are not offered. */
export function notShown(html: string, loc: Location): Set<number> {
  if (!loc.agrees) return new Set();
  const p = readPageCopy(html);
  return new Set(p.units.map((_, k) => k).filter((k) => !loc.spans.has(k)));
}

/** What the written page must show: its body and title, each character's link, and where each changed line went. */
interface Expected {
  body: string;
  hrefs: (string | null)[];
  title: string;
  /** For each character of `body`, the offered line (1-based) whose words it is, or 0. */
  lineAt: number[];
  /** Each changed line's place in `body` (a deleted line: where it was). */
  places: { line: number; start: number; end: number; in: 'body' | 'title' }[];
}

/** A line's words and the gaps between them, as Chromium showed them. */
const wordsOf = (t: string): { words: string[]; gaps: string[] } => {
  const words: string[] = [];
  const gaps: string[] = [];
  let i = 0;
  while (i < t.length && isHtmlSpace(t[i])) i++;
  while (i < t.length) {
    let j = i;
    while (j < t.length && !isHtmlSpace(t[j])) j++;
    words.push(t.slice(i, j));
    let k = j;
    while (k < t.length && isHtmlSpace(t[k])) k++;
    if (k < t.length) gaps.push(t.slice(j, k));
    i = k;
  }
  return { words, gaps };
};

/**
 * The text the written page must show (see the module comment), or a refusal naming the line. `notOffered` is the set
 * the offered deck was read with (readPageCopy), so offered line i is the i-th line not in it.
 */
export function expectedShown(html: string, loc: Location, notOffered: ReadonlySet<number>, edit: PageEdit): Expected | { problem: string; line: number } {
  const full = readPageCopy(html);
  const offered = full.units.map((_, k) => k).filter((k) => !notOffered.has(k));
  const repl: { span: Span; line: number; text: string; hrefs: (string | null)[] }[] = [];
  for (const [i, line] of edit.lines.entries()) {
    if (!line.changed) continue;
    const n = i + 1;
    const k = offered[i]!;
    const u = full.units[k]!;
    const span = loc.spans.get(k);
    const cannot = (why: string) => ({ problem: `byway could not put line ${n} on this page exactly as you wrote it, because ${why}. Leave line ${n} as it was offered.`, line: n });
    if (MARKS.test(line.text)) return { problem: `Line ${n} has a character byway uses to mark a page while it checks it (a noncharacter, U+FDD0 to U+FDEF), which a page does not show: take it out.`, line: n };
    if (!loc.agrees) return cannot('byway could not match this page\'s lines to what a browser shows (its marked copy reads differently from the page), so it cannot check a change');
    if (!span) return cannot('a browser does not show that line where byway reads it, so byway cannot check a change to it');
    const oldText = (span.in === 'body' ? loc.body : loc.title).slice(span.start, span.end);
    // The line's link words as Chromium shows them must be the deck's: each bracketed part one address, nothing else in a link.
    const partHref: (string | null)[] = [];
    if (span.in === 'body') {
      const shownHrefs = loc.hrefs.slice(span.start, span.end).filter((_, x) => !isHtmlSpace(oldText[x]));
      let x = 0;
      let part = -1;
      for (const w of u.words) {
        if (w.kind === 'link') part++;
        for (const c of w.text) {
          if (isHtmlSpace(c)) continue;
          for (let q = 0; q < c.length; q++, x++) {
            const h = shownHrefs[x] ?? null;
            if (w.kind === 'out' ? h !== null : h === null || (partHref[part] !== undefined && partHref[part] !== h)) {
              return cannot(`a browser shows its link words differently from how they were offered (${h === null ? `"${w.text}" is not a link's words there` : `its words are in the link to ${h}`})`);
            }
            if (w.kind === 'link') partHref[part] = h;
          }
        }
      }
    }
    // The person's words, with their links: a bracketed part goes to its link's address, as the line's k-th link.
    let text = '';
    const hrefs: (string | null)[] = [];
    let part = -1;
    const segs = u.marked ? line.segs : [{ kind: u.words[0]!.kind, text: line.text }];
    for (const seg of segs) {
      if (seg.kind === 'link') part++;
      for (let q = 0; q < seg.text.length; q++) {
        text += seg.text[q];
        hrefs.push(seg.kind === 'link' ? (partHref[part] ?? null) : null);
      }
    }
    // Gaps: one space each; inside a line Chromium broke over screen lines, a space or a line break.
    const broken = /[\n\r\t]/.test(oldText.trim());
    if (broken) text = text.replace(/ /g, ANY_GAP);
    repl.push({ span, line: n, text: line.text ? text : '', hrefs: line.text ? hrefs : [] });
  }
  const build = (where: 'body' | 'title') => {
    const src = where === 'body' ? loc.body : loc.title;
    const srcHrefs = where === 'body' ? loc.hrefs : [];
    const rs = repl.filter((r) => r.span.in === where).sort((x, y) => x.span.start - y.span.start);
    const chunks: string[] = [];
    const hrefs: (string | null)[] = [];
    const lineAt: number[] = [];
    const places: Expected['places'] = [];
    const keep = (a: number, b: number) => {
      chunks.push(src.slice(a, b));
      for (let x = a; x < b; x++) {
        hrefs.push(srcHrefs[x] ?? null);
        lineAt.push(0);
      }
    };
    let from = 0;
    for (const r of rs) {
      keep(from, r.span.start);
      places.push({ line: r.line, start: hrefs.length, end: hrefs.length + r.text.length, in: where });
      chunks.push(r.text);
      for (let x = 0; x < r.text.length; x++) {
        hrefs.push(r.hrefs[x] ?? null);
        lineAt.push(r.line);
      }
      from = r.span.end;
    }
    keep(from, src.length);
    return { text: chunks.join(''), hrefs, lineAt, places };
  };
  const b = build('body');
  const t = build('title');
  return { body: b.text, hrefs: b.hrefs, title: t.text, lineAt: b.lineAt, places: [...b.places, ...t.places] };
}

/** A snippet of a shape around index `d`, line breaks shown as " / ". */
const around = (s: Shape, d: number): string => {
  const from = Math.max(0, d - 24);
  const to = Math.min(s.cs.length, d + 24);
  const t = s.cs.slice(from, to).map((c) => (c === '\n' ? ' / ' : c === ANY_GAP ? ' ' : c)).join('');
  return `${from > 0 ? '…' : ''}${t}${to < s.cs.length ? '…' : ''}`;
};

/**
 * Whether the written page, as Chromium shows it (`after`), is exactly the expected text: a problem naming the line
 * where they first differ, or undefined.
 */
export function arbiterProblem(exp: Expected, after: ShownText): { problem: string; line: number } | undefined {
  const got = unmark(after.linked, after.hrefs);
  // The marked read must be the page's own reading, marks aside.
  const want = shape(exp.body, exp.hrefs);
  const plain = shape(after.text);
  const linked = shape(got.text, got.hrefs);
  const nearest = (src: number): number => {
    const at = exp.lineAt[src];
    if (at) return at;
    let best = 0;
    let dist = Infinity;
    for (const pl of exp.places) {
      if (pl.in !== 'body') continue;
      const d = src < pl.start ? pl.start - src : src > pl.end ? src - pl.end : 0;
      if (d < dist) {
        dist = d;
        best = pl.line;
      }
    }
    return best || (exp.places[0]?.line ?? 1);
  };
  const say = (line: number, why: string) => ({ problem: `byway could not put line ${line} on this page exactly as you wrote it, because ${why}. Change line ${line} again, or leave it as it was offered.`, line });
  const titleWant = shape(exp.title);
  const titleGot = shape(after.title);
  if (flat(titleWant) !== flat(titleGot) && !sameWithGaps(titleWant, titleGot)) {
    const line = exp.places.find((pl) => pl.in === 'title')?.line ?? nearest(0);
    return say(line, `a browser would show the page's title as "${flat(titleGot)}", not "${flat(titleWant).replace(new RegExp(ANY_GAP, 'g'), ' ')}"`);
  }
  let d = 0;
  while (d < want.cs.length && d < plain.cs.length && same(want.cs[d]!, plain.cs[d]!)) d++;
  if (d < want.cs.length || d < plain.cs.length) {
    const w = want.cs[d];
    const g = plain.cs[d];
    const line = nearest(want.src[d] ?? exp.body.length);
    const gap = (c: string | undefined) => c === ' ' || c === '\n' || c === ANY_GAP;
    let why: string;
    if (w === undefined) why = `a browser would show text your lines do not have: it would show "${around(plain, d)}"`;
    else if (g === undefined) why = `a browser would not show all of your lines: it would end with "${around(plain, d)}"`;
    else if (gap(w) && !gap(g)) why = `a browser would run words together that your lines keep apart: it would show "${around(plain, d)}"`;
    else if (!gap(w) && gap(g)) why = `a browser would show ${g === '\n' ? 'a line break' : 'a space'} that your lines do not have: it would show "${around(plain, d)}"`;
    else if (w === ' ' && g === '\n') why = `a browser would break a line where your lines have a space: it would show "${around(plain, d)}"`;
    else if (w === '\n' && g === ' ') why = `a browser would show on one line what it showed on separate lines: it would show "${around(plain, d)}"`;
    else why = `a browser would show "${around(plain, d)}" there`;
    return say(line, why);
  }
  // Link membership: the same characters, each in the expected link.
  if (flat(linked) !== flat(plain)) return say(nearest(0), 'byway could not read which words a browser shows as link words on the written page');
  for (let x = 0; x < want.cs.length; x++) {
    if (want.hrefs[x] === linked.hrefs[x]) continue;
    const line = nearest(want.src[x]!);
    const word = around(plain, x);
    const h = linked.hrefs[x];
    const e = want.hrefs[x];
    return say(line, h === null ? `a browser would show the words at "${word}" outside the link (to ${e}) they belong to` : e === null ? `a browser would show the words at "${word}" as words of a link (to ${h})` : `a browser would show the words at "${word}" in the link to ${h}, not ${e}`);
  }
  return undefined;
}

/** Characters equal, or an either-gap against a space or a line break. */
const same = (w: string, g: string): boolean => w === g || (w === ANY_GAP && (g === ' ' || g === '\n'));
const sameWithGaps = (a: Shape, b: Shape): boolean => a.cs.length === b.cs.length && a.cs.every((c, i) => same(c, b.cs[i]!));

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
