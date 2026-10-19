// Round-12 verifier's visitor oracle (written apart from pages.ts / page-arbiter.ts and from the round-11 verifier's
// oracle12 / the implementer's harness). A different model of "what a visitor sees":
//  - the page runs on the REAL clock, with the page's own IntersectionObserver and requestAnimationFrame, prefers-reduced-
//    motion as asked (default: no-preference, as most visitors), scrolled slowly in 400 px steps, then back to the top;
//  - a character is SEEN if it was visible (style ink, clip, offset checks of my own) while inside the viewport at any
//    step, or at the final instant;
//  - glue is decided by VISUAL WORDS: at the final instant, every visible character's box is put in a plane; two
//    characters on one row (vertical overlap >= half the smaller height) whose boxes are no more than 0.15 of the
//    smaller font size apart (or overlap) are joined; a visual word is a connected component. Two neighbouring
//    characters (document order) are GLUED iff they lie in one visual word, else APART. No structural/flow/bidi rules:
//    reading order and bidi come out of the geometry itself.
//  - a second snapshot 650 ms later tells which pairs move (their relation differs between the two).
import { createRequire } from 'node:module';
const { chromium } = await import('playwright');
void createRequire;

const HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com']);
const ORIGIN = 'http://vo13.localhost';
let browser: any;
async function getBrowser() {
  if (!browser || !browser.isConnected()) browser = await chromium.launch({ headless: true });
  return browser;
}
export async function closeOracle() {
  await browser?.close();
  browser = undefined;
}

const INIT = `(() => {
  let s = 0x1234567; Math.random = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) / 16777216; };
})()`;

// Runs in the page. Returns per text node an id and its characters; every char's state at this instant.
const SNAP = String.raw`(() => {
  const st = window.__vo13 || (window.__vo13 = { ids: new WeakMap(), n: 0 });
  const idOf = (n) => { let v = st.ids.get(n); if (v === undefined) { v = st.n++; st.ids.set(n, v); } return v; };
  const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','TEXTAREA','TITLE','SELECT','OPTION','OPTGROUP','DATALIST']);
  const out = [];
  if (!document.body) return out;
  const cs = new Map();
  const style = (e) => { let s = cs.get(e); if (!s) { s = getComputedStyle(e); cs.set(e, s); } return s; };
  const alphaOf = (c) => { if (!c || c === 'transparent') return 0; let m = /rgba?\(([^)]*)\)/.exec(c); if (m) { const v = m[1].split(/[\s,\/]+/).filter(Boolean); return v.length >= 4 ? (v[3].endsWith('%') ? parseFloat(v[3]) / 100 : parseFloat(v[3])) : 1; } m = /\/\s*([0-9.]+)(%?)\s*\)/.exec(c); if (m) return parseFloat(m[1]) / (m[2] ? 100 : 1); return 1; };
  const opac = (e) => { let o = 1; for (let x = e; x && x.nodeType === 1; x = x.parentElement) { const s = style(x); o *= parseFloat(s.opacity); const f = s.filter; if (f && f !== 'none') for (const m of f.matchAll(/opacity\(\s*([0-9.]+)(%?)\s*\)/g)) o *= parseFloat(m[1]) / (m[2] ? 100 : 1); } return o; };
  const gradientText = (e) => { for (let x = e; x && x.nodeType === 1; x = x.parentElement) { const s = style(x); if (/text/.test((s.backgroundClip || '') + (s.webkitBackgroundClip || ''))) return true; } return false; };
  const inkOf = (e) => {
    const s = style(e);
    if (e instanceof SVGElement) { const f = s.fill; const fa = !f || f === 'none' ? 0 : /url/.test(f) ? 1 : alphaOf(f) * parseFloat(s.fillOpacity || '1'); const sw = parseFloat(s.strokeWidth || '0'); const sa = s.stroke && s.stroke !== 'none' && sw > 0 ? alphaOf(s.stroke) : 0; return Math.max(fa, sa); }
    if (gradientText(e)) return 1;
    if (s.textShadow && s.textShadow !== 'none') return 1;
    const fill = s.webkitTextFillColor || s.color;
    const stroke = parseFloat(s.webkitTextStrokeWidth || '0') > 0 ? alphaOf(s.webkitTextStrokeColor) : 0;
    return Math.max(alphaOf(fill), stroke);
  };
  // The clip rectangle (viewport coords) that applies to content of element e, following containing blocks.
  const clipOf = (e) => {
    let l = -1e9, t = -1e9, r = 1e9, b = 1e9;
    let mode = '';
    const isPos = (s) => s.position !== 'static' || s.transform !== 'none' || s.willChange.includes('transform');
    const isFixCB = (s) => s.transform !== 'none' || (s.filter && s.filter !== 'none') || /paint|layout|strict|content/.test(s.contain || '');
    let x = e;
    let first = true;
    while (x && x !== document.documentElement) {
      const s = style(x);
      const escaped = (mode === 'abs' && !isPos(s)) || (mode === 'fixed' && !isFixCB(s));
      if (!escaped || first) {
        // own clip of x applies to its content (x is e or an ancestor whose clip applies)
        const ox = /hidden|clip/.test(s.overflowX) || /paint|strict|content/.test(s.contain || '');
        const oy = /hidden|clip/.test(s.overflowY) || /paint|strict|content/.test(s.contain || '');
        const disp = s.display;
        if ((ox || oy) && !/^(inline|contents|table-row|table-row-group|table-cell)$/.test(disp) || (x instanceof SVGSVGElement && (ox||oy))) {
          const br = x.getBoundingClientRect();
          const cl = br.left + (x.clientLeft || 0), ct = br.top + (x.clientTop || 0);
          const cw = x instanceof SVGSVGElement ? br.width : x.clientWidth, ch = x instanceof SVGSVGElement ? br.height : x.clientHeight;
          if (ox) { l = Math.max(l, cl); r = Math.min(r, cl + cw); }
          if (oy) { t = Math.max(t, ct); b = Math.min(b, ct + ch); }
        }
        if ((s.position === 'absolute' || s.position === 'fixed') && s.clip && s.clip.startsWith('rect(')) {
          const br = x.getBoundingClientRect();
          const v = s.clip.slice(5, -1).split(/[\s,]+/).filter(Boolean).map((q) => (q === 'auto' ? NaN : parseFloat(q)));
          if (v.length === 4) { t = Math.max(t, br.top + (isNaN(v[0]) ? 0 : v[0])); r = Math.min(r, br.left + (isNaN(v[1]) ? br.width : v[1])); b = Math.min(b, br.top + (isNaN(v[2]) ? br.height : v[2])); l = Math.max(l, br.left + (isNaN(v[3]) ? 0 : v[3])); }
        }
        const cp = s.clipPath;
        if (cp && cp !== 'none') {
          const br = x.getBoundingClientRect();
          let m;
          if ((m = /^inset\(([^)]*)\)/.exec(cp))) {
            const v = m[1].split(/\s+round\s+/)[0].trim().split(/\s+/).map((q) => (q.endsWith('%') ? parseFloat(q) / 100 : parseFloat(q)));
            const [a, bb, c, d] = v.length === 1 ? [v[0], v[0], v[0], v[0]] : v.length === 2 ? [v[0], v[1], v[0], v[1]] : v.length === 3 ? [v[0], v[1], v[2], v[1]] : v;
            const px = (q, whole) => (Math.abs(q) <= 1 && String(q).length && cp.includes('%') ? q * whole : q);
            t = Math.max(t, br.top + px(a, br.height)); r = Math.min(r, br.right - px(bb, br.width)); b = Math.min(b, br.bottom - px(c, br.height)); l = Math.max(l, br.left + px(d, br.width));
          } else if (/^polygon\(/.test(cp)) {
            const pts = cp.slice(8, -1).replace(/^\s*(nonzero|evenodd)\s*,/, '').split(',').map((p) => p.trim().split(/\s+/).map((q) => q.endsWith('%') ? parseFloat(q) / 100 : parseFloat(q)));
            let area = 0; for (let i = 0; i < pts.length; i++) { const p1 = pts[i], p2 = pts[(i + 1) % pts.length]; area += p1[0] * p2[1] - p2[0] * p1[1]; }
            if (Math.abs(area) < 1e-6) { r = l - 1; }
          } else if (/^circle\(\s*0/.test(cp) || /^ellipse\(\s*0/.test(cp)) { r = l - 1; }
        }
      }
      first = false;
      if (s.position === 'fixed') mode = 'fixed';
      else if (s.position === 'absolute' && mode !== 'fixed') mode = 'abs';
      else if (mode === 'abs' && isPos(s)) mode = '';
      else if (mode === 'fixed' && isFixCB(s)) mode = '';
      x = x.parentElement;
    }
    return { l, t, r, b };
  };
  const ellOf = (e) => {
    for (let x = e; x && x !== document.body; x = x.parentElement) {
      const s = style(x);
      if (/^inline/.test(s.display) && s.display !== 'inline-block') continue;
      const clamp = s.webkitLineClamp && s.webkitLineClamp !== 'none';
      if (s.textOverflow === 'ellipsis' && /hidden|clip/.test(s.overflowX) && x.scrollWidth > x.clientWidth + 1) { const br = x.getBoundingClientRect(); return { right: br.left + x.clientLeft + x.clientWidth - parseFloat(s.paddingRight), fs: parseFloat(s.fontSize) }; }
      if (clamp && /hidden|clip/.test(s.overflowY) && x.scrollHeight > x.clientHeight + 1) { const br = x.getBoundingClientRect(); return { right: br.left + x.clientLeft + x.clientWidth - parseFloat(s.paddingRight), fs: parseFloat(s.fontSize), lastRowBottom: br.top + x.clientTop + x.clientHeight - parseFloat(s.paddingBottom), lh: parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2 }; }
      if (!/^inline/.test(s.display)) return null;
    }
    return null;
  };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const r = document.createRange();
  const sx = scrollX, sy = scrollY;
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const p = n.parentElement;
    if (!p) continue;
    let skip = false;
    for (let x = p; x; x = x.parentElement) if (SKIP.has(x.tagName.toUpperCase())) { skip = true; break; }
    if (skip) continue;
    if (!/[^ \t\n\f\r]/.test(n.data)) continue;
    const id = idOf(n);
    const s = style(p);
    const vis = !/hidden|collapse/.test(s.visibility);
    const ink = inkOf(p) * opac(p);
    const fs = parseFloat(s.fontSize) || 16;
    const clip = clipOf(p);
    const ell = ellOf(p);
    const a = p.closest('a[href]');
    const href = a ? a.getAttribute('href') : null;
    // whether this text runs top to bottom on the screen: a vertical writing mode, or a rotation near a quarter turn
    let m = new DOMMatrix();
    for (let x = p; x && x.nodeType === 1; x = x.parentElement) { const tf = style(x).transform; if (tf && tf !== 'none') m = new DOMMatrix(tf).multiply(m); }
    const ang = Math.atan2(m.b, m.a);
    const vertMode = /^(vertical|sideways)/.test(s.writingMode || '');
    const vert = vertMode !== (Math.abs(Math.sin(ang)) > 0.7);
    const chars = [];
    const d = n.data;
    for (let i = 0; i < d.length; ) {
      const cp = d.codePointAt(i);
      const wd = cp > 0xffff ? 2 : 1;
      const c = d.slice(i, i + wd);
      if (!/^[ \t\n\f\r]$/.test(c)) {
        r.setStart(n, i); r.setEnd(n, i + wd);
        const rs = [...r.getClientRects()].filter((q) => q.width > 0 || q.height > 0);
        const q = rs.find((q) => q.width > 0 && q.height > 0) || rs[0] || null;
        let box = null, seen = false, inView = false;
        if (q) {
          box = [q.left + sx, q.top + sy, q.right + sx, q.bottom + sy];
          const cx = (q.left + q.right) / 2, cy = (q.top + q.bottom) / 2;
          inView = cy >= 0 && cy <= innerHeight && cx >= 0 && cx <= innerWidth;
          const inClip = cx >= clip.l && cx <= clip.r && cy >= clip.t && cy <= clip.b && clip.r > clip.l && clip.b > clip.t;
          const onPage = cx + sx >= 0 && cy + sy >= 0;
          let cut = false;
          if (ell) { if (ell.lastRowBottom === undefined ? q.right > ell.right - 0.9 * ell.fs : (q.bottom > ell.lastRowBottom - ell.lh * 0.6 && q.right > ell.right - 1.2 * ell.fs)) cut = true; }
          seen = vis && ink >= 0.1 && fs >= 4 && inClip && onPage && !cut && (q.width >= 1 || /[\p{Mn}\p{Cf}\p{Zs}]/u.test(c));
        }
        chars.push([i, c, box, seen, inView]);
      }
      i += wd;
    }
    out.push({ id, href, fs, vert, chars, laid: n.parentElement.getClientRects().length > 0 });
  }
  return out;
})()`;

const SETTLE = String.raw`(() => { for (const a of document.getAnimations()) { let t = null; try { t = a.effect && a.effect.getComputedTiming(); } catch {} if (t && t.iterations !== Infinity) { try { a.finish(); } catch {} } } return [document.documentElement.scrollHeight, innerHeight]; })()`;

export type VChar = { node: number; i: number; c: string; box: number[] | null; seen: boolean; href: string | null; fs: number; vert: boolean };
export type View = { chars: VChar[]; word: number[]; word2: number[]; text: string; ms: number; title: string; known?: boolean[] };

export async function view(html: string, opts: { motion?: 'reduce' | 'no-preference'; width?: number } = {}): Promise<View> {
  const t0 = Date.now();
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: { width: opts.width ?? 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: opts.motion ?? 'no-preference', serviceWorkers: 'block' });
  try {
    await ctx.addInitScript({ content: INIT });
    await ctx.route('**/*', async (route: any) => {
      const u = new URL(route.request().url());
      if (u.origin === ORIGIN) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      if (u.protocol === 'https:' && HOSTS.has(u.hostname)) return route.continue();
      return route.abort('blockedbyclient');
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(`${ORIGIN}/page`, { waitUntil: 'load', timeout: 30000 });
    await page.evaluate('document.fonts ? document.fonts.ready.then(() => 1) : 1');
    await page.waitForTimeout(1200);
    // seen: per node id and char index, whether ever seen while in view
    const ever = new Map<string, boolean>();
    const note = (snap: any[]) => { for (const n of snap) for (const [i, , , seen, inView] of n.chars) if (seen && inView) ever.set(`${n.id}:${i}`, true); };
    let [h] = (await page.evaluate(SETTLE)) as number[];
    for (let y = 0; y < h + 900 && y < 40000; y += 400) {
      await page.evaluate(`window.scrollTo(0, ${y})`);
      await page.waitForTimeout(140);
      note((await page.evaluate(SNAP)) as any[]);
      [h] = (await page.evaluate(SETTLE)) as number[];
    }
    await page.evaluate('window.scrollTo(0, 0)');
    await page.waitForTimeout(900);
    // a page with timers or animations: watch it on until 8.5 s after load (slides shown in turn)
    if (/setInterval|setTimeout|animation|gsap|swiper|carousel/i.test(html)) {
      const t1 = Date.now();
      while (Date.now() - t1 < 6000) { await page.waitForTimeout(500); note((await page.evaluate(SNAP)) as any[]); }
    }
    await page.evaluate(SETTLE);
    const A = (await page.evaluate(SNAP)) as any[];
    note(A);
    await page.waitForTimeout(650);
    const B = (await page.evaluate(SNAP)) as any[];
    const title = (await page.evaluate('document.title')) as string;
    const chars: VChar[] = [];
    const bBox = new Map<string, number[] | null>();
    for (const n of B) for (const [i, , box] of n.chars) bBox.set(`${n.id}:${i}`, box);
    const boxes2: (number[] | null)[] = [];
    const known: boolean[] = [];
    for (const n of A) {
      for (const [i, c, box, seen] of n.chars) {
        const key = `${n.id}:${i}`;
        const s = !!box && (seen || ever.get(key) === true);
        if (!s) continue;
        chars.push({ node: n.id, i, c, box, seen: true, href: n.href, fs: n.fs, vert: !!n.vert });
        boxes2.push(bBox.get(key) ?? box);
        known.push(!!seen);
      }
    }
    // characters not seen at this instant (seen earlier, as a slide or a section shown and hidden again) stand out of the
    // plane: their relation to their neighbours is unknown (each its own word, and `known` false)
    // characters drawn over other text (not their document neighbours): overlapping ink, whose gaps nobody can read
    {
      const idx = chars.map((_, k) => k).filter((k) => known[k]).sort((a, b) => chars[a]!.box![0]! - chars[b]!.box![0]!);
      const act: number[] = [];
      const over = new Set<number>();
      for (const k of idx) {
        const [l, t, r, b] = chars[k]!.box!;
        for (let j = act.length - 1; j >= 0; j--) if (chars[act[j]!]!.box![2]! <= l) act.splice(j, 1);
        for (const j of act) {
          if (Math.abs(j - k) <= 2) continue;
          const [l2, t2, r2, b2] = chars[j]!.box!;
          const w = Math.min(r, r2) - Math.max(l, l2), h = Math.min(b, b2) - Math.max(t, t2);
          if (w > 0 && h > 0 && w * h > 0.3 * Math.min((r - l) * (b - t), (r2 - l2) * (b2 - t2))) { over.add(k); over.add(j); }
        }
        act.push(k);
      }
      for (const k of over) known[k] = false;
    }
    const far = (b: number[], k: number) => (known[k] ? b : [-1e7 - k * 100, -1e7 - k * 100, -1e7 - k * 100 + 1, -1e7 - k * 100 + 1]);
    const word = words(chars.map((x, k) => far(x.box!, k)), chars.map((x) => x.fs), chars.map((x) => x.c), chars.map((x) => x.vert));
    const word2 = words(boxes2.map((x, k) => far(x ?? chars[k]!.box!, k)), chars.map((x) => x.fs), chars.map((x) => x.c), chars.map((x) => x.vert));
    let text = '';
    chars.forEach((x, k) => { text += (k > 0 && word[k] !== word[k - 1] ? ' ' : '') + x.c; });
    return { chars, word, word2, text, ms: Date.now() - t0, title, known };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

const GLYPHLESS = /^[\p{Zs}\p{Cf}\p{Mn}\p{Me}]$/u;
/** Visual words: union-find of characters on one row no more than 0.15 em apart. Glyphless characters join both sides. */
function words(boxes: number[][], fs: number[], cs: string[], vert: boolean[]): number[] {
  const n = boxes.length;
  const par = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => { while (par[x] !== x) { par[x] = par[par[x]!]!; x = par[x]!; } return x; };
  const join = (a: number, b: number) => { const x = find(a), y = find(b); if (x !== y) par[x] = y; };
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => boxes[a]![0]! - boxes[b]![0]!);
  const active: number[] = [];
  for (const k of order) {
    const [l, t, r, b] = boxes[k]!;
    // prune
    for (let j = active.length - 1; j >= 0; j--) if (boxes[active[j]!]![2]! < l - 24) active.splice(j, 1);
    for (const j of active) {
      const [l2, t2, r2, b2] = boxes[j]!;
      if (vert[k] && vert[j]) continue;
      const ov = Math.min(b, b2) - Math.max(t, t2);
      if (ov < 0.5 * Math.min(b - t, b2 - t2)) continue;
      const gap = Math.max(l - r2, l2 - r);
      const tol = Math.max(0.6, 0.15 * Math.min(fs[k]!, fs[j]!));
      if (gap <= tol) join(k, j);
    }
    active.push(k);
  }
  // text that runs top to bottom: one column, vertically no more than 0.15 em apart
  const vs = Array.from({ length: n }, (_, i) => i).filter((i) => vert[i]).sort((a, b) => boxes[a]![1]! - boxes[b]![1]!);
  for (let x = 0; x < vs.length; x++) {
    const k = vs[x]!;
    const [l, t, r, b] = boxes[k]!;
    for (let y = x + 1; y < vs.length; y++) {
      const j = vs[y]!;
      const [l2, t2, r2, b2] = boxes[j]!;
      if (t2 > b + 24) break;
      const ov = Math.min(r, r2) - Math.max(l, l2);
      if (ov < 0.5 * Math.min(r - l, r2 - l2)) continue;
      const gap = Math.max(t2 - b, t - b2);
      const tol = Math.max(0.6, 0.15 * Math.min(fs[k]!, fs[j]!));
      if (gap <= tol) join(k, j);
    }
  }
  // glyphless characters (nbsp, zwsp, combining) stand with their document neighbours when those are joined
  for (let k = 0; k < n; k++) if (GLYPHLESS.test(cs[k]!) && k > 0 && k + 1 < n && find(k - 1) === find(k + 1)) join(k, k - 1);
  return Array.from({ length: n }, (_, i) => find(i));
}
