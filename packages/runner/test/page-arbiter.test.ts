/**
 * VOICE's browser arbiter on its own (F07, ADR-0081), against the runner's real Chromium: where each deck line shows,
 * which lines are offered, and the check of a written page, including pages no placement would write (a simulated
 * placement fault), so the arbiter is shown to refuse whatever wrote them.
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import type { Browser } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import { deckLines, readPageCopy, readPageEdit, type PageEdit } from '../src/copy.ts';
import { arbitrate, expectedShown, locateLines, markLines, notShown, notShownWhy, type Location } from '../src/page-arbiter.ts';
import { chromiumLaunchOptions, playwrightPages, RENDERER_OS_SANDBOX_DEFAULT } from '../src/pages.ts';
import { modelShownText } from './helpers/fake-pages.ts';

const chromium = playwrightPages();
/** The launch byway makes when the person has not switched the sandbox off: inside it (ADR-0105). */
const STATED = { osSandbox: RENDERER_OS_SANDBOX_DEFAULT };
afterAll(() => chromium.close(), 60_000);
const none = async () => undefined;
/** Chromium's own local-network checks would also stop a page reaching 127.0.0.1; off, so only byway's rule is tested. */
const LOCAL_NETWORK_CHECKS_OFF = ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests'];
/** Test-only: the stated launch with flags added in test code (as pages.test.ts does). */
async function launchWith(extra: readonly string[]): Promise<Browser> {
  const { chromium: c } = await import('playwright');
  const opts = chromiumLaunchOptions(STATED);
  return c.launch({ ...opts, args: [...(opts.args ?? []), ...extra] });
}

const pageOf = (b: string) => `<!doctype html><html><head><title>T</title></head><body>${b}</body></html>`;
/** Bootstrap 5's screen-reader-only class. */
const VISUALLY_HIDDEN = '.visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}';
const edit = (html: string, answer: string, notOffered = new Set<number>()): PageEdit => {
  const e = readPageEdit(readPageCopy(html, notOffered), answer);
  if (!e.ok) throw new Error(e.problem);
  return e;
};
const at = (loc: Location, html: string) => deckLines(readPageCopy(html)).map((l, k) => [l, loc.spans.get(k)?.in ?? 'not shown'] as const);

describe('where Chromium shows each line', () => {
  it('marks each line at its first and last character without changing what a browser shows', async () => {
    const html = pageOf('<h1>Hello <b>world</b></h1><p>Please <a href="/t">read &amp; agree</a>&#32;</p>');
    const marked = markLines(html);
    // The marks are noncharacters inside the text; the elements are the same.
    expect(marked.replace(/[﷐-﷯]/g, '')).toBe(html);
    expect((await chromium.shownText(marked, none)).text.replace(/[﷐-﷯]/g, '')).toBe((await chromium.shownText(html, none)).text);
    const loc = await locateLines(chromium, none, html);
    expect(loc.agrees).toBe(true);
    expect(at(loc, html)).toEqual([['T', 'title'], ['Hello world', 'body'], ['Please [read & agree]', 'body']]);
  }, 60_000);

  it('a line a browser does not show, or shows elsewhere than one piece, is not placed, so it is not offered', async () => {
    const html = pageOf(
      [
        '<div hidden>Menu</div>',
        '<details><summary>More</summary><p>Inside</p></details>',
        '<details><summary>Less</summary>Bare text</details>',
        '<div style="content-visibility:hidden">Skipped</div>',
        '<dialog>Closed</dialog>',
        '<p style="display:none">Styled away</p>',
        '<p>X<svg width="9" height="9"><title>Tip</title></svg> shown</p>',
        '<p>After</p>',
      ].join(''),
    );
    const loc = await locateLines(chromium, none, html);
    expect(at(loc, html)).toEqual([
      ['T', 'title'],
      ['Menu', 'not shown'],
      ['More', 'body'],
      ['Inside', 'not shown'],
      ['Less', 'body'],
      ['Bare text', 'not shown'],
      ['Skipped', 'not shown'],
      ['Closed', 'not shown'],
      ['Styled away', 'not shown'],
      ['X', 'body'],
      ['Tip', 'not shown'],
      ['shown', 'body'],
      ['After', 'body'],
    ]);
    expect(deckLines(readPageCopy(html, notShown(html, loc)))).toEqual(['T', 'More', 'Less', 'X', 'shown', 'After']);
    // An svg <title> left open over the end of a paragraph keeps everything after it hidden in a browser.
    const open = pageOf('<p>X<svg width="9" height="9"><title>Tip</p><p>Hello</p>');
    expect(deckLines(readPageCopy(open))).toEqual(['T', 'X', 'Tip', 'Hello']);
    expect(deckLines(readPageCopy(open, notShown(open, await locateLines(chromium, none, open))))).toEqual(['T', 'X']);
  }, 60_000);

  it('a line holding text a style hides from sight, though a browser lays it out, is not placed, so it is not offered (r9)', async () => {
    const html = pageOf(
      [
        `<style>${VISUALLY_HIDDEN}</style>`,
        '<p>Rated 4.5<span class="visually-hidden"> out of 5</span> stars</p>',
        '<p><button type="submit" class="btn">Send message <span class="visually-hidden">to Saltbox</span></button></p>',
        '<h2 class="visually-hidden">Our menu</h2>',
        '<p>Sale <i style="opacity:0">ends</i> today</p>',
        '<p><a href="/blog/defaults">Read more<span class="visually-hidden"> about defaults</span></a></p>',
        '<p><span style="font-size:0">Zero</span>Big</p>',
        '<p>Fresh bread daily</p>',
      ].join(''),
    );
    const loc = await locateLines(chromium, none, html);
    expect(loc.agrees).toBe(true);
    expect(loc.hidden).toEqual([['out of 5', null], ['to Saltbox', null], ['Our menu', null], ['ends', null], ['about defaults', '/blog/defaults'], ['Zero', null]]);
    expect(deckLines(readPageCopy(html, notShown(html, loc)))).toEqual(['T', 'Fresh bread daily']);
  }, 60_000);

  it('a page holding the marks\' own characters cannot be placed: nothing is hidden from the offer, and no change can be checked', async () => {
    const html = pageOf('<p>Odd ﷐ text</p><p>Two</p>');
    const loc = await locateLines(chromium, none, html);
    expect(loc.agrees).toBe(false);
    expect(notShown(html, loc).size).toBe(0);
    expect(expectedShown(html, loc, new Set(), edit(html, 'T\nOdd ﷐ text\nTwo!'))).toMatchObject({ line: 3, problem: expect.stringMatching(/^byway could not put line 3 on this page exactly as you wrote it, because byway could not match this page's lines to what a browser shows/) });
  }, 60_000);
});

describe('the check of a written page: Chromium against the person\'s edit, whatever wrote it', () => {
  const check = async (html: string, answer: string, written: string) => {
    const loc = await locateLines(chromium, none, html);
    const hidden = notShown(html, loc);
    return arbitrate(chromium, none, html, written, loc, hidden, edit(html, answer, hidden));
  };

  it('accepts a written page that shows exactly the person\'s lines, the page\'s own separators kept', async () => {
    const html = pageOf('<h1>Head</h1><p>Old middle</p><p>Please <a href="/terms">read terms</a> today.</p>');
    expect(await check(html, 'T\nNew head\n\nPlease [read the terms] today.', pageOf('<h1>New head</h1><p>Please <a href="/terms">read the terms</a> today.</p>'))).toBeUndefined();
    // A line Chromium shows broken over two screen lines (a style the deck does not read) may keep its break.
    const broken = pageOf('<style>.b{display:block}</style><h1>Fresh <span class="b">bread daily</span></h1>');
    expect(await check(broken, 'T\nWarm bread daily', broken.replace('Fresh ', 'Warm '))).toBeUndefined();
    expect(await check(broken, 'T\nWarm bread', broken.replace('Fresh ', 'Warm ').replace(' daily', ''))).toBeUndefined();
  }, 60_000);

  it('refuses lines run together, a space or a line break that was not there, and other words, naming the line', async () => {
    const html = pageOf('<p>Hello</p><p>big</p><p>world</p>');
    expect(await check(html, 'T\nHello\n\nworld', pageOf('<p>Hello<span></span>world</p>'))).toEqual({
      line: 3,
      problem: 'byway could not put line 3 on this page exactly as you wrote it, because a browser would run words together that your lines keep apart: it would show "Helloworld". Change line 3 again, or leave it as it was offered.',
    });
    // A space the person kept, between characters they kept, keeps the separator it had: here, one flow of text (r10).
    const two = pageOf('<p>Hello</p><p>big one</p><p>world</p>');
    expect((await check(two, 'T\nHello\nbig one more\nworld', pageOf('<p>Hello</p><p>big</p><p>one more</p><p>world</p>')))?.problem).toMatch(/^byway could not put line 3 on this page exactly as you wrote it, because a browser would show on separate lines what it showed on one line: it would show "Hello \/ big \/ one more \/ world"/);
    expect((await check(html, 'T\nHi\nbig\nworld', pageOf('<p>Hi</p><p>big</p><p>world</p><p>Buy now!</p>')))?.problem).toMatch(/^byway could not put line 2 on this page exactly as you wrote it, because a browser would show text your lines do not have: it would show "Hi \/ big \/ world \/ Buy now!"/);
    expect((await check(html, 'T\nHi\nbig\nworld', pageOf('<p>Hi</p><p>big</p>')))?.problem).toMatch(/^byway could not put line 2 on this page exactly as you wrote it, because a browser would not show all of your lines: it would end with "Hi \/ big"/);
    expect((await check(html, 'T\nHi\nbig\nworld', pageOf('<p>Hi</p><p>b ig</p><p>world</p>')))?.problem).toMatch(/^byway could not put line 2 on this page exactly as you wrote it, because a browser would show a space that your lines do not have: it would show "Hi \/ b ig \/ world"/);
    expect((await check(html, 'T\nHello\nbig\nworlds', pageOf('<p>Hello</p><p>big</p><p>world</p>')))?.problem).toMatch(/^byway could not put line 4 on this page exactly as you wrote it, because a browser would not show all of your lines: it would end with "Hello \/ big \/ world"/);
    expect((await check(html, 'T\nHello\nbig\nworlds', pageOf('<p>Hello</p><p>big</p><p>wordls</p>')))?.problem).toMatch(/^byway could not put line 4 on this page exactly as you wrote it, because a browser would show "Hello \/ big \/ wordls" there/);
  }, 60_000);

  it('refuses a word moved into or out of a link, or into another link', async () => {
    const html = pageOf('<p>See <a href="/d">docs</a> and <a href="/f">FAQ</a> now</p>');
    const answer = 'T\nSee [the docs] and [FAQ] now';
    expect(await check(html, answer, pageOf('<p>See <a href="/d">the docs</a> and <a href="/f">FAQ</a> now</p>'))).toBeUndefined();
    expect((await check(html, answer, pageOf('<p>See the <a href="/d">docs</a> and <a href="/f">FAQ</a> now</p>')))?.problem).toMatch(/^byway could not put line 2 on this page exactly as you wrote it, because a browser would show the words at ".*" outside the link \(to \/d\) they belong to/);
    expect((await check(html, answer, pageOf('<p>See <a href="/d">the docs and</a> <a href="/f">FAQ</a> now</p>')))?.problem).toMatch(/as words of a link \(to \/d\)/);
    expect((await check(html, answer, pageOf('<p>See <a href="/f">the docs</a> and <a href="/f">FAQ</a> now</p>')))?.problem).toMatch(/in the link to \/f, not \/d/);
  }, 60_000);

  it('table cells are boxes of their own: a deleted line at a cell\'s edge leaves the cell\'s edge between its neighbours (r8, r10)', async () => {
    // A visitor sees "Name", "Note" and "$9" apart across boxes: deleting "Note" leaves "Name" and "$9" in their cells,
    // apart across boxes as before (round 7 read the tab as a space and refused this write).
    const html = pageOf('<table><tr><td>Name<br>Note</td><td>$9</td></tr></table>');
    expect(await check(html, 'T\nName\n\n$9', pageOf('<table><tr><td>Name</td><td>$9</td></tr></table>'))).toBeUndefined();
    const desc = pageOf('<table><tr><td><strong>Sourdough</strong><p>Our classic loaf</p></td><td>$9</td></tr></table>');
    expect(await check(desc, 'T\nSourdough\n\n$9', pageOf('<table><tr><td><strong>Sourdough</strong></td><td>$9</td></tr></table>'))).toBeUndefined();
    const first = pageOf('<table><tr><td>$9</td><td><h3>Plan</h3>For teams</td></tr></table>');
    expect(await check(first, 'T\n$9\n\nFor teams', pageOf('<table><tr><td>$9</td><td>For teams</td></tr></table>'))).toBeUndefined();
    // Words moved into one cell, or a line split over two, are refused.
    expect(await check(html, 'T\nName\n\n$9', pageOf('<table><tr><td>Name $9</td><td></td></tr></table>'))).toEqual({
      line: 3,
      problem: 'byway could not put line 3 on this page exactly as you wrote it, because a browser would show on one line what it showed on separate lines: it would show "Name $9". Change line 3 again, or leave it as it was offered.',
    });
    const one = pageOf('<table><tr><td>Sourdough loaf</td><td>$9</td></tr></table>');
    expect((await check(one, 'T\nSourdough loaf\n$10', pageOf('<table><tr><td>Sourdough</td><td>loaf</td><td>$10</td></tr></table>')))?.problem).toBe(
      // Cells side by side are boxes on one row: the refusal says so, not that the line breaks (r11 verifier).
      'byway could not put line 3 on this page exactly as you wrote it, because a browser would part, at the edge of a box on the same row (shown as " / "), words it showed in one run of text: it would show "Sourdough / loaf / $10". Change line 3 again, or leave it as it was offered.',
    );
    // An empty cell between shows nothing a visitor reads: the words are apart across boxes, as before.
    expect(await check(one, 'T\nSourdough loaf\n$10', pageOf('<table><tr><td>Sourdough loaf</td><td></td><td>$10</td></tr></table>'))).toBeUndefined();
  }, 60_000);

  it('a deleted line has no link words to check: a line whose link words the reader misreads can be deleted, not changed (r8)', async () => {
    // An <a> in a MathML <title> is MathML's, not a link, and the <dd> breaks out of math: a browser shows "Now bread" as
    // plain words, while the reader reads them as a link's.
    const html = pageOf('<p>Call</p><math><title><a href="/c"><dd>Now bread</a></title></math><p>End</p>');
    expect(await check(html, 'T\nCall\n\nEnd', pageOf('<p>Call</p><math><title><a href="/c"><dd></a></title></math><p>End</p>'))).toBeUndefined();
    expect((await check(html, 'T\nCall\nNew bread\nEnd', pageOf('<p>Call</p><math><title><a href="/c"><dd>New bread</a></title></math><p>End</p>')))?.problem).toBe(
      'byway could not put line 3 on this page exactly as you wrote it, because a browser shows its link words differently from how they were offered ("Now bread" is not a link\'s words there). Leave line 3 as it was offered.',
    );
  }, 60_000);

  it('refuses a write that would show the person\'s words hidden from sight, hide text the page showed, or show text it hid (r9)', async () => {
    // A simulated placement fault: the new word put into an empty screen-reader-only span.
    const sr = pageOf(`<style>${VISUALLY_HIDDEN}</style><p>Sale <span class="visually-hidden"></span>today</p>`);
    expect(await check(sr, 'T\nSale starts today', sr.replace('"></span>', '">starts </span>'))).toEqual({
      line: 2,
      problem: 'byway could not put line 2 on this page exactly as you wrote it, because a style on this page would hide "starts" from sight there (a browser lays that text out, as for a screen reader, but does not show it). Change line 2 again, or leave it as it was offered.',
    });
    // A longer first line pushes the second out of a box that clips what overflows it.
    const box = (lines: string) => pageOf(`<div style="width:120px;height:40px;line-height:20px;overflow:hidden">${lines}</div>`);
    expect(await check(box('<div>One</div><div>Two</div>'), 'T\nOne two three four five six\nTwo', box('<div>One two three four five six</div><div>Two</div>'))).toEqual({
      line: 2,
      problem: 'byway could not put line 2 on this page exactly as you wrote it, because a style on this page would hide "Two" from sight there (a browser lays that text out, as for a screen reader, but does not show it). Change line 2 again, or leave it as it was offered.',
    });
    // Deleting the first line brings the clipped third into the box.
    const three = box('<div>One</div><div>Two</div><div>Three</div>');
    expect((await locateLines(chromium, none, three)).hidden).toEqual([['Three', null]]);
    expect(await check(three, 'T\n\nTwo', box('<div>Two</div><div>Three</div>'))).toEqual({
      line: 2,
      problem: 'byway could not put line 2 on this page exactly as you wrote it, because a browser would show "Three", which a style on this page hid from sight before. Change line 2 again, or leave it as it was offered.',
    });
  }, 60_000);

  it('a control left with only hidden words shows the same text, so the in-code check, not the arbiter, refuses it', async () => {
    const html = pageOf('<form><p>Ready? <button type="submit"><span>Send</span><span hidden>Sending…</span></button> We reply fast.</p></form>');
    expect(await check(html, 'T\nReady?\n\nWe reply fast.', html.replace('<span>Send</span>', ''))).toBeUndefined();
  }, 60_000);
});

describe('the visitor read decides what shows, what is hidden, and how words sit (r10)', () => {
  /** Each offered deck line, and why each other one is not offered. */
  const offer = async (html: string, pages = chromium) => {
    const loc = await locateLines(pages, none, html);
    const lines = deckLines(readPageCopy(html));
    const why = Object.fromEntries(notShownWhy(html, loc).map(([k, w]) => [lines[k]!, w]));
    return { offered: deckLines(readPageCopy(html, notShown(html, loc))), why, loc };
  };
  const check = async (html: string, answer: string, written: string, pages = chromium) => {
    const loc = await locateLines(pages, none, html);
    const hidden = notShown(html, loc);
    return arbitrate(pages, none, html, written, loc, hidden, edit(html, answer, hidden));
  };
  const FLEX = 'display:flex;align-items:center';

  it('a flex row: the round-9 write that glued the person\'s words after a link is refused; a row whose own words show glued is not offered', async () => {
    const signin = pageOf(`<p style="${FLEX};justify-content:center">Already have an account? <a href="/login" style="margin-left:4px">Sign in</a></p>`);
    expect((await offer(signin)).offered).toEqual(['T', 'Already have an account? [Sign in]']);
    // Placement writes " today" after the link: a new flex item whose leading space a browser drops, so a visitor sees
    // "Sign intoday" (round 9 stored this, reading innerText's line break between flex items as a gap).
    expect(await check(signin, 'T\nAlready have an account? [Sign in] today', signin.replace('</a></p>', '</a> today</p>'))).toEqual({
      line: 2,
      problem: 'byway could not put line 2 on this page exactly as you wrote it, because a browser would run words together that your lines keep apart: it would show "…eady have an account? / Sign intoday". Change line 2 again, or leave it as it was offered.',
    });
    // Words the page itself shows glued, as flex items with no gap, are not one piece with the line's words.
    const glued = pageOf(`<p style="${FLEX}">Starting at <strong>$29</strong></p><ul><li style="${FLEX}"><b>Fast</b> delivery</li></ul><p>Plain</p>`);
    expect(await offer(glued)).toMatchObject({ offered: ['T', 'Plain'], why: { 'Starting at $29': 'layout', 'Fast delivery': 'layout' } });
    // With a gap, the row shows its words apart: offered, and a write that keeps them apart is stored.
    const gapped = pageOf(`<h3 style="${FLEX};gap:8px">Pro <span style="background:#eef;padding:2px 6px">Popular</span></h3>`);
    expect((await offer(gapped)).offered).toEqual(['T', 'Pro Popular']);
    expect(await check(gapped, 'T\nPro plan Popular', gapped.replace('Pro <span', 'Pro plan <span'))).toBeUndefined();
  }, 60_000);

  it('grid cards and floats: cards are boxes of their own; a line a float or a reversed row reorders is not offered', async () => {
    const cards = pageOf('<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px"><div><h3>Fast</h3><p>Same-day delivery</p></div><div><h3>Fresh</h3><p>Baked at dawn</p></div><div><h3>Local</h3><p>From our street</p></div></div>');
    expect((await offer(cards)).offered).toEqual(['T', 'Fast', 'Same-day delivery', 'Fresh', 'Baked at dawn', 'Local', 'From our street']);
    expect(await check(cards, 'T\nFast\nSame-day delivery, every day\nFresh\nBaked at dawn\nLocal\nFrom our street', cards.replace('Same-day delivery', 'Same-day delivery, every day'))).toBeUndefined();
    // A deleted card line leaves the cards apart as they were.
    expect(await check(cards, 'T\nFast\nSame-day delivery\nFresh\n\nLocal\nFrom our street', cards.replace('<p>Baked at dawn</p>', ''))).toBeUndefined();
    const moved = pageOf(
      [
        '<p>Alpha <span style="float:right">Beta</span> Gamma</p>',
        '<p style="display:flex;gap:6px;flex-direction:row-reverse;justify-content:flex-end"><span>Hello</span> <span>brave</span> <span>world</span></p>',
        '<p style="display:flex;gap:6px"><span style="order:2">Warm bread</span> <span style="order:1">every morning</span></p>',
        '<p style="display:grid;grid-template-columns:auto auto;justify-content:start"><span>One</span> <span>Two</span></p>',
        '<p><bdo dir="rtl">Hello world</bdo> after</p>',
        '<p>Plain</p>',
      ].join(''),
    );
    expect(await offer(moved)).toMatchObject({ offered: ['T', 'Plain'], why: { 'Alpha Beta Gamma': 'layout', 'Hello brave world': 'layout', 'Warm bread every morning': 'layout', 'One Two': 'layout', 'Hello world after': 'layout' } });
  }, 60_000);

  it('a space the person types at a line\'s edge is kept apart from its neighbour however the page sets them apart, in the other order included (r10)', async () => {
    // The float shows "fl" at the right of the paragraph's row: a visitor reads the paragraph's words before it.
    const html = pageOf('<div style="float:right">fl</div><p>Order now</p><p>End</p>');
    expect((await offer(html)).offered).toEqual(['T', 'fl', 'Order now', 'End']);
    expect(await check(html, 'T\nfl\n Big order now\nEnd', html.replace('<p>Order now', '<p>Big order now'))).toBeUndefined();
    expect(await check(html, 'T\nflag \nOrder now\nEnd', html.replace('>fl<', '>flag<'))).toBeUndefined();
  }, 60_000);

  it('a neighbour the page shows in the other order stays so when the line beside it now ends in punctuation (r10 generator)', async () => {
    // The float shows its badge at the right of the paragraph's row: "New" and "New!" both stand after "Annual plan".
    const html = pageOf('<div style="float:right">New</div><p>Annual plan</p>');
    expect((await offer(html)).offered).toEqual(['T', 'New', 'Annual plan']);
    expect(await check(html, 'T\nNew!\nAnnual plan', html.replace('>New<', '>New!<'))).toBeUndefined();
  }, 60_000);

  it('a gap beside text its box cuts off is measured from what shows, not from where the cut-off characters would be (r10 generator)', async () => {
    // The svg is 9px wide: its "S" shows in part, the rest is cut off. A space typed before "Our" shows as one.
    const html = pageOf('<h2><svg width="9" height="9" aria-hidden="true"><text y="8">Svg</text></svg>Pricing</h2>');
    expect((await offer(html)).offered).toEqual(['T', 'Pricing']);
    expect(await check(html, 'T\n Our pricing', html.replace('>Pricing<', '> Our pricing<'))).toBeUndefined();
  }, 60_000);

  it('content-visibility skips only a box that can contain its content, and display: contents shows its text (r10 hand cases)', async () => {
    // hidden="until-found" on an inline span is content-visibility: hidden on a box it does not apply to: Chromium
    // paints " ends", so the line the reader reads as "Sale today" is shown with other words in it, and is not offered
    // (round 10 at first read " ends" as not laid out, offered the line and stored "Sale ends starts today").
    const found = pageOf('<p>Sale<span hidden="until-found"> ends</span> today</p><div hidden="until-found">Found</div><p>Hi <em style="display:contents">there</em> you</p>');
    const o = await offer(found);
    expect(o.offered).toEqual(['T', 'Hi there you']);
    expect(o.why).toEqual({ 'Sale today': 'changed', Found: 'unlaid' });
    expect(await check(found, 'T\nHi there, you', found.replace('</em> you', '</em>, you'))).toBeUndefined();
  }, 60_000);

  it('a deleted line glued to a box beside it leaves its neighbours apart, in the flow or across the box\'s edge (r10)', async () => {
    // "price" touches the svg's visible "S", which hides the svg's edge between them; once "price" is gone, the edge
    // stands between "S" and "Name.": a visitor sees them apart on one row, as "price" and "Name." were.
    const html = pageOf('<p>Intro <del><svg width="9" height="9"><text y="5">Svgt</text></svg>price</del>\nName. Call late</p>');
    expect((await offer(html)).offered).toEqual(['T', 'Intro', 'price', 'Name. Call late']);
    expect(await check(html, 'T\nIntro\n\nName. Call late', html.replace('</svg>price</del>', '</svg></del>'))).toBeUndefined();
    // Glued on both sides, the neighbours must stay glued.
    const glued = pageOf('<p><b>Hello</b><font>big</font><i>world</i></p>');
    expect((await check(glued, 'T\nHello\n\nworld', glued.replace('<font>big</font>', ' ')))?.problem).toMatch(/a browser would show a space that your lines do not have/);
  }, 60_000);

  it('a block break where the line has no space (a display:block cite) is the page\'s own: the line is offered, and an edit keeps the break', async () => {
    const quote = pageOf('<blockquote><p>“Worth every penny.”<cite style="display:block">— Maya R., Hackney</cite></p></blockquote>');
    expect((await offer(quote)).offered).toEqual(['T', '“Worth every penny.”— Maya R., Hackney']);
    expect(await check(quote, 'T\n“Worth every penny.”— Maya R., Camden', quote.replace('Hackney', 'Camden'))).toBeUndefined();
    // Both ends changed: the two characters around the break are still side by side, so they keep it.
    expect(await check(quote, 'T\n“Worth it.”— Maya, Camden', quote.replace('Worth every penny.', 'Worth it.').replace('Maya R., Hackney', 'Maya, Camden'))).toBeUndefined();
    // Where the person's new words meet, a break the page makes is not the person's: refused.
    expect((await check(quote, 'T\n“Worth every penny.”— Maya R., Hackney!', quote.replace('Hackney</cite>', 'Hackney</cite>!')))?.problem).toMatch(/would show a line break that your lines do not have/);
    // Inline blocks with padding (tag chips) show their edges apart: the line is offered and an edit beside them stored.
    const chips = pageOf('<style>.chip{display:inline-block;padding:2px 8px;border-radius:9px;background:#eee}</style><p>Tags: <span class="chip">New</span><span class="chip">tech</span></p>');
    expect((await offer(chips)).offered).toEqual(['T', 'Tags: Newtech']);
    expect(await check(chips, 'T\nTags: Newtech, design', chips.replace('tech</span>', 'tech, design</span>'))).toBeUndefined();
  }, 60_000);

  it('text clipped in part (an ellipsis, a line clamp, a box of fixed height) is hidden from sight character by character', async () => {
    const box = (style: string, text: string) => pageOf(`<p style="${style}">${text}</p><p>Next</p>`);
    const truncate = 'width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:16px Arial';
    const clamp = 'width:200px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;font:16px Arial';
    const fixed = 'height:20px;width:200px;overflow:hidden;margin:0;font:16px/20px Arial';
    for (const style of [truncate, clamp, fixed]) {
      const html = box(style, 'Fresh bread');
      expect((await offer(html)).offered, style).toEqual(['T', 'Fresh bread', 'Next']);
      // The person's added words cut from sight: refused (round 9 stored these).
      expect((await check(html, 'T\nFresh bread baked every single morning by hand\nNext', html.replace('Fresh bread', 'Fresh bread baked every single morning by hand')))?.problem, style).toMatch(/^byway could not put line 2 on this page exactly as you wrote it, because a style on this page would hide "[^"]+" from sight there/);
      // A line the page already cuts off is not offered.
      const cut = box(style, 'Fresh bread baked every single morning by hand in the oven');
      expect((await offer(cut)).why, style).toEqual({ 'Fresh bread baked every single morning by hand in the oven': 'part-hidden' });
    }
  }, 60_000);

  it('a box that cuts a row partway hides that row from sight: the person\'s words, or the page\'s, pushed into it are refused (r10 verifier)', async () => {
    // Round 9's reproduction, at the default line height: the 20 px box keeps the top 2 px of a second row.
    const r9 = pageOf('<div style="height:20px;overflow:hidden;width:200px"><p style="margin:0">Fresh bread</p></div><p>Next</p>');
    expect((await offer(r9)).offered).toEqual(['T', 'Fresh bread', 'Next']);
    const long = 'Fresh bread baked every single morning by hand in the oven';
    expect((await check(r9, `T\n${long}\nNext`, r9.replace('Fresh bread', long)))?.problem).toMatch(/^byway could not put line 2 on this page exactly as you wrote it, because a style on this page would hide "[^"]*morning by hand in the oven" from sight there/);
    // Tailwind's h-20 overflow-hidden card: rows of 24 px in 80 px, so a fourth row shows only its top 5 px.
    const card = pageOf('<p style="height:80px;overflow:hidden;width:180px;font:16px/24px Arial;margin:0">Our classic loaf, slow proved for a deep flavour.</p><p>Next</p>');
    expect((await offer(card)).offered).toEqual(['T', 'Our classic loaf, slow proved for a deep flavour.', 'Next']);
    expect((await check(card, 'T\nOur classic loaf, slow proved for a deep flavour. Slice it thin and toast it.\nNext', card.replace('flavour.', 'flavour. Slice it thin and toast it.')))?.problem).toMatch(/would hide "toast it\." from sight there/);
    // The page's own line pushed into the cut row by a longer line before it.
    const rows = (first: string) => pageOf(`<div style="height:80px;overflow:hidden;width:300px;font:16px/24px Arial"><p style="margin:0">${first}</p><p style="margin:0">Two</p><p style="margin:0">Three</p></div>`);
    expect((await offer(rows('One'))).offered).toEqual(['T', 'One', 'Two', 'Three']);
    const longer = 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen';
    expect(await check(rows('One'), `T\n${longer}\nTwo\nThree`, rows(longer))).toEqual({
      line: 2,
      problem: 'byway could not put line 2 on this page exactly as you wrote it, because a style on this page would hide "Three" from sight there (a browser lays that text out, as for a screen reader, but does not show it). Change line 2 again, or leave it as it was offered.',
    });
  }, 60_000);

  it('a word whose text fill leaves it clear is hidden from sight, so its line is not offered (r10 verifier)', async () => {
    const html = pageOf('<p>Rated <span style="-webkit-text-fill-color:transparent">5</span> stars</p><p>Sale <span style="color:rgba(0,0,0,0.02)">ends</span> today</p><p>Plain</p>');
    expect(await offer(html)).toMatchObject({ offered: ['T', 'Plain'], why: { 'Rated 5 stars': 'part-hidden', 'Sale ends today': 'part-hidden' } });
  }, 60_000);

  it('a heading a script splits into letters keeps its marks: the page\'s lines are placed and can be changed (r10 verifier)', async () => {
    const split = (display: string, space: string) =>
      pageOf(
        `<h1 class="split">Sourdough, still warm.</h1><h3>Seeded rye</h3><p>Dense and dark.</p><script>document.querySelectorAll(".split").forEach((el) => { const t = el.textContent; el.textContent = ""; [...t].forEach((c, i) => { const s = document.createElement("span"); s.style.display = "${display}"; s.style.animation = "none"; s.textContent = c === " " ? "${space}" : c; el.appendChild(s); }); });</script>`,
      );
    // Letters in inline blocks, a no-break space between words: the heading shows other characters than its line (a
    // no-break space is not a space), so it alone is not offered.
    const blocks = split('inline-block', '\\u00a0');
    const a = await offer(blocks);
    expect(a.loc.agrees).toBe(true);
    expect(a).toMatchObject({ offered: ['T', 'Seeded rye', 'Dense and dark.'], why: { 'Sourdough, still warm.': 'changed' } });
    expect(await check(blocks, 'T\nSeeded spelt\nDense and dark.', blocks.replace('Seeded rye', 'Seeded spelt'))).toBeUndefined();
    // Letters in inline spans, spaces as they were: the heading shows as its line does, and a change to it is written.
    const inline = split('inline', ' ');
    expect((await offer(inline)).offered).toEqual(['T', 'Sourdough, still warm.', 'Seeded rye', 'Dense and dark.']);
    expect(await check(inline, 'T\nSourdough, still warm at eight.\nSeeded rye\nDense and dark.', inline.replace('still warm.', 'still warm at eight.'))).toBeUndefined();
  }, 60_000);

  it('a box edge the page shows where a line has no space stays the page\'s own beside the text kept: a menu\'s dish and price, a drop cap (r10 verifier)', async () => {
    const item = (dish: string, price: string) => `<li style="display:flex;justify-content:space-between"><span>${dish}</span><span>${price}</span></li>`;
    const menu = pageOf(`<ul style="width:400px">${item('Cacio e pepe', '£13')}${item('Ravioli di zucca', '£15')}</ul>`);
    expect((await offer(menu)).offered).toEqual(['T', 'Cacio e pepe£13', 'Ravioli di zucca£15']);
    // The last word before the price changed (round 10 refused this, saying a browser would show a line break the line
    // does not have), the price changed, the dish rewritten.
    expect(await check(menu, 'T\nCacio e Brightest£13\nRavioli di zucca£15', menu.replace('Cacio e pepe', 'Cacio e Brightest'))).toBeUndefined();
    expect(await check(menu, 'T\nCacio e pepe£13\nRavioli di zucca£16', menu.replace('£15', '£16'))).toBeUndefined();
    expect(await check(menu, 'T\nGnocchi£13\nRavioli di zucca£15', menu.replace('Cacio e pepe', 'Gnocchi'))).toBeUndefined();
    // A break where the person's new characters meet away from that edge is still refused.
    expect((await check(menu, 'T\nCacio e Brightest£13\nRavioli di zucca£15', menu.replace('<span>Cacio e pepe</span>', '<span>Cacio e Bright</span><span>est</span>')))?.problem).toMatch(/would part words that your lines run together, at the edge of a box on the same row \(shown as " \/ "\): it would show "Cacio e Bright \/ est \/ £13/);
    // Text glued to the price, which round 11 put outside the price's box, now goes into it (page-copy.test.ts); put
    // outside, it shows apart on the same row, and the refusal says so, not that a line breaks (r11 verifier).
    expect(await check(menu, 'T\nCacio e pepe£13!\nRavioli di zucca£15', menu.replace('£13</span>', '£13!</span>'))).toBeUndefined();
    expect((await check(menu, 'T\nCacio e pepe£13!\nRavioli di zucca£15', menu.replace('£13</span>', '£13</span>!')))?.problem).toMatch(/would part words that your lines run together, at the edge of a box on the same row \(shown as " \/ "\): it would show "Cacio e pepe \/ £13 \/ !/);
    // A drop cap: its first letter floats beside the rest of the word, which a visitor reads as one word.
    const cap = pageOf('<style>.d::first-letter{float:left;font-size:3em;line-height:1;margin-right:8px}</style><p class="d">Once upon a time there was bread.</p><p>End</p>');
    expect((await offer(cap)).offered).toEqual(['T', 'Once upon a time there was bread.', 'End']);
    expect(await check(cap, 'T\nTwice upon a time there was bread.\nEnd', cap.replace('Once', 'Twice'))).toBeUndefined();
    expect(await check(cap, 'T\nA time there was bread.\nEnd', cap.replace('Once upon a', 'A'))).toBeUndefined();
  }, 60_000);

  it('refuses a deletion that leaves text a stylesheet adds standing on its own, in an emptied element kept for its hook (r10 verifier)', async () => {
    const soon = pageOf('<style>p:empty::before{content:"Coming soon"}</style><p id="soon">Our summer menu</p><p>Visit us</p>');
    expect(await check(soon, 'T\n\nVisit us', soon.replace('Our summer menu', ''))).toEqual({
      line: 2,
      problem: 'byway could not put line 2 on this page exactly as you wrote it, because a style on this page would show "Coming soon" on its own where your lines leave an element empty (text a stylesheet adds, which is not one of your lines). Change line 2 again, or leave it as it was offered.',
    });
    const ticks = pageOf('<style>li{list-style:none}li::before{content:"\\2713  "}</style><ul><li data-aos="fade-up">Fast delivery</li><li data-aos="fade-up">Fresh bread</li></ul>');
    expect((await check(ticks, 'T\n\nFresh bread', ticks.replace('Fast delivery', '')))?.problem).toMatch(/would show "✓" on its own/);
    // Beside the element's own words it stays as it was; an element the deletion removes takes it along.
    const sale = pageOf('<style>.n::before{content:"New: "}</style><p class="n">Spring sale</p><p class="n">Summer menu</p>');
    expect(await check(sale, 'T\nAutumn sale\n', sale.replace('Spring', 'Autumn').replace('<p class="n">Summer menu</p>', ''))).toBeUndefined();
  }, 60_000);

  it('filter: opacity(0), opacity just above 0 and clip-path shapes with no area hide text from sight (r10)', async () => {
    const html = pageOf(
      [
        '<p>Rated 4.5<span style="filter:opacity(0)"> out of 5</span> stars</p>',
        '<p>Sale<span style="opacity:0.01"> ends</span> today</p>',
        '<p>Call<span style="position:absolute;clip-path:circle(0)"> us</span> now</p>',
        '<p>Open<span style="display:inline-block;clip-path:polygon(0 0, 0 0, 0 0)"> late</span> daily</p>',
        '<p>Order <span style="opacity:0.01"></span>today</p>',
        // A part a style does not lay out at all (the reader reads it as the line's) is said the same way.
        '<p>Get started<span style="display:none"> free</span> now</p>',
      ].join(''),
    );
    const { offered, why, loc } = await offer(html);
    expect(offered).toEqual(['T', 'Order today']);
    expect(why).toEqual({ 'Rated 4.5 out of 5 stars': 'part-hidden', 'Sale ends today': 'part-hidden', 'Call us now': 'part-hidden', 'Open late daily': 'part-hidden', 'Get started free now': 'part-hidden' });
    expect(loc.hidden).toEqual([['out of 5', null], ['ends', null], ['us', null], ['late', null]]);
    // A write that puts the person's words into the empty faint span: refused.
    expect((await check(html, 'T\nOrder online today', html.replace('opacity:0.01"></span>', 'opacity:0.01">online </span>')))?.problem).toMatch(/a style on this page would hide "online" from sight there/);
  }, 60_000);

  it('a page styled by a script (Tailwind\'s browser build): screen-reader-only text is hidden and a desktop-only word is shown, as a visitor sees them', async () => {
    const require = createRequire(import.meta.url);
    const tw = readFileSync(require.resolve('@tailwindcss/browser'));
    const server = createServer((_, res) => {
      res.setHeader('content-type', 'text/javascript');
      res.end(tw);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
    const scripted = playwrightPages({ admit: (u) => u.protocol === 'http:' && u.host === host, launch: () => launchWith(LOCAL_NETWORK_CHECKS_OFF) });
    try {
      const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Loaf</title><script src="http://${host}/tw.js"></script></head><body class="p-8">${body}</body></html>`;
      const html = page(
        [
          '<p class="text-lg">Rated 4.5<span class="sr-only"> out of 5</span> stars</p>',
          '<footer class="flex gap-4"><p>Follow us</p><a href="https://instagram.com/loaf"><span class="sr-only">Instagram</span><svg class="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg></a></footer>',
          '<a href="/start" class="rounded bg-orange-600 px-4 py-2 text-white">Get started<span class="hidden md:inline"> free</span></a>',
          '<p class="hidden">Gone</p>',
          '<p>Sale <span class="sr-only"></span>today</p>',
        ].join(''),
      );
      const { offered, why } = await offer(html, scripted);
      // Round 9 read this page with JavaScript off, offered all of it, and wrote "Rated 5 by every single baker" into
      // the screen-reader-only span.
      expect(offered).toEqual(['Loaf', 'Follow us', 'Get started free', 'Sale today']);
      expect(why).toEqual({ 'Rated 4.5 out of 5 stars': 'part-hidden', Instagram: 'hidden', Gone: 'unlaid' });
      expect((await check(html, 'Loaf\nFollow us\nGet started free\nSale starts today', html.replace('sr-only"></span>', 'sr-only">starts </span>'), scripted))?.problem).toMatch(/a style on this page would hide "starts" from sight there/);
      expect(await check(html, 'Loaf\nFollow us\nGet started free\nSale starts today', html.replace('Sale <span', 'Sale starts <span'), scripted)).toBeUndefined();
    } finally {
      await scripted.close();
      server.close();
    }
  }, 120_000);

  it('a page whose sections wait at opacity 0 for a scroll-reveal script is read revealed: its lines are offered and can be written', async () => {
    const reveal = (body: string) =>
      pageOf(
        `<style>.reveal{opacity:0;transform:translateY(30px);transition:opacity .6s,transform .6s}.reveal.in{opacity:1;transform:none}</style><header><h1>Crumb &amp; Co.</h1></header>${body}<script>const io=new IntersectionObserver((es)=>es.forEach((e)=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.2});document.querySelectorAll('.reveal').forEach((el)=>io.observe(el));</script>`,
      );
    const html = reveal('<section class="reveal" style="margin-top:1400px"><h2>Our bread</h2><p>Sourdough at dawn.</p></section><section class="reveal" style="margin-top:1400px"><h2>Visit</h2><p>12 Baker Street</p></section>');
    expect((await offer(html)).offered).toEqual(['T', 'Crumb & Co.', 'Our bread', 'Sourdough at dawn.', 'Visit', '12 Baker Street']);
    expect(await check(html, 'T\nCrumb & Co.\nOur bread\nSourdough baked at dawn.\nVisit\n12 Baker Street', html.replace('Sourdough at dawn.', 'Sourdough baked at dawn.'))).toBeUndefined();
    // A reveal a scroll listener undoes as the section leaves the screen is still read revealed: a visitor saw it.
    const scrolled = pageOf(
      `<style>.r{opacity:0;transition:opacity .4s}.r.on{opacity:1}</style><p>Top</p><div style="height:1600px"></div><p class="r">Scroll text</p><div style="height:1600px"></div><script>addEventListener('scroll',()=>document.querySelectorAll('.r').forEach((e)=>{const b=e.getBoundingClientRect();e.classList.toggle('on',b.top<innerHeight&&b.bottom>0)}))</script>`,
    );
    expect((await offer(scrolled)).offered).toEqual(['T', 'Top', 'Scroll text']);
  }, 60_000);

  it('script-made text is not offered, and must read the same after the write: a script that rewrites other text from the edited line refuses it', async () => {
    // A table of contents a script builds from the headings shows each heading twice: those lines are not offered.
    const toc = pageOf('<nav id="toc"></nav><h2>Bread</h2><p>Baked daily.</p><script>for (const h of document.querySelectorAll("h2")) { const a = document.createElement("a"); a.href = "#"; a.textContent = h.textContent; document.getElementById("toc").append(a); }</script>');
    expect(await offer(toc)).toMatchObject({ offered: ['T', 'Baked daily.'], why: { Bread: 'copied' } });
    // A reading-time line a script writes from the article: changing the article changes it, so the write is refused.
    const time = pageOf('<p id="rt"></p><article><p>Short.</p></article><script>const n = document.querySelector("article").textContent.trim().split(/\\s+/).length; document.getElementById("rt").textContent = n + (n === 1 ? " word" : " words");</script>');
    expect((await offer(time)).offered).toEqual(['T', 'Short.']);
    expect((await check(time, 'T\nShort and sweet.', time.replace('<p>Short.</p>', '<p>Short and sweet.</p>')))?.problem).toMatch(/^byway could not put line 2 on this page exactly as you wrote it, because other text on this page, not one of your lines, would change \(as when a script on the page writes it from your lines\): it would show "3 words.*", where it showed "1 word/);
    // A clock, a counter and a random pick read the same each time (a stopped clock, a seeded Math.random).
    const live = pageOf('<p>Now: <span id="c"></span></p><p>Served <span id="n">0</span>+ loaves</p><p id="q"></p><p>Plain</p><script>setInterval(() => { document.getElementById("c").textContent = new Date().toISOString(); }, 1000); let v = 0; const t = setInterval(() => { v += 100; document.getElementById("n").textContent = v; if (v >= 2500) clearInterval(t); }, 30); document.getElementById("q").textContent = ["Alpha", "Beta", "Gamma"][Math.floor(Math.random() * 3)];</script>');
    const a = await chromium.shownText(live, none);
    const b = await chromium.shownText(live.replace('<p>Plain</p>', '<p>Plain and tall</p><div style="height:9000px"></div>'), none);
    expect(a.text.split('\n').slice(0, 3)).toEqual(b.text.split('\n').slice(0, 3));
    expect(a.text).toMatch(/^Now: 2026-01-01T12:00:\d\d\.\d{3}Z\nServed 2500\+ loaves\n\w+\nPlain$/);
    // The counter's line reads otherwise than its source (a script wrote it), so it is not offered; the rest can be written.
    const { offered, why } = await offer(live);
    expect(offered).toEqual(['T', 'Now:', 'Plain']);
    expect(why).toEqual({ 'Served 0+ loaves': 'changed' });
    expect(await check(live, 'T\nNow:\nPlain text', live.replace('<p>Plain</p>', '<p>Plain text</p>'))).toBeUndefined();
  }, 60_000);

  it('an item that keeps moving (an endless pulse, a tween that settles later than its neighbour) is judged beside its neighbour where both stand: at the read\'s last instant, or at one sample (r11 verifier)', async () => {
    const PULSE = '<style>@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}.pulse{display:inline-block;animation:pulse 2s ease-in-out infinite}</style>';
    // Round 9's reproduction with a pulsing link: round 11 read the link and its static neighbour as apart across boxes,
    // measured at different samples, and stored "Sign intoday".
    const signin = pageOf(`${PULSE}<p style="${FLEX};justify-content:center">Already have an account? <a class="pulse" href="/login" style="margin-left:4px">Sign in</a></p>`);
    expect((await offer(signin)).offered).toEqual(['T', 'Already have an account? [Sign in]']);
    expect((await check(signin, 'T\nAlready have an account? [Sign in] today', signin.replace('</a></p>', '</a> today</p>')))?.problem).toMatch(/because a browser would run words together that your lines keep apart: it would show ".*Sign intoday"/);
    // A price that pulses beside words the row shows glued to it: the line is not offered (round 11 offered it).
    const price = pageOf(`${PULSE}<p style="display:flex;align-items:baseline;font-size:24px">From <strong class="pulse">$29</strong></p><p>Plain</p>`);
    expect(await offer(price)).toMatchObject({ offered: ['T', 'Plain'], why: { 'From $29': 'layout' } });
    // Words a script tweens into place one after another, as GSAP's stagger does, each settling at another sample.
    const stagger = (row: string) =>
      pageOf(
        `${row}<script>const els=[...document.querySelectorAll('.w')];const t0=performance.now();const tick=()=>{const t=performance.now()-t0;let done=true;els.forEach((e,i)=>{const p=Math.min(1,Math.max(0,(t-i*800)/1200));if(p<1)done=false;e.style.opacity=String(p);e.style.transform='translateY('+40*(1-p)+'px)';});if(!done)requestAnimationFrame(tick);};tick();</script>`,
      );
    const order = stagger('<h2 style="display:flex;font-size:40px"><span class="w">Order</span><span class="w">now</span></h2>');
    expect((await offer(order)).offered).toEqual(['T', 'Ordernow']);
    expect((await check(order, 'T\nOrder now', order.replace('>Order<', '>Order <')))?.problem).toMatch(/because a browser would run words together that your lines keep apart: it would show "Ordernow"/);
    const month = stagger('<p style="display:flex;align-items:baseline;font-size:24px"><strong class="w">$29</strong><span class="w">/month</span></p>');
    expect((await check(month, 'T\n$29/month billed yearly', month.replace('/month</span></p>', '/month</span> billed yearly</p>')))?.problem).toMatch(/because a browser would run words together that your lines keep apart: it would show ".*\/monthbilled yearly"/);
    // The tweened page reads the same every time: written back unchanged, it is let through.
    expect(await check(month, 'T\n$29/month', month)).toBeUndefined();
    // Words a scroll script shows one after another and hides again as the visitor scrolls back up are not shown at
    // the read's last instant: they are set beside their neighbour where both stood at one sample.
    const mirror = pageOf(
      `<div style="height:1600px"></div><p class="row" style="display:flex;align-items:baseline;font-size:24px"><span class="w" style="opacity:0">$29</span><span class="w" style="opacity:0">/month</span></p><div style="height:1600px"></div><script>const row=document.querySelector('.row');const ws=[...row.querySelectorAll('.w')];let shown=false;addEventListener('scroll',()=>{const r=row.getBoundingClientRect();const inView=r.top<innerHeight&&r.bottom>0;if(inView&&!shown){shown=true;ws.forEach((w,i)=>setTimeout(()=>{w.style.opacity='1';},i*600));}if(!inView&&shown){shown=false;ws.forEach((w)=>{w.style.opacity='0';});}});</script>`,
    );
    expect((await offer(mirror)).offered).toEqual(['T', '$29/month']);
    // Round 11 read "$29" and "/month", shown 0.6 s apart, as apart across boxes, so it let through a space typed
    // between them, which the flex item's edge drops.
    expect((await check(mirror, 'T\n$29 /month', mirror.replace('>$29<', '>$29 <')))?.problem).toMatch(/because a browser would run words together that your lines keep apart: it would show "\$29\/month"/);
    // Testimonials a script fades in turn, stacked in one place, never stand on the screen together: a slide made
    // shorter is written (round 12's first fix read them from where each stood, the next slide's first letter before
    // the last one's end, and refused "I" as words run together with the next slide).
    const fade = pageOf(
      '<style>.car{position:relative;height:60px;width:600px}.s{position:absolute;left:0;top:0;margin:0;opacity:0;transition:opacity .5s}.s.on{opacity:1}</style><h2>What people say</h2><div class="car"><p class="s on">Great bread every day</p><p class="s">Best coffee in town</p><p class="s">Friendly staff</p></div><p>After</p><script>const ss=[...document.querySelectorAll(".s")];let k=0;setInterval(()=>{ss[k].classList.remove("on");k=(k+1)%ss.length;ss[k].classList.add("on");},2000);</script>',
    );
    expect((await offer(fade)).offered).toEqual(['T', 'What people say', 'Great bread every day', 'Best coffee in town', 'Friendly staff', 'After']);
    expect(await check(fade, 'T\nWhat people say\nI\nBest coffee in town\nFriendly staff\nAfter', fade.replace('Great bread every day', 'I'))).toBeUndefined();
    expect(await check(fade, 'T\nWhat people say\nGreat bread every day\nB\nFriendly staff\nAfter', fade.replace('Best coffee in town', 'B'))).toBeUndefined();
  }, 60_000);

  it('vertical and turned text is judged along its own line; where the read cannot measure it, a box\'s edge never stands for a space: such a line is not offered, and a space typed there is refused, saying why (r12 verifier)', async () => {
    // A side label turned a quarter turn: its flex items glued, so a typed space a new item's edge drops is refused, and
    // the label written back as it was is let through.
    const side = pageOf('<div style="position:absolute;left:0;top:200px;transform:rotate(-90deg);transform-origin:left top;display:flex"><span>Scroll</span><a href="/more">down</a></div><p style="margin-left:80px">Body</p>');
    expect((await offer(side)).offered).toEqual(['T', 'Scroll[down]', 'Body']);
    expect((await check(side, 'T\nScroll[down] now\nBody', side.replace('</a></div>', '</a> now</div>')))?.problem).toMatch(/because a browser would run words together that your lines keep apart: it would show "Scrolldownnow/);
    expect(await check(side, 'T\nScroll[down]now\nBody', side.replace('</a></div>', '</a>now</div>'))).toBeUndefined();
    // Deleting the line between two side labels turned a quarter turn in one column, sections apart, is let through: the
    // two are not one line, so not read in another order (round 13's first form refused deleting a ticker so).
    const labels = pageOf('<div style="position:absolute;left:20px;top:300px;transform:rotate(-90deg);transform-origin:left top">Since 2011</div><p style="margin:400px 0 0 80px">Oysters are back</p><div style="position:absolute;left:20px;top:900px;transform:rotate(-90deg);transform-origin:left top">01 Menu</div>');
    expect((await offer(labels)).offered).toEqual(['T', 'Since 2011', 'Oysters are back', '01 Menu']);
    expect(await check(labels, 'T\nSince 2011\n\n01 Menu', labels.replace('Oysters are back', ''))).toBeUndefined();
    // Turned near an eighth of a turn, the read cannot solve a character's own box: two flex items there are read glued,
    // marked as not measured, so a line with a space between them is not offered, and a space typed at such an edge is
    // refused with that reason.
    const eighth = pageOf('<div style="transform:rotate(-45deg);display:flex;gap:6px;width:400px;margin:150px"><span>Fresh bread</span> <b>daily</b></div><div style="transform:rotate(-45deg);display:flex;width:400px;margin:150px"><span>Hot</span><b>coffee</b></div>');
    expect(await offer(eighth)).toMatchObject({ offered: ['T', 'Hotcoffee'], why: { 'Fresh bread daily': 'turned' } });
    expect((await check(eighth, 'T\nHotcoffee now', eighth.replace('coffee</b></div>', 'coffee</b> now</div>')))?.problem).toMatch(/because a browser shows the words there turned in a way byway cannot measure \(near an eighth of a turn, or in 3D\), so it cannot tell whether they would stand apart as your lines have them: it would show ".* \/ Hotcoffeenow"/);
  }, 60_000);

  it('neighbours across a box\'s edge offset across their line: a line with a space between two that meet is not offered, a space typed there is refused saying why, and a line a visitor reads in the other order is not offered (r13 verifier)', async () => {
    const stagger = pageOf('<h1 style="display:flex;align-items:flex-start;font:40px Arial"><span>Bake</span> <span style="margin-top:24px">better</span> <span>bread</span></h1><p>We bake every morning.</p>');
    expect(await offer(stagger)).toMatchObject({ offered: ['T', 'We bake every morning.'], why: { 'Bake better bread': 'offset' } });
    // A link lowered beside the words before it: round 12 and 13 stored " today" after it, which a visitor sees as
    // "Sign intoday" (placement puts it in a new flex item, whose leading space a browser drops).
    const lowered = pageOf('<p style="display:flex;align-items:flex-start;font:20px Arial"><span>Already have an account?</span><a href="/l" style="position:relative;top:14px">Sign in</a></p>');
    expect((await offer(lowered)).offered).toEqual(['T', 'Already have an account?[Sign in]']);
    expect((await check(lowered, 'T\nAlready have an account?[Sign in] today', lowered.replace('</a></p>', '</a> today</p>')))?.problem).toMatch(/because a browser shows the words there offset from each other across their line \(one raised or lowered beside the next, at the edge of a box\), so it cannot tell whether they would stand apart as your lines have them: it would show ".*Sign intoday"/);
    expect(await check(lowered, 'T\nAlready have an account?[Sign in]today', lowered.replace('</a></p>', '</a>today</p>'))).toBeUndefined();
    // The second before the first along the line (round 12 and 13 stored "Fresh rye", which a visitor reads "rye Fresh").
    const reversed = pageOf('<p style="display:flex;flex-direction:row-reverse;justify-content:flex-end;align-items:flex-start;gap:6px;font:20px Arial"><span>Fresh</span> <span style="margin-top:14px">bread</span></p>');
    expect(await offer(reversed)).toMatchObject({ offered: ['T'], why: { 'Fresh bread': 'layout' } });
  }, 60_000);

  it('a card a 3D transform leaves flat (AOS\'s flip at rest) is offered and written; a box turned in 3D that hides its overflow is named as turned in a way byway cannot measure, not as hidden from sight (r13 verifier)', async () => {
    const card = (tf: string) => pageOf(`<div style="transform:${tf};overflow:hidden;width:400px;padding:16px"><h3>Fresh bread</h3><p>Baked every morning.</p></div><p>Outside line.</p>`);
    const flat = card('perspective(2500px) rotateY(0)');
    expect((await offer(flat)).offered).toEqual(['T', 'Fresh bread', 'Baked every morning.', 'Outside line.']);
    expect(await check(flat, 'T\nFresh bread\nBaked every single morning.\nOutside line.', flat.replace('Baked every morning.', 'Baked every single morning.'))).toBeUndefined();
    // Round 13 named the flat card's lines "hidden from sight (for screen readers, moved out of view, or until a visitor
    // opens it)"; where the box is truly turned in 3D, where it cuts cannot be told, and the prompt says so.
    expect(await offer(card('perspective(400px) rotateY(30deg)'))).toMatchObject({ offered: ['T', 'Outside line.'], why: { 'Fresh bread': 'turned-cut', 'Baked every morning.': 'turned-cut' } });
  }, 60_000);

  it('right-to-left pages: native digits, numbers, Latin names and left-to-right boxes read in the order a visitor reads them (r11 verifier)', async () => {
    const html = pageOf(
      [
        '<main dir="rtl" lang="ar">',
        '<h1>مخبز النور</h1>',
        '<p>افتتحنا المخبز عام ١٩٩٨ في القاهرة</p>',
        '<p>اتصل بنا: ٠١٢٣٤٥ أو ٢٫٥ كيلو</p>',
        '<p>اتصل بنا على 0123 456 789</p>',
        '<p>قهوة Blue Bottle المختصة</p>',
        '<div style="display:flex;justify-content:space-between;width:400px"><span>Cold brew</span><span>3.5 JOD</span></div>',
        '</main>',
        '<div dir="rtl" lang="he"><p>פתוח: א׳–ו׳, 7:00–14:00</p></div>',
      ].join(''),
    );
    const { offered, why } = await offer(html);
    // Round 11 read Arabic-Indic digits as right-to-left letters, and two left-to-right runs or boxes of a right-to-left
    // paragraph in the visual order, so it offered none of these but the heading.
    expect(why).toEqual({});
    expect(offered).toEqual(['T', 'مخبز النور', 'افتتحنا المخبز عام ١٩٩٨ في القاهرة', 'اتصل بنا: ٠١٢٣٤٥ أو ٢٫٥ كيلو', 'اتصل بنا على 0123 456 789', 'قهوة Blue Bottle المختصة', 'Cold brew3.5 JOD', 'פתוח: א׳–ו׳, 7:00–14:00']);
    const answer = (k: number, line: string) => offered.map((x, i) => (i === k ? line : x)).join('\n');
    expect(await check(html, answer(2, 'افتتحنا المخبز عام ١٩٩٨ في الإسكندرية'), html.replace('القاهرة', 'الإسكندرية'))).toBeUndefined();
    expect(await check(html, answer(6, 'Iced brew3.5 JOD'), html.replace('Cold', 'Iced'))).toBeUndefined();
    expect(await check(html, answer(4, 'اتصل بنا على 0123 456 790'), html.replace('789', '790'))).toBeUndefined();
    // Where a run of one direction meets a run of the other, the two characters side by side in the text stand at the
    // runs' far ends: a visitor sees the runs glued or apart by where the runs meet (round 12's evidence: the arbiter
    // measured the two characters, a number's width apart, so it refused "الآن١٩٩٨" glued as a space not typed, and let
    // a typed space a flex item's edge drops stand as apart).
    const date = pageOf('<p dir="rtl" lang="ar">مفتوح الآن ١٩٩٨ دائما</p><p>Plain</p>');
    expect(await check(date, 'T\nمفتوح الآن١٩٩٨ دائما\nPlain', date.replace('الآن ١٩٩٨', 'الآن١٩٩٨'))).toBeUndefined();
    const price = pageOf('<p dir="rtl" lang="ar" style="display:flex;justify-content:flex-start;font-size:24px"><span>السعر</span><span>$20</span></p><p>Plain</p>');
    expect((await offer(price)).offered).toEqual(['T', 'السعر$20', 'Plain']);
    expect((await check(price, 'T\nالسعر $20\nPlain', price.replace('السعر</span>', 'السعر </span>')))?.problem).toMatch(/because a browser would run words together that your lines keep apart/);
    const latin = pageOf('<p>Order <bdi>שלום</bdi> today</p><p>Plain</p>');
    expect(await check(latin, 'T\nOrder שלום tomorrow\nPlain', latin.replace('today', 'tomorrow'))).toBeUndefined();
    expect((await check(latin, 'T\nOrderשלום today\nPlain', latin.replace('Order <bdi>', 'Order<bdi>')))).toBeUndefined();
    // A link marked dir="ltr" (an isolate) in a right-to-left paragraph runs in its own direction: its phone number's
    // groups and its plus sign are one left-to-right run, apart from the words around it (round 12's evidence, the
    // round-11 verifier's Arabic café page: "!" or " too" after the number, or new words before it, were refused).
    const phone = pageOf('<main dir="rtl" lang="ar"><p>هاتف: <a href="tel:+96265000000" dir="ltr">+962 6 500 0000</a></p><p>شكرا</p></main>');
    expect((await offer(phone)).offered).toEqual(['T', 'هاتف: [+962 6 500 0000]', 'شكرا']);
    expect(await check(phone, 'T\nهاتف: [+962 6 500 0000] too\nشكرا', phone.replace('</a></p>', '</a> too</p>'))).toBeUndefined();
    expect(await check(phone, 'T\nهاتف: [+962 6 500 0000]!\nشكرا', phone.replace('</a></p>', '</a>!</p>'))).toBeUndefined();
    expect(await check(phone, 'T\nfresh words [Go now]\nشكرا', phone.replace('هاتف: ', 'fresh words ').replace('+962 6 500 0000', 'Go now'))).toBeUndefined();
    expect((await check(phone, 'T\nهاتف: [+962 6 500 0000]too\nشكرا', phone.replace('</a></p>', '</a> too</p>')))?.problem).toMatch(/a space that your lines do not have/);
    // Brackets and punctuation beside a number in a right-to-left paragraph resolve as the bidi algorithm resolves them
    // (a number counts as right to left there), and where a right-to-left text meets other text a visitor sees a space
    // exactly where whitespace between the two shows (round 12's evidence: "(soon)" beside Arabic-Indic digits was
    // read as "( soon)", and "today!" before a number as "today !", each refused as a space not typed).
    const soon = pageOf('<p dir="rtl" lang="ar">٩ ٠١٢٣ طازج.</p><p dir="rtl" lang="ar">طازج عام ٩ ٢٠٢٥</p><p>Plain</p>');
    expect((await offer(soon)).offered).toEqual(['T', '٩ ٠١٢٣ طازج.', 'طازج عام ٩ ٢٠٢٥', 'Plain']);
    expect(await check(soon, 'T\n٩ (soon) طازج.\nطازج عام ٩ ٢٠٢٥\nPlain', soon.replace('٩ ٠١٢٣ طازج.', '٩ (soon) طازج.'))).toBeUndefined();
    expect(await check(soon, 'T\n٩ ٠١٢٣ طازج.\nطازج today! ٩ ٢٠٢٥\nPlain', soon.replace('طازج عام', 'طازج today!'))).toBeUndefined();
    expect((await check(soon, 'T\n٩ (soon) طازج.\nطازج عام ٩ ٢٠٢٥\nPlain', soon.replace('٩ ٠١٢٣ طازج.', '٩ ( soon) طازج.')))?.problem).toMatch(/a space that your lines do not have/);
    // A left-to-right word a script reverses in a left-to-right page is still in another order.
    const ltr = pageOf('<p><bdo dir="rtl">Hello world</bdo> after</p><p>Plain</p>');
    expect(await offer(ltr)).toMatchObject({ offered: ['T', 'Plain'], why: { 'Hello world after': 'layout' } });
  }, 60_000);
});

describe('the reader\'s model of a browser (the fake renderer the e2e scenarios use)', () => {
  it('places the lines of a plain page as Chromium does', async () => {
    const html = pageOf('<h1>Hello <b>world</b></h1><nav><a href="/a">A</a><a href="/b">B</a></nav><p>Read <a href="/t">terms</a>.</p>');
    const real = await locateLines(chromium, none, html);
    const model = await locateLines({ ...chromium, shownText: async (h) => modelShownText(h) }, none, html);
    expect([...model.spans.keys()]).toEqual([...real.spans.keys()]);
  }, 60_000);
});
