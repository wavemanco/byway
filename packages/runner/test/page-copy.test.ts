/**
 * A page's copy deck and VOICE's exact write-back (F07, ADR-0081): the deck as the person is shown it, the answer read
 * as an exact positional edit, deterministic placement with its witness, and the verifier. Each case is a page, an
 * answer and the exact page written (or the refusal), as the design's prototype recorded them
 * (revise-E-r3-1b/proto8.out.json).
 */
import { describe, expect, it } from 'vitest';
import { demoPage } from './helpers/demo-page.ts';
import { deckLines, pageEditProblems, pageLockView, pageVoiceSuffix, placePageEdit, readPageCopy, readPageEdit, samePageCopy, type PageEdit } from '../src/copy.ts';
import { editPairs, tablePairs } from '../src/page-copy.ts';

const pageOf = (b: string) => `<!doctype html><html><head><title>T</title></head><body>${b}</body></html>`;
const body = (html: string) => html.replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g, '');
const same = (d: string[]) => d.join('\n');
const set = (k: number, v: string) => (d: string[]) => d.map((l, i) => (i === k ? v : l)).join('\n');
const sets = (m: Record<number, string>) => (d: string[]) => d.map((l, i) => (i in m ? m[i]! : l)).join('\n');

interface Outcome {
  deck: string[];
  rejected?: string;
  placed?: string;
  placeProblems?: string[];
  verifier?: string[];
}

/** Read the page's deck, answer it, place the answer and verify it, as VOICE does. */
function run(b: string, answerOf: (deck: string[]) => string, opts: { offered?: string; full?: boolean; reask?: boolean } = {}): Outcome {
  const before = opts.full ? b : pageOf(b);
  const p = readPageCopy(before);
  const deck = deckLines(p);
  const e = readPageEdit(p, answerOf(deck), opts.offered, !opts.reask);
  if (!e.ok) return { deck, rejected: e.problem };
  const placed = placePageEdit(before, e);
  return { deck, placed: opts.full ? placed.page : body(placed.page), placeProblems: placed.problems, verifier: pageEditProblems(before, placed.page, e, placed) };
}
/** A clean write: placed exactly so, with no problem from placement or the verifier. */
const clean = (placed: string) => ({ placed, placeProblems: [], verifier: [] });
const edit = (before: string, answer: string): PageEdit => {
  const e = readPageEdit(readPageCopy(before), answer);
  if (!e.ok) throw new Error(e.problem);
  return e;
};
/** The verifier on a page placement did not produce (a simulated placement fault), with placement's own witness. */
const verifyBad = (before: string, after: string, answer: string) => {
  const e = edit(before, answer);
  return pageEditProblems(before, after, e, placePageEdit(before, e));
};

describe('the deck and exact placement (F07)', () => {
  it('deletion, duplicates, order and moves across blocks are positional', () => {
    expect(run('<h1>Head</h1><p>Old middle</p><p>Tail</p>', () => 'T\nNew head\n\nTail')).toMatchObject({ deck: ['T', 'Head', 'Old middle', 'Tail'], ...clean('<h1>New head</h1><p>Tail</p>') });
    expect(run('<p>Old first</p><p>Old second</p>', () => 'T\nRepeated\nRepeated')).toMatchObject(clean('<p>Repeated</p><p>Repeated</p>'));
    expect(run('<p>Alpha</p><p>Beta</p>', () => 'T\nBeta\nAlpha')).toMatchObject(clean('<p>Beta</p><p>Alpha</p>'));
    expect(run('<h1>Bread before seven</h1><p>Order by nine</p>', () => 'T\nBread before\nseven Order by nine')).toMatchObject(clean('<h1>Bread before</h1><p>seven Order by nine</p>'));
  });

  it('the last line can be emptied; blank lines past the end are nothing', () => {
    expect(run('<h1>Head</h1><p>Sub</p>', () => 'T\nHead\n')).toMatchObject(clean('<h1>Head</h1>'));
    expect(run('<h1>Head</h1><p>Sub</p>', () => 'T\nHead\nSub\n\n')).toMatchObject(clean('<h1>Head</h1><p>Sub</p>'));
  });

  it('a link inside a line: the person chooses its words, in brackets', () => {
    const P = '<p>Please <a href="/terms">read terms</a> today.</p>';
    expect(run(P, same).deck).toEqual(['T', 'Please [read terms] today.']);
    expect(run(P, set(1, 'Please [read the terms] today.'))).toMatchObject(clean('<p>Please <a href="/terms">read the terms</a> today.</p>'));
    expect(run(P, set(1, 'Please [come] today.'))).toMatchObject(clean('<p>Please <a href="/terms">come</a> today.</p>'));
    expect(run(P, set(1, 'Please [] today.'))).toMatchObject(clean('<p>Please today.</p>'));
    expect(run(P, set(1, 'Review [the conditions] now.'))).toMatchObject(clean('<p>Review <a href="/terms">the conditions</a> now.</p>'));
    expect(run(P, set(1, 'Today, please [read terms].'))).toMatchObject(clean('<p>Today, please <a href="/terms">read terms</a>.</p>'));
    expect(run(P, set(1, 'Read terms [please] today.'))).toMatchObject(clean('<p>Read terms <a href="/terms">please</a> today.</p>'));
    expect(run(P, set(1, 'Please read the terms today.')).rejected).toBe('Line 2 has 1 link in [brackets] and your line has 0: keep one pair per link, in order; leave a pair empty, [], to remove its link.');
    expect(run('<p><a href="/faq">Read the FAQ</a> before you order.</p>', set(1, '[Read the FAQ] before ordering.'))).toMatchObject(clean('<p><a href="/faq">Read the FAQ</a> before ordering.</p>'));
    expect(run('<p style="white-space:pre-wrap">Please <a href="/t">read terms</a> today.</p>', set(1, 'Please [read the terms] today.'))).toMatchObject(clean('<p style="white-space:pre-wrap">Please <a href="/t">read the terms</a> today.</p>'));
    expect(run('<p>\n      Please <a href="/t">read terms</a>\n      today.\n    </p>', set(1, 'Please [read terms] tomorrow.'))).toMatchObject(clean('<p>\n      Please <a href="/t">read terms</a> tomorrow.\n    </p>'));
    expect(run('<p>Please <strong><a href="/t">read terms</a></strong> today.</p>', set(1, 'Please [read the terms] now.'))).toMatchObject(clean('<p>Please <strong><a href="/t">read the terms</a></strong> now.</p>'));
    expect(run('<p><em>Please <a href="/t">read</a> the</em> terms today.</p>', set(1, 'Kindly [review] the terms today.'))).toMatchObject(clean('<p><em>Kindly <a href="/t">review</a> the</em> terms today.</p>'));
    expect(run('<p>Read <a href="/a">A</a><a href="/b">B</a> now</p>', set(1, 'Read [Alpha][Beta] now'))).toMatchObject({ deck: ['T', 'Read [A][B] now'], ...clean('<p>Read <a href="/a">Alpha</a><a href="/b">Beta</a> now</p>') });
    expect(run('<p>Click<a href="/x"> here </a>now</p>', set(1, 'Click [here] today'))).toMatchObject({ deck: ['T', 'Click [here] now'], ...clean('<p>Click <a href="/x">here</a> today</p>') });
  });

  it('emphasis follows whole words and pieces (a documented rule, not verified)', () => {
    expect(run('<p>Order by 10pm and <strong>it arrives at seven</strong>.</p>', set(1, 'Order by 10pm and it arrives by six.'))).toMatchObject(clean('<p>Order by 10pm and <strong>it arrives by six</strong>.</p>'));
    expect(run('<p>Order by 10pm and <strong>it arrives at seven</strong>.</p>', set(1, 'Order today for delivery by six.'))).toMatchObject(clean('<p>Order today for delivery by six.</p>'));
    expect(run('<p>Order <em>now</em> please.</p>', set(1, 'Order please.'))).toMatchObject(clean('<p>Order please.</p>'));
    expect(run('<p><strong>Free delivery</strong></p>', set(1, 'Free delivery today'))).toMatchObject(clean('<p><strong>Free delivery today</strong></p>'));
    expect(run('<p><strong>Free delivery</strong> <em>on orders over $20</em></p>', set(1, 'Free delivery on orders over $25'))).toMatchObject(clean('<p><strong>Free delivery</strong> <em>on orders over $25</em></p>'));
    expect(run('<h1>Bread before <em>seven</em></h1>', set(1, 'Loaves at dawn'))).toMatchObject(clean('<h1>Loaves at dawn</h1>'));
    expect(run('<h1><em>Fresh</em> bread daily</h1>', set(1, 'Find us downtown'))).toMatchObject(clean('<h1>Find us downtown</h1>'));
    expect(run('<h1>Bread before <em>seven</em></h1>', set(1, 'Bread before eight'))).toMatchObject(clean('<h1>Bread before <em>eight</em></h1>'));
    expect(run('<p>Get <strong>50% off</strong> today</p>', set(1, 'Get 5 loaves free today'))).toMatchObject(clean('<p>Get <strong>5 loaves free</strong> today</p>'));
    expect(run('<p><b class="cap">F</b>resh bread daily</p>', set(1, 'Fine bread daily'))).toMatchObject(clean('<p><b class="cap">F</b>ine bread daily</p>'));
    expect(run('<p>Open at <em>seven</em>.</p>', set(1, 'Open at eight.'))).toMatchObject(clean('<p>Open at <em>eight</em>.</p>'));
    expect(run('<p>Open <em>seven</em> days</p>', set(1, 'Open seventy days'))).toMatchObject(clean('<p>Open <em>seventy</em> days</p>'));
    expect(run('<h1><span class="a">Fresh bread</span> <span class="b">before seven</span></h1>', same)).toMatchObject({ deck: ['T', 'Fresh bread before seven'], ...clean('<h1><span class="a">Fresh bread</span> <span class="b">before seven</span></h1>') });
    // Formatting coverage is not verified: an odd <em> with an honest witness passes.
    const em = pageOf('<h1>Bread before <em>seven</em></h1>');
    expect(pageEditProblems(em, pageOf('<h1>Loaves at daw<em>n</em></h1>'), edit(em, 'T\nLoaves at dawn'), { removed: [], brs: [] })).toEqual([]);
  });

  it('a footer and a nav: side-by-side links are one line each, or bracketed in a line with words between', () => {
    expect(run('<footer><p><a href="/t">Terms</a> · <a href="/p">Privacy</a></p></footer>', set(1, '[Terms] · [Privacy policy]'))).toMatchObject({ deck: ['T', '[Terms] · [Privacy]'], ...clean('<footer><p><a href="/t">Terms</a> · <a href="/p">Privacy policy</a></p></footer>') });
    expect(run('<footer><p><a href="/t">Terms</a> · <a href="/p">Privacy</a></p></footer>', set(1, '[Terms] [Privacy]'))).toMatchObject(clean('<footer><p><a href="/t">Terms</a> <a href="/p">Privacy</a></p></footer>'));
    expect(run('<footer><p><a href="/t">Terms</a> · <a href="/p">Privacy</a></p></footer>', set(1, '[Privacy] · [Terms]'))).toMatchObject(clean('<footer><p><a href="/t">Privacy</a> · <a href="/p">Terms</a></p></footer>'));
    const NAV = '<nav><a href="#how">How it works</a><a href="#start">Contact</a></nav>';
    expect(run(NAV, (d) => sets({ 1: d[2]!, 2: d[1]! })(d))).toMatchObject({ deck: ['T', 'How it works', 'Contact'], ...clean('<nav><a href="#how">Contact</a><a href="#start">How it works</a></nav>') });
    expect(run(NAV, set(2, 'How it works'))).toMatchObject(clean('<nav><a href="#how">How it works</a><a href="#start">How it works</a></nav>'));
  });

  it('space at a line\'s edges stays in the slot that held it, so an icon keeps its gap (r2)', () => {
    expect(run('<ul><li><i class="icon"></i> Fast delivery</li></ul>', set(1, 'Faster delivery'))).toMatchObject(clean('<ul><li><i class="icon"></i> Faster delivery</li></ul>'));
    expect(run('<p>Fast delivery <i class="icon"></i></p>', set(1, 'Faster delivery'))).toMatchObject(clean('<p>Faster delivery <i class="icon"></i></p>'));
    expect(run('<p><span class="badge"></span> New arrivals</p>', set(1, 'Old arrivals'))).toMatchObject(clean('<p><span class="badge"></span> Old arrivals</p>'));
    expect(run('<p><a href="/shop" aria-label="Shop"><img src="a.png"></a> Shop now</p>', set(1, 'Shop later'))).toMatchObject(clean('<p><a href="/shop" aria-label="Shop"><img src="a.png"></a> Shop later</p>'));
    expect(run('<p><a href="/shop"><img src="a.png" alt="Shop"></a> Shop now</p>', set(1, 'Shop later'))).toMatchObject(clean('<p><a href="/shop"><img src="a.png" alt="Shop"></a> Shop later</p>'));
    expect(run('<p>Follow us <a href="https://x.com/b"><svg width="10" height="10"></svg></a></p>', set(1, 'Follow me'))).toMatchObject(clean('<p>Follow me <a href="https://x.com/b"><svg width="10" height="10"></svg></a></p>'));
    expect(run('<p> <i class="icon"></i>\n  Fast delivery\n</p>', set(1, 'Faster delivery'))).toMatchObject(clean('<p> <i class="icon"></i>\n  Faster delivery\n</p>'));
    // Words added before the first words go beside them, after the icon; formatting still takes the shallowest slot.
    expect(run('<ul><li><i class="icon"></i> Fast delivery</li></ul>', set(1, 'Free Fast delivery'))).toMatchObject(clean('<ul><li><i class="icon"></i> Free Fast delivery</li></ul>'));
    expect(run('<ul><li><i class="icon"></i> Fast <b>delivery</b></li></ul>', set(1, 'Free Fast delivery'))).toMatchObject(clean('<ul><li><i class="icon"></i> Free Fast <b>delivery</b></li></ul>'));
    expect(run('<p><b>Bold</b> plain</p>', set(1, 'Very Bold plain'))).toMatchObject(clean('<p>Very <b>Bold</b> plain</p>'));
    // The verifier holds edge space to its slot too: a page that moved it across the icon is refused.
    const icon = pageOf('<ul><li><i class="icon"></i> Fast delivery</li></ul>');
    expect(verifyBad(icon, pageOf('<ul><li> <i class="icon"></i>Faster delivery</li></ul>'), 'T\nFaster delivery')).toEqual(['Line 2: the space before or after its words moved.']);
  });

  it('words added at a line\'s edge go beside its first or last word, never across an icon, also on a line with links (r3)', () => {
    // Before the first link part: the icon and its gap stay at the line's start.
    expect(run('<p><i class="icon"></i> <a href="/d">Fast delivery</a> today</p>', set(1, 'Now [Fast delivery] today'))).toMatchObject(clean('<p><i class="icon"></i> Now <a href="/d">Fast delivery</a> today</p>'));
    expect(run('<div><a href="/l" aria-label="Lab"><i class="fa"></i></a> <a href="/t0"><em>today Fresh</em></a> now</div>', set(1, 'New [today Fresh] now'))).toMatchObject(clean('<div><a href="/l" aria-label="Lab"><i class="fa"></i></a> New <a href="/t0"><em>today Fresh</em></a> now</div>'));
    // An icon inside the formatting that holds the first word: the new word joins that word, after the icon.
    expect(run('<p> <em><i class="icon"></i> Go</em> now</p>', set(1, 'New Go now'))).toMatchObject(clean('<p> <em><i class="icon"></i> New Go</em> now</p>'));
    // After the last link part: the words go before the icon, which keeps its gap.
    expect(run('<p>Fresh <em><a href="/g">Go</a> <i class="icon"></i></em></p>', set(1, 'Fresh [Go] now'))).toMatchObject(clean('<p>Fresh <em><a href="/g">Go</a> now <i class="icon"></i></em></p>'));
    // An arrow at the end of a link, words added after the link: the space before the arrow stays where it was.
    expect(run('<p>Order online: <a href="/order">Order now <i class="arrow"></i></a></p>', set(1, 'Order online: [Order now] today'))).toMatchObject(clean('<p>Order online: <a href="/order">Order now <i class="arrow"></i></a> today</p>'));
    // Space at the edge stays in its slot even when the new words come before it, across formatting only.
    expect(run('<p><b> Hello</b> world</p>', set(1, 'Big Hello world'))).toMatchObject(clean('<p>Big <b> Hello</b> world</p>'));
    // The verifier: a page that moved the gap across the icon on a line with a link is refused.
    const P = pageOf('<p><i class="icon"></i> <a href="/d">Fast delivery</a> today</p>');
    expect(verifyBad(P, pageOf('<p> Now <i class="icon"></i><a href="/d">Fast delivery</a> today</p>'), 'T\nNow [Fast delivery] today')).toEqual(['Line 2: the space before or after its words moved.']);
    // The arrow glued to the link's words (round 2's write), and a doubled space beside kept edge space, are refused.
    const ARROW = pageOf('<p>Order online: <a href="/order">Order now <i class="arrow"></i></a></p>');
    expect(verifyBad(ARROW, pageOf('<p>Order online: <a href="/order">Order now<i class="arrow"></i></a> today </p>'), 'T\nOrder online: [Order now] today')).toEqual(['Line 2: the space before or after its words moved.']);
    const BOLD = pageOf('<p><b> Hello</b> world</p>');
    expect(verifyBad(BOLD, pageOf('<p>Big  <b> Hello</b> world</p>'), 'T\nBig Hello world')).toEqual(['Line 2 must read exactly "Big Hello world" (it reads "Big  Hello world").']);
  });

  it('one bracket grammar on every line', () => {
    const NAV = '<nav><a href="#how">How it works</a><a href="#start">Contact</a></nav>';
    expect(run(NAV, set(2, '[Contact us]'))).toMatchObject(clean('<nav><a href="#how">How it works</a><a href="#start">Contact us</a></nav>'));
    expect(run(NAV, set(2, 'Contact us'))).toMatchObject(clean('<nav><a href="#how">How it works</a><a href="#start">Contact us</a></nav>'));
    expect(run(NAV, set(2, 'Contact [us]')).rejected).toBe("Line 3 is all one link's words: write them plain, or put the whole line in [brackets]. To write a bracket as text, put \\ before it.");
    expect(run('<p>Read the terms today.</p>', set(1, 'Read [the terms] today.')).rejected).toBe('Line 2 has no link, so it cannot have [brackets]: links cannot be added in this step. To write a bracket as text, put \\ before it: \\[ or \\].');
    expect(run('<p>Old</p>', set(1, String.raw`Use \[beta\] now`))).toMatchObject(clean('<p>Use [beta] now</p>'));
    expect(run('<p>See [beta] notes</p><p>Two</p>', set(2, 'Two!'))).toMatchObject({ deck: ['T', String.raw`See \[beta\] notes`, 'Two'], ...clean('<p>See [beta] notes</p><p>Two!</p>') });
    expect(run('<p>See [beta] notes</p>', set(1, String.raw`See \[beta\] notes now`))).toMatchObject(clean('<p>See [beta] notes now</p>'));
    expect(run('<p>See <a href="/x">docs</a> [beta]</p>', (d) => set(1, d[1]!.replace('docs', 'the docs'))(d))).toMatchObject({ deck: ['T', String.raw`See [docs] \[beta\]`], ...clean('<p>See <a href="/x">the docs</a> [beta]</p>') });
    expect(run('<p>Next <a href="/n">x</a> [a</p>', set(1, 'Next [y] [a')).rejected).toMatch(/^Line 2 has a "\[" that is never closed/);
  });

  it('backslashes round-trip', () => {
    expect(run('<p>Path <a href="/x">docs</a> here</p>', set(1, String.raw`Path C:\Users [docs] here`))).toMatchObject(clean(String.raw`<p>Path C:\Users <a href="/x">docs</a> here</p>`));
    expect(run(String.raw`<p>Path C:\Users <a href="/x">docs</a> here</p>`, same)).toMatchObject({ deck: ['T', String.raw`Path C:\Users [docs] here`], ...clean(String.raw`<p>Path C:\Users <a href="/x">docs</a> here</p>`) });
    expect(run(String.raw`<p>Path C:\Users <a href="/x">docs</a> here</p>`, (d) => set(1, d[1]!.replace('here', 'there'))(d))).toMatchObject(clean(String.raw`<p>Path C:\Users <a href="/x">docs</a> there</p>`));
    expect(run(String.raw`<p>Dir\<a href="/x">docs</a></p>`, (d) => set(1, d[1]!.replace('docs', 'the docs'))(d))).toMatchObject({ deck: ['T', String.raw`Dir\\[docs]`], ...clean(String.raw`<p>Dir\<a href="/x">the docs</a></p>`) });
  });

  it('entities and whitespace: decoded as browsers do, unchanged bytes kept, typed text written literally', () => {
    expect(run('<p>A &#99999999; B &#xD800; C &#x110000; &eacute; &copy 2026</p><p>Caf&eacute; open</p><footer>&copy; 2026</footer>', set(2, 'Café now open'))).toMatchObject({
      deck: ['T', 'A \uFFFD B \uFFFD C \uFFFD é © 2026', 'Café open', '© 2026'],
      ...clean('<p>A &#99999999; B &#xD800; C &#x110000; &eacute; &copy 2026</p><p>Café now open</p><footer>&copy; 2026</footer>'),
    });
    expect(run('<p>Old</p>', set(1, 'Fish &amp; chips & more <b>'))).toMatchObject(clean('<p>Fish &amp;amp; chips &amp; more &lt;b&gt;</p>'));
    expect(run('<p>Price:&nbsp;$9</p>', (d) => set(1, d[1]!.replace('$9', '$10'))(d))).toMatchObject(clean('<p>Price:\u00a0$10</p>'));
    const kept = run('<p>Caf&eacute; &amp; bar</p><p>Two</p>', set(2, 'Two!'));
    expect(kept).toMatchObject({ deck: ['T', 'Café & bar', 'Two'], ...clean('<p>Caf&eacute; &amp; bar</p><p>Two!</p>') });
  });

  it('what is not offered keeps its bytes: <pre>, svg CDATA, iframe fallback, textarea default text, xmp, plaintext, svg style', () => {
    expect(run('<p>Intro</p><pre>line one\n  line two</pre>', set(1, 'New intro'))).toMatchObject({ deck: ['T', 'Intro'], ...clean('<p>New intro</p><pre>line one\n  line two</pre>') });
    const SVG = '<p>Before</p><svg viewBox="0 0 10 10"><text x="0" y="5"><![CDATA[a > b]]></text></svg><p>After</p>';
    expect(run(SVG, set(2, ''))).toMatchObject({ deck: ['T', 'Before', 'After'], ...clean('<p>Before</p><svg viewBox="0 0 10 10"><text x="0" y="5"><![CDATA[a > b]]></text></svg>') });
    expect(run('<p>A<![CDATA[x>y]]></p>', same)).toMatchObject({ deck: ['T', String.raw`Ay\]\]>`], ...clean('<p>A<![CDATA[x>y]]></p>') });
    expect(run('<p>Map</p><iframe src="/m"><p>Your browser cannot show maps</p></iframe>', same).deck).toEqual(['T', 'Map']);
    expect(run('<p>Note</p><textarea name="n">Write to us: we reply in 1 day</textarea>', same).deck).toEqual(['T', 'Note']);
    expect(run('<p>Intro</p><xmp><b>shown as text</b></xmp>', set(1, 'New intro'))).toMatchObject(clean('<p>New intro</p><xmp><b>shown as text</b></xmp>'));
    expect(run('<p>A</p><plaintext><p>B</p>', set(1, 'A!'))).toMatchObject(clean('<p>A!</p><plaintext><p>B</p>'));
    expect(run('<svg><style>a > b { fill: red }</style><text>Hi</text></svg>', set(1, 'Hello'))).toMatchObject(clean('<svg><style>a > b { fill: red }</style><text>Hello</text></svg>'));
  });

  it('a ">" inside a quoted attribute: the deck and the write are exact', () => {
    expect(run('<p>Price <a title="a > b" href="/x">Link</a> now</p>', set(1, 'Price [Link] today'))).toMatchObject({ deck: ['T', 'Price [Link] now'], ...clean('<p>Price <a title="a > b" href="/x">Link</a> today</p>') });
    expect(run("<p>Next <a aria-label='Next >' href='/n'>page</a></p>", set(1, 'Next [chapter]'))).toMatchObject(clean("<p>Next <a aria-label='Next >' href='/n'>chapter</a></p>"));
    expect(run('<div x-show="n > 0"><p>Shown</p></div>', set(1, 'Shown now'))).toMatchObject(clean('<div x-show="n > 0"><p>Shown now</p></div>'));
    expect(run('<p><button onclick="if (a > b) go()">Send</button> it</p>', set(1, 'Send it now'))).toMatchObject({ deck: ['T', 'Send', 'it'], ...clean('<p><button onclick="if (a > b) go()">Send it now</button> it</p>') });
  });

  it('a "/" at the end of an unquoted address does not self-close the link; "/>" on a link in HTML is ignored, as browsers ignore it (r2)', () => {
    for (const P of ['<p>Go <a href=/shop/>Shop</a> now</p>', '<p>Go <a href="/shop/"/>Shop</a> now</p>']) {
      const p = readPageCopy(pageOf(P));
      expect(deckLines(p), P).toEqual(['T', 'Go [Shop] now']);
      expect(pageVoiceSuffix(p), P).toMatch(/line 2 "Shop" goes to \/shop\/\./);
      expect(pageLockView(pageOf(P.replace('/shop/', '/elsewhere/'))), P).not.toBe(pageLockView(pageOf(P)));
      expect(run(P, set(1, 'Go [Shop] today')), P).toMatchObject(clean(P.replace('now', 'today')));
    }
    // "<span/>" opens a span, as in browsers: a link beside one no longer throws while the page is read.
    expect(deckLines(readPageCopy(pageOf('<p><a href="/a">A</a><span/>B</p>')))).toEqual(['T', '[A]B']);
    expect(run('<nav><a href="/a">A</a><i class="icon"/><a href="/b">B</a></nav>', set(1, '[Alpha][Beta]'))).toMatchObject({ deck: ['T', '[A][B]'], ...clean('<nav><a href="/a">Alpha</a><i class="icon"/><a href="/b">Beta</a></nav>') });
    // In svg, "/>" closes the element: the path holds no text and the svg's text is one line.
    expect(run('<svg viewBox="0 0 1 1"><path d="M0 0"/><text>Hi</text></svg>', set(1, 'Hello'))).toMatchObject({ deck: ['T', 'Hi'], ...clean('<svg viewBox="0 0 1 1"><path d="M0 0"/><text>Hello</text></svg>') });
  });

  it('the title is RCDATA: offered whole, written escaped', () => {
    const t = '<!doctype html><html><head><title>A <b>x</b> &amp; y</title></head><body><p>Body</p></body></html>';
    const p = readPageCopy(t);
    expect(deckLines(p)).toEqual(['A <b>x</b> & y', 'Body']);
    const e = edit(t, 'Fresh & warm\nBody');
    const placed = placePageEdit(t, e);
    expect(/<title>[\s\S]*?<\/title>/.exec(placed.page)?.[0]).toBe('<title>Fresh &amp; warm</title>');
    expect(pageEditProblems(t, placed.page, e, placed)).toEqual([]);
  });
});

describe('removals: conservative, and named when refused (F07)', () => {
  it('a CTA, an aria-label CTA and an all-deleted <li> are removed', () => {
    expect(run('<div class="lede"><p>Promise</p><a class="button" href="#start">Book a visit</a></div>', () => 'T\nPromise\n')).toMatchObject(clean('<div class="lede"><p>Promise</p></div>'));
    expect(run('<p>Intro</p><a href="#o" aria-label="Order now">Order now</a>', set(2, ''))).toMatchObject(clean('<p>Intro</p>'));
    expect(run('<ul><li><span class="num">01</span><h3>Title</h3><p>Body</p></li><li><h3>Keep</h3></li></ul>', () => 'T\n\n\n\nKeep')).toMatchObject(clean('<ul><li><h3>Keep</h3></li></ul>'));
  });

  it('a table cell, an <h2 id>, a <label for>, a <div data-slot> and a <dd> are kept empty', () => {
    expect(run('<table><tr><th>Plan</th><th>Speed</th><th>Price</th></tr><tr><td>Basic</td><td>Slow</td><td>$9</td></tr></table>', set(5, ''))).toMatchObject(clean('<table><tr><th>Plan</th><th>Speed</th><th>Price</th></tr><tr><td>Basic</td><td></td><td>$9</td></tr></table>'));
    expect(run('<nav><a href="#pricing">Pricing</a></nav><h2 id="pricing">Pricing</h2><p>From $9.</p>', set(2, ''))).toMatchObject(clean('<nav><a href="#pricing">Pricing</a></nav><h2 id="pricing"></h2><p>From $9.</p>'));
    expect(run('<form><label for="e">Email</label><input id="e"></form><p>Tail</p>', set(1, ''))).toMatchObject(clean('<form><label for="e"></label><input id="e"></form><p>Tail</p>'));
    expect(run('<div data-slot="feature-1"><p>Fast</p></div><p>Tail</p>', set(1, ''))).toMatchObject(clean('<div data-slot="feature-1"></div><p>Tail</p>'));
    expect(run('<dl><dt>Hours</dt><dd>9 to 5</dd><dt>Phone</dt><dd>555</dd></dl>', set(2, ''))).toMatchObject(clean('<dl><dt>Hours</dt><dd></dd><dt>Phone</dt><dd>555</dd></dl>'));
  });

  it('never joins two runs of text: "Alpha<p>Middle</p>Omega" keeps an empty <p>, also across several removals', () => {
    expect(run('<div>Alpha<p>Middle</p>Omega</div>', set(2, ''))).toMatchObject(clean('<div>Alpha<p></p>Omega</div>'));
    expect(run('<div>Alpha<p>Middle</p></div><p>Tail</p>', set(2, ''))).toMatchObject(clean('<div>Alpha</div><p>Tail</p>'));
    expect(run('<div>Alpha<p>X</p><p>Y</p>Omega</div>', sets({ 2: '', 3: '' }))).toMatchObject(clean('<div>Alpha<p></p>Omega</div>'));
  });

  it('a submit label and an unnamed svg link are refused, by placement and by the verifier; named icon controls are kept', () => {
    expect(run('<form><input name="e"><button type="submit">Send</button></form><p>Tail</p>', set(1, ''))).toMatchObject({
      placeProblems: ['Line 2: this button cannot be removed in this step and would be left empty; keep some words for it, or leave the line as it was.'],
      verifier: ['A button in your changed lines is left without a name.'],
    });
    expect(run('<p>Intro</p><a class="cta" href="#x"><svg viewBox="0 0 1 1"></svg>Book</a>', set(2, ''))).toMatchObject({
      placeProblems: ['Line 3: this link cannot be removed in this step and would be left without a name; keep some words for it, or leave the line as it was.'],
      verifier: ['A link in your changed lines is left without a name.'],
    });
    expect(run('<p>Intro</p><a href="#o" class="cta" aria-labelledby="x"><svg viewBox="0 0 1 1"></svg>Order</a>', set(2, ''))).toMatchObject(clean('<p>Intro</p><a href="#o" class="cta" aria-labelledby="x"><svg viewBox="0 0 1 1"></svg></a>'));
    expect(run('<p>Intro</p><button aria-label="Search"><svg viewBox="0 0 1 1"></svg>Search</button>', set(2, ''))).toMatchObject(clean('<p>Intro</p><button aria-label="Search"><svg viewBox="0 0 1 1"></svg></button>'));
  });

  it('a line beside an image-only or svg-only link can be edited: the link held no words, so the edit takes no name from it (r2)', () => {
    const ok = { placeProblems: [], verifier: [] };
    for (const [page, line, answer] of [
      ['<p><a href="/shop"><img src="a.png" alt="Shop"></a> Shop now</p>', 1, 'Shop later'],
      ['<h1><a href="/"><img src="logo.png" alt="Bakery"></a> Fresh Bakery</h1><p>Body</p>', 1, 'Warm Bakery'],
      ['<p>Follow us <a href="https://x.com/b"><svg width="10" height="10"></svg></a></p>', 1, 'Follow me'],
      ['<p>Follow us <a href="/tw"><svg width="10" height="10"></svg></a> on Twitter</p>', 1, 'Follow me'],
      ['<p><a href="/g"><picture><img src="g.png" alt="Gallery"></picture></a> See the gallery</p>', 1, 'See our gallery'],
      ['<ul><li><a href="/ship"><img src="i.svg" alt=""></a> Free shipping</li></ul>', 1, 'Fast shipping'],
      ['<p><a href="/shop"><img src="a.png" alt="Shop"></a> Shop now</p>', 1, ''],
    ] as const) {
      const r = run(page, set(line, answer));
      expect(r, page).toMatchObject(ok);
      expect(deckLines(readPageCopy(pageOf(r.placed!)))[line] ?? '', page).toBe(answer);
    }
  });

  it('words never cross a link\'s edge: words beside an image or icon link stay outside it, words added to a whole-link line stay inside it (r3)', () => {
    const fresh = (placed: string) => deckLines(readPageCopy(pageOf(placed)));
    for (const [page, answer, written] of [
      // A share icon, then a link: "Please" must not link to the share address.
      ['<p><a href="https://x.com/bakery"><svg width="10" height="10"></svg></a> <a href="/contact">Contact us</a> today</p>', 'Please [Contact us] today', '<p><a href="https://x.com/bakery"><svg width="10" height="10"></svg></a> Please <a href="/contact">Contact us</a> today</p>'],
      // A logo, then a heading link.
      ['<h2><a href="/"><img src="logo.png" alt="Bakery"></a><a href="/menu">Our menu</a> changes daily</h2>', 'See [Our menu] changes daily', '<h2><a href="/"><img src="logo.png" alt="Bakery"></a>See <a href="/menu">Our menu</a> changes daily</h2>'],
      // A decorative image link (empty alt), then a link.
      ['<h2><a href="/e"><img src="e.png" alt=""></a><a href="/t4">bread</a> Order</h2>', 'New [bread] Order', '<h2><a href="/e"><img src="e.png" alt=""></a>New <a href="/t4">bread</a> Order</h2>'],
      // A whole-link line whose words span formatting: every word stays the link's.
      ['<p><a href="/b">caf&eacute;<em> and more</em></a></p>', 'café and more new', '<p><a href="/b">café<em> and more</em> new</a></p>'],
      ['<p>Intro</p><label for="f"> <a href="/b" id="k">caf&eacute;<em>&amp; more</em></a></label>', 'café& more new', '<p>Intro</p><label for="f"> <a href="/b" id="k">café<em>&amp; more</em> new</a></label>'],
    ] as const) {
      const r = run(page, (d) => set(d.length - 1, answer)(d));
      expect(r, page).toMatchObject(clean(written));
      expect(fresh(r.placed!).at(-1), page).toBe(answer);
    }
  });

  it('an image with a non-empty alt names its link: the link\'s words can be deleted and the link kept (r2)', () => {
    expect(run('<p>Intro</p><a href="/cart"><img src="c.png" alt="Cart"> Cart</a>', set(2, ''))).toMatchObject(clean('<p>Intro</p><a href="/cart"><img src="c.png" alt="Cart"> </a>'));
    expect(run('<p>Intro</p><a href="/cart"><img src="c.png" alt=""> Cart</a>', set(2, ''))).toMatchObject({
      placeProblems: ['Line 3: this link cannot be removed in this step and would be left without a name; keep some words for it, or leave the line as it was.'],
      verifier: ['A link in your changed lines is left without a name.'],
    });
  });

  it('a line whose link carries a hook cannot be deleted (named), but can be edited', () => {
    expect(run('<p>Intro</p><p>See <a id="t" href="/t">terms</a> here.</p>', set(2, '')).placeProblems).toEqual(['Line 3: this link cannot be removed in this step (it carries id, which other parts of the page may use) and would be left empty; keep some words for it, or leave the line as it was.']);
    expect(run('<p>Intro</p><p>See <a id="t" href="/t">terms</a> here.</p>', set(2, 'Read [the terms] first.'))).toMatchObject(clean('<p>Intro</p><p>Read <a id="t" href="/t">the terms</a> first.</p>'));
  });

  it('<br> runs go with the lines deleted', () => {
    expect(run('<p>Line one<br>Line two</p>', set(1, ''))).toMatchObject(clean('<p>Line two</p>'));
    expect(run('<p>Line one<br>Line two</p>', set(2, ''))).toMatchObject(clean('<p>Line one</p>'));
    expect(run('<p>A<br>B<br>C</p>', set(2, ''))).toMatchObject(clean('<p>A<br>C</p>'));
    expect(run('<p>A<br>B<br>C</p>', sets({ 2: '', 3: '' }))).toMatchObject(clean('<p>A</p>'));
    expect(run('<p>A<br>B<br>C</p>', sets({ 1: '', 3: '' }))).toMatchObject(clean('<p>B</p>'));
    expect(run('<p>A<br><br>B</p>', set(2, ''))).toMatchObject(clean('<p>A</p>'));
    expect(run('<p>A<br id="x">B</p>', set(1, ''))).toMatchObject(clean('<p><br id="x">B</p>'));
  });

  it('a link across a <br>: each part is a line, verified per line; words beside a continuing part are refused', () => {
    const P = '<p>See <a href="/m">our<br>menu</a> today</p>';
    expect(run(P, same)).toMatchObject({ deck: ['T', 'See [our]', '[menu] today'], ...clean(P) });
    expect(run(P, set(2, '[menu] tonight'))).toMatchObject(clean('<p>See <a href="/m">our<br>menu</a> tonight</p>'));
    expect(run(P, set(2, '[menu today]'))).toMatchObject(clean('<p>See <a href="/m">our<br>menu today</a></p>'));
    expect(run(P, set(1, ''))).toMatchObject(clean('<p><a href="/m">menu</a> today</p>'));
    expect(run(P, set(1, 'See [our] full')).placeProblems).toEqual(['Line 2: words cannot be added on this side of the link here, because the link continues on the next or previous line.']);
  });
});

describe('the verifier refuses a page placement did not make (F07)', () => {
  const H = pageOf('<h1>Head</h1><p>Old middle</p><p>Tail</p>');
  const LK = pageOf('<p>Please <a href="/terms">read terms</a> today.</p>');

  it('deleted text left on the page, copy inserted between tags, a moved link span, doubled spaces, an emptied link', () => {
    expect(verifyBad(H, pageOf('<h1>New head</h1><p>Old middle</p><p>Tail</p>'), 'T\nNew head\n\nTail')).toEqual(['The page changed beyond its text: its markup is not the page before the edit, less the elements the edit emptied.']);
    // A swap the page did not make, and a repeated line written as other words.
    const AB = pageOf('<p>Alpha</p><p>Beta</p>');
    expect(verifyBad(AB, AB, 'T\nBeta\nAlpha')).toEqual(['Line 2 must read exactly "Beta" (it reads "Alpha").', 'Line 3 must read exactly "Alpha" (it reads "Beta").', 'The page, read again, does not have your lines block by block (expected 3 blocks of text, found 3).']);
    expect(verifyBad(AB, pageOf('<p>Same</p><p>Other</p>'), 'T\nSame\nSame')).toEqual(['Line 3 must read exactly "Same" (it reads "Other").', 'The page, read again, does not have your lines block by block (expected 3 blocks of text, found 3).']);
    const S = pageOf('<h1>Head</h1><p>Sub</p>');
    expect(verifyBad(S, pageOf('<h1>New head</h1>Now 50% off, guaranteed!<p>Sub</p>'), 'T\nNew head\nSub')).toEqual(['Text outside your changed lines changed ("").', 'The page, read again, does not have your lines block by block (expected 3 blocks of text, found 4).']);
    expect(verifyBad(LK, pageOf('<p><a href="/terms">Please read the terms</a> today.</p>'), 'T\nPlease [read the terms] today.')).toEqual([
      'Line 2: the link must read exactly "read the terms" (it reads "Please read the terms").',
      'Line 2, read again, does not have its link words where you put them (it reads "[Please read the terms] today.").',
    ]);
    expect(verifyBad(LK, pageOf('<p>Please  <a href="/terms">read the terms</a>  today.</p>'), 'T\nPlease [read the terms] today.')).toEqual(['Line 2 must read exactly "Please read the terms today." (it reads "Please  read the terms  today.").']);
    expect(verifyBad(LK, pageOf('<p>Please <a href="/conditions">read the terms</a> today.</p>'), 'T\nPlease [read the terms] today.')).toEqual(['The page changed beyond its text: its markup is not the page before the edit, less the elements the edit emptied.']);
    expect(verifyBad(LK, pageOf('<p>Please read the terms today.<a href="/terms"></a></p>'), 'T\nPlease [read the terms] today.')).toEqual([
      'Line 2: the link must read exactly "read the terms" (it reads "").',
      'A link in your changed lines is left without a name.',
      'Line 2, read again, does not have its link words where you put them (it reads "Please read the terms today.").',
    ]);
    const D = pageOf('<div>Alpha<p>Middle</p>Omega</div>');
    expect(verifyBad(D, pageOf('<div>AlphaOmega</div>'), 'T\nAlpha\n\nOmega')).toEqual(['The page changed beyond its text: its markup is not the page before the edit, less the elements the edit emptied.']);
    const TB = pageOf('<table><tr><td>Basic</td><td>Slow</td><td>$9</td></tr></table>');
    expect(verifyBad(TB, pageOf('<table><tr><td>Basic</td><td>$9</td></tr></table>'), 'T\nBasic\n\n$9')).toEqual(['The page changed beyond its text: its markup is not the page before the edit, less the elements the edit emptied.']);
  });

  it('words moved across a link\'s edge are refused, read fresh with each link part\'s words and address (r3)', () => {
    const SHARE = pageOf('<p><a href="https://x.com/bakery"><svg width="10" height="10"></svg></a> <a href="/contact">Contact us</a> today</p>');
    expect(verifyBad(SHARE, pageOf('<p><a href="https://x.com/bakery"><svg width="10" height="10"></svg> Please </a><a href="/contact">Contact us</a> today</p>'), 'T\nPlease [Contact us] today')).toContain(
      'Line 2, read again, does not have its link words where you put them (it reads "[Please] [Contact us] today").',
    );
    const LOGO = pageOf('<h2><a href="/"><img src="logo.png" alt="Bakery"></a><a href="/menu">Our menu</a> changes daily</h2>');
    expect(verifyBad(LOGO, pageOf('<h2><a href="/"><img src="logo.png" alt="Bakery">See </a><a href="/menu">Our menu</a> changes daily</h2>'), 'T\nSee [Our menu] changes daily')).toContain(
      'Line 2, read again, does not have its link words where you put them (it reads "[See] [Our menu] changes daily").',
    );
    const WHOLE = pageOf('<p><a href="/b">caf&eacute;<em> and more</em></a></p>');
    expect(verifyBad(WHOLE, pageOf('<p><a href="/b">café<em> and more</em></a> new</p>'), 'T\ncafé and more new')).toEqual(['Line 2, read again, does not have its link words where you put them (it reads "[café and more] new").']);
    // Words moved from one link into its neighbour: the words read the same, the link parts do not.
    const TWO = pageOf('<p>See <a href="/a">menu</a> <a href="/b">hours</a> now</p>');
    expect(verifyBad(TWO, pageOf('<p>See <a href="/a">menu hours</a> <a href="/b"></a> now</p>'), 'T\nSee [menu] [hours] now')).toContain(
      'Line 2, read again, does not have its link words where you put them (it reads "See [menu hours] now").',
    );
  });

  it('checks the witness, never trusts it', () => {
    const b = pageOf('<p>A</p><p>B</p>');
    const e = edit(b, 'T\n\nB');
    const pl = placePageEdit(b, e);
    expect({ placed: body(pl.page), witness: pl.removed.length, verifier: pageEditProblems(b, pl.page, e, pl) }).toEqual({ placed: '<p>B</p>', witness: 1, verifier: [] });
    const p = readPageCopy(b);
    const pB = [...p.els.values()].find((x) => x.name === 'p' && p.tokens[x.start + 1]?.raw === 'B')!;
    expect(pageEditProblems(b, pageOf(''), e, { removed: [...pl.removed, pB.start], brs: [] })).toEqual(['The page changed beyond its text: it removes an element this edit may not remove.']);
    expect(pageEditProblems(b, b.replace('<p>A</p>', '<p></p>'), e, pl)).toEqual(['The page changed beyond its text: its markup is not the page before the edit, less the elements the edit emptied.']);
    expect(pageEditProblems(b, pl.page, e, { removed: [], brs: [] })).toEqual(['The page changed beyond its text: its markup is not the page before the edit, less the elements the edit emptied.']);
    // Invariant 5 in the verifier too: a link left empty and kept is refused.
    expect(pageEditProblems(LK, pageOf('<p>Please <a href="/terms"></a>today.</p>'), edit(LK, 'T\nPlease [] today.'), { removed: [], brs: [] })).toEqual(['A link in your changed lines is left without a name.']);
  });

  it('never throws: a fault inside placement or the verifier is a problem', () => {
    const b = pageOf('<p>Old</p>');
    const broken = { ok: true as const, lines: [] };
    expect(placePageEdit(b, broken).problems).toEqual([expect.stringMatching(/^byway could not place this edit \(/)]);
    expect(pageEditProblems(b, b, broken, { removed: [], brs: [] })).toEqual([expect.stringMatching(/^byway could not check this edit \(/)]);
  });
});

describe('questions in flight across the upgrade (F07)', () => {
  const pg = '<p>Intro</p><p>Please <a href="/terms">read terms</a> today.</p>';
  const oldOffered = 'T\nIntro\nPlease read terms today.';
  const mis = '<p>A</p><nav><a href="#1">One</a><a href="#2">Two</a></nav><pre>code</pre>';
  const old = 'T\nA\nOneTwo\ncode';

  it('an old line now shown with brackets gets the bracket rule, then is applied; an unchanged old line keeps its bytes', () => {
    expect(run(pg, () => 'T\nIntro\nPlease read the terms today.', { offered: oldOffered }).rejected).toMatch(/^Line 3 has 1 link in \[brackets\]/);
    expect(run(pg, () => 'T\nIntro\nPlease [read the terms] today.', { offered: oldOffered })).toMatchObject(clean('<p>Intro</p><p>Please <a href="/terms">read the terms</a> today.</p>'));
    expect(run(pg, () => 'T\nNew intro\nPlease read terms today.', { offered: oldOffered })).toMatchObject(clean('<p>New intro</p><p>Please <a href="/terms">read terms</a> today.</p>'));
    expect(run('<p>Caf&eacute; open</p>', () => 'T\nCafé now open', { offered: 'T\nCaf&eacute; open' })).toMatchObject(clean('<p>Café now open</p>'));
  });

  it('an equal-count shape change: a moved changed line is refused on the first offer and read against the current deck on a re-ask', () => {
    expect(run(mis, () => old, { offered: old })).toMatchObject(clean('<p>A</p><nav><a href="#1">One</a><a href="#2">Two</a></nav><pre>code</pre>'));
    expect(run(mis, () => 'T\nA\nOne Two!\ncode', { offered: old }).rejected).toBe('Line 3 was read again since this question opened; it now reads "One": write your change to that line.');
    expect(run(mis, () => 'T\nA!\nOneTwo\ncode', { offered: old })).toMatchObject(clean('<p>A!</p><nav><a href="#1">One</a><a href="#2">Two</a></nav><pre>code</pre>'));
    expect(run(mis, () => 'T\nA\nOne and Two\nTwo', { offered: old, reask: true })).toMatchObject(clean('<p>A</p><nav><a href="#1">One and Two</a><a href="#2">Two</a></nav><pre>code</pre>'));
  });

  it('an old deck that showed literal brackets unescaped still aligns', () => {
    expect(run('<p>See [beta] notes</p>', set(1, 'See [beta] notes now'), { offered: 'T\nSee [beta] notes' }).rejected).toMatch(/^Line 2 has no link, so it cannot have \[brackets\]/);
    expect(run('<p>See [beta] notes</p><p>Two</p>', set(2, 'Two!'), { offered: 'T\nSee [beta] notes\nTwo' })).toMatchObject(clean('<p>See [beta] notes</p><p>Two!</p>'));
  });

  it('the old 24-line demo answer is refused, naming line 3 as split', () => {
    const html = demoPage();
    const d = deckLines(readPageCopy(html));
    const contact = d.indexOf('Contact');
    const oldDeck = d.slice(0, contact - 1).concat([`${d[contact - 1]}${d[contact]}`], d.slice(contact + 1));
    const r = readPageEdit(readPageCopy(html), oldDeck.map((l, i) => (i === 0 ? `${l} (edited)` : l)).join('\n'), oldDeck.join('\n'));
    expect(r.ok ? 'accepted' : r.problem).toBe('This page has one line per block of text: 25 lines, and your text has 24. Keep one line per block: merge a line you added into the line next to it, or put back a line you removed (an empty line empties its block). The page is now read with line 3 ("How it worksContact") as two lines: "How it works" and "Contact".');
  });

  it('"unchanged" is per line with HTML whitespace collapsed', () => {
    expect(samePageCopy('T\nHead', 'T\n  Head  \n\n')).toBe(true);
    expect(samePageCopy('T\nHead', 'T\nHead!')).toBe(false);
    expect(samePageCopy('T\nA\u00a0B', 'T\nA B')).toBe(false);
  });
});

describe('the C1 demo page (F07)', () => {
  const html = demoPage();

  it('has 25 lines, no marks or escapes; "Contact us" and a new CTA place exactly', () => {
    const d = deckLines(readPageCopy(html));
    expect(d).toHaveLength(25);
    expect(d.filter((l) => /[[\]\\]/.test(l))).toEqual([]);
    const answer = d.map((l, i) => (i === d.indexOf('Contact') ? 'Contact us' : i === d.indexOf('Book a visit') ? 'Order tomorrow’s loaf' : l)).join('\n');
    const e = edit(html, answer);
    const placed = placePageEdit(html, e);
    expect(placed.problems).toEqual([]);
    expect(/<nav>[\s\S]*?<\/nav>/.exec(placed.page)?.[0]).toBe('<nav><a href="#how">How it works</a><a href="#start">Contact us</a></nav>');
    expect([...placed.page.matchAll(/<a class="button"[^>]*>[^<]*<\/a>/g)].map((m) => m[0])).toEqual(['<a class="button" href="#start">Order tomorrow’s loaf</a>', '<a class="button" href="#start">Book a visit</a>']);
    expect(pageEditProblems(html, placed.page, e, placed)).toEqual([]);
  });

  it('names where every link goes in the VOICE prompt', () => {
    expect(pageVoiceSuffix(readPageCopy(html))).toBe(
      'One line per block of text; leave a line empty to remove its text. Links stay where they are; only their words change. Where each one goes: line 2 "Saltbox" goes to #; line 3 "How it works" goes to #how; line 4 "Contact" goes to #start; line 7 "Book a visit" goes to #start; line 24 "Book a visit" goes to #start.',
    );
  });
});

describe('the VOICE prompt for a page, and the page lock (F07)', () => {
  it('a footer names each address; a page with no links gets no legend; a marked line gets the bracket rule', () => {
    const footer = readPageCopy(pageOf('<footer><p><a href="/terms">Terms of service</a> · <a href="/privacy">Privacy policy</a></p></footer>'));
    expect(pageVoiceSuffix(footer)).toBe(
      "One line per block of text; leave a line empty to remove its text. Words in [brackets] are a link's words: keep one pair of brackets per link, in order, and leave a pair empty, [], to remove that link. To write a bracket as text, put \\ before it. Links stay where they are; only their words change. Where each one goes: line 2 \"Terms of service\" goes to /terms; line 2 \"Privacy policy\" goes to /privacy.",
    );
    expect(pageVoiceSuffix(readPageCopy(pageOf('<p>No links here.</p>')))).toBe('One line per block of text; leave a line empty to remove its text.');
    expect(run('<footer><p><a href="/terms">Terms of service</a> · <a href="/privacy">Privacy policy</a></p></footer>', set(1, '[Privacy] · [Terms]'))).toMatchObject(clean('<footer><p><a href="/terms">Privacy</a> · <a href="/privacy">Terms</a></p></footer>'));
  });

  it('the lock holds the deck and every link address, by position; visibility is not checked', () => {
    const voiced = pageOf('<h1>New head</h1><p>Please <a href="/t">read the terms</a> today.</p><nav><a href="#how">How</a></nav>');
    const same2 = (x: string) => pageLockView(voiced) === pageLockView(x);
    expect(same2(voiced.replace('<h1>', '<h1 class="x">'))).toBe(true);
    expect(same2(voiced.replace('href="/t"', 'href="/elsewhere"'))).toBe(false);
    expect(same2(voiced.replace('href="#how"', 'href="#buy"'))).toBe(false);
    expect(same2(voiced.replace('today.', 'today. Now 50% off!'))).toBe(false);
    expect(same2(voiced.replace('Please <a href="/t">read the terms</a>', '<a href="/t">Please read the terms</a>'))).toBe(false);
    expect(same2(voiced.replace('<p>', '<p hidden>'))).toBe(true);
  });
});

/**
 * A guard against a search or a quadratic pass over the page, not a benchmark: these pages take a few hundred
 * milliseconds alone, and a full parallel suite on a loaded machine has taken 2.6 s, so the bound leaves room for load.
 */
const BOUND_MS = 5000;

describe('size: reading, placing and verifying are linear in the page (F07)', () => {
  it('a 4,000-item list (24,010 tags) opens, places and verifies well inside five seconds; a bad markup is still found', () => {
    const items = Array.from({ length: 4000 }, (_, i) => `<li><span class="n">${i}</span> Item ${i} <a href="/i/${i}">go</a></li>`).join('');
    const before = pageOf(`<ul>${items}</ul>`);
    const t0 = performance.now();
    const p = readPageCopy(before);
    const d = deckLines(p);
    const e = readPageEdit(p, d.map((l, i) => (i === 5 || i === Math.floor(d.length * 0.6) ? '' : i === 7 ? `${l} (new)` : l)).join('\n'));
    if (!e.ok) throw new Error(e.problem);
    const placed = placePageEdit(before, e);
    const v = pageEditProblems(before, placed.page, e, placed);
    expect(performance.now() - t0).toBeLessThan(BOUND_MS);
    expect(p.tokens.filter((t) => t.kind === 'tag')).toHaveLength(24010);
    expect([placed.problems, v]).toEqual([[], []]);
    expect(pageEditProblems(before, placed.page.replace('<li>', '<li class="x">'), e, placed)).toHaveLength(1);
  });

  it('one block of 12,000 words with emphasis: a word changed near each end is placed with every <em> kept, within the bound (r2)', () => {
    const words = Array.from({ length: 12000 }, (_, i) => `w${i}`);
    const before = pageOf(`<p>${words.map((w, i) => (i % 50 === 0 ? `<em>${w}</em>` : w)).join(' ')}</p>`);
    const t0 = performance.now();
    const r = run(before, set(1, words.map((w) => (w === 'w10' ? 'changed' : w === 'w11995' ? 'tail' : w)).join(' ')), { full: true });
    expect(performance.now() - t0).toBeLessThan(BOUND_MS);
    expect(r).toMatchObject(clean(before.replace(' w10 ', ' changed ').replace(' w11995 ', ' tail ')));
    // Rewritten throughout (past the edit script's cap): still placed exactly, in bounded time; formatting is not kept.
    const t1 = performance.now();
    const heavy = run(before, set(1, words.map((w, i) => (i % 3 ? w : `x${i}`)).join(' ')), { full: true });
    expect(performance.now() - t1).toBeLessThan(BOUND_MS);
    expect(heavy).toMatchObject({ placeProblems: [], verifier: [] });
  });

  it('the edit script matches as many words as the table, in order, on 2,000 random pairs of word lists', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const list = () => Array.from({ length: Math.floor(rnd() * 30) }, () => 'abcde'[Math.floor(rnd() * 5)]!);
    for (let i = 0; i < 2000; i++) {
      const a = list();
      const b = list();
      const pairs = editPairs(a, b, Infinity)!;
      expect(pairs.length, JSON.stringify([a, b])).toBe(tablePairs(a, b).length);
      expect(pairs.every(([x, y], k) => a[x] === b[y] && (k === 0 || (x > pairs[k - 1]![0] && y > pairs[k - 1]![1])))).toBe(true);
    }
    expect(editPairs(['a', 'b', 'c'], ['x', 'y', 'z'], 2)).toBeUndefined();
  });

  it('a 20,000-path svg page and 1,000 identical items, every other one deleted', () => {
    const paths = Array.from({ length: 20000 }, (_, i) => `<path d="M${i} 0 L${i + 1} 1" stroke="#${(i % 4096).toString(16).padStart(3, '0')}"/>`).join('');
    const svgPage = pageOf(`<h1>Fresh bread</h1><svg viewBox="0 0 20000 1" aria-hidden="true">${paths}</svg><p>Order by nine</p><p>Old line</p>`);
    let t0 = performance.now();
    const e = edit(svgPage, 'T\nFresh loaves\nOrder by nine\n');
    const placed = placePageEdit(svgPage, e);
    expect(pageEditProblems(svgPage, placed.page, e, placed)).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(BOUND_MS);
    expect(body(placed.page).slice(-60)).toBe('M19999 0 L20000 1" stroke="#e1f"/></svg><p>Order by nine</p>');
    const same3 = pageOf(`<ul>${Array.from({ length: 1000 }, () => '<li>Same</li>').join('')}</ul>`);
    const p = readPageCopy(same3);
    t0 = performance.now();
    const e2 = edit(same3, ['T', ...p.units.slice(1).map((_, i) => (i % 2 ? '' : 'Same'))].join('\n'));
    const placed2 = placePageEdit(same3, e2);
    expect(pageEditProblems(same3, placed2.page, e2, placed2)).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(BOUND_MS);
    expect(placed2.page.match(/<li>/g)).toHaveLength(500);
  });
});
