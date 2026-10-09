/**
 * A web page's copy deck, and VOICE's exact write-back into the page (F07, ADR-0081). Imported only by copy.ts.
 *
 * The deck: one line ("unit") per run of visible text, in reading order, read with the browser-faithful tokenizer
 * (html-tokens.ts). A run is text with no tag inside it but inline formatting (INLINE: a, abbr, b, bdi, bdo, cite,
 * code, data, dfn, em, i, kbd, mark, q, s, samp, small, span, strong, sub, sup, time, u, var, wbr), so a block is one
 * line unless a <br>, a nested block or any other tag splits it, including the tags of elements browsers show inline
 * (font, label, ins, del, button, an image, an svg, a control). Head content is not offered except the <title> (text
 * that is not whitespace ends the head, as browsers end it, and continues the body's first line); <pre>, raw text,
 * CDATA, attribute copy and the content of a hidden element browsers show inline are not offered (a hidden block is
 * read as its own lines; VOICE then leaves out every line Chromium does not show: see readPageCopy's notOffered, and
 * page-arbiter.ts). A block that holds only links side by side (a nav) gives one line per link. One notation holds on every line: a link's words inside a line are shown in [brackets]; a literal
 * "[", "]", or a backslash before one of them or before a bracket of the notation, is shown escaped with a backslash.
 * A line that is exactly one link's words is shown plain (a "whole-link" line). A link is an <a> with an href; one
 * without is a placeholder, and its words are plain.
 *
 * The reader builds no tree, but tracks the open elements as browsers do where that decides what is copy (see
 * OpenElements): end tags are matched by browsers' rules (scope, special elements, the adoption agency), browsers'
 * implied ends for start tags are applied, and ignored tags open nothing. Besides the deck's runs, it reads the page's
 * blocks as browsers show them by their default stylesheet (BLOCK): the removal rule and the verifier use those, so no
 * removal runs two lines together on screen as the reader reads blocks. Foster parenting is not modelled: what browsers
 * move out of a table is marked, and never removed. The reader is a model: the browser arbiter (page-arbiter.ts) has
 * the last word on every VOICE write.
 *
 * Links are read where browsers end them: at the next <a ...> or </a> tag. A link the page leaves open (an unclosed
 * <a>, "<a href=x/>", one a misnested closing tag pops) reaches the following blocks, and an <a> inside another ends
 * the first. Where browsers may stop, skip or resume it (its reach holds a table, a list box, svg or math; something
 * like that it holds is still open at its own </a>; or eight or more blocks opened inside it are open where it ends),
 * byway cannot tell without building the tree: the link is tangled, and every line from it on is offered but cannot be
 * changed.
 *
 * The write-back has three parts that never call a model:
 * - readPageEdit: the person's answer as an exact positional edit (one line per unit; an empty line deletes its text);
 * - placePageEdit: deterministic placement. Changed text goes into the line's text slots, words aligned to the old
 *   words so formatting follows whole words or pieces (a documented rule, not verified); link words go where the
 *   person put their brackets, and no word crosses a link's edge (words outside brackets never go into an image or
 *   icon link, and a whole-link line's words all stay in its link). A line's edge whitespace stays in the slot that
 *   held it, unless it would then show as a space where the person's line has none (text glued to a link whose edge
 *   space sat inside it): then it is dropped. Elements left empty are removed when the shared rule allows (never one
 *   that carries a hook such as id, data-* or aria-*, never one browsers close elsewhere than its own end tag, never
 *   one whose removal would join two runs of text, as runs or as blocks on screen, or move where browsers end a link),
 *   and the whitespace placement put inside a removed element is written where it was, a deleted line's too where text
 *   stands on both sides (gapKept). Where new words go past the slot holding a line's edge whitespace, the line's new
 *   edge gets a space if text beside it on its screen line needs one. The <br> run a deleted line leaves goes with it.
 *   It returns its removals as a witness;
 * - pageEditProblems: the verifier. It checks the witness against the shared rule, compares the markup token for token
 *   (the page before, less exactly the witnessed removals), accounts for every run of text, checks each line's words,
 *   the line as it shows (edge whitespace included, whitespace collapsed) and its edge whitespace, and each link
 *   part's words, that no link or button whose shown words were in a changed line is left without words a browser
 *   shows, unnamed (an image's alt or a label names one that keeps an image or icon; hidden words name nothing), and
 *   reads the written page fresh: each run's words, which of them are in which link (with its address), and each block
 *   as browsers show blocks, whitespace collapsed, against the page before with the person's lines in place and its own
 *   separators between lines. It shares the removal rules with placement (removable, the <br> runs, gapKept), not
 *   placement's alignment or its choices among removals, and it is not independent of the reader, so a page the reader
 *   misreads can pass it: the browser arbiter (page-arbiter.ts) checks every write after it.
 * Reading, placing and verifying are linear in the page (amortized), except that placement matches a changed block's
 * old and new words: by a table quadratic in the words of that block (a line of up to about a thousand words), and
 * past that by an edit script whose cost grows with the words changed (capped; see wordPairs). None of them throws.
 */
import { attributesOf, decodeText, escapeText, isHtmlSpace, noHtmlSpace, squashHtml, tokenize, type Token } from './html-tokens.ts';

/**
 * Formatting that sits inside a line of text (a deck run); any other tag ends the run, even one browsers show inline
 * (font, label, ins, del, button, img, svg), as does an end tag at which browsers end a block (see BLOCK).
 */
const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
/**
 * Elements browsers show as blocks by their default stylesheet: text on either side of one's start tag, or of the end
 * tag that closes it, shows on separate lines, as it does on either side of a <br>. Every other element shows inline
 * (formatting, font, label, ins, del, images, svg, controls, custom elements) or not at all (script, a hidden element),
 * so removing what stood between two runs of text with only those between them would run the two together. A form is
 * left out: browsers ignore a form inside another. The table parts are blocks only inside a table (TABLE_PART).
 */
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'body', 'center', 'details', 'dialog', 'dir', 'div', 'dl', 'dd', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'head', 'header', 'hgroup', 'hr', 'html', 'legend', 'li', 'listing', 'main', 'menu', 'nav', 'ol', 'p', 'plaintext', 'pre', 'search', 'section', 'summary', 'ul', 'xmp', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'caption', 'colgroup', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th']);
/** Outside a table, browsers ignore these tags. */
const TABLE_PART = new Set(['caption', 'colgroup', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th']);
/** A table and its parts: the innermost open one says whether content stands in a cell (see OpenElements.fosters). */
const TABLE_STRUCT = new Set(['table', ...TABLE_PART]);
/**
 * WHATWG's "special" elements (HTML namespace): an end tag for an element that is neither special nor formatting is
 * ignored when one of these is open inside it, and the adoption agency closes formatting past them, leaving them open.
 */
const SPECIAL = new Set(['address', 'applet', 'area', 'article', 'aside', 'base', 'basefont', 'bgsound', 'blockquote', 'body', 'br', 'button', 'caption', 'center', 'col', 'colgroup', 'dd', 'details', 'dir', 'div', 'dl', 'dt', 'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'frame', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'iframe', 'img', 'input', 'keygen', 'li', 'link', 'listing', 'main', 'marquee', 'menu', 'meta', 'nav', 'noembed', 'noframes', 'noscript', 'object', 'ol', 'p', 'param', 'plaintext', 'pre', 'script', 'search', 'section', 'select', 'source', 'style', 'summary', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'title', 'tr', 'track', 'ul', 'wbr', 'xmp']);
/** Inside svg or math, the elements that are special and bound a scope (integration points). */
const FOREIGN_SCOPE = new Set(['foreignobject', 'desc', 'title', 'mi', 'mo', 'mn', 'ms', 'mtext', 'annotation-xml']);
/** The adoption agency's formatting elements. */
const FORMATTING = new Set(['a', 'b', 'big', 'code', 'em', 'font', 'i', 'nobr', 's', 'small', 'strike', 'strong', 'tt', 'u']);
/**
 * What an end tag does not reach past ("has an element in scope"), with the adoption agency's markers and a list box:
 * an end tag for an element open outside a cell, a caption, a table, an object, a marquee, a template or a list box is
 * ignored inside it.
 */
const SCOPE = new Set(['applet', 'caption', 'html', 'table', 'td', 'th', 'marquee', 'object', 'template', 'select']);
/** End tags browsers close by scope: the element and everything still open inside it. */
const SCOPED_END = new Set(['address', 'article', 'aside', 'blockquote', 'button', 'center', 'details', 'dialog', 'dir', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'header', 'hgroup', 'listing', 'main', 'menu', 'nav', 'ol', 'pre', 'search', 'section', 'summary', 'ul', 'dd', 'dt', 'applet', 'marquee', 'object']);
const HEADING = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
/** Start tags that end an open p (WHATWG "close a p element"; a table only in no-quirks mode, so not here). */
const CLOSES_P = new Set(['address', 'article', 'aside', 'blockquote', 'center', 'details', 'dialog', 'dir', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'header', 'hgroup', 'main', 'menu', 'nav', 'ol', 'p', 'search', 'section', 'summary', 'ul', ...HEADING, 'pre', 'listing', 'form', 'li', 'dd', 'dt', 'plaintext', 'hr', 'xmp']);
/** What may stand in the head: any other start tag ends it. */
const HEAD_CONTENT = new Set(['base', 'basefont', 'bgsound', 'link', 'meta', 'noframes', 'noscript', 'script', 'style', 'template', 'title']);
/**
 * The adoption agency runs at most eight times, each time past one block opened inside the link: an </a> (or the next
 * <a>) with eight or more blocks open inside the link leaves it open in browsers.
 */
const AAA_DEPTH = 8;
/** Elements a person sees without text: a link or button holding one keeps a visible face. */
const EMBEDDED = new Set(['img', 'svg', 'picture', 'video', 'audio', 'iframe', 'canvas', 'object', 'embed', 'input', 'select', 'textarea', 'button']);
/**
 * Raw text that is markup, not copy (page behaviour, or text the deck does not offer): an element holding one is kept, so
 * its bytes stay. Textarea and iframe are EMBEDDED.
 */
const RAW_KEPT = new Set(['script', 'style', 'noscript', 'template', 'xmp', 'noembed', 'noframes', 'plaintext']);
/** Blocks whose removal (when emptied) leaves no hole: everything else (a cell, a <dd>, a wrapper) is kept empty. */
const TEXT_BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'figcaption']);
/**
 * Markup inside which browsers may stop, skip or resume a link the page leaves open (table modes and cells, the
 * formatting markers, a list box, svg and math): in its reach, byway cannot tell a link's words without building the
 * tree.
 */
const UNCLEAR = new Set(['table', 'caption', 'colgroup', 'col', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th', 'applet', 'object', 'marquee', 'template', 'select', 'svg', 'math']);

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
  /** Deck runs: text separated by tags outside INLINE, and by end tags at which browsers end a block. */
  region: number;
  /** Blocks as browsers show them: text separated by the tags at which browsers start a new line (see BLOCK). A run lies in one. */
  vregion: number;
  /** The inline elements opened in its run and still open: how many, and the outermost one's start token (-1: none). */
  depth: number;
  outer: number;
  /** Offered: outside the head (the title aside) and outside <pre>. */
  visible: boolean;
  /** Shown by browsers: outside the head and the title, and not inside a hidden block (the hidden attribute, a closed dialog). */
  rendered: boolean;
  /** The outermost closed link holding it (its start token). */
  link?: number;
}
interface El {
  start: number;
  end?: number;
  name: string;
  /**
   * An <a> whose end is where browsers end it, not its own closing tag: the next <a ...> or </a> tag, or the page's
   * end. Its words are read in that reach.
   */
  virtual?: true;
  /**
   * A virtual link's own closing tag in the markup, when the reader matched one (an <a> written around another): its
   * removal span. A virtual link with none is never removed.
   */
  markupEnd?: number;
  /**
   * Closed by its own end tag while it was the innermost open element, with nothing inside it ignored, closed out of
   * order or closed by another end tag: its tokens hold whole elements, as browsers read them. Only such an element is
   * removed.
   */
  balanced?: true;
  /** Inside svg or math. */
  foreign?: true;
  /** A block as browsers show it (its start tag was a line break, see BLOCK). */
  block?: true;
  /** A hidden element (the hidden attribute, a closed dialog, a datalist): nothing inside it shows. */
  hidden?: true;
  /**
   * A hidden element browsers show inline (outside BLOCK): its text would sit inside a line a person sees, so it is not
   * offered (a hidden block is offered as its own lines: a script or the reader may open it).
   */
  concealed?: true;
  /** An <a> a later <a> start tag ends in browsers: closing it implicitly after that is not out of order. */
  superseded?: true;
  /** Its start tag ended other elements (an open p, li, heading or the head): it is never balanced. */
  endsOthers?: true;
}
/** The tokens an element's removal takes, to its last one: its own closing tag in the markup. */
const spanEnd = (el: El): number | undefined => (el.virtual ? el.markupEnd : el.end);
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
  /** In the reach of a tangled link (see readPageCopy): byway cannot tell which of its words are link words. */
  tangled?: true;
  /** The line's parts as the deck shows them: outside links, or one link's words (whitespace collapsed, ends trimmed). */
  words: Seg[];
}

/** A page read for its copy. */
export interface PageDeck {
  tokens: Token[];
  slots: Slot[];
  els: Map<number, El>;
  units: Unit[];
  slotEndingAt: Int32Array;
  blockOfRegion: Map<number, number>;
  /** The start token of the first tangled link: every line from it on cannot be changed. */
  tangledAt?: number;
  /**
   * The tokens that bound a virtual link's reach (its start tag, and the next <a> tag that ends it), each with the
   * other end (the page's length when it runs to the end): an element holding one end and not the other is kept.
   */
  reachEnds: Map<number, number[]>;
  /** Every <a> and </a> tag, in order. */
  aTags: number[];
  /** Start tags (and void tags) browsers move out of a table (OpenElements.fosters): never removed, nor what holds one. */
  fostered: Uint8Array;
  /**
   * Lines of the page that are not offered (VOICE's arbiter found no place where a browser shows them, ADR-0081): their
   * text is the page's own, like text the deck never offers, and stays byte for byte. In reading order.
   */
  unoffered: Unit[];
}

/** An <a> with an address is a link; one without is a placeholder (browsers show its words plain). */
const hasHref = (t: Token): boolean => t.kind === 'tag' && attributesOf(t.raw).some((a) => a.name === 'href');
/**
 * A control a person activates, which must keep a name: a button, a link, or an <a> without an address that a script
 * or a role makes one (role, tabindex or an on... handler). A placeholder <a> (a name or id only) may be left empty.
 */
function isControl(p: PageDeck, el: El): boolean {
  if (el.name === 'button') return true;
  if (el.name !== 'a') return false;
  return attributesOf(p.tokens[el.start]!.raw).some((a) => a.name === 'href' || a.name === 'role' || a.name === 'tabindex' || a.name.startsWith('on'));
}

type TagToken = Extract<Token, { kind: 'tag' }>;
const lastOf = (xs: readonly number[]): number => (xs.length ? xs[xs.length - 1]! : -1);
/** A hidden element: the hidden attribute, a dialog that is not open, or a datalist. */
function hiddenTag(t: TagToken): boolean {
  if (t.name === 'datalist') return true;
  if (t.name !== 'dialog' && !/hidden/i.test(t.raw)) return false;
  const names = attributesOf(t.raw).map((a) => a.name);
  return names.includes('hidden') || (t.name === 'dialog' && !names.includes('open'));
}

/**
 * The elements the reader holds open, as a stack of start tokens, with end tags matched as browsers match them
 * (WHATWG tree construction, without building the tree):
 * - p, li, dd, dt, the headings and the block end tags close the element (any heading for a heading) and everything
 *   open inside it, unless a scope boundary (a table, a cell, a caption, an object, a marquee, a template, a list box)
 *   is open inside it; table parts close within their table. "</p>" with no p open makes an empty p, and "</br>" is a
 *   <br>, so both break the line;
 * - a formatting end tag (a, b, em, font, ...) closes its element; when a special element (a block, a control) is open
 *   inside it, browsers' adoption agency closes the formatting element and leaves the block open, and so does the
 *   reader (the element stays on the stack, closed, until the block above it closes);
 * - any other end tag closes its element unless a special element is open inside it; then browsers ignore it;
 * - "</body>" and "</html>" close nothing.
 * Start tags end what browsers end for them (implicitly: such an element keeps no end): a block ends an open p, an li
 * an open li and a dd or dt an open dd or dt (unless a block other than a div, an address or a p is open inside it), a
 * heading a heading that is the innermost element, and body content the head; an <a> marks an open <a> superseded.
 * Browsers ignore a table part outside a table, an html start tag after anything else, a body start tag once the body
 * has begun (explicitly, or implicitly with text or a start tag that does not belong in the head), a head once the head
 * or the body has begun, and a form inside a form: the reader opens no element for them, so none of them breaks a line. Foster parenting and the reconstruction of formatting are not modelled (links
 * are read where browsers end them, see readPageCopy); an element browsers foster-parent is marked (fosters), and never
 * removed. Lookups go through stacks of positions per name and per kind,
 * so each tag costs a constant amount, amortized.
 */
class OpenElements {
  readonly open: number[] = [];
  /** Out-of-order events so far (an ignored end tag, an element closed implicitly or past a block): see El.balanced. */
  private dirty = 0;
  private readonly dirtyAt = new Map<number, number>();
  private readonly byName = new Map<string, number[]>();
  private readonly special: number[] = [];
  private readonly scope: number[] = [];
  private readonly tableScope: number[] = [];
  /** Positions of open table structure (TABLE_STRUCT): the innermost says whether content sits in a cell. */
  private readonly tableCtx: number[] = [];
  /** Positions of open special elements other than address, div and p: an li, dd or dt start tag stops at one. */
  private readonly hardSpecial: number[] = [];
  private headSeen = false;
  /** A start tag or text has been read (browsers have made the html element): a later <html> is ignored. */
  private started = false;
  /**
   * The body has begun, explicitly or as browsers begin it implicitly (text, or a start tag that does not belong in the
   * head): a later <body> is ignored, as is a <head>.
   */
  private bodyBegun = false;
  /** Positions of open elements outside INLINE (for the block a run belongs to); closed ones are skipped lazily. */
  private readonly blocks: number[] = [];
  preDepth = 0;
  hiddenDepth = 0;
  /** Open concealed elements (El.concealed): their content is not offered. */
  concealDepth = 0;
  /** Open svg or math <title> elements: their text is a tooltip, not shown. A self-closed one opens nothing. */
  foreignTitleDepth = 0;
  private readonly els: Map<number, El>;
  constructor(els: Map<number, El>) {
    this.els = els;
  }

  /** The position of the innermost open element with this name, or -1. */
  named(name: string): number {
    return lastOf(this.byName.get(name) ?? []);
  }
  /** The head is open: its content is not shown. */
  get inHead(): boolean {
    return this.named('head') >= 0;
  }
  /**
   * Text that is not whitespace, outside the title: browsers end an open head there and put the text in the body ("in
   * head" and "before head"), so a <head> after it is ignored. Whether it ended the head.
   */
  text(): boolean {
    this.headSeen = true;
    this.started = true;
    this.bodyBegun = true;
    const k = this.named('head');
    if (k < 0) return false;
    this.endImplicitly(k);
    return true;
  }
  /** Browsers ignore this start tag: no element opens. */
  ignores(t: TagToken): boolean {
    if (t.foreign) return false;
    const n = t.name;
    if (TABLE_PART.has(n)) return this.named('table') < 0;
    if (n === 'html') return this.started;
    if (n === 'body') return this.bodyBegun;
    if (n === 'head') return this.headSeen || this.bodyBegun;
    if (n === 'form') return this.named('form') >= 0 && this.named('template') < 0;
    return false;
  }
  /** Note a start tag, ignored or not (after asking `ignores`): anything but the html, the head and head content begins the body. */
  sawStart(t: TagToken): void {
    this.started = true;
    if (t.foreign || (!HEAD_CONTENT.has(t.name) && t.name !== 'html' && t.name !== 'head')) this.bodyBegun = true;
  }
  /**
   * The ends browsers imply for a start tag they do not ignore (see the class comment). Whether it ended any element:
   * then the element it opens is never removed (without its start tag, what it ended would run on past it).
   */
  startTag(t: TagToken): boolean {
    if (t.foreign) return false;
    const depth = this.open.length;
    const n = t.name;
    if (n === 'head') this.headSeen = true;
    else if (this.inHead && !HEAD_CONTENT.has(n)) this.endImplicitly(this.named('head'));
    if (n === 'li' || n === 'dd' || n === 'dt') {
      const k = n === 'li' ? this.named('li') : Math.max(this.named('dd'), this.named('dt'));
      if (k >= 0 && lastOf(this.hardSpecial) <= k) this.endImplicitly(k);
    }
    if (CLOSES_P.has(n)) {
      const k = this.named('p');
      if (k >= 0 && k > Math.max(lastOf(this.scope), this.named('button'))) this.endImplicitly(k);
    }
    if (HEADING.includes(n) && this.open.length && HEADING.includes(this.els.get(this.open.at(-1)!)!.name)) this.endImplicitly(this.open.length - 1);
    return this.open.length < depth;
  }
  /**
   * Browsers move this start tag's element out of the table, before it (foster parenting): it stands in a table, a row
   * group, a row or a column group, outside any cell or caption (a row opened inside a cell ends the cell in browsers,
   * and the reader keeps that row innermost). The reader does not move it, so it never removes it (see markOf).
   */
  fosters(t: TagToken): boolean {
    if (t.foreign || TABLE_STRUCT.has(t.name) || t.name === 'col' || t.name === 'script' || t.name === 'style' || t.name === 'template') return false;
    const k = lastOf(this.tableCtx);
    return k >= 0 && !['td', 'th', 'caption'].includes(this.els.get(this.open[k]!)!.name);
  }
  /** Whether a start tag browsers do not ignore starts a new line (see BLOCK): read before the element is pushed. */
  startBreaks(t: TagToken): boolean {
    if (t.foreign || this.hiddenDepth > 0) return false;
    if (t.name === 'br') return true;
    return BLOCK.has(t.name) && !hiddenTag(t);
  }
  push(i: number, t: TagToken, block: boolean, endsOthers = false): void {
    const name = t.name;
    // Browsers end an open <a> (outside a cell, a table or a list box) where the next <a> starts.
    if (name === 'a' && !t.foreign) {
      const k = this.named('a');
      if (k >= 0 && k > lastOf(this.scope)) this.els.get(this.open[k]!)!.superseded = true;
    }
    const hidden = !t.foreign && hiddenTag(t);
    const concealed = hidden && !BLOCK.has(name);
    const el: El = { start: i, name, ...(t.foreign ? { foreign: true as const } : {}), ...(block ? { block: true as const } : {}), ...(hidden ? { hidden: true as const } : {}), ...(concealed ? { concealed: true as const } : {}), ...(endsOthers ? { endsOthers: true as const } : {}) };
    this.els.set(i, el);
    const k = this.open.length;
    this.open.push(i);
    const list = this.byName.get(name);
    if (list) list.push(k);
    else this.byName.set(name, [k]);
    if (t.foreign ? FOREIGN_SCOPE.has(name) : SPECIAL.has(name)) {
      this.special.push(k);
      if (t.foreign || !['address', 'div', 'p'].includes(name)) this.hardSpecial.push(k);
    }
    if (t.foreign ? FOREIGN_SCOPE.has(name) : SCOPE.has(name)) this.scope.push(k);
    if (!t.foreign && (name === 'html' || name === 'table' || name === 'template')) this.tableScope.push(k);
    if (!t.foreign && TABLE_STRUCT.has(name)) this.tableCtx.push(k);
    if (!INLINE.has(name)) this.blocks.push(k);
    if (name === 'pre') this.preDepth++;
    if (hidden) this.hiddenDepth++;
    if (concealed) this.concealDepth++;
    if (t.foreign && name === 'title') this.foreignTitleDepth++;
    this.dirtyAt.set(i, this.dirty);
  }
  /** The innermost open element outside INLINE (its start token), or -1. */
  innermostBlock(): number {
    while (this.blocks.length && this.isClosed(lastOf(this.blocks))) this.blocks.pop();
    return this.blocks.length ? this.open[lastOf(this.blocks)]! : -1;
  }
  /** Open special elements started after token `tok`. */
  specialsAfter(tok: number): number {
    let lo = 0;
    let hi = this.special.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.open[this.special[mid]!]! > tok) hi = mid;
      else lo = mid + 1;
    }
    return this.special.length - lo;
  }
  /** Match an end tag; whether it breaks the line in browsers. */
  endTag(i: number, t: TagToken): boolean {
    const name = t.name;
    const ignored = (breaks = false) => {
      this.dirty++;
      return breaks;
    };
    const within = (k: number, bound: number) => (k >= 0 && k >= bound ? this.close(k, i) : ignored());
    if (t.foreign) return within(this.named(name), 0);
    if (name === 'br') {
      this.started = this.bodyBegun = true;
      return ignored(this.hiddenDepth === 0);
    }
    if (name === 'p') {
      const k = this.named('p');
      if (k >= 0 && k > Math.max(lastOf(this.scope), this.named('button'))) return this.close(k, i);
      return ignored(this.hiddenDepth === 0 && this.named('select') < 0);
    }
    if (name === 'li') return within(this.named('li'), Math.max(lastOf(this.scope), this.named('ol'), this.named('ul')) + 1);
    if (HEADING.includes(name)) return within(Math.max(...HEADING.map((h) => this.named(h))), lastOf(this.scope) + 1);
    if (TABLE_PART.has(name) || name === 'table') return within(this.named(name), lastOf(this.tableScope));
    if (name === 'select') return within(this.named('select'), 0);
    if (FORMATTING.has(name)) {
      const k = this.named(name);
      if (k < 0 || lastOf(this.scope) > k) return ignored();
      if (lastOf(this.special) < k) return this.close(k, i);
      // A block opened inside it: browsers close the formatting here and leave the block open.
      const el = this.els.get(this.open[k]!)!;
      this.release(k);
      el.end = i;
      this.dirty++;
      return false;
    }
    if (SCOPED_END.has(name)) return within(this.named(name), lastOf(this.scope));
    if (name === 'body' || name === 'html') return ignored();
    return within(this.named(name), lastOf(this.special));
  }

  private isClosed(k: number): boolean {
    return k >= this.open.length || this.els.get(this.open[k]!)!.end !== undefined;
  }
  /** The element at position k leaves the open set (popped, or closed past a block). */
  private release(k: number): void {
    const el = this.els.get(this.open[k]!)!;
    const list = this.byName.get(el.name)!;
    if (lastOf(list) === k) list.pop();
    if (lastOf(this.special) === k) this.special.pop();
    if (lastOf(this.hardSpecial) === k) this.hardSpecial.pop();
    if (lastOf(this.scope) === k) this.scope.pop();
    if (lastOf(this.tableScope) === k) this.tableScope.pop();
    if (lastOf(this.tableCtx) === k) this.tableCtx.pop();
    if (el.name === 'pre') this.preDepth--;
    if (el.hidden) this.hiddenDepth--;
    if (el.concealed) this.concealDepth--;
    if (el.foreign && el.name === 'title') this.foreignTitleDepth--;
  }
  /** End the element at position k and everything open inside it, as browsers end them for a start tag: no end. */
  private endImplicitly(k: number): void {
    for (let j = this.open.length - 1; j >= k; j--) if (this.els.get(this.open[j]!)!.end === undefined) this.release(j);
    this.open.length = k;
    while (this.open.length && this.isClosed(this.open.length - 1)) this.open.pop();
    while (this.blocks.length && lastOf(this.blocks) >= this.open.length) this.blocks.pop();
  }
  /** Close the element at position k with end tag i, and everything open inside it (closed implicitly). */
  private close(k: number, i: number): boolean {
    let breaks = false;
    let implicit = false;
    for (let j = this.open.length - 1; j > k; j--) {
      const inner = this.els.get(this.open[j]!)!;
      if (inner.end !== undefined) continue; // closed past a block before: already released
      this.release(j);
      if (!inner.superseded) implicit = true;
      if (inner.block) breaks = true;
    }
    const el = this.els.get(this.open[k]!)!;
    if (!implicit && !el.endsOthers && this.dirty === this.dirtyAt.get(el.start)) el.balanced = true;
    if (implicit) this.dirty++;
    this.release(k);
    el.end = i;
    this.open.length = k;
    while (this.open.length && this.isClosed(this.open.length - 1)) this.open.pop();
    while (this.blocks.length && lastOf(this.blocks) >= this.open.length) this.blocks.pop();
    return breaks || !!el.block;
  }
}

/**
 * Read a page's copy deck (one pass over its tokens, plus link membership by token index). `notOffered` holds the
 * indices of lines (in the deck read without it) that are not offered: they become the page's own text.
 */
export function readPageCopy(html: string, notOffered?: ReadonlySet<number>): PageDeck {
  // Browsers read a start tag named "image" as <img> (tree construction): an image, void.
  const tokens = tokenize(html).map((t) => (t.kind === 'tag' && !t.closing && !t.foreign && t.name === 'image' ? { ...t, name: 'img' } : t));
  const slots: Slot[] = [];
  const els = new Map<number, El>();
  const open = new OpenElements(els);
  const slotEndingAt = new Int32Array(tokens.length + 1).fill(-1);
  const fostered = new Uint8Array(tokens.length);
  let region = 0;
  let vregion = 0;
  // The inline elements opened in the current run and still open (start tokens), with their positions by name.
  const inline: number[] = [];
  const inlineAt = new Map<string, number[]>();
  let inTitle = false;
  // The block a region belongs to: the innermost open non-inline element when the region starts (for <br> runs).
  const blockOfRegion = new Map<number, number>();
  blockOfRegion.set(0, -1);
  // At each <a> tag, the special elements open that started after the <a> tag before it (see AAA_DEPTH).
  const aDepth = new Map<number, number>();
  let prevA = -1;
  const next = (): Omit<Slot, 'end'> => ({
    toks: [],
    region,
    vregion,
    depth: inline.length,
    outer: inline.length ? inline[0]! : -1,
    visible: (!open.inHead || inTitle) && open.preDepth === 0 && open.concealDepth === 0,
    rendered: !open.inHead && !inTitle && open.hiddenDepth === 0 && open.foreignTitleDepth === 0,
  });
  let cur = next();
  tokens.forEach((t, i) => {
    if (t.kind === 'text') {
      if (!inTitle && noHtmlSpace(t.raw) !== '' && open.text() && !cur.toks.length) {
        // Text in the head ended it: the text is the body's, and starts a run of its own. It continues the body's first
        // screen line, as browsers show it (the head showed nothing, and a later <body> is ignored).
        region++;
        inline.length = 0;
        inlineAt.clear();
        blockOfRegion.set(region, open.innermostBlock());
        cur = next();
      }
      cur.toks.push(i);
      return;
    }
    slotEndingAt[i] = slots.length;
    slots.push({ ...cur, end: i });
    let breaks = false;
    if (t.kind === 'tag') {
      const name = t.name;
      if (name === 'a') {
        aDepth.set(i, open.specialsAfter(prevA));
        prevA = i;
      }
      // The html <title> is RCDATA: one text token, then its end tag. An svg or math <title> is an element like any other
      // there (a self-closed one opens nothing, and its svg's end closes an open one), so OpenElements tracks it.
      if (name === 'title' && !t.foreign) inTitle = !t.closing;
      // A start tag opens an element unless it is void or honours its self-closing flag (in svg or math, and <svg/>
      // and <math/> themselves); browsers ignore "/>" on other HTML elements, so "<a href=x/>" and "<span/>" open one.
      // Browsers ignore some start tags altogether (see OpenElements.ignores).
      const ignored = !t.closing && open.ignores(t);
      const opens = !t.closing && !ignored && !VOID.has(name) && !(t.selfClosing && (t.foreign || name === 'svg' || name === 'math'));
      if (!t.closing) {
        open.sawStart(t);
        const endsOthers = !ignored && open.startTag(t);
        if (!ignored && open.fosters(t)) fostered[i] = 1;
        breaks = !ignored && open.startBreaks(t);
        if (opens) open.push(i, t, breaks, endsOthers);
      } else breaks = open.endTag(i, t);
      if (!INLINE.has(name) || breaks) {
        region++;
        inline.length = 0;
        inlineAt.clear();
        blockOfRegion.set(region, name === 'br' ? (blockOfRegion.get(region - 1) ?? -1) : open.innermostBlock());
      } else if (opens) {
        const at = inlineAt.get(name);
        if (at) at.push(inline.length);
        else inlineAt.set(name, [inline.length]);
        inline.push(i);
      } else if (t.closing) {
        const k = lastOf(inlineAt.get(name) ?? []);
        if (k >= 0) {
          while (inline.length > k) {
            const s = inline.pop()!;
            inlineAt.get(els.get(s)!.name)!.pop();
          }
        }
      }
    }
    if (breaks) vregion++;
    cur = next();
  });
  slotEndingAt[tokens.length] = slots.length;
  slots.push({ ...cur, end: tokens.length });
  // Where browsers end each link (an <a> with an address; one without is a placeholder, and its words are plain). A
  // link ends at the next <a ...> or </a> tag, wherever the markup puts it: a link the page leaves open (an unclosed
  // <a>, "<a href=x/>", or one a misnested closing tag pops) is opened again in each following block until then, and
  // an <a> inside another ends the first. Such a link's end is read as browsers read it (virtual), so the deck,
  // placement, the verifier and the lock see the words a browser shows as its words. Where browsers may stop, skip or
  // resume it, byway cannot tell without building the tree: the link is tangled, keeps the markup's reading, and every
  // line from it on cannot be changed. That is when its reach holds UNCLEAR markup, when something UNCLEAR opened inside
  // it is still open at its own </a> (an </a> behind a cell, a caption, an object, a marquee, a table or a list box is
  // ignored: the reader does not match it), or when eight or more blocks opened inside it are open where it ends.
  let tangledAt: number | undefined;
  const reachEnds = new Map<number, number[]>();
  const pair = (x: number, y: number) => {
    const r = reachEnds.get(x);
    if (r) r.push(y);
    else reachEnds.set(x, [y]);
  };
  const aTags: number[] = [];
  tokens.forEach((t, i) => {
    if (t.kind === 'tag' && t.name === 'a') aTags.push(i);
  });
  {
    let at = 0;
    // Each link's reach runs to the next <a> tag, so the reaches do not overlap and the scans are linear.
    for (const el of [...els.values()].filter((e) => e.name === 'a').sort((x, y) => x.start - y.start)) {
      while (at < aTags.length && aTags[at]! <= el.start) at++;
      const n = at < aTags.length ? aTags[at]! : tokens.length;
      if (!hasHref(tokens[el.start]!)) continue;
      const deep = (aDepth.get(n) ?? 0) >= AAA_DEPTH;
      if (el.end === n) {
        // Closed by its own </a>, with no <a> inside: browsers read it the same, unless something UNCLEAR it holds is
        // still open there, or the adoption agency runs out of turns.
        let clear = !deep;
        for (let t = el.start + 1; clear && t < n; t++) {
          const tk = tokens[t]!;
          const inner = els.get(t);
          if (tk.kind === 'tag' && UNCLEAR.has(tk.name) && inner && (inner.end === undefined || inner.end > n)) clear = false;
        }
        if (!clear) tangledAt ??= el.start;
        continue;
      }
      let clear = !el.foreign && !deep;
      for (let t = el.start + 1; clear && t < n; t++) {
        const tk = tokens[t]!;
        if (tk.kind === 'tag' && UNCLEAR.has(tk.name)) clear = false;
      }
      if (clear) {
        if (el.end !== undefined) el.markupEnd = el.end;
        el.end = n;
        el.virtual = true;
        pair(el.start, n);
        if (n < tokens.length) pair(n, el.start);
      } else tangledAt ??= el.start;
    }
  }
  // Link membership: the outermost closed link holding the slot (a link spanning a <br> covers slots in two units).
  const aEls = [...els.values()].filter((e) => e.name === 'a' && e.end !== undefined && hasHref(tokens[e.start]!)).sort((x, y) => x.start - y.start);
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
  const page: PageDeck = { tokens, slots, els, units: [], slotEndingAt, blockOfRegion, reachEnds, aTags, fostered, unoffered: [] };
  const byRegion = new Map<number, number[]>();
  slots.forEach((s, i) => {
    if (!s.visible) return;
    const a = byRegion.get(s.region);
    if (a) a.push(i);
    else byRegion.set(s.region, [i]);
  });
  for (const ids of byRegion.values()) {
    const text = (xs: number[]) => squashHtml(xs.map((s) => slotText(page, s)).join(''));
    // The run's slots by the outermost inline element holding them (none: the run's own text), in one pass.
    const own: number[] = [];
    const byTop = new Map<number, number[]>();
    for (const i of ids) {
      const top = slots[i]!.outer;
      if (top < 0) own.push(i);
      else {
        const g = byTop.get(top);
        if (g) g.push(i);
        else byTop.set(top, [i]);
      }
    }
    const tops = [...byTop.entries()].filter(([, g]) => text(g)).map(([top]) => top);
    // A block of links side by side (a nav) reads as one line per link, not one glued line.
    const sideBySide = !text(own) && tops.length >= 2 && tops.every((t) => els.get(t)?.name === 'a' && hasHref(tokens[t]!));
    const groups = sideBySide ? tops.map((top) => byTop.get(top)!) : [ids];
    for (const g of groups) if (text(g)) page.units.push(makeUnit(page, g));
  }
  page.units.sort((a, b) => a.slots[0]! - b.slots[0]!);
  // A tangled link may reach the page's end, so every line with text after its start tag is flagged.
  if (tangledAt !== undefined) {
    page.tangledAt = tangledAt;
    for (const u of page.units) {
      const k = u.slots.at(-1)!;
      if (k > 0 && slots[k - 1]!.end >= tangledAt) u.tangled = true;
    }
  }
  if (notOffered?.size) {
    page.unoffered = page.units.filter((_, i) => notOffered.has(i));
    page.units = page.units.filter((_, i) => !notOffered.has(i));
  }
  return page;
}

const slotRaw = (p: PageDeck, s: number): string => p.slots[s]!.toks.map((i) => p.tokens[i]!.raw).join('');
const slotText = (p: PageDeck, s: number): string => decodeText(slotRaw(p, s));
/** Slots wholly inside an element (for a virtual link, its reach): a contiguous range, by token index. */
function inside(p: PageDeck, el: El, end = el.end!): number[] {
  const a = p.slotEndingAt[el.start]! + 1;
  const b = p.slotEndingAt[end]!;
  const r: number[] = [];
  for (let s = a; s <= b; s++) r.push(s);
  return r;
}
/** Slots in an element's removal span (see spanEnd): for a virtual link, to its own closing tag. */
const spanSlots = (p: PageDeck, el: El): number[] => inside(p, el, spanEnd(el)!);

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
  const text = texts.map((t) => t.text).join('');
  return {
    slots: g,
    segs: marked ? alt : [{ kind: 'out', slots: g }],
    marked,
    text,
    words: marked ? texts : [{ kind: links.length === 1 ? 'link' : 'out', text }],
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

/**
 * A line of the person's answer. A changed line's `text` and `segs` are read with whitespace collapsed and the ends
 * trimmed; `lead` and `trail` say that the person's line, with its brackets taken out, begins or ends with whitespace:
 * a space at that edge, which parts the line from text a browser shows beside it (placement writes it where nothing
 * else parts them).
 */
export type EditLine = { changed: false } | { changed: true; text: string; segs: Seg[]; lead?: true; trail?: true };
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
    // A changed line in a tangled link's reach is refused: byway cannot tell which of its words a browser shows as
    // link words, so it cannot write it exactly.
    const changed = (line: EditLine) => {
      if (u.tangled) refuse(i, `Line ${i + 1} cannot be changed in this step: ${tangledWhy(p)}, so byway cannot write this line exactly. Leave line ${i + 1} as it was offered.`);
      else out.push(line);
    };
    if (!noHtmlSpace(raw)) {
      changed({ changed: true, text: '', segs: u.segs.map((s) => ({ kind: s.kind, text: '' })) });
      return;
    }
    // Browsers drop a null character from a page's text, so it could not show as written.
    if (raw.includes('\u0000')) {
      refuse(i, `Line ${i + 1} has a null character (U+0000), which browsers drop: take it out.`);
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
    const flat = segs.map((t) => t.text).join('');
    const text = ns.map((t) => t.text).join('');
    changed({ changed: true, text, segs: ns, ...(text && isHtmlSpace(flat[0]) ? { lead: true as const } : {}), ...(text && isHtmlSpace(flat.at(-1)) ? { trail: true as const } : {}) });
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
/** An address as the prompt and refusals name it: cut to 60 characters. */
const shortAddress = (h: string): string => (h.length > 60 ? `${h.slice(0, 57)}...` : h);

/** Why lines in a tangled link's reach cannot be changed, naming the link. */
function tangledWhy(p: PageDeck): string {
  const href = p.tangledAt === undefined ? '(no address)' : hrefOf(p.tokens[p.tangledAt]!.raw);
  const link = href === '(no address)' ? 'a link on the page' : `a link on the page (to ${shortAddress(href)})`;
  return `${link} is left open or holds another link, around a table, a list box, an svg or other markup where byway cannot tell which words a browser shows as that link's words`;
}

/** 1-based line numbers as words: "Line 3", "Lines 3 to 5", "Lines 2, 4 to 6 and 9". */
function linesNamed(ns: number[]): string {
  const runs: string[] = [];
  for (let k = 0; k < ns.length; ) {
    let j = k;
    while (j + 1 < ns.length && ns[j + 1] === ns[j]! + 1) j++;
    runs.push(j === k ? `${ns[k]}` : `${ns[k]} to ${ns[j]}`);
    k = j + 1;
  }
  return `${ns.length > 1 ? 'Lines' : 'Line'} ${runs.length > 1 ? `${runs.slice(0, -1).join(', ')} and ${runs.at(-1)}` : runs[0]}`;
}

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
  // Lines in a tangled link's reach cannot be changed, so their links are not named.
  const links = linkParts(p).filter((x) => !p.units[x.line]!.tangled);
  if (links.length) {
    const shown = links.slice(0, LEGEND_MAX).map((x) => `line ${x.line + 1} "${x.words}" goes to ${shortAddress(x.href)}`);
    parts.push(`Links stay where they are; only their words change. Where each one goes: ${shown.join('; ')}${links.length > LEGEND_MAX ? `; and ${links.length - LEGEND_MAX} more` : ''}.`);
  }
  const tangled = p.units.flatMap((u, i) => (u.tangled ? [i + 1] : []));
  if (tangled.length) parts.push(`${linesNamed(tangled)} cannot be changed in this step: ${tangledWhy(p)}; leave ${tangled.length > 1 ? 'them as they are' : 'it as it is'}.`);
  return parts.join(' ');
}

/** The page keepsVoice lock: the deck as shown (marks included) and each link part's address, by position. */
export function pageLockView(html: string): string {
  const p = readPageCopy(html);
  return JSON.stringify({ deck: deckLines(p), links: linkParts(p).map((x) => x.href) });
}

// ---- removal: the one rule placement and the verifier share --------------------------------------------------------

/** Prefix counts over the page's tokens, built once per page when removals are weighed (see markOf). */
interface Marks {
  /** Start tags of elements a person sees without text (EMBEDDED). */
  embedded: Int32Array;
  /**
   * Start tags that are embedded, carry a hook, or that browsers move out of a table (PageDeck.fostered), and markup that
   * is not the person's copy (a script, style, noscript, template or other raw text, a comment): an element holding one
   * is never removed, so those bytes stay.
   */
  kept: Int32Array;
  /** Start tags whose own aria-label or aria-labelledby, or (an image's) alt, is filled: they name what holds them. */
  naming: Int32Array;
}
const marksOf = new WeakMap<PageDeck, Marks>();
function markOf(p: PageDeck): Marks {
  const have = marksOf.get(p);
  if (have) return have;
  const n = p.tokens.length;
  const m: Marks = { embedded: new Int32Array(n + 1), kept: new Int32Array(n + 1), naming: new Int32Array(n + 1) };
  const filled = (attrs: { name: string; value: string }[], names: (n: string) => boolean) => attrs.some((a) => names(a.name) && a.value.trim() !== '');
  p.tokens.forEach((t, i) => {
    let e = 0;
    let k = 0;
    let nm = 0;
    if (t.kind === 'other') k = 1;
    else if (t.kind === 'tag' && !t.closing) {
      const attrs = attributesOf(t.raw);
      e = EMBEDDED.has(t.name) ? 1 : 0;
      k = e || RAW_KEPT.has(t.name) || attrs.some((a) => isHook(a.name)) || p.fostered[i] ? 1 : 0;
      nm = filled(attrs, (x) => x === 'aria-label' || x === 'aria-labelledby' || (x === 'alt' && ALT_NAMED.has(t.name))) ? 1 : 0;
    }
    m.embedded[i + 1] = m.embedded[i]! + e;
    m.kept[i + 1] = m.kept[i]! + k;
    m.naming[i + 1] = m.naming[i]! + nm;
  });
  marksOf.set(p, m);
  return m;
}
/** How many marks lie in tokens a..b (inclusive); 0 when the range is empty. */
const within = (xs: Int32Array, a: number, b: number): number => (b < a ? 0 : xs[b + 1]! - xs[a]!);

/** Something inside the element shows without text: an image, an icon, a control. */
const showsWithoutText = (p: PageDeck, el: El): boolean => within(markOf(p).embedded, el.start + 1, el.end! - 1) > 0;

/**
 * Something names the element without its words, as a screen reader would name it: its own aria-label,
 * aria-labelledby or title, or inside it an image's alt or an element's own aria-label or aria-labelledby (each
 * non-empty; an empty alt marks an image as decoration).
 */
function namedWithoutText(p: PageDeck, el: El): boolean {
  if (attributesOf(p.tokens[el.start]!.raw).some((a) => isNameAttr(a.name) && a.value.trim() !== '')) return true;
  return within(markOf(p).naming, el.start + 1, el.end! - 1) > 0;
}

/** The first index in sorted `xs` whose value is at least `v`. */
function lowerBound(xs: readonly number[], v: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Tokens a..b hold one end of a virtual link's reach and not the other. Reaches run between consecutive <a> tags, so
 * only the first and the last <a> tag inside can pair with one outside.
 */
function crossesReach(p: PageDeck, a: number, b: number): boolean {
  const lo = lowerBound(p.aTags, a);
  const hi = lowerBound(p.aTags, b + 1) - 1;
  if (lo > hi) return false;
  return [p.aTags[lo]!, p.aTags[hi]!].some((t) => p.reachEnds.get(t)?.some((o) => o < a || o > b));
}

/**
 * An emptied element may go, from its start tag to its own closing tag: inline or a text block, outside svg and math,
 * with nothing inside that carries a hook or shows without text, and neither one browsers move out of a table (foster
 * parenting, which the reader does not model) nor one holding such an element. It must be balanced (El.balanced):
 * closed by its own end tag as browsers close it, with every element inside it whole, so removing it leaves no end tag
 * browsers would ignore and takes no start tag of a block browsers end later. A link the page leaves open (virtual, with no closing tag
 * of its own) never goes; nor does an element holding one end of a virtual link's reach and not the other (removing it
 * would move where browsers end that link). An <a> written around another goes whole, the inner link with it.
 */
function removable(p: PageDeck, el: El): boolean {
  const end = spanEnd(el);
  if (end === undefined || !el.balanced || el.foreign) return false;
  if (!INLINE.has(el.name) && !TEXT_BLOCKS.has(el.name)) return false;
  if (within(markOf(p).kept, el.start, end) > 0) return false;
  return !crossesReach(p, el.start, end);
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
          if (hasHook(tk.raw) || p.fostered[t]) return [];
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

/** Prefix counts over the page's slots of those that satisfy `f`. */
function slotCounts(p: PageDeck, f: (s: number) => boolean): Int32Array {
  const x = new Int32Array(p.slots.length + 1);
  for (let s = 0; s < p.slots.length; s++) x[s + 1] = x[s]! + (f(s) ? 1 : 0);
  return x;
}
/** The slots inside tokens a..b, where a is a start tag: a contiguous range [first, last] (empty when last < first). */
const slotSpan = (p: PageDeck, a: number, b: number): [number, number] => [p.slotEndingAt[a]! + 1, p.slotEndingAt[b]!];
/** Each slot's line (its unit's index), or -1. */
function lineOfSlots(p: PageDeck): Int32Array {
  const line = new Int32Array(p.slots.length).fill(-1);
  p.units.forEach((u, i) => {
    for (const s of u.slots) line[s] = i;
  });
  return line;
}

/**
 * For each slot, the nearest slot at or before it (`prev`) and at or after it (`next`) that holds text browsers show, as
 * the page was (-1: none). Vregions only grow along the slots, so text beside a slot in its own block is one lookup.
 */
interface ShownText {
  prev: Int32Array;
  next: Int32Array;
}
const shownOf = new WeakMap<PageDeck, ShownText>();
function shownText(p: PageDeck): ShownText {
  const have = shownOf.get(p);
  if (have) return have;
  const n = p.slots.length;
  const x: ShownText = { prev: new Int32Array(n), next: new Int32Array(n) };
  const shown = (s: number) => p.slots[s]!.rendered && noHtmlSpace(slotText(p, s)) !== '';
  for (let s = 0, last = -1; s < n; s++) x.prev[s] = last = shown(s) ? s : last;
  for (let s = n - 1, last = -1; s >= 0; s--) x.next[s] = last = shown(s) ? s : last;
  shownOf.set(p, x);
  return x;
}
/** Text browsers show stands before slot `s` (in a slot before it), in the same block as browsers show it. */
function shownBefore(p: PageDeck, s: number): boolean {
  const t = s > 0 ? shownText(p).prev[s - 1]! : -1;
  return t >= 0 && p.slots[t]!.vregion === p.slots[s]!.vregion;
}
/** Text browsers show stands after slot `s` (in a slot after it), in the same block as browsers show it. */
function shownAfter(p: PageDeck, s: number): boolean {
  const t = s + 1 < p.slots.length ? shownText(p).next[s + 1]! : -1;
  return t >= 0 && p.slots[t]!.vregion === p.slots[s]!.vregion;
}
/**
 * The shared rule for the whitespace a deleted line held inside an element the edit removes: it is written where the
 * element was when text browsers show stands on both sides of the element in one block, as the page was, so the lines
 * on either side stay apart ("Price: <del>$20</del><span> now </span><ins>$15</ins>" with "now" deleted). Elsewhere it
 * would sit at a block's edge, where it shows nothing, and it goes with the element. Only whitespace a browser showed is
 * kept so (a slot that is rendered): a hidden block's whitespace never showed, and it goes with the element.
 */
function gapKept(p: PageDeck, el: El): boolean {
  const before = p.slotEndingAt[el.start]!;
  const after = p.slotEndingAt[spanEnd(el)!]! + 1;
  if (p.slots[before]!.vregion !== p.slots[after]!.vregion) return false;
  const { prev, next } = shownText(p);
  const t = prev[before]!;
  const u = next[after]!;
  return t >= 0 && u >= 0 && p.slots[t]!.vregion === p.slots[before]!.vregion && p.slots[u]!.vregion === p.slots[after]!.vregion;
}

/**
 * The removals an edit makes, given which slots hold text afterwards (placement's own result). No removal may join two
 * runs of text: neither two deck runs (two lines, or a line and text it was apart from), nor two blocks of text as
 * browsers show them (BLOCK; so a block between two runs of text that only inline elements, such as font, label or an
 * icon, hold apart is kept, empty). Weighed for all removals together, by union-find over both.
 */
function removalsFor(p: PageDeck, edit: PageEdit, hasText: (s: number) => boolean): { elements: number[]; brs: number[]; problems: string[] } {
  const problems: string[] = [];
  const had = slotCounts(p, (s) => noHtmlSpace(slotText(p, s)) !== '');
  const has = slotCounts(p, hasText);
  // A control's name is the words a browser shows in it: words it hides (a hidden span) name nothing.
  const shownHad = slotCounts(p, (s) => p.slots[s]!.rendered && noHtmlSpace(slotText(p, s)) !== '');
  const shownHas = slotCounts(p, (s) => p.slots[s]!.rendered && hasText(s));
  const left = ([a, b]: [number, number]) => within(had, a, b) > 0 && within(has, a, b) === 0;
  // Emptied over its removal span (a removal candidate: hidden words count, so they are never dropped), and, for a link
  // or button, over its reach (left without words a browser shows).
  const emptied = [...p.els.values()].filter((el) => spanEnd(el) !== undefined && left(slotSpan(p, el.start, spanEnd(el)!)));
  const unworded = [...p.els.values()].filter((el) => {
    if (!isControl(p, el) || el.end === undefined) return false;
    const [a, b] = slotSpan(p, el.start, el.end);
    return within(shownHad, a, b) > 0 && within(shownHas, a, b) === 0;
  });
  const runText = new Uint8Array(p.slots.at(-1)!.region + 1);
  const blockText = new Uint8Array(p.slots.at(-1)!.vregion + 1);
  p.slots.forEach((s, k) => {
    if (!hasText(k)) return;
    if (s.visible) runText[s.region] = 1;
    if (s.rendered) blockText[s.vregion] = 1;
  });
  const runs = new Regions((r) => runText[r] === 1, runText.length - 1);
  const blocks = new Regions((r) => blockText[r] === 1, blockText.length - 1);
  const before = (tok: number) => p.slots[p.slotEndingAt[tok]!]!;
  const after = (tok: number) => p.slots[p.slotEndingAt[tok]! + 1]!;
  // Removing tokens a..b joins the run and the block before a with those after b.
  const joins = (a: number, b: number) => runs.wouldJoin(before(a).region, after(b).region) || blocks.wouldJoin(before(a).vregion, after(b).vregion);
  const join = (a: number, b: number) => {
    runs.join(before(a).region, after(b).region);
    blocks.join(before(a).vregion, after(b).vregion);
  };
  // Outermost removable emptied elements, in document order; one is kept (empty) when removing it would join text, and
  // what it holds may still go.
  const elements: number[] = [];
  const cover = new Int32Array(p.tokens.length + 1).fill(-1); // the removed element (start token) covering each token
  let coveredTo = -1;
  for (const el of emptied.filter((e) => removable(p, e)).sort((a, b) => a.start - b.start)) {
    if (el.start <= coveredTo) continue;
    const end = spanEnd(el)!;
    if (joins(el.start, end)) continue;
    join(el.start, end);
    for (let t = el.start; t <= end; t++) cover[t] = el.start;
    elements.push(el.start);
    coveredTo = end;
  }
  const brs = brRuns(p, deletedUnitsOf(p, edit))
    .filter((t) => cover[t]! < 0)
    .filter((t) => {
      if (joins(t, t)) return false;
      join(t, t);
      return true;
    });
  let lineOf: Int32Array | undefined;
  for (const el of unworded) {
    const last = Math.max(el.end!, spanEnd(el) ?? 0);
    if (cover[el.start]! >= 0 && cover[el.start] === cover[last]) continue;
    const visible = showsWithoutText(p, el);
    if (!visible || !namedWithoutText(p, el)) {
      lineOf ??= lineOfSlots(p);
      const [a, b] = slotSpan(p, el.start, el.end!);
      let at = -1;
      for (let s = a; s <= b && at < 0; s++) at = lineOf[s]!;
      const hook = hookOf(p.tokens[el.start]!.raw);
      const why = [...(hook ? [`it carries ${hook}, which other parts of the page may use`] : []), ...(within(has, a, b) > 0 ? ['it holds words a browser hides'] : [])];
      problems.push(`Line ${at + 1}: this ${el.name === 'a' ? 'link' : 'button'} cannot be removed in this step${why.length ? ` (${why.join('; ')})` : ''} and would be left ${visible ? 'without a name' : 'empty'}; keep some words for it, or leave the line as it was.`);
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
  const depth = (s: number) => p.slots[s]!.depth;
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
  // Positions count characters (code points), as `oc` and `nc` do; a word's string length counts UTF-16 units.
  for (const [a, b] of pairs) for (let t = 0; t < nw[b]!.to - nw[b]!.from; t++) ns[nw[b]!.from + t] = oc[ow[a]!.from + t]!.s;
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

/**
 * The line's edge whitespace pieces (by slot) that would show as a space where the person's line has none. With every
 * piece back in its slot, at its end, the line's text is read in order: a run of whitespace between two characters
 * that holds no space of the person's own is made only of edge pieces, and would show as a space the person did not
 * write. Every other piece sits beside the person's own space or at the line's edge, where it shows nothing more.
 */
function strandedEdges(u: Unit, placed: Map<number, string>): { lead: Set<number>; trail: Set<number> } {
  const out = { lead: new Set<number>(), trail: new Set<number>() };
  let run: [Set<number>, number][] = [];
  let own = false; // the current run of whitespace holds a space the person typed
  let text = false; // a character came before the current run
  const piece = (set: Set<number>, s: number, ws: string | undefined) => {
    if (ws) run.push([set, s]);
  };
  for (const s of u.slots) {
    piece(out.lead, s, u.lead.get(s));
    for (const c of placed.get(s) ?? '') {
      if (isHtmlSpace(c)) {
        own = true;
        continue;
      }
      if (text && !own) for (const [set, x] of run) set.add(x);
      run = [];
      own = false;
      text = true;
    }
    piece(out.trail, s, u.trail.get(s));
  }
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

/**
 * Place an edit into the page (`notOffered`: the lines the deck the edit answers did not offer, see readPageCopy). Never
 * throws: a fault inside placement is a problem, and the page is returned unchanged.
 */
export function placePageEdit(before: string, edit: PageEdit, notOffered?: ReadonlySet<number>): Placed {
  try {
    return place(before, edit, notOffered);
  } catch (e) {
    return { page: before, problems: [`byway could not place this edit (${(e as Error).message}); change the line again, or leave it as it was offered.`], removed: [], brs: [] };
  }
}

function place(before: string, edit: PageEdit, notOffered?: ReadonlySet<number>): Placed {
  const p = readPageCopy(before, notOffered);
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
        // A part outside links with no slot outside links: none at all, or only the empty reach of a wordless link the
        // page leaves open (it ends where the next <a> starts).
        if (seg.kind === 'out' && u.marked && !seg.slots.some((s) => p.slots[s]!.link === undefined)) {
          // Words beside a link where the line had none: right after the link before, or right before the link after.
          const prevLink = u.segs[k - 1];
          const nextLink = u.segs[k + 1];
          const prev = prevLink ? p.els.get(prevLink.link!)! : undefined;
          if (prev && (prev.end! >= p.tokens.length || !(p.tokens[prev.end!]! as { closing?: boolean }).closing)) {
            // The link before is left open and ends where the next <a> starts: there is no place between them outside
            // both. A space can go at the end of the first (it shows the same); words cannot.
            if (noHtmlSpace(t)) {
              problems.push(
                nextLink
                  ? `Line ${i + 1}: words cannot be added between these two links here: the page leaves the first one open, so a browser starts the second right where the first ends.`
                  : `Line ${i + 1}: words cannot be added after the link "${squashHtml(line.segs[k - 1]!.text)}" on this line: the page leaves that link open, so a browser makes the words after it, up to the next link, part of it.`,
              );
              return;
            }
            const last = prevLink!.slots.at(-1)!;
            texts.set(last, `${texts.get(last) ?? ''}${t}`);
            return;
          }
          const at = prev ? prev.end! + 1 : p.els.get(nextLink!.link!)!.start;
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
    // between, shows as one). A piece that would show as a space where the person's line has none is dropped: the
    // person glued new text to a word whose edge space sat inside a link or formatting ("our shop\n  </a>" + ".").
    const stranded = strandedEdges(u, texts);
    for (const [s, ws] of u.lead) if (!stranded.lead.has(s)) texts.set(s, `${ws}${texts.get(s)}`);
    for (const [s, ws] of u.trail) if (!stranded.trail.has(s)) texts.set(s, `${texts.get(s)}${ws}`);
    // The line's edge whitespace also parts it from text beside it on the same screen line. Where new words went past the
    // slot that held it (into a shallower slot beyond formatting, or beyond a dropped piece), the line's new edge would
    // touch that text: a space goes at the new edge, beside the words ("<b>$20 </b> only " before "Now $15"). So does a
    // space the person typed at the line's edge (" there" beside "Hello", or "[] menu" with the link before "menu"
    // removed). Whitespace already beside the line is not weighed (a space more shows as one, and the reader cannot
    // always tell whether whitespace shows, as at a button's edge).
    if (line.text) {
      const words = u.slots.filter((s) => noHtmlSpace(texts.get(s)!) !== '');
      const joined = u.slots.map((s) => texts.get(s)!).join('');
      const had = (m: Map<number, string>) => [...m.values()].some((ws) => ws !== '');
      const first = u.slots[0]!;
      const last = u.slots.at(-1)!;
      if (words.length && !isHtmlSpace(joined[0]) && shownBefore(p, first) && (had(u.lead) || line.lead)) texts.set(words[0]!, ` ${texts.get(words[0]!)}`);
      if (words.length && !isHtmlSpace(joined.at(-1)) && shownAfter(p, last) && (had(u.trail) || line.trail)) texts.set(words.at(-1)!, `${texts.get(words.at(-1)!)} `);
    }
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
  const lineOf = lineOfSlots(p);
  const out: string[] = [];
  let skip = -1;
  raws.forEach((r, i) => {
    if (i <= skip) return;
    const g = goneEls.get(i);
    if (g) {
      // An element the edit emptied goes, and what placement put in it (whitespace: a line's edge space, or a space
      // between two words) is written where it was, so the gap beside an icon stays and no two words run together. A
      // deleted line's edge whitespace in it is written there too where text stands on both sides (gapKept).
      const [a, b] = slotSpan(p, g.start, spanEnd(g)!);
      const gap = gapKept(p, g);
      let kept = '';
      for (let s = a; s <= b; s++) {
        const line = lineOf[s]! >= 0 ? edit.lines[lineOf[s]!]! : undefined;
        if (line?.changed && (line.text || (gap && p.slots[s]!.rendered))) kept += newText.get(s) ?? '';
      }
      out.push((inserts.get(i) ?? '') + escapeText(kept));
      skip = spanEnd(g)!;
      return;
    }
    if (goneBr.has(i)) {
      out.push(inserts.get(i) ?? '');
      return;
    }
    out.push((inserts.get(i) ?? '') + r);
  });
  if (inserts.has(raws.length)) out.push(inserts.get(raws.length)!);
  return { page: out.join(''), problems: [...new Set(problems)], removed: rem.elements, brs: rem.brs };
}

// ---- the exact verifier ------------------------------------------------------------------------------------------

/** Check a written page against the edit and placement's witness. Never throws: a fault is a problem. */
export function pageEditProblems(before: string, after: string, edit: PageEdit, witness: Witness, notOffered?: ReadonlySet<number>): string[] {
  try {
    return verify(before, after, edit, witness, notOffered);
  } catch (e) {
    return [`byway could not check this edit (${(e as Error).message}).`];
  }
}

function verify(before: string, after: string, edit: PageEdit, witness: Witness, notOffered?: ReadonlySet<number>): string[] {
  const p = readPageCopy(before, notOffered);
  // 0. No changed line in a tangled link's reach: byway cannot tell its link words (the reader refuses these too).
  const tangled = p.units.flatMap((u, i) => (u.tangled && edit.lines[i]!.changed ? [i + 1] : []));
  if (tangled.length) return tangled.map((n) => `Line ${n} cannot be changed in this step: a link on the page is left open or holds another link there.`);
  const a = tokenize(after);
  const B = p.tokens.map((t, i) => ({ t, i })).filter((x) => x.t.kind !== 'text');
  const A = a.map((t, i) => ({ t, i })).filter((x) => x.t.kind !== 'text');
  const changedSlots = new Set(p.units.flatMap((u, i) => (edit.lines[i]!.changed ? u.slots : [])));
  // Slots with text outside the changed lines: a removal may take none of them.
  const fixedText = slotCounts(p, (s) => !changedSlots.has(s) && noHtmlSpace(slotText(p, s)) !== '');
  const candidate = (el: El | undefined) => !!el && removable(p, el) && within(fixedText, ...slotSpan(p, el.start, spanEnd(el)!)) === 0;
  const brCandidates = new Set(brRuns(p, deletedUnitsOf(p, edit)));
  // 1. Markup. Each witnessed removal must be one the shared rule allows, and the written page's markup must be the page
  // before, less exactly those removals, token for token. Linear; no search (overlapping removals are marked by
  // difference arrays).
  const removed = new Set<El>();
  const tokMarks = new Int32Array(p.tokens.length + 2);
  const slotMarks = new Int32Array(p.slots.length + 1);
  for (const st of new Set(witness.removed)) {
    const el = p.els.get(st);
    if (!candidate(el)) return ['The page changed beyond its text: it removes an element this edit may not remove.'];
    removed.add(el!);
    tokMarks[el!.start]!++;
    tokMarks[spanEnd(el!)! + 1]!--;
    const [s0, s1] = slotSpan(p, el!.start, spanEnd(el!)!);
    if (s1 >= s0) {
      slotMarks[s0]!++;
      slotMarks[s1 + 1]!--;
    }
  }
  const removedTok = new Uint8Array(p.tokens.length + 1);
  for (let t = 0, run = 0; t <= p.tokens.length; t++) {
    run += tokMarks[t]!;
    if (run > 0) removedTok[t] = 1;
  }
  for (const t of new Set(witness.brs)) {
    if (!brCandidates.has(t)) return ['The page changed beyond its text: it removes a line break this edit may not remove.'];
    removedTok[t] = 1;
  }
  const kept = B.filter((x) => !removedTok[x.i]);
  if (kept.length !== A.length || kept.some((x, k) => x.t.raw !== A[k]!.t.raw)) return ['The page changed beyond its text: its markup is not the page before the edit, less the elements the edit emptied.'];
  const map = new Map<number, number>(kept.map((x, k) => [x.i, A[k]!.i]));
  const inRemoved = new Uint8Array(p.slots.length);
  for (let s = 0, run = 0; s < p.slots.length; s++) {
    run += slotMarks[s]!;
    if (run > 0) inRemoved[s] = 1;
  }
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
  // Between two slots of a chain lies one removal: a <br>, which leaves nothing, or an element, which leaves what the
  // shared rule says (gapKept): the edge whitespace of a deleted line it held, where text stands on both sides, else
  // nothing. Whitespace a changed line's run held in it is that line's (unknown, like the line's own slots).
  const removedAt = new Map<number, El>([...removed].map((el) => [el.start, el]));
  const isDeleted = (i: number) => i >= 0 && edit.lines[i]!.changed && !(edit.lines[i] as { text: string }).text;
  type Item = { text?: string; line: number; slot?: number; gapOf?: number[] };
  const gapItem = (el: El | undefined): Item => {
    if (!el) return { text: '', line: -1 };
    const [s0, s1] = slotSpan(p, el.start, spanEnd(el)!);
    const keep = gapKept(p, el);
    let text = '';
    const gapOf: number[] = [];
    for (let s = s0; s <= s1; s++) {
      const i = lineOfSlot[s]!;
      if (i >= 0 && edit.lines[i]!.changed && (edit.lines[i] as { text: string }).text) return { line: i };
      if (keep && isDeleted(i) && p.slots[s]!.rendered) {
        text += known(s)!;
        if (!gapOf.includes(i)) gapOf.push(i);
      }
    }
    return { text, line: -1, gapOf };
  };
  for (const [tok, ss] of chains) {
    const got = afterTextAt(tok);
    const items: Item[] = [];
    ss.forEach((s, k) => {
      if (k > 0) items.push(gapItem(removedAt.get(p.slots[ss[k - 1]!]!.end)));
      const t = known(s);
      items.push(t === undefined ? { line: lineOfSlot[s]!, slot: s } : { text: t, line: -1, slot: s });
    });
    const unknown = items.flatMap((x, k) => (x.text === undefined ? [k] : []));
    const lines = new Set(unknown.map((k) => items[k]!.line));
    const first = unknown.length ? unknown[0]! : items.length;
    const last = unknown.length ? unknown.at(-1)! : items.length - 1;
    const lastSlot = unknown.length ? unknown.filter((k) => items[k]!.slot !== undefined).at(-1) : undefined;
    // A removal that leaves nothing, inside the changed line's run, is part of it.
    const inRun = (x: Item) => x.text === undefined || (x.slot === undefined && x.text === '');
    if (lines.size > 1 || (unknown.length && (!items.slice(first, last + 1).every(inRun) || lastSlot === undefined))) {
      problems.push('Two changed lines ended up in one run of text.');
      continue;
    }
    const pre = items.slice(0, first).map((x) => x.text!).join('');
    const post = items.slice(last + 1).map((x) => x.text!).join('');
    if (!got.startsWith(pre) || !got.endsWith(post) || got.length < pre.length + post.length || (!unknown.length && got !== pre + post)) {
      const gaps = [...new Set(items.flatMap((x) => (x.text ? (x.gapOf ?? []) : [])))];
      const del = [...new Set(ss.map((s) => lineOfSlot[s]!).filter(isDeleted))];
      if (gaps.length && !unknown.length && noHtmlSpace(got) === noHtmlSpace(pre + post)) problems.push(`${linesNamed(gaps.map((i) => i + 1))} ${gaps.length > 1 ? 'are' : 'is'} emptied, but the space ${gaps.length > 1 ? 'they' : 'it'} left between the lines beside ${gaps.length > 1 ? 'them' : 'it'} is not where the element that held it was.`);
      else problems.push(del.length ? `${del.map((i) => `Line ${i + 1}`).join(' and ')} must be empty.` : `Text outside your changed lines changed ("${(pre + post).slice(0, 40)}").`);
      continue;
    }
    items.forEach((x, k) => {
      if (x.slot !== undefined) slotAfter.set(x.slot, k < first || k > last ? x.text! : '');
    });
    if (lastSlot !== undefined) slotAfter.set(items[lastSlot]!.slot!, got.slice(pre.length, got.length - post.length));
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
    else if (line.text) {
      // The line as it shows: all of its text, edge whitespace included, with HTML whitespace collapsed, is the
      // person's line. So edge space left between two characters, where the person wrote none, is refused.
      const shown = squashHtml(decodeText(u.slots.map(at).join('')));
      if (shown !== line.text) problems.push(`Line ${i + 1} must read exactly "${line.text}" (it reads "${shown}").`);
    }
    // Edge whitespace stays in its slot, at the same end, across every segment of the line: each slot before the
    // first that holds words keeps exactly the whitespace it held, and every other one still starts with it (so a gap
    // beside an empty icon or an image link never moves past it); the same at the end. A piece may be gone only where
    // it would have shown as a space between two characters (the line's characters on both sides of it, as written,
    // are not whitespace): new text glued to a word whose edge space sat inside a link. Slots a removal merged are
    // skipped.
    const words = line.text ? u.slots.filter((s) => noHtmlSpace(at(s))) : [];
    if (words.length) {
      const f = words[0]!;
      const l = words.at(-1)!;
      const shownAt = u.slots.map((s) => decodeText(at(s)));
      const index = new Map(u.slots.map((s, k) => [s, k]));
      // The line's last character before each slot, and its first character after each slot, as written.
      const before: (string | undefined)[] = [];
      const after: (string | undefined)[] = [];
      let last: string | undefined;
      shownAt.forEach((t, k) => {
        before[k] = last;
        if (t) last = t.at(-1);
      });
      let first: string | undefined;
      for (let k = shownAt.length - 1; k >= 0; k--) {
        after[k] = first;
        if (shownAt[k]) first = shownAt[k]![0];
      }
      const glued = (x: string | undefined, y: string | undefined) => x !== undefined && y !== undefined && !isHtmlSpace(x) && !isHtmlSpace(y);
      const leadOk = (s: number, ws: string) => {
        const k = index.get(s)!;
        return (s < f ? at(s) === ws : at(s).startsWith(ws)) || glued(before[k], shownAt[k] ? shownAt[k]![0] : after[k]);
      };
      const trailOk = (s: number, ws: string) => {
        const k = index.get(s)!;
        return (s > l ? at(s) === ws : at(s).endsWith(ws)) || glued(shownAt[k] ? shownAt[k]!.at(-1) : before[k], after[k]);
      };
      const moved = [...u.lead].some(([s, ws]) => alone.has(s) && !leadOk(s, ws)) || [...u.trail].some(([s, ws]) => alone.has(s) && !trailOk(s, ws));
      if (moved) problems.push(`Line ${i + 1}: the space before or after its words moved.`);
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
  // Only words a browser shows count: a hidden span names nothing.
  const changedHad = slotCounts(p, (s) => changedSlots.has(s) && p.slots[s]!.rendered && noHtmlSpace(slotText(p, s)) !== '');
  const afterHas = slotCounts(p, (s) => p.slots[s]!.rendered && noHtmlSpace(decodeText(slotAfter.get(s) ?? '')) !== '');
  for (const el of p.els.values()) {
    // Removed elements cover their whole token range, so one inside a removed one starts on a removed token.
    if (el.end === undefined || !isControl(p, el) || removedTok[el.start]) continue;
    const span = slotSpan(p, el.start, el.end);
    if (within(changedHad, ...span) === 0 || within(afterHas, ...span) > 0) continue;
    if (!showsWithoutText(p, el) || !namedWithoutText(p, el)) problems.push(`A ${el.name === 'a' ? 'link' : 'button'} in your changed lines is left without a name.`);
  }
  // 6. Read fresh: the written page's blocks hold exactly the expected text, block by block, in order; and each block's
  // words sit in the same links as the person put them, each link with its address (so words that crossed a link's
  // edge are refused, whichever way they got there).
  const wantRegion = new Map<number, { parts: Part[]; line: number }>();
  const linkPart = (el: number | undefined, raw: string): Part => (el === undefined ? { raw } : { el, href: hrefOf(p.tokens[el]!.raw), raw });
  // Lines not offered are the page's own text, unchanged.
  const all = [...p.units.map((u, i) => ({ u, i })), ...p.unoffered.map((u) => ({ u, i: -1 }))].sort((x, y) => x.u.slots[0]! - y.u.slots[0]!);
  for (const { u, i } of all) {
    const line: EditLine = i >= 0 ? edit.lines[i]! : { changed: false };
    const r = p.slots[u.slots[0]!]!.region;
    let parts: Part[];
    if (!line.changed) parts = partsOf(p, u.slots);
    else if (!line.text) parts = [];
    else if (u.marked) parts = u.segs.map((seg, k) => linkPart(seg.kind === 'link' ? seg.link : undefined, line.segs[k]!.text));
    else parts = [linkPart(u.wholeLink, line.text)];
    const w = wantRegion.get(r);
    if (w) {
      w.parts.push({ raw: ' ' }, ...parts);
      if (!w.line && i >= 0) w.line = i + 1;
    } else wantRegion.set(r, { parts, line: i + 1 });
  }
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
  else {
    got.forEach((g, k) => {
      if (g.links !== want[k]!.form.links) problems.push(`${want[k]!.line ? `Line ${want[k]!.line}` : 'Text you were not offered'}, read again, does not have its link words where ${want[k]!.line ? 'you put them' : 'they were'} (it reads "${g.shown}").`);
    });
    // And read as browsers show blocks (BLOCK; end tags browsers ignore break nothing), with HTML whitespace collapsed:
    // each block of text is the page before with the person's lines in place, each changed or deleted line keeping the
    // edge whitespace it had (so the separators between lines are the page's own). So no two runs of text that showed
    // apart now run together, on separate lines or as words on one line, and no space shows that did not, whatever
    // wrote it.
    const anchor = new Map(p.units.map((u, i) => [i, [...u.lead.keys()].at(-1)!]));
    const shownWant = new Map<number, string>();
    p.slots.forEach((s, k) => {
      if (!s.rendered) return;
      const i = lineOfSlot[k]!;
      const line = i >= 0 ? edit.lines[i]! : undefined;
      let t = slotText(p, k);
      if (line?.changed) {
        const u = p.units[i]!;
        t = `${u.lead.get(k) ?? ''}${anchor.get(i) === k ? `${line.lead ? ' ' : ''}${line.text}${line.trail ? ' ' : ''}` : ''}${u.trail.get(k) ?? ''}`;
      }
      shownWant.set(s.vregion, `${shownWant.get(s.vregion) ?? ''}${t}`);
    });
    const shownGot = new Map<number, string>();
    q.slots.forEach((s, k) => {
      if (s.rendered) shownGot.set(s.vregion, `${shownGot.get(s.vregion) ?? ''}${slotText(q, k)}`);
    });
    const blocksOf = (m: Map<number, string>) => [...m.entries()].sort((x, y) => x[0] - y[0]).map(([, t]) => squashHtml(t)).filter((t) => t);
    const wantBlocks = blocksOf(shownWant);
    const gotBlocks = blocksOf(shownGot);
    let k = gotBlocks.findIndex((t, j) => t !== wantBlocks[j]);
    if (k < 0 && gotBlocks.length !== wantBlocks.length) k = gotBlocks.length - 1;
    if (k >= 0) {
      const g = gotBlocks[k] ?? '';
      const w = wantBlocks[k] ?? '';
      const at = g.slice(0, 80);
      if (noHtmlSpace(g) === noHtmlSpace(w)) {
        // The same characters, spaced otherwise: where they first differ, the browser showed a space, or did not.
        let j = 0;
        while (j < g.length && g[j] === w[j]) j++;
        problems.push(w[j] === ' ' ? `The page, read again, runs words together that a browser showed apart: it shows "${at}".` : `The page, read again, shows a space a browser did not: it shows "${at}".`);
      } else {
        problems.push(
          noHtmlSpace(g).length > noHtmlSpace(w).length
            ? `The page, read again, runs lines together that a browser showed apart: it shows "${at}" as one line.`
            : `The page, read again, breaks a line a browser showed whole: it shows "${at}" on a line of its own.`,
        );
      }
    }
  }
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
