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
import { chromiumLaunchOptions, playwrightPages } from '../src/pages.ts';
import { modelShownText } from './helpers/fake-pages.ts';

const chromium = playwrightPages();
afterAll(() => chromium.close(), 60_000);
const none = async () => undefined;
/** Chromium's own local-network checks would also stop a page reaching 127.0.0.1; off, so only byway's rule is tested. */
const LOCAL_NETWORK_CHECKS_OFF = ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests'];
/** Test-only: the stated launch with flags added in test code (as pages.test.ts does). */
async function launchWith(extra: readonly string[]): Promise<Browser> {
  const { chromium: c } = await import('playwright');
  const opts = chromiumLaunchOptions();
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
      ['Closed', 'not shown'],
      ['Styled away', 'not shown'],
      ['X', 'body'],
      ['Tip', 'not shown'],
      ['shown', 'body'],
      ['After', 'body'],
    ]);
    expect(deckLines(readPageCopy(html, notShown(html, loc)))).toEqual(['T', 'More', 'X', 'shown', 'After']);
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
      'byway could not put line 3 on this page exactly as you wrote it, because a browser would show on separate lines what it showed on one line: it would show "Sourdough / loaf / $10". Change line 3 again, or leave it as it was offered.',
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

  it('filter: opacity(0), opacity just above 0 and clip-path shapes with no area hide text from sight (r10)', async () => {
    const html = pageOf(
      [
        '<p>Rated 4.5<span style="filter:opacity(0)"> out of 5</span> stars</p>',
        '<p>Sale<span style="opacity:0.01"> ends</span> today</p>',
        '<p>Call<span style="position:absolute;clip-path:circle(0)"> us</span> now</p>',
        '<p>Open<span style="display:inline-block;clip-path:polygon(0 0, 0 0, 0 0)"> late</span> daily</p>',
        '<p>Order <span style="opacity:0.01"></span>today</p>',
      ].join(''),
    );
    const { offered, why, loc } = await offer(html);
    expect(offered).toEqual(['T', 'Order today']);
    expect(why).toEqual({ 'Rated 4.5 out of 5 stars': 'part-hidden', 'Sale ends today': 'part-hidden', 'Call us now': 'part-hidden', 'Open late daily': 'part-hidden' });
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
});

describe('the reader\'s model of a browser (the fake renderer the e2e scenarios use)', () => {
  it('places the lines of a plain page as Chromium does', async () => {
    const html = pageOf('<h1>Hello <b>world</b></h1><nav><a href="/a">A</a><a href="/b">B</a></nav><p>Read <a href="/t">terms</a>.</p>');
    const real = await locateLines(chromium, none, html);
    const model = await locateLines({ ...chromium, shownText: async (h) => modelShownText(h) }, none, html);
    expect([...model.spans.keys()]).toEqual([...real.spans.keys()]);
  }, 60_000);
});
