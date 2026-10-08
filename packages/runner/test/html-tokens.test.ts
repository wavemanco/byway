/**
 * The page tokenizer reads a page as a browser's tokenizer does where that decides what is copy (F07, ADR-0081): tag
 * ends, comments, raw text and RCDATA, CDATA in svg and math, plaintext. Each case is the token list a browser makes.
 */
import { describe, expect, it } from 'vitest';
import { demoPage } from './helpers/demo-page.ts';
import { attributesOf, decodeText, tokenize, type Token } from '../src/html-tokens.ts';

const toks = (h: string) => tokenize(h).map((t) => (t.kind === 'tag' ? `${t.closing ? '/' : ''}${t.name}` : `${t.kind}:${t.raw}`));

/** The tokenizer as it was at b33f1285 (a regex that ends a tag at the first ">"), kept to compare real pages with. */
function legacyTokenize(html: string): Token[] {
  const out: Token[] = [];
  const re = /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>|[^<]+|</g;
  let rawUntil: string | undefined;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[0];
    if (rawUntil) {
      const close = html.toLowerCase().indexOf(`</${rawUntil}`, m.index);
      const end = close < 0 ? html.length : close;
      if (end > m.index) out.push({ kind: 'other', raw: html.slice(m.index, end) });
      re.lastIndex = end;
      rawUntil = undefined;
      continue;
    }
    if (m[1]) {
      const name = m[1].toLowerCase();
      const closing = raw.startsWith('</');
      out.push({ kind: 'tag', raw, name, closing });
      if (!closing && ['script', 'style', 'noscript', 'template', 'textarea'].includes(name) && !raw.endsWith('/>')) rawUntil = name;
    } else if (raw.startsWith('<!') || raw === '<') out.push(raw === '<' ? { kind: 'text', raw } : { kind: 'other', raw });
    else out.push({ kind: 'text', raw });
  }
  return out;
}

describe('the page tokenizer (F07)', () => {
  it('ends a tag where a browser does: a ">" inside a quoted value does not end it (the old regex did)', () => {
    expect(toks('<a title="a > b" href="/x">L</a>')).toEqual(['a', 'text:L', '/a']);
    expect(legacyTokenize('<a title="a > b" href="/x">L</a>').map((t) => (t.kind === 'text' ? `text:${t.raw}` : t.kind))).toEqual(['tag', 'text: b" href="/x">L', 'tag']);
    expect(toks("<a aria-label='Next >' href='/n'>page</a>")).toEqual(['a', 'text:page', '/a']);
  });

  it('stray quotes, an unterminated tag, comment forms, "<" as text, end-tag attributes', () => {
    expect(toks('<a href=x"y>L</a>')).toEqual(['a', 'text:L', '/a']);
    expect(toks('<a "b>L</a>')).toEqual(['a', 'text:L', '/a']);
    expect(toks('<p>A</p><a title="x>')).toEqual(['p', 'text:A', '/p', 'other:<a title="x>']);
    expect(toks('<!--a > b-->x<!-->y<!--->z<!--c--!>w')).toEqual(['other:<!--a > b-->', 'text:x', 'other:<!-->', 'text:y', 'other:<!--->', 'text:z', 'other:<!--c--!>', 'text:w']);
    expect(toks('a < b <3 c</p>')).toEqual(['text:a < b <3 c', '/p']);
    expect(toks('<p>a</p title=">">b')).toEqual(['p', 'text:a', '/p', 'text:b']);
    expect(toks('x</>y</ z>w')).toEqual(['text:x', 'other:</>', 'text:y', 'other:</ z>', 'text:w']);
  });

  it('raw text and RCDATA: textarea with "/>", title, plaintext, CDATA inside and outside svg', () => {
    expect(toks('<title>A <b>x</b></title><p>B</p>')).toEqual(['title', 'text:A <b>x</b>', '/title', 'p', 'text:B', '/p']);
    expect(toks('<svg><text><![CDATA[a > b]]></text></svg><p>C</p>')).toEqual(['svg', 'text', 'other:<![CDATA[a > b]]>', '/text', '/svg', 'p', 'text:C', '/p']);
    expect(toks('<p>A<![CDATA[x>y]]></p>')).toEqual(['p', 'text:A', 'other:<![CDATA[x>', 'text:y]]>', '/p']);
    expect(toks('<textarea/><p>not a tag</p></textarea><p>D</p>')).toEqual(['textarea', 'other:<p>not a tag</p>', '/textarea', 'p', 'text:D', '/p']);
    expect(toks('<p>A</p><plaintext><p>B</p>')).toEqual(['p', 'text:A', '/p', 'plaintext', 'other:<p>B</p>']);
    expect(toks('<iframe src="/m"><p>No maps</p></iframe><xmp><b>x</b></xmp>')).toEqual(['iframe', 'other:<p>No maps</p>', '/iframe', 'xmp', 'other:<b>x</b>', '/xmp']);
    expect(toks('<style>a</style  ><p>x</p>')).toEqual(['style', 'other:a', '/style', 'p', 'text:x', '/p']);
  });

  it('a script follows the script data escapes: "</script>" inside an escaped "<script" string does not end it', () => {
    const script = '<script><!-- document.write("<script>x()</script>"); --></script><p>After</p>';
    expect(toks(script)).toEqual(['script', 'other:<!-- document.write("<script>x()</script>"); -->', '/script', 'p', 'text:After', '/p']);
    expect(toks('<script>if (a<!--b) go()</script><p>x</p>')).toEqual(['script', 'other:if (a<!--b) go()', '/script', 'p', 'text:x', '/p']);
    expect(toks('<script>a = "</script>"</script>')).toEqual(['script', 'other:a = "', '/script', 'text:"', '/script']);
  });

  it('reads attributes with the same scanner, values decoded', () => {
    expect(attributesOf('<a title="a > b" href="/x?a=1&amp;b=2" hidden data-x=y>')).toEqual([
      { name: 'title', value: 'a > b' },
      { name: 'href', value: '/x?a=1&b=2' },
      { name: 'hidden', value: '' },
      { name: 'data-x', value: 'y' },
    ]);
  });

  it('decodes references as browsers do: total, U+FFFD out of range, legacy names without ";"', () => {
    expect(decodeText('A &#99999999; B &#xD800; C &#x110000; &eacute; &copy 2026 &amp;')).toBe('A � B � C � é © 2026 &');
  });

  it('the C1 demo page tokenizes exactly as before', () => {
    const html = demoPage();
    expect(tokenize(html)).toEqual(legacyTokenize(html));
  });
});
