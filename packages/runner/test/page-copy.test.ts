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
/** Each link part's address, by position, as the page lock holds them. */
const linkHrefs = (html: string): string[] => (JSON.parse(pageLockView(html)) as { links: string[] }).links;

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

  it('text glued to a link at a line\'s edge is written glued: the link\'s edge space would show between them, so it goes (r4)', () => {
    const fresh = (placed: string) => deckLines(readPageCopy(pageOf(placed)));
    for (const [page, answer, written] of [
      // Pretty-printed: the link holds the line's edge whitespace inside it.
      ['<p>Visit\n  <a href="/shop">\n    our shop\n  </a>\n</p>', 'Visit [our shop].', '<p>Visit <a href="/shop">our shop</a>.\n</p>'],
      ['<p>Questions?\n  <a href="/contact">\n    Contact us\n  </a>\n</p>', 'Questions? [Contact us]!', '<p>Questions? <a href="/contact">Contact us</a>!\n</p>'],
      ['<p>Read <a href="/x">more </a></p>', 'Read [more].', '<p>Read <a href="/x">more</a>.</p>'],
      // The leading side.
      ['<p>\n  <a href="/x">\n    Read more\n  </a>\n  today\n</p>', '"[Read more]" today', '<p>\n  "<a href="/x">Read more</a>" today\n</p>'],
      ['<p><a href="/x"> Read</a> more</p>', '([Read]) more', '<p>(<a href="/x">Read</a>) more</p>'],
      // An arrow at the end of the link: the deck shows no space between the link and "!", so none is written there,
      // and the gap before the arrow goes with it (the deck cannot show the arrow).
      ['<p>Ready? <a href="/order">Order now <i class="arrow"></i></a></p>', 'Ready? [Order now]!', '<p>Ready? <a href="/order">Order now<i class="arrow"></i></a>!</p>'],
      // With a space typed after the link, the gap before the arrow stays (r3).
      ['<p>Ready? <a href="/order">Order now <i class="arrow"></i></a></p>', 'Ready? [Order now] today', '<p>Ready? <a href="/order">Order now <i class="arrow"></i></a> today</p>'],
    ] as const) {
      const r = run(page, set(1, answer));
      expect(r, page).toMatchObject(clean(written));
      expect(fresh(r.placed!)[1], page).toBe(answer);
    }
  });

  it('the verifier reads a line with its edge space: a space shown where the person wrote none is refused, and edge space dropped where none would show (r4)', () => {
    // Round 3's write: the link's edge space left between its words and the "." the person glued to it.
    const SHOP = pageOf('<p>Visit\n  <a href="/shop">\n    our shop\n  </a>\n</p>');
    expect(verifyBad(SHOP, pageOf('<p>Visit <a href="/shop">our shop\n  </a>.\n</p>'), 'T\nVisit [our shop].')).toEqual([
      'Line 2 must read exactly "Visit our shop." (it reads "Visit our shop .").',
      'The page, read again, shows a space a browser did not: it shows "Visit our shop .".',
    ]);
    const READ = pageOf('<p><a href="/x"> Read</a> more</p>');
    expect(verifyBad(READ, pageOf('<p>(<a href="/x"> Read</a>) more</p>'), 'T\n([Read]) more')).toEqual([
      'Line 2 must read exactly "(Read) more" (it reads "( Read) more").',
      'The page, read again, shows a space a browser did not: it shows "( Read) more".',
    ]);
    // Edge space dropped where it would have shown nothing: the gap before the arrow, with a space typed after the link.
    const ARROW = pageOf('<p>Order online: <a href="/order">Order now <i class="arrow"></i></a></p>');
    expect(verifyBad(ARROW, pageOf('<p>Order online: <a href="/order">Order now<i class="arrow"></i></a> today</p>'), 'T\nOrder online: [Order now] today')).toEqual(['Line 2: the space before or after its words moved.']);
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

  it('a head the page does not close ends where the body starts, as in browsers: the body is offered (r5)', () => {
    const t = '<!doctype html><html><head><title>T</title><body><p>Hi</p></body></html>';
    expect(deckLines(readPageCopy(t))).toEqual(['T', 'Hi']);
    expect(run(t, set(1, 'Hello'), { full: true })).toMatchObject(clean(t.replace('Hi', 'Hello')));
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

describe('an <a> left open, or holding another: read as browsers read it, or refused where byway cannot tell (F07, r4)', () => {
  const OPEN = '<p>Hello <a href="/x">world</p><p>Next block</p>';

  it('an unclosed <a> (and "<a href=x/>") carries its link into the following blocks, as browsers carry it', () => {
    const p = readPageCopy(pageOf(OPEN));
    expect(deckLines(p)).toEqual(['T', 'Hello [world]', 'Next block']);
    expect(pageVoiceSuffix(p)).toMatch(/Where each one goes: line 2 "world" goes to \/x; line 3 "Next block" goes to \/x\.$/);
    expect(pageLockView(pageOf(OPEN))).toBe(JSON.stringify({ deck: ['T', 'Hello [world]', 'Next block'], links: ['/x', '/x'] }));
    expect(run(OPEN, set(2, 'Next blocks'))).toMatchObject(clean('<p>Hello <a href="/x">world</p><p>Next blocks</p>'));
    expect(run(OPEN, set(1, 'Hello [big world]'))).toMatchObject(clean('<p>Hello <a href="/x">big world</p><p>Next block</p>'));
    expect(run(OPEN, set(1, 'Hello world')).rejected).toMatch(/^Line 2 has 1 link in \[brackets\] and your line has 0/);
    expect(deckLines(readPageCopy(pageOf('<p>Go <a href="/x"/> now</p><p>More</p>')))).toEqual(['T', 'Go [now]', 'More']);
    // It ends at the next </a> or <a ...> tag, as browsers end it.
    expect(deckLines(readPageCopy(pageOf('<p>A <a href="/x">b</p><p>c</a> d</p><p>e</p>')))).toEqual(['T', 'A [b]', '[c] d', 'e']);
    expect(deckLines(readPageCopy(pageOf('<p>A <a href="/x">b</p><p>c <a href="/y">d</a> e</p>')))).toEqual(['T', 'A [b]', '[c] [d] e']);
    // A misnested </b> pops the link, and browsers open it again for the words after.
    expect(deckLines(readPageCopy(pageOf('<p><b>bold <a href="/x">link</b> more</a> after</p>')))).toEqual(['T', 'bold [link more] after']);
    expect(deckLines(readPageCopy(pageOf('<div><a href="/x">Hi<div>there</div></div><p>after</p>')))).toEqual(['T', 'Hi', 'there', 'after']);
    expect(linkHrefs(pageOf('<div><a href="/x">Hi<div>there</div></div><p>after</p>'))).toEqual(['/x', '/x', '/x']);
  });

  it('an <a> inside another: browsers end the first where the second starts', () => {
    const N = '<p>See <a href="/1">one <a href="/2">two</a> three</a> end</p>';
    expect(deckLines(readPageCopy(pageOf(N)))).toEqual(['T', 'See [one] [two] three end']);
    expect(run(N, set(1, 'See [one] [2] three end'))).toMatchObject(clean('<p>See <a href="/1">one <a href="/2">2</a> three</a> end</p>'));
    expect(deckLines(readPageCopy(pageOf('<a href="/1">x<p>y<a href="/2">z</a></p>w</a>')))).toEqual(['T', 'x', '[y][z]', 'w']);
    // Two links with no place between them outside both: a space can go between them, words cannot.
    const T2 = '<p><a href="/1">One<a href="/2">Two</a></p>';
    expect(deckLines(readPageCopy(pageOf(T2)))).toEqual(['T', '[One][Two]']);
    expect(run(T2, set(1, '[One] [Two]'))).toMatchObject(clean('<p><a href="/1">One <a href="/2">Two</a></p>'));
    expect(run(T2, set(1, '[One] and [Two]')).placeProblems).toEqual(['Line 2: words cannot be added between these two links here: the page leaves the first one open, so a browser starts the second right where the first ends.']);
    // The same with a wordless link left open between them: its empty reach is no place outside the links either.
    const T3 = '<p><a href="/1">One<a href="/2"><a href="/3">Two</a></p>';
    expect(deckLines(readPageCopy(pageOf(T3)))).toEqual(['T', '[One][Two]']);
    expect(run(T3, set(1, '[One] [Two]'))).toMatchObject(clean('<p><a href="/1">One <a href="/2"><a href="/3">Two</a></p>'));
    expect(run(T3, set(1, '[One] and [Two]')).placeProblems).toEqual(['Line 2: words cannot be added between these two links here: the page leaves the first one open, so a browser starts the second right where the first ends.']);
  });

  it('a link left open is never removed, nor anything holding one end of its reach and not the other', () => {
    expect(run(OPEN, sets({ 1: 'Hello []', 2: '' })).placeProblems).toEqual(['Line 2: this link cannot be removed in this step and would be left empty; keep some words for it, or leave the line as it was.']);
    // The block holding the link's start tag stays (empty): removing it would take the link off the next block's words.
    expect(run('<p>Intro</p><p><a href="/x">Lead</p><p>Carried</p>', set(2, ''))).toMatchObject(clean('<p>Intro</p><p><a href="/x"></p><p>Carried</p>'));
    // The link whose start tag ends the reach stays: removing it would carry the first link on to "d".
    expect(run('<p>A <a href="/x">b</p><p><a href="/y">c</a></p><p>d</p>', set(2, '')).placeProblems).toEqual(['Line 3: this link cannot be removed in this step and would be left empty; keep some words for it, or leave the line as it was.']);
    // A block holding the whole reach can go.
    expect(run('<p>Intro</p><p><a href="/1">x <a href="/2">y</a></p><p>End</p>', set(2, ''))).toMatchObject(clean('<p>Intro</p><p>End</p>'));
    // Inside a wrapper that is never removed, the two links are named once.
    expect(run('<p>Intro</p><div><a href="/1">x <a href="/2">y</a></div><p>End</p>', set(2, '')).placeProblems).toEqual(['Line 3: this link cannot be removed in this step and would be left empty; keep some words for it, or leave the line as it was.']);
    // An <a> written around another, with its own closing tag: emptied, it goes whole, from its start tag to that
    // closing tag (the inner link with it), as round 3 removed it.
    expect(run('<p>Intro</p><p><a href="/1"><a href="/2">café six</a></a> <em>R&amp;D</em> <svg width="8" height="8"></svg></p>', set(2, ''))).toMatchObject(clean('<p>Intro</p><p> <svg width="8" height="8"></svg></p>'));
    const AROUND = '<p>Intro</p><div>bread <a href="/8"><a href="/7">us now</a> bread</a> Fresh</div>';
    expect(run(AROUND, same).deck).toEqual(['T', 'Intro', 'bread [us now] bread Fresh']);
    expect(run(AROUND, set(2, 'bread [] Fresh'))).toMatchObject(clean('<p>Intro</p><div>bread Fresh</div>'));
    // The verifier holds the same rule.
    const lead = pageOf('<p>Intro</p><p><a href="/x">Lead</p><p>Carried</p>');
    const lp = readPageCopy(lead);
    const leadP = [...lp.els.values()].find((x) => x.name === 'p' && lp.tokens[x.start + 1]?.raw === '<a href="/x">')!;
    expect(pageEditProblems(lead, pageOf('<p>Intro</p><p>Carried</p>'), edit(lead, 'T\nIntro\n\nCarried'), { removed: [leadP.start], brs: [] })).toEqual(['The page changed beyond its text: it removes an element this edit may not remove.']);
  });

  it('where a table, a list box or an svg makes it unclear, the lines from that link on are refused, named, and the prompt says so', () => {
    const TP = '<p>Intro</p><p>Hello <a href="/x">world</p><table><tr><td>Cell</td></tr></table><p>After</p>';
    const p = readPageCopy(pageOf(TP));
    expect(deckLines(p)).toEqual(['T', 'Intro', 'Hello world', 'Cell', 'After']);
    const why = "a link on the page (to /x) is left open or holds another link, around a table, a list box, an svg or other markup where byway cannot tell which words a browser shows as that link's words";
    expect(pageVoiceSuffix(p)).toBe(`One line per block of text; leave a line empty to remove its text. Lines 3 to 5 cannot be changed in this step: ${why}; leave them as they are.`);
    expect(run(TP, set(3, 'Cells')).rejected).toBe(`Line 4 cannot be changed in this step: ${why}, so byway cannot write this line exactly. Leave line 4 as it was offered.`);
    expect(run(TP, set(2, '')).rejected).toBe(`Line 3 cannot be changed in this step: ${why}, so byway cannot write this line exactly. Leave line 3 as it was offered.`);
    expect(run(TP, set(1, 'Intro!'))).toMatchObject(clean(TP.replace('Intro', 'Intro!')));
    expect(run(TP, same)).toMatchObject(clean(TP));
    // A list box: a </a> inside it is ignored by browsers, so the link may go on after it.
    expect(pageVoiceSuffix(readPageCopy(pageOf('<p>Hi <a href="/x">there</p><select><option>Opt</option></select><p>after</p>')))).toMatch(/Lines 2 to 4 cannot be changed in this step/);
    // The verifier refuses such a line too, whatever reads the answer.
    const before = pageOf(TP);
    const e: PageEdit = { ok: true, lines: p.units.map((_, i) => (i === 3 ? { changed: true as const, text: 'Cells', segs: [{ kind: 'out' as const, text: 'Cells' }] } : { changed: false as const })) };
    expect(pageEditProblems(before, before.replace('Cell<', 'Cells<'), e, { removed: [], brs: [] })).toEqual(['Line 4 cannot be changed in this step: a link on the page is left open or holds another link there.']);
  });
});

describe('no removal runs two of the person\'s lines together in a browser (F07, r5)', () => {
  const fresh = (placed: string) => deckLines(readPageCopy(pageOf(placed)));
  const answer = (lines: readonly string[]) => () => ['T', ...lines].join('\n');

  it('a block inside an element browsers show inline (font, ins, label) is kept, empty, where removing it would join text', () => {
    for (const [page, lines, written] of [
      ['<div><font face="Arial">Intro<p>Spring sale</p></font>Order today</div>', ['Intro', '', 'Order today'], '<div><font face="Arial">Intro<p></p></font>Order today</div>'],
      ['<div><font face="Arial">Intro <p>Spring sale</p></font> Order today</div>', ['Intro', '', 'Order today'], '<div><font face="Arial">Intro <p></p></font> Order today</div>'],
      ['<div>Call us<ins><p>New offer</p></ins>today</div>', ['Call us', '', 'today'], '<div>Call us<ins><p></p></ins>today</div>'],
      ['<div>Name<label><p>(required)</p></label>here</div>', ['Name', '', 'here'], '<div>Name<label><p></p></label>here</div>'],
      ['<ul><li><font>Item one</font></li></ul><font>Lead<li>Gone</li></font>Tail', ['Item one', 'Lead', '', 'Tail'], '<ul><li><font>Item one</font></li></ul><font>Lead<li></li></font>Tail'],
      // A block after another block: the text after it is on its own line anyway, so it goes.
      ['<section><p>Price</p><del><p>$20</p></del>Now $15</section>', ['Price', '', 'Now $15'], '<section><p>Price</p><del></del>Now $15</section>'],
      // A <br> inside an emptied span: removing the span would join the lines on either side.
      ['<p>Hello <span>one<br>two</span> world</p>', ['Hello', 'world'], '<p>Hello<span><br></span>world</p>'],
    ] as const) {
      const r = run(page, answer(lines));
      expect(r, page).toMatchObject(clean(written));
      expect(fresh(r.placed!), page).toEqual(['T', ...lines.filter((l) => l)]);
    }
  });

  it('an element browsers end elsewhere (misnested) is never removed, so no end tag is left for browsers to ignore', () => {
    for (const [page, lines, written] of [
      ['<section><span>one<div>two</span>three</div>after</section>', ['', 'three', 'after'], '<section><span><div></span>three</div>after</section>'],
      ['<div><b>one<li>two</b>three</li>after</div>', ['', 'three', 'after'], '<div><b><li></b>three</li>after</div>'],
      ['<div><span>one<h2>two</span>three</h2>after</div>', ['', 'three', 'after'], '<div><span><h2></span>three</h2>after</div>'],
    ] as const) {
      const r = run(page, answer(lines));
      expect(r, page).toMatchObject(clean(written));
      expect(fresh(r.placed!), page).toEqual(['T', 'three', 'after']);
    }
    // A heading whose start tag ends the heading around it: without it, the outer heading would run on to the text
    // after it, and the end tag browsers now ignore would end the line there.
    const h2 = run('<div><h2><h2>Sub</h2>after</h2>more</div>', set(1, ''));
    expect(h2).toMatchObject(clean('<div><h2><h2></h2>after</h2>more</div>'));
    expect(fresh(h2.placed!)).toEqual(['T', 'after', 'more']);
    // A cell outside a table: browsers ignore its tags, so the text after its end tag stays in the block.
    const td = run('<div><td><div>Call us<li>R&amp;D</li></td>at six</div></div>', answer(['Call us', '', 'at six']));
    expect(td).toMatchObject(clean('<div><td><div>Call us<li></li></td>at six</div></div>'));
    expect(fresh(td.placed!)).toEqual(['T', 'Call us', 'at six']);
    // A link around a block, misnested: it is not removed, so emptying it is refused, never written glued.
    expect(run('<section><a href="/x">one<div>two</a>three</div>after</section>', answer(['', '[]three', 'after'])).placeProblems).toEqual([
      'Line 2: this link cannot be removed in this step and would be left empty; keep some words for it, or leave the line as it was.',
    ]);
  });

  it('the verifier reads the written page\'s blocks as browsers show them: lines run together are refused, whatever wrote them', () => {
    const F = pageOf('<div><font face="Arial">Intro<p>Spring sale</p></font>Order today</div>');
    const fp = readPageCopy(F);
    const pEl = [...fp.els.values()].find((x) => x.name === 'p')!;
    expect(pageEditProblems(F, pageOf('<div><font face="Arial">Intro</font>Order today</div>'), edit(F, 'T\nIntro\n\nOrder today'), { removed: [pEl.start], brs: [] })).toEqual([
      'The page, read again, runs lines together that a browser showed apart: it shows "IntroOrder today" as one line.',
    ]);
    const L = pageOf('<div>Name<label><p>(required)</p></label>here</div>');
    const lp = readPageCopy(L);
    const lpEl = [...lp.els.values()].find((x) => x.name === 'p')!;
    expect(pageEditProblems(L, pageOf('<div>Name<label></label>here</div>'), edit(L, 'T\nName\n\nhere'), { removed: [lpEl.start], brs: [] })).toEqual([
      'The page, read again, runs lines together that a browser showed apart: it shows "Namehere" as one line.',
    ]);
    // A misnested span is not a removal the shared rule allows: its end tag holds the start of a block browsers end later.
    const M = pageOf('<section><span>one<div>two</span>three</div>after</section>');
    const mp = readPageCopy(M);
    const span = [...mp.els.values()].find((x) => x.name === 'span')!;
    expect(pageEditProblems(M, pageOf('<section>three</div>after</section>'), edit(M, 'T\n\nthree\nafter'), { removed: [span.start], brs: [] })).toEqual([
      'The page changed beyond its text: it removes an element this edit may not remove.',
    ]);
  });
});

describe('links: where browsers end them, and what is not a link (F07, r5)', () => {
  const why = (to: string) => `a link on the page (to ${to}) is left open or holds another link, around a table, a list box, an svg or other markup where byway cannot tell which words a browser shows as that link's words`;

  it('an </a> browsers ignore (in a cell, caption, object, marquee or list box the link holds) does not end it: those lines are refused, named', () => {
    for (const [page, lines] of [
      ['<div><a href="/x">Shop<table><tr><td>Cell</a> more</td></tr></table>After table</div>', 4],
      ['<p>Hi <a href="/x">one<table><tr><td>two</a>three</td></tr></table>four</p><p>five</p>', 5],
      ['<p>Hi <a href="/x">one<object>two</a>three</object>four</a> five</p>', 4],
      ['<p>Hi <a href="/x">one<select><option>o</a>p</select>q</a> r</p>', 4],
      ['<p>Hi <a href="/x">one<marquee>two</a>three</marquee>four</a> five</p>', 4],
      ['<a href="/x">one<table><caption>two</a>three</caption></table>four</a> five', 4],
    ] as const) {
      const p = readPageCopy(pageOf(page));
      expect(pageVoiceSuffix(p), page).toContain(`Lines 2 to ${lines} cannot be changed in this step: ${why('/x')}; leave them as they are.`);
      expect(pageVoiceSuffix(p), page).not.toContain('goes to /x');
      const d = deckLines(p);
      expect(run(page, set(lines - 1, `${d[lines - 1]} now`)).rejected, page).toMatch(new RegExp(`^Line ${lines} cannot be changed in this step`));
    }
  });

  it('an </a> under more than seven nested blocks does not end the link in browsers: its lines are refused; under fewer, it is read as browsers read it', () => {
    const deep = (k: number) => `<p>Hi <a href="/x">one${Array.from({ length: k }, (_, i) => `<div>${i + 1}`).join('')}</a> after${'</div>'.repeat(k)}</p><p>next</p>`;
    expect(pageVoiceSuffix(readPageCopy(pageOf(deep(10))))).toContain(`Lines 2 to 13 cannot be changed in this step: ${why('/x')}`);
    // As Chromium reads it: the link ends at its </a>, so "after" and "next" are plain.
    const four = readPageCopy(pageOf(deep(4)));
    expect(deckLines(four)).toEqual(['T', 'Hi [one]', '1', '2', '3', '[4] after', 'next']);
    expect(four.units.some((u) => u.tangled)).toBe(false);
  });

  it('a link holding a whole table (an email button) is read as browsers read it', () => {
    const E = '<a href="/x"><table><tr><td>Click</td></tr></table></a><p>after</p>';
    const p = readPageCopy(pageOf(E));
    expect(deckLines(p)).toEqual(['T', 'Click', 'after']);
    expect(pageVoiceSuffix(p)).toMatch(/Where each one goes: line 2 "Click" goes to \/x\.$/);
    expect(run(E, set(1, 'Click here'))).toMatchObject(clean('<a href="/x"><table><tr><td>Click here</td></tr></table></a><p>after</p>'));
  });

  it('an <a> without an address is a placeholder, not a link: its words read plain, also when the page leaves it open', () => {
    const N = '<h2><a name="top"/>Welcome</h2><p>Our <a href="/menu">menu</a> changes daily.</p>';
    const p = readPageCopy(pageOf(N));
    expect(deckLines(p)).toEqual(['T', 'Welcome', 'Our [menu] changes daily.']);
    expect(pageVoiceSuffix(p)).toMatch(/Where each one goes: line 3 "menu" goes to \/menu\.$/);
    expect(run(N, set(2, 'Our [menus] change daily!'))).toMatchObject(clean('<h2><a name="top"/>Welcome</h2><p>Our <a href="/menu">menus</a> change daily!</p>'));
    expect(run(N, set(1, 'Welcome!'))).toMatchObject(clean('<h2><a name="top"/>Welcome!</h2><p>Our <a href="/menu">menu</a> changes daily.</p>'));
    const C = readPageCopy(pageOf('<p>Go to <a name="x">here</a> now</p>'));
    expect(deckLines(C)).toEqual(['T', 'Go to here now']);
    expect(pageVoiceSuffix(C)).toBe('One line per block of text; leave a line empty to remove its text.');
    expect(linkHrefs(pageOf('<p>Go to <a name="x">here</a> now</p>'))).toEqual([]);
  });

  it('words after a link the page leaves open, at the end of a line, are refused with that reason', () => {
    const msg = 'Line 2: words cannot be added after the link "there" on this line: the page leaves that link open, so a browser makes the words after it, up to the next link, part of it.';
    expect(run('<p>Hi <a href="/x">there</p><p>Next</p>', set(1, 'Hi [there] friend')).placeProblems).toEqual([msg]);
    expect(run('<p>Hi <a href="/x">there</p><p>Next</p>', set(1, 'Hi [there].')).placeProblems).toEqual([msg]);
    expect(run('<p>Hi <a href="/x">there</p>', set(1, 'Hi [there]!')).placeProblems).toEqual([msg]);
  });
});

describe('edge space held by an element the edit empties and removes (F07, r5)', () => {
  it('is written where the element was, so the gap beside an icon or a button stays', () => {
    expect(run('<p>Hello <span>world </span><i class="arrow"></i></p>', set(1, 'Hello'))).toMatchObject(clean('<p>Hello <i class="arrow"></i></p>'));
    expect(run('<p>Call us <em>today </em><button type="button" aria-label="Call"><svg width="9" height="9"></svg></button></p>', set(1, 'Call us'))).toMatchObject(
      clean('<p>Call us <button type="button" aria-label="Call"><svg width="9" height="9"></svg></button></p>'),
    );
    expect(run('<p><i class="icon"></i><span> old</span> world</p>', set(1, 'world'))).toMatchObject(clean('<p><i class="icon"></i> world</p>'));
    // A space between two words that sat inside the removed element: written, so the words stay apart.
    expect(run('<p>Big<b> red </b>apple</p>', set(1, 'Big apple'))).toMatchObject(clean('<p>Big apple</p>'));
  });
});

describe('an svg or math <title> keeps the block reading for the rest of the page (F07, r6)', () => {
  const fresh = (placed: string) => deckLines(readPageCopy(pageOf(placed)));
  // A self-closed svg <title/> opens nothing, an unclosed one ends with its svg, and math's likewise.
  const icons = [
    ['<p><svg width="9" height="9"><title/></svg></p>', []],
    ['<p>X<svg width="9" height="9"><title>Tip</svg></p>', ['X', 'Tip']],
    ['<p>x<math><title/></math></p>', ['x']],
    ['<p>Call <svg viewBox="0 0 9 9"><title/><path d="M0 0h9v9H0z"/></svg> us</p>', ['Call', 'us']],
  ] as const;
  const glue = [
    ['<div><font face="Arial">Intro<p>Spring sale</p></font>Order today</div>', ['Intro', '', 'Order today'], '<div><font face="Arial">Intro<p></p></font>Order today</div>'],
    ['<div>Call us<ins><p>New offer</p></ins>today</div>', ['Call us', '', 'today'], '<div>Call us<ins><p></p></ins>today</div>'],
    ['<div>Name<label><p>(required)</p></label>here</div>', ['Name', '', 'here'], '<div>Name<label><p></p></label>here</div>'],
  ] as const;

  it('a block inside an inline element after it is still kept where removing it would run two lines together', () => {
    for (const [icon, iconLines] of icons) {
      for (const [page, lines, written] of glue) {
        const r = run(`${icon}${page}`, () => ['T', ...iconLines, ...lines].join('\n'));
        expect(r, icon + page).toMatchObject(clean(`${icon}${written}`));
        expect(fresh(r.placed!), icon + page).toEqual(['T', ...iconLines, ...lines.filter((l) => l)]);
      }
    }
  });

  it('the verifier reads the blocks after such a title as browsers show them', () => {
    for (const [icon, iconLines] of icons) {
      const F = pageOf(`${icon}<div><font face="Arial">Intro<p>Spring sale</p></font>Order today</div>`);
      const pEl = [...readPageCopy(F).els.values()].filter((x) => x.name === 'p').at(-1)!;
      const glued = F.replace('<p>Spring sale</p>', '');
      expect(pageEditProblems(F, glued, edit(F, ['T', ...iconLines, 'Intro', '', 'Order today'].join('\n')), { removed: [pEl.start], brs: [] }), icon).toEqual([
        'The page, read again, runs lines together that a browser showed apart: it shows "IntroOrder today" as one line.',
      ]);
    }
  });

  it('only the html <title> is the page title: the slots after a foreign one are shown by browsers', () => {
    for (const [icon] of icons) {
      const p = readPageCopy(pageOf(`${icon}<p>After</p>`));
      const after = p.slots.find((s) => s.toks.some((t) => p.tokens[t]!.raw === 'After'))!;
      expect(after.rendered, icon).toBe(true);
    }
    // Inside an open svg <title>, the text is not shown (a tooltip), and the html <title> is not either.
    const p = readPageCopy(pageOf('<p><svg width="9" height="9"><title>Logo</title></svg></p>'));
    for (const word of ['Logo', 'T']) expect(p.slots.find((s) => s.toks.some((t) => p.tokens[t]!.raw === word))!.rendered, word).toBe(false);
  });
});

describe('two lines a browser shows on one screen line stay apart, or together, as they were (F07, r6)', () => {
  const fresh = (placed: string) => deckLines(readPageCopy(pageOf(placed)));
  const answer = (lines: readonly string[]) => () => ['T', ...lines].join('\n');

  it('a deleted line whose edge space sat in an element the edit removes leaves that space where the element was', () => {
    for (const [page, lines, written] of [
      ['<p><label>First</label><b> and </b><label>second</label></p>', ['First', '', 'second'], '<p><label>First</label>  <label>second</label></p>'],
      ['<p>Price: <del>$20</del><span> now </span><ins>$15</ins></p>', ['Price:', '$20', '', '$15'], '<p>Price: <del>$20</del>  <ins>$15</ins></p>'],
      ['<p><font>Hello</font><span> big </span><font>world</font></p>', ['Hello', '', 'world'], '<p><font>Hello</font>  <font>world</font></p>'],
      ['<p><font>Hello</font><a href="/x"> big </a><font>world</font></p>', ['Hello', '[]', 'world'], '<p><font>Hello</font>  <font>world</font></p>'],
      ['<p>Pick <button type="button">Yes</button><em> or </em><button type="button">No</button></p>', ['Pick', 'Yes', '', 'No'], '<p>Pick <button type="button">Yes</button>  <button type="button">No</button></p>'],
      // A space on one side only is that side's, written as it was.
      ['<p><font>Hello</font><span> big</span><font>world</font></p>', ['Hello', '', 'world'], '<p><font>Hello</font> <font>world</font></p>'],
      // At a block's edge, or across a line break, nothing stands on the other side: nothing is written.
      ['<p><span> big </span><font>world</font></p>', ['', 'world'], '<p><font>world</font></p>'],
      ['<p><font>Hello</font><span> big </span><br><font>world</font></p>', ['Hello', '', 'world'], '<p><font>Hello</font><br><font>world</font></p>'],
      // No space between them before: none after.
      ['<p><label>First</label><b>and</b><label>second</label></p>', ['First', '', 'second'], '<p><label>First</label><label>second</label></p>'],
    ] as const) {
      const r = run(page, answer(lines));
      expect(r, page).toMatchObject(clean(written));
      expect(fresh(r.placed!), page).toEqual(['T', ...lines.filter((l) => l && l !== '[]')]);
    }
  });

  it('words added past the slot that holds a line\'s edge space leave a space at the line\'s new edge, where a line beside it needs one', () => {
    for (const [page, lines, written] of [
      ['<p><del>Was <b>$20 </b></del>Now $15</p>', ['Was $20 only', 'Now $15'], '<p><del>Was <b>$20 </b> only </del>Now $15</p>'],
      ['<p><del>Was $20</del><ins><b> Now</b> $15</ins></p>', ['Was $20', 'Only Now $15'], '<p><del>Was $20</del><ins> Only <b> Now</b> $15</ins></p>'],
      ['<p><label>Email <em>address </em></label>is required</p>', ['Email address here', 'is required'], '<p><label>Email <em>address </em> here </label>is required</p>'],
      ['<p><label>Email</label><a href="/help"> help</a> is here</p>', ['Email', 'Get [help] is here'], '<p><label>Email</label> Get <a href="/help"> help</a> is here</p>'],
      ['<p><nobr>Call <i>us </i></nobr>today please</p>', ['Call us now', 'today please'], '<p><nobr>Call <i>us </i> now </nobr>today please</p>'],
      ['<p><font color="red">Sale <b>ends </b></font>tonight at nine</p>', ['Sale ends soon', 'tonight at nine'], '<p><font color="red">Sale <b>ends </b> soon </font>tonight at nine</p>'],
      ['<p>Sale ends<font color="red"><b> tonight</b> at nine</font></p>', ['Sale ends', 'really tonight at nine'], '<p>Sale ends<font color="red"> really <b> tonight</b> at nine</font></p>'],
      // One slot holds the line's words: the new ones join them there, before its edge space.
      ['<p><button type="button"><span>Buy </span></button>now or later</p>', ['Buy it', 'now or later'], '<p><button type="button"><span>Buy it </span></button>now or later</p>'],
      // Text glued to a link whose edge space sat inside it: the space goes, and the line keeps one at its new edge.
      ['<p><label>Go</label><a href="/x"> Read</a> more</p>', ['Go', '([Read]) more'], '<p><label>Go</label> (<a href="/x">Read</a>) more</p>'],
      ['<p>Read <a href="/x">more </a><label>Next</label></p>', ['Read [more].', 'Next'], '<p>Read <a href="/x">more</a>. <label>Next</label></p>'],
      // Nothing beside the line on its screen line: nothing is added (as round 4 wrote these).
      ['<p>Read <a href="/x">more </a></p>', ['Read [more].'], '<p>Read <a href="/x">more</a>.</p>'],
      ['<p><del>Was <b>$20 </b></del></p><p>Now $15</p>', ['Was $20 only', 'Now $15'], '<p><del>Was <b>$20 </b> only</del></p><p>Now $15</p>'],
    ] as const) {
      const r = run(page, answer(lines));
      expect(r, page).toMatchObject(clean(written));
      expect(fresh(r.placed!), page).toEqual(['T', ...lines]);
    }
  });

  it('the verifier reads each block with its spaces: lines run together, or a space where none was, are refused, whatever wrote them', () => {
    const cases = [
      ['<p><del>Was <b>$20 </b></del>Now $15</p>', 'T\nWas $20 only\nNow $15', '<p><del>Was <b>$20 </b> only</del>Now $15</p>', 'The page, read again, runs words together that a browser showed apart: it shows "Was $20 onlyNow $15".'],
      ['<p><label>Email</label><a href="/help"> help</a> is here</p>', 'T\nEmail\nGet [help] is here', '<p><label>Email</label>Get <a href="/help"> help</a> is here</p>', 'The page, read again, runs words together that a browser showed apart: it shows "EmailGet help is here".'],
      ['<p><label>First</label><b>and</b><label>second</label></p>', 'T\nFirst\nand!\nsecond', '<p><label>First</label><b> and!</b><label>second</label></p>', 'The page, read again, shows a space a browser did not: it shows "First and!second".'],
    ] as const;
    for (const [page, ans, bad, msg] of cases) expect(verifyBad(pageOf(page), pageOf(bad), ans), page).toEqual([msg]);
    // A deleted line's space dropped with the element that held it.
    const L = pageOf('<p><label>First</label><b> and </b><label>second</label></p>');
    const b = [...readPageCopy(L).els.values()].find((x) => x.name === 'b')!;
    expect(pageEditProblems(L, pageOf('<p><label>First</label><label>second</label></p>'), edit(L, 'T\nFirst\n\nsecond'), { removed: [b.start], brs: [] })).toEqual([
      'Line 3 is emptied, but the space it left between the lines beside it is not where the element that held it was.',
      'The page, read again, runs words together that a browser showed apart: it shows "Firstsecond".',
    ]);
  });
});

describe('what browsers move out of a table is never removed (F07, r6)', () => {
  it('an element in a table outside any cell, which browsers put before the table, is kept, as is anything holding one', () => {
    // Browsers put the span, and "After", before the table: removing the emptied span would show "late:After".
    const F = '<div>late:<table><tr><span><section>Gone</section></span>After<td>Cell</td></tr></table></div>';
    expect(run(F, set(2, ''))).toMatchObject({ deck: ['T', 'late:', 'Gone', 'After', 'Cell'], ...clean('<div>late:<table><tr><span><section></section></span>After<td>Cell</td></tr></table></div>') });
    // A row opened inside a cell ends the cell in browsers: what follows is outside any cell again.
    const R = '<div>late:<table><tr><td>A</td><tr><b><i><section>Gone</section></i></b>After</tr></table></div>';
    expect(run(R, set(3, ''))).toMatchObject(clean('<div>late:<table><tr><td>A</td><tr><b><i><section></section></i></b>After</tr></table></div>'));
    // Inside a cell nothing moves: an emptied span there goes as before.
    expect(run('<table><tr><td>Keep <span>gone</span> this</td></tr></table>', set(1, 'Keep this'))).toMatchObject(clean('<table><tr><td>Keep this</td></tr></table>'));
    // The round-5 review's page: the link around the deleted line would be left empty and cannot go, so the edit is refused.
    const page = '<!doctype html><title>T</title> late:\n<table><tbody><tr><td><tr><b></span>\n<tt> <a href="/b"> <section>🎉?</section></a><tr> $20? x! &nbsp;,</b></td><td>\n  today, daily</td></tr></table>\n';
    expect(run(page, set(2, ''), { full: true }).placeProblems).toEqual(['Line 3: this link cannot be removed in this step and would be left empty; keep some words for it, or leave the line as it was.']);
  });
});

describe('what a page hides, and what its head shows (F07, r6)', () => {
  it('a hidden element browsers show inline is not offered: its words stay as they are, and the person\'s go beside it', () => {
    const S = '<p>Sale<span hidden> ends</span> today</p>';
    expect(run(S, same).deck).toEqual(['T', 'Sale today']);
    expect(run(S, set(1, 'Sale starts today'))).toMatchObject(clean('<p>Sale<span hidden> ends</span> starts today</p>'));
    expect(run('<p>Call <font hidden>(old) </font>us <label hidden>now</label></p>', same).deck).toEqual(['T', 'Call', 'us']);
    // A hidden block shows when a script or the reader opens it: it is offered, as its own lines, as before.
    expect(run('<div hidden>Menu</div><details><summary>More</summary><p>Inside</p></details><p>After</p>', same).deck).toEqual(['T', 'Menu', 'More', 'Inside', 'After']);
  });

  it('text written in the head after the title ends the head, as browsers end it: it is offered', () => {
    const H = '<!doctype html><html><head><title>T</title>Welcome</head><body><p>Hi</p></body></html>';
    expect(run(H, same, { full: true }).deck).toEqual(['T', 'Welcome', 'Hi']);
    expect(run(H, set(1, 'Hello'), { full: true })).toMatchObject(clean('<!doctype html><html><head><title>T</title>Hello</head><body><p>Hi</p></body></html>'));
    expect(run('<!doctype html><html><head><title>T</title>Hello <b>world</b></html>', same, { full: true }).deck).toEqual(['T', 'Hello world']);
    // Whitespace in the head is the head's.
    expect(run('<!doctype html><html><head>\n  <title>T</title>\n  <meta charset="utf-8">\n</head><body><p>Hi</p></body></html>', same, { full: true }).deck).toEqual(['T', 'Hi']);
  });

  it('an <a> without an address is not a link in a row of links either; <image> is an image; a null character is refused', () => {
    expect(run('<p><a href="/x">Read</a><a> more</a></p>', same).deck).toEqual(['T', '[Read] more']);
    expect(run('<p><a href="/x">Read</a><a> more</a></p>', set(1, '[Read] more today'))).toMatchObject(clean('<p><a href="/x">Read</a><a> more today</a></p>'));
    // Browsers read <image> as <img>: the link keeps a picture, named by its alt, so its words can go.
    expect(run('<p><a href="/h">Home<image src="h.png" alt="Home"></a> now</p>', set(1, ''))).toMatchObject(clean('<p><a href="/h"><image src="h.png" alt="Home"></a> now</p>'));
    expect(run('<p>Hello world</p>', set(1, 'Hello\u0000 world')).rejected).toBe('Line 2 has a null character (U+0000), which browsers drop: take it out.');
  });
});

describe('characters outside the Basic Multilingual Plane are one character each (F07, r6)', () => {
  it('a line of several slots whose kept word is an emoji or an astral letter is placed', () => {
    expect(run('<p><strong>Free shipping</strong> on all orders 🎉</p>', set(1, 'Free shipping on every order 🎉'))).toMatchObject(clean('<p><strong>Free shipping</strong> on every order 🎉</p>'));
    expect(run('<p>Ready? <a href="/o"><b>Order now</b> 🚀</a></p>', set(1, 'Ready? [Order today 🚀]'))).toMatchObject(clean('<p>Ready? <a href="/o"><b>Order today</b> 🚀</a></p>'));
    expect(run('<p>Hello <b>world</b> 🎉🎉</p>', set(1, 'Hi world 🎉🎉'))).toMatchObject(clean('<p>Hi <b>world</b> 🎉🎉</p>'));
    expect(run('<p>Party 🎉 <b>now</b> today</p>', set(1, 'Party 🎉 now tomorrow'))).toMatchObject(clean('<p>Party 🎉 <b>now</b> tomorrow</p>'));
    expect(run('<p>Big <em>𝒳 value</em> here</p>', set(1, 'Small 𝒳 value here'))).toMatchObject(clean('<p>Small <em>𝒳 value</em> here</p>'));
    expect(run('<p>Join <a href="/j">us 🎉</a> now</p>', set(1, 'Please join [us 🎉] now'))).toMatchObject(clean('<p>Please join <a href="/j">us 🎉</a> now</p>'));
  });
});

describe('lines a browser does not show are not offered (the arbiter\'s offer rule, F07, r7)', () => {
  it('are the page\'s own text: left out of the deck, kept byte for byte by placement, and read as unchanged by the verifier', () => {
    const before = pageOf('<div hidden>Menu</div><p>Hello <b>big</b> world</p><nav><a href="/a">Shown</a><a href="/b">Gone</a></nav>');
    expect(deckLines(readPageCopy(before))).toEqual(['T', 'Menu', 'Hello big world', 'Shown', 'Gone']);
    const hide = new Set([1, 4]);
    const p = readPageCopy(before, hide);
    expect(deckLines(p)).toEqual(['T', 'Hello big world', 'Shown']);
    expect(pageVoiceSuffix(p)).toMatch(/line 3 "Shown" goes to \/a\.$/);
    const e = readPageEdit(p, 'T\nHello world\nSeen');
    if (!e.ok) throw new Error(e.problem);
    const placed = placePageEdit(before, e, hide);
    expect(body(placed.page)).toBe('<div hidden>Menu</div><p>Hello world</p><nav><a href="/a">Seen</a><a href="/b">Gone</a></nav>');
    expect(placed.problems).toEqual([]);
    expect(pageEditProblems(before, placed.page, e, placed, hide)).toEqual([]);
    // A placement that changed a line not offered is refused.
    expect(pageEditProblems(before, placed.page.replace('>Gone<', '>Went<'), e, placed, hide)).not.toEqual([]);
  });
});

describe('a link or button keeps words a browser shows (F07, r7)', () => {
  it('one whose only other words are hidden is refused, not left without a name: words a browser hides do not name it', () => {
    // A submit button whose label is deleted, with a hidden "Sending…" beside it: a browser shows an empty button.
    expect(run('<form><p>Ready? <button type="submit"><span>Send</span><span hidden>Sending…</span></button> We reply fast.</p></form>', set(2, '')).placeProblems).toEqual([
      'Line 3: this button cannot be removed in this step (it holds words a browser hides) and would be left empty; keep some words for it, or leave the line as it was.',
    ]);
    // A link whose words are taken ([]), with a hidden span inside: the link cannot go (its hidden words stay), so it is refused.
    expect(run('<p>Go <a href="/x">Read<span hidden> more</span></a> now</p>', set(1, 'Go [] now')).placeProblems).toEqual([
      'Line 2: this link cannot be removed in this step (it holds words a browser hides) and would be left empty; keep some words for it, or leave the line as it was.',
    ]);
    // An icon button with a hidden span: it keeps a picture, but nothing names it.
    expect(run('<p>Menu: <button type="button"><svg width="9" height="9"></svg><span>Open</span><span hidden>Close</span></button> here</p>', set(2, '')).placeProblems).toEqual([
      'Line 3: this button cannot be removed in this step (it holds words a browser hides) and would be left without a name; keep some words for it, or leave the line as it was.',
    ]);
    // Named by its own label, it may lose its shown words; one that keeps a shown word is fine.
    expect(run('<p>Menu: <button type="button" aria-label="Menu"><svg width="9" height="9"></svg><span>Open</span><span hidden>Close</span></button> here</p>', set(2, ''))).toMatchObject(clean('<p>Menu: <button type="button" aria-label="Menu"><svg width="9" height="9"></svg><span hidden>Close</span></button> here</p>'));
    expect(run('<p>Go <a href="/x">Read<span hidden> more</span></a> now</p>', set(1, 'Go [Look] now'))).toMatchObject(clean('<p>Go <a href="/x">Look<span hidden> more</span></a> now</p>'));
  });

  it('the verifier counts only words a browser shows when it asks whether a control kept a name', () => {
    const before = pageOf('<form><p>Ready? <button type="submit"><span>Send</span><span hidden>Sending…</span></button> We reply fast.</p></form>');
    const after = before.replace('<span>Send</span>', '');
    expect(verifyBad(before, after, 'T\nReady?\n\nWe reply fast.')).toContain('A button in your changed lines is left without a name.');
    const link = pageOf('<p>Go <a href="/x">Read<span hidden> more</span></a> now</p>');
    expect(verifyBad(link, link.replace('Read<span', '<span').replace('</a> now', '</a>now'), 'T\nGo [] now')).toContain('A link in your changed lines is left without a name.');
  });
});

describe('a <body> or <html> after the body has begun is ignored, as browsers ignore it (F07, r7)', () => {
  // Chromium shows each page before the edit as "Welcome" / "Sale" / "Order today", one line each; removing the emptied
  // heading showed "WelcomeOrder today" (round 6), so it is kept.
  const pages = [
    '<!doctype html><html><head><title>T</title>Welcome</head><body><h2>Sale</h2>Order today</body></html>',
    '<!doctype html><title>T</title>Welcome<body><h2>Sale</h2>Order today',
    '<!doctype html><title>T</title><span>Welcome</span><body><h2>Sale</h2>Order today',
    '<!doctype html><html><head><title>T</title></head>Welcome<body><h2>Sale</h2>Order today',
    '<!doctype html><title>T</title><p>One</p>Welcome<html lang="en"><h2>Sale</h2>Order today',
  ];
  it('so a block between text before it and text after it is kept, empty, when its line is deleted', () => {
    for (const html of pages) {
      const deck = deckLines(readPageCopy(html));
      expect(run(html, set(deck.indexOf('Sale'), ''), { full: true }), html).toMatchObject(clean(html.replace('<h2>Sale</h2>', '<h2></h2>')));
    }
  });

  it('text that ends the head continues the body\'s first screen line: lines on either side of an ignored <body> stay as they showed', () => {
    // Chromium shows "Welcometo our shop" and "Hello world": the lines are two in the deck, on one screen line.
    const W = '<!doctype html><html><head><title>T</title>Welcome</head><body>to <b>our</b> shop';
    expect(run(W, same, { full: true }).deck).toEqual(['T', 'Welcome', 'to our shop']);
    expect(run(W, set(1, 'Hi'), { full: true })).toMatchObject(clean('<!doctype html><html><head><title>T</title>Hi</head><body>to <b>our</b> shop'));
    // Chromium shows "Welcome Sale today": deleting "Sale" keeps its spaces where the emptied span was, so it shows
    // "Welcome today" (round 6 read "Welcome" as a block of its own and wrote "Welcometoday").
    const S = '<!doctype html><html><head><title>T</title>Welcome</head><body><span><font> Sale </font></span>today';
    expect(run(S, same, { full: true }).deck).toEqual(['T', 'Welcome', 'Sale', 'today']);
    expect(run(S, set(2, ''), { full: true })).toMatchObject(clean('<!doctype html><html><head><title>T</title>Welcome</head><body>  today'));
  });
});

describe('a deleted line leaves only a space a browser showed (F07, r7)', () => {
  it('the whitespace of a line in a hidden block is not written where the block was: it never showed', () => {
    // "sale" and "Spring!" show glued; round 6 wrote the hidden block's spaces between them and its verifier refused that.
    expect(run('<div><font>sale<blockquote hidden> X </blockquote></font>Spring!</div>', set(2, ''))).toMatchObject(clean('<div><font>sale</font>Spring!</div>'));
    // A shown line's space is still kept where its element was.
    expect(run('<p>Price: <del>$20</del><span> now </span><ins>$15</ins></p>', set(3, ''))).toMatchObject(clean('<p>Price: <del>$20</del>  <ins>$15</ins></p>'));
  });
});

describe('a space the person types at a changed line\'s edge parts it from text beside it (F07, r8)', () => {
  it('is written at the line\'s edge where the page shows text beside the line with no space between', () => {
    for (const [page, answer, written] of [
      // Round 7 dropped these spaces, so "Hello" and "there" ran together.
      ['<p><b>Hello</b><font>world</font></p>', 'T\nHello\n there', '<p><b>Hello</b><font> there</font></p>'],
      ['<p><b>Hello</b><font>world</font></p>', 'T\nHi \nworld', '<p><b>Hi </b><font>world</font></p>'],
      // A link removed at a line's start or end: the space the person kept beside its brackets stays at the line's edge.
      ['<p><b>Sale,</b><font><a href="/d">$20</a> menu</font></p>', 'T\nSale,\n[] menu', '<p><b>Sale,</b><font> menu</font></p>'],
      ['<p><font>Intro <a href="/m">more</a></font><b>x</b></p>', 'T\nIntro []\nx', '<p><font>Intro </font><b>x</b></p>'],
      // The space goes beside the line's first or last word, as a line's own edge space does when words move past it, so
      // inside a link that ends the line (layout only).
      ['<p><b>price,</b><font><a href="/p">price</a> sale,</font><i>now</i></p>', 'T\nprice,\n[price] \nnow', '<p><b>price,</b><font><a href="/p">price </a></font><i>now</i></p>'],
    ] as const) {
      const r = run(page, () => answer);
      expect(r, page).toMatchObject(clean(written));
    }
  });

  it('adds nothing where nothing stands beside the line, or on a line whose words are unchanged; beside a space already there, one more shows as one', () => {
    expect(run('<p>Hello</p><p>world</p>', () => 'T\n Hi \nworld')).toMatchObject(clean('<p>Hi</p><p>world</p>'));
    // Whitespace beside the line is not weighed: the reader cannot always tell whether it shows (a button's edge).
    expect(run('<p><b>Hello </b><font>world</font></p>', () => 'T\nHello\n there')).toMatchObject(clean('<p><b>Hello </b><font> there</font></p>'));
    expect(run('<p><b>Hello</b> <font>world</font></p>', () => 'T\nHello \n there ')).toMatchObject(clean('<p><b>Hello</b> <font> there</font></p>'));
    // Edge spaces alone are layout: the line is unchanged, and nothing is written.
    const p = readPageCopy(pageOf('<p><b>Hello</b><font>world</font></p>'));
    expect(readPageEdit(p, 'T\nHello\n world')).toEqual({ ok: true, lines: [{ changed: false }, { changed: false }, { changed: false }] });
  });

  it('the verifier holds placement to it: the person\'s edge space must part the line from the text beside it', () => {
    expect(verifyBad(pageOf('<p><b>Hello</b><font>world</font></p>'), pageOf('<p><b>Hello</b><font>there</font></p>'), 'T\nHello\n there')).toEqual([
      'The page, read again, runs words together that a browser showed apart: it shows "Hellothere".',
    ]);
  });
});

describe('markup that is not copy stays byte for byte (F07, r7)', () => {
  it('an emptied element holding a script, style, noscript, template or comment is kept, with those bytes', () => {
    for (const inner of ['<script>window.x=1</script>', '<noscript>Enable JS</noscript>', '<template><p>T</p></template>', '<!-- keep -->', '<style>p{}</style>']) {
      expect(run(`<p>Hello <span>world${inner}</span></p>`, set(1, 'Hello'))).toMatchObject(clean(`<p>Hello<span>${inner}</span></p>`));
    }
    // A comment does not end a line; raw text does.
    expect(run('<p>Hello <b>world<!-- keep --></b> again</p>', set(1, 'Hello again'))).toMatchObject(clean('<p>Hello <b><!-- keep --></b>again</p>'));
    expect(run('<p>Hello <b>world<script>x()</script></b> again</p>', set(1, 'Hello'))).toMatchObject(clean('<p>Hello<b><script>x()</script></b> again</p>'));
    expect(run('<div><p>Gone<!-- c --></p><p>Stay</p></div>', set(1, ''))).toMatchObject(clean('<div><p><!-- c --></p><p>Stay</p></div>'));
    // Without one, an emptied element goes as before.
    expect(run('<p>Hello <span>world</span></p>', set(1, 'Hello'))).toMatchObject(clean('<p>Hello</p>'));
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

  it('20,000 inline elements a block leaves open: read, placed and verified within the bound, without copying the open elements per run of text (r5)', () => {
    for (const open of ['<span>', '<a href="/x">', '<b>']) {
      const before = pageOf(`<p>${Array.from({ length: 20000 }, (_, i) => `${open}w${i} `).join('')}</p><p>Tail</p>`);
      const t0 = performance.now();
      const r = run(before, (d) => set(d.length - 1, 'Tail!')(d), { full: true });
      expect(performance.now() - t0, open).toBeLessThan(BOUND_MS);
      expect(r, open).toMatchObject(clean(before.replace('<p>Tail</p>', '<p>Tail!</p>')));
    }
  });

  it('20,000 nested elements, emptied: the removal rule is linear too (r5)', () => {
    const before = pageOf(`<p>Keep</p><p>${'<span>'.repeat(20000)}Gone${'</span>'.repeat(20000)}</p>`);
    const t0 = performance.now();
    const r = run(before, () => 'T\nKeep\n', { full: true });
    expect(performance.now() - t0).toBeLessThan(BOUND_MS);
    expect(r).toMatchObject(clean(pageOf('<p>Keep</p>')));
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
