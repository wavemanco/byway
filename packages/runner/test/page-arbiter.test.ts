/**
 * VOICE's browser arbiter on its own (F07, ADR-0081), against the runner's real Chromium: where each deck line shows,
 * which lines are offered, and the check of a written page, including pages no placement would write (a simulated
 * placement fault), so the arbiter is shown to refuse whatever wrote them.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { deckLines, readPageCopy, readPageEdit, type PageEdit } from '../src/copy.ts';
import { arbitrate, expectedShown, locateLines, markLines, notShown, type Location } from '../src/page-arbiter.ts';
import { playwrightPages } from '../src/pages.ts';
import { modelShownText } from './helpers/fake-pages.ts';

const chromium = playwrightPages();
afterAll(() => chromium.close(), 60_000);
const none = async () => undefined;

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
    expect((await check(html, 'T\nHello\nbig one\nworld', pageOf('<p>Hello</p><p>big</p><p>one</p><p>world</p>')))?.problem).toMatch(/^byway could not put line 3 on this page exactly as you wrote it, because a browser would break a line where your lines have a space: it would show "Hello \/ big \/ one \/ world"/);
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

  it('a table cell\'s boundary is its own kind of gap: line breaks beside it are a block\'s edge inside the cell (r8)', async () => {
    // Chromium shows "Name\nNote\t$9": deleting "Note" leaves "Name\n\t$9" expected, and the cell boundary is what parts
    // "Name" from "$9" in both (round 7 read the tab as a space and refused this write).
    const html = pageOf('<table><tr><td>Name<br>Note</td><td>$9</td></tr></table>');
    expect(await check(html, 'T\nName\n\n$9', pageOf('<table><tr><td>Name</td><td>$9</td></tr></table>'))).toBeUndefined();
    const desc = pageOf('<table><tr><td><strong>Sourdough</strong><p>Our classic loaf</p></td><td>$9</td></tr></table>');
    expect(await check(desc, 'T\nSourdough\n\n$9', pageOf('<table><tr><td><strong>Sourdough</strong></td><td>$9</td></tr></table>'))).toBeUndefined();
    const first = pageOf('<table><tr><td>$9</td><td><h3>Plan</h3>For teams</td></tr></table>');
    expect(await check(first, 'T\n$9\n\nFor teams', pageOf('<table><tr><td>$9</td><td>For teams</td></tr></table>'))).toBeUndefined();
    // But a cell boundary is never a space or a line break: words moved into one cell, or split over two, are refused.
    expect(await check(html, 'T\nName\n\n$9', pageOf('<table><tr><td>Name $9</td><td></td></tr></table>'))).toEqual({
      line: 3,
      problem: 'byway could not put line 3 on this page exactly as you wrote it, because a browser would show in one table cell what it showed in separate cells: it would show "Name $9". Change line 3 again, or leave it as it was offered.',
    });
    const one = pageOf('<table><tr><td>Sourdough loaf</td><td>$9</td></tr></table>');
    expect((await check(one, 'T\nSourdough loaf\n$10', pageOf('<table><tr><td>Sourdough</td><td>loaf</td><td>$10</td></tr></table>')))?.problem).toBe(
      'byway could not put line 3 on this page exactly as you wrote it, because a browser would show in separate table cells what it showed in one: it would show "Sourdough | loaf | $10". Change line 3 again, or leave it as it was offered.',
    );
    expect((await check(one, 'T\nSourdough loaf\n$10', pageOf('<table><tr><td>Sourdough loaf</td><td></td><td>$10</td></tr></table>')))?.problem).toBe(
      'byway could not put line 3 on this page exactly as you wrote it, because a browser would show another number of table cells here: it would show "Sourdough loaf | | $10". Change line 3 again, or leave it as it was offered.',
    );
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

describe('the reader\'s model of a browser (the fake renderer the e2e scenarios use)', () => {
  it('places the lines of a plain page as Chromium does', async () => {
    const html = pageOf('<h1>Hello <b>world</b></h1><nav><a href="/a">A</a><a href="/b">B</a></nav><p>Read <a href="/t">terms</a>.</p>');
    const real = await locateLines(chromium, none, html);
    const model = await locateLines({ ...chromium, shownText: async (h) => modelShownText(h) }, none, html);
    expect([...model.spans.keys()]).toEqual([...real.spans.keys()]);
  }, 60_000);
});
