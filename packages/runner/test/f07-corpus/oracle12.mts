// Round-11 verifier's visitor oracle (written apart from pages.ts / page-arbiter.ts and from the implementer's
// oracle11.mts). What a visitor sees is decided by PAINT, not by computed style: at each scroll position the viewport
// is screenshotted twice, once as is and once with all text ink erased (an @layer declared first with !important
// colour/fill/stroke/shadow transparent, gradient text turned into a box fill), and a character counts as painted where
// pixels inside its box differ between the two shots. So covering elements, z-index behind a background, masks,
// clip-path url()/path(), text coloured as its background, backface-hidden text and every clip are all judged by what
// Chromium actually paints. Geometry (rows, gaps, order) comes from per-character Range rects in page coordinates.
// Own clock (another instant), own seeded Math.random, the page's REAL IntersectionObserver and Playwright's own rAF,
// scrolled in 450 px steps; finite animations finished, endless ones sampled at 4 phases.
import { createRequire } from 'node:module';
const { chromium } = await import('playwright');
const req = createRequire(import.meta.url);
const { PNG } = createRequire(req.resolve('playwright'))('playwright-core/lib/utilsBundle');

const CLOCK = Date.UTC(2026, 2, 15, 8, 30);
const HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com'];
const VW = 1440, VH = 900;
const INIT = `(() => {
  let s = 987654321; Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1000003) / 1000003; };
  const o = new MutationObserver(() => { window.__o12c = true; });
  Object.defineProperty(window, '__o12o', { value: o });
  window.__o12c = true;
  o.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
})()`;

const SETUP = String.raw`(() => {
  if (window.__o12) return true;
  const st = { ids: new WeakMap(), n: 0, aids: new WeakMap(), an: 0 };
  const sheet = document.createElement('style');
  sheet.textContent = '@layer o12erase { *, *::before, *::after, *::first-letter, *::first-line, *::marker { color: transparent !important; -webkit-text-fill-color: transparent !important; -webkit-text-stroke-color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; caret-color: transparent !important; } text, tspan, textPath { fill: transparent !important; stroke: transparent !important; } [data-o12g] { -webkit-background-clip: border-box !important; background-clip: border-box !important; } }';
  sheet.disabled = true;
  const only = document.createElement('style');
  only.textContent = '@layer o12erase { *, *::before, *::after { text-decoration-color: transparent !important; } [data-o12only], [data-o12only]::first-letter, [data-o12only]::first-line { color: transparent !important; -webkit-text-fill-color: transparent !important; -webkit-text-stroke-color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; } [data-o12only][data-o12g] { -webkit-background-clip: border-box !important; background-clip: border-box !important; } }';
  const head = document.head || document.documentElement;
  head.insertBefore(only, head.firstChild);
  head.insertBefore(sheet, head.firstChild);
  sheet.disabled = true;
  const SKIP = 'script,style,noscript,template,textarea,title,select,option';
  const idOf = (n) => { let v = st.ids.get(n); if (v === undefined) { v = st.n++; st.ids.set(n, v); } return v; };
  const texts = () => { const out = []; if (!document.body) return out; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let t = w.nextNode(); t; t = w.nextNode()) { const p = t.parentElement; if (!p || p.closest(SKIP)) continue; if (!/[^ \t\n\f\r]/.test(t.data)) continue; out.push(t); } return out; };
  const settle = (k) => { for (const a of document.getAnimations()) { let t = null; try { t = a.effect && a.effect.getComputedTiming(); } catch {} if (t && t.iterations === Infinity) { if (typeof t.duration === 'number' && t.duration > 0) { try { a.pause(); a.currentTime = (t.delay || 0) + t.duration * (k % 4) / 4; } catch {} } continue; } try { a.finish(); } catch { try { a.cancel(); } catch {} } } };
  let before = null;
  const erase = (on) => {
    if (on) {
      for (const e of document.querySelectorAll('*')) { const s = getComputedStyle(e); if (/text/.test((s.backgroundClip || '') + ' ' + (s.webkitBackgroundClip || ''))) e.setAttribute('data-o12g', ''); }
      before = new Set(document.getAnimations());
      sheet.disabled = false;
    } else sheet.disabled = true;
    for (const a of document.getAnimations()) if (!before.has(a)) { try { a.finish(); } catch { try { a.cancel(); } catch {} } }
    if (!on) for (const e of document.querySelectorAll('[data-o12g]')) e.removeAttribute('data-o12g');
    window.__o12o.takeRecords();
    return true;
  };
  const byId = () => { const m = new Map(); for (const t of texts()) m.set(idOf(t), t); return m; };
  const keep = (ids) => { const m = byId(); const before = new Set(document.getAnimations()); for (const e of document.querySelectorAll('[data-o12only]')) e.removeAttribute('data-o12only'); for (const id of ids) { const t = m.get(id); if (t && t.parentElement) { t.parentElement.setAttribute('data-o12only', ''); const s = getComputedStyle(t.parentElement); if (/text/.test((s.backgroundClip || '') + ' ' + (s.webkitBackgroundClip || ''))) t.parentElement.setAttribute('data-o12g', ''); } } if (!ids.length) for (const e of document.querySelectorAll('[data-o12g]')) e.removeAttribute('data-o12g'); for (const a of document.getAnimations()) if (!before.has(a)) { try { a.finish(); } catch { try { a.cancel(); } catch {} } } window.__o12o.takeRecords(); return true; };
  // Every text node's characters whose box meets the viewport now, in viewport coordinates; and every node's page box.
  const rects = () => {
    const r = document.createRange();
    const chars = [];
    const nodes = [];
    for (const t of texts()) {
      const id = idOf(t);
      r.selectNodeContents(t);
      const b = r.getBoundingClientRect();
      nodes.push([id, Math.round(b.left + scrollX), Math.round(b.top + scrollY), Math.round(b.width), Math.round(b.height), t.data.length]);
      if (!(b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth) && !(b.width === 0 && b.height === 0)) continue;
      const p = t.parentElement;
      const fs = parseFloat(getComputedStyle(p).fontSize) || 16;
      const a = p.closest('a[href]');
      const href = a ? a.getAttribute('href') : null;
      let aid = -1; if (a) { aid = st.aids.get(a); if (aid === undefined) { aid = st.an++; st.aids.set(a, aid); } }
      const rtl = getComputedStyle(p).direction === 'rtl';
      const d = t.data;
      for (let i = 0; i < d.length; ) {
        const w = d.codePointAt(i) > 0xffff ? 2 : 1;
        const c = d.slice(i, i + w);
        if (!/[ \t\n\f\r]/.test(c)) {
          r.setStart(t, i); r.setEnd(t, i + w);
          let q = null;
          for (const x of r.getClientRects()) if (x.width > 0 && x.height > 0) { q = x; break; }
          if (q && q.right > 0 && q.bottom > 0 && q.left < innerWidth && q.top < innerHeight) chars.push([id, i, c, q.left, q.top, q.right, q.bottom, fs, href, rtl, aid]);
        }
        i += w;
      }
    }
    return JSON.stringify({ chars, nodes, sx: scrollX, sy: scrollY });
  };
  // At the end: every text node in document order with its data, whether whitespace or a box edge lies before each
  // character (for row breaks), and drop caps.
  const layout = () => {
    const out = [];
    let prevBlock = null, wsPending = false;
    const blockOf = (e) => { for (let x = e; x; x = x.parentElement) { const d = getComputedStyle(x).display; if (!/^inline$|^contents$|^ruby/.test(d)) return x; } return null; };
    const capBlocks = new Set();
    for (const t of texts()) {
      const p = t.parentElement;
      const blk = blockOf(p);
      let cap = false;
      if (!capBlocks.has(blk)) {
        capBlocks.add(blk);
        for (let b = blk, k = 0; b && k < 4; b = b.parentElement ? blockOf(b.parentElement) : null, k++) { const f = getComputedStyle(b, '::first-letter'); if ((f.float && f.float !== 'none') || (f.initialLetter && f.initialLetter !== 'normal')) { cap = true; break; } }
      }
      out.push([idOf(t), t.data, cap, blk ? idOf(blk.firstChild || blk) : -1, st.blk.get(blk) ?? (st.blk.set(blk, st.blk.size), st.blk.get(blk))]);
    }
    return JSON.stringify({ title: document.title, nodes: out });
  };
  st.blk = new Map();
  window.__o12 = { settle, erase, rects, layout, keep };
  window.__o12o.takeRecords();
  return true;
})()`;

type CharRec = { n: number; i: number; c: string; l: number; t: number; r: number; b: number; fs: number; href: string | null; rtl: boolean; aid: number; ink: number; mid: number; sample: number };
export type OChar = CharRec & { gap: 'G' | 'A' | 'R' | '?' };
export type OVisit = { title: string; chars: OChar[]; ms: number; samples: number };

let browser: any;
async function getBrowser() {
  if (!browser || !browser.isConnected()) browser = await chromium.launch({ headless: true });
  return browser;
}
export async function closeOracle() {
  await browser?.close();
  browser = undefined;
}

function diffCount(a: any, b: any, l: number, t: number, r: number, bb: number): { ink: number; mid: number } {
  const x0 = Math.max(0, Math.floor(l)), x1 = Math.min(a.width, Math.ceil(r));
  const y0 = Math.max(0, Math.floor(t)), y1 = Math.min(a.height, Math.ceil(bb));
  const m0 = t + (bb - t) * 0.3, m1 = t + (bb - t) * 0.7;
  let ink = 0, mid = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const k = (y * a.width + x) * 4;
      const d = Math.max(Math.abs(a.data[k] - b.data[k]), Math.abs(a.data[k + 1] - b.data[k + 1]), Math.abs(a.data[k + 2] - b.data[k + 2]));
      if (d >= 40) {
        ink++;
        if (y >= m0 && y <= m1) mid++;
      }
    }
  }
  return { ink, mid };
}

const STRONG_R = /^[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;
const STRONG_L = /^\p{L}/u;
// Digits (European or Arabic-Indic) run left to right inside any paragraph: they are 'L' for order and gaps.
const dir = (c: string) => (/^\p{Nd}/u.test(c) ? 'L' : STRONG_R.test(c) && /^\p{L}/u.test(c) ? 'R' : STRONG_L.test(c) ? 'L' : 'N');

/** The oracle's visit of a page. opts.motion: reduced motion (default true, as the arbiter's read). */
export async function visit(html: string, opts: { motion?: 'reduce' | 'no-preference'; totalMs?: number } = {}): Promise<OVisit> {
  const t0 = Date.now();
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, reducedMotion: opts.motion ?? 'reduce', serviceWorkers: 'block' });
  try {
    await ctx.clock.install({ time: CLOCK - 5 });
    await ctx.clock.pauseAt(CLOCK);
    await ctx.addInitScript({ content: INIT });
    let nav = false;
    await ctx.route('**/*', async (r: any) => {
      const rq = r.request();
      if (rq.isNavigationRequest()) {
        if (nav) return r.fulfill({ status: 204, body: '' }).catch(() => undefined);
        nav = true;
      }
      const u = new URL(rq.url());
      if (u.origin === 'http://oracle12.localhost') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }).catch(() => undefined);
      if (u.protocol === 'https:' && HOSTS.includes(u.hostname)) return r.continue().catch(() => undefined);
      return r.abort('blockedbyclient').catch(() => undefined);
    });
    const page = await ctx.newPage();
    page.on('dialog', (d: any) => d.dismiss().catch(() => undefined));
    await page.goto('http://oracle12.localhost/p', { waitUntil: 'load', timeout: 60_000 });
    await page.evaluate(`(async () => { for (const i of document.images) if (i.loading === 'lazy') i.loading = 'eager'; if (document.fonts) { document.fonts.forEach((f) => { if (f.status === 'unloaded') f.load().catch(() => {}); }); await document.fonts.ready; } await Promise.all([...document.images].map((i) => i.complete ? null : i.decode().catch(() => null))); return true; })()`);
    let clock = 0;
    const run = async (ms: number) => { await page.clock.runFor(ms); clock += ms; };
    await run(1800);
    await page.evaluate(SETUP);
    let sampleNo = 0;
    let phase = 0;
    // Per node: per sample, its page box; its best sample (most chars painted) and those chars.
    const nodeBox = new Map<number, Map<number, string>>();
    const best = new Map<number, { sample: number; chars: CharRec[]; len: number }>();
    const cur = new Map<number, { sample: number; chars: CharRec[]; len: number }>();
    const sample = async () => {
      sampleNo++;
      await page.evaluate(`window.__o12.settle(${phase++})`);
      const shotA = await page.screenshot({ type: 'png', animations: 'allow', caret: 'initial' });
      const R = JSON.parse(String(await page.evaluate('window.__o12.rects()'))) as { chars: any[]; nodes: number[][]; sx: number; sy: number };
      await page.evaluate('window.__o12.erase(true)');
      const shotB = await page.screenshot({ type: 'png', animations: 'allow', caret: 'initial' });
      await page.evaluate('window.__o12.erase(false)');
      const A = PNG.sync.read(shotA), B = PNG.sync.read(shotB);
      const here = new Map<number, CharRec[]>();
      for (const [id, x, y, w, h, len] of R.nodes) {
        let m = nodeBox.get(id!);
        if (!m) nodeBox.set(id!, (m = new Map()));
        m.set(sampleNo, `${x},${y},${w},${h},${len}`);
      }
      const inks = R.chars.map(([, , , l, t, r, bb]) => diffCount(A, B, l, t, r, bb));
      // Boxes of different nodes (or far-apart characters of one node) that overlap: the ink there cannot be told
      // apart by one erase, so each such node is shot again alone (its own element's text kept, all else erased).
      const suspects = new Set<number>();
      {
        const grid = new Map<string, number[]>();
        const cell = 24;
        R.chars.forEach(([n, i, , l, t, r, bb], k) => {
          for (let gx = Math.floor(l / cell); gx <= Math.floor(r / cell); gx++)
            for (let gy = Math.floor(t / cell); gy <= Math.floor(bb / cell); gy++) {
              const key = `${gx},${gy}`;
              const xs = grid.get(key) ?? [];
              for (const j of xs) {
                const [n2, i2, , l2, t2, r2, b2] = R.chars[j];
                if (n2 === n && Math.abs(i2 - i) <= 2) continue;
                const ix = Math.min(r, r2) - Math.max(l, l2), iy = Math.min(bb, b2) - Math.max(t, t2);
                if (ix > 0.5 && iy > 0.5) { suspects.add(n); suspects.add(n2); }
              }
              xs.push(k);
              grid.set(key, xs);
            }
        });
      }
      let checked = 0;
      for (const sn of suspects) {
        if (checked++ >= Number(process.env.O12_CAP ?? 200)) break;
        await page.evaluate(`window.__o12.keep([${sn}])`);
        const shotK = PNG.sync.read(await page.screenshot({ type: 'png', animations: 'allow', caret: 'initial' }));
        await page.evaluate('window.__o12.keep([])');
        R.chars.forEach(([n, , , l, t, r, bb], k) => {
          if (n === sn) inks[k] = diffCount(A, shotK, l, t, r, bb);
        });
      }
      R.chars.forEach(([n, i, c, l, t, r, bb, fs, href, rtl, aid], k) => {
        const { ink, mid } = inks[k]!;
        if (ink < 2) return;
        let xs = here.get(n);
        if (!xs) here.set(n, (xs = []));
        xs.push({ n, i, c, l: l + R.sx, t: t + R.sy, r: r + R.sx, b: bb + R.sy, fs, href, rtl, aid, ink, mid, sample: sampleNo });
      });
      // A node keeps, per place it stands, the union of what was painted there; its best place is where most painted.
      for (const [id, m] of nodeBox) {
        const key = m.get(sampleNo);
        if (key === undefined) continue;
        const len = Number(key.split(',')[4]);
        const prev = cur.get(id);
        const prevKey = prev ? m.get(prev.sample) : undefined;
        const xs = here.get(id) ?? [];
        let now: { sample: number; chars: CharRec[]; len: number };
        if (prev && prevKey === key && prev.len === len) {
          const have = new Map(prev.chars.map((x) => [x.i, x]));
          for (const x of xs) if (!have.has(x.i)) have.set(x.i, x);
          now = { sample: sampleNo, chars: [...have.values()].sort((a, b) => a.i - b.i), len };
        } else now = { sample: sampleNo, chars: xs, len };
        cur.set(id, now);
        const bst = best.get(id);
        if (!bst || bst.len !== len || now.chars.length >= bst.chars.length) best.set(id, now);
      }
    };
    const height = Number(await page.evaluate('Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)'));
    const ys: number[] = [];
    for (let y = 0; y < Math.max(1, height - VH + 1) && ys.length < 50; y += 450) ys.push(y);
    if (height > VH) ys.push(height - VH);
    const pass = async (stepMs: number) => {
      for (const y of ys) {
        await page.evaluate(`window.scrollTo({ top: ${y}, left: 0, behavior: 'instant' })`);
        await page.waitForTimeout(40);
        await run(stepMs);
        await sample();
      }
      await page.evaluate(`window.scrollTo({ top: 0, left: 0, behavior: 'instant' })`);
      await page.waitForTimeout(40);
    };
    await pass(250);
    await run(250);
    await sample();
    const total = opts.totalMs ?? 9000;
    const rescans = new Set([5000, 7000, total]);
    while (clock < total) {
      await run(500);
      const changed = Boolean(await page.evaluate('(() => { const c = !!window.__o12c || document.getAnimations().some((a) => a.playState === "running"); window.__o12c = false; return c; })()'));
      if (changed && [...rescans].some((x) => clock >= x)) {
        for (const x of [...rescans]) if (clock >= x) rescans.delete(x);
        await pass(0);
      }
      if (changed) await sample();
    }
    const L = JSON.parse(String(await page.evaluate('window.__o12.layout()'))) as { title: string; nodes: [number, string, boolean, number, number][] };
    const chars: OChar[] = [];
    const finalSample = sampleNo;
    let prev: OChar | undefined;
    let prevNode: { id: number; data: string; blk: number } | undefined;
    let capOpen = false;
    for (const [id, data, cap, , blk] of L.nodes) {
      const bst = best.get(id);
      const lastKey = nodeBox.get(id)?.get(finalSample);
      const valid = bst && bst.len === data.length ? bst.chars : [];
      let capDone = !cap;
      for (const ch of valid) {
        // whitespace between the previous painted char and this one, in DOM
        let ws = false;
        if (prev && prev.n === id) ws = /[ \t\n\f\r]/.test(data.slice(prev.i + 1, ch.i));
        else if (prev && prevNode) ws = /[ \t\n\f\r]/.test(prevNode.data.slice(prev.i + 1)) || /[ \t\n\f\r]/.test(data.slice(0, ch.i));
        const sameBlk = !!prevNode && prevNode.blk === blk;
        const isCap = !capDone;
        if (!capDone && STRONG_L.test(ch.c)) capDone = true;
        else if (!capDone && /\p{N}/u.test(ch.c)) capDone = true;
        let gap: OChar['gap'] = 'G';
        if (prev) {
          // geometry valid only if both nodes stood at the same place at both samples
          const pb = nodeBox.get(prev.n), cb = nodeBox.get(id);
          const geomOk = prev.sample === ch.sample || (pb?.get(prev.sample) === pb?.get(ch.sample) && cb?.get(prev.sample) === cb?.get(ch.sample) && pb?.get(ch.sample) !== undefined);
          if (capOpen && !ws && prev.n === id) gap = 'G';
          else if (!geomOk) gap = '?';
          else {
            const row = Math.min(prev.b, ch.b) - Math.max(prev.t, ch.t) >= 0.5 * Math.min(prev.b - prev.t, ch.b - ch.t);
            const fs = Math.min(prev.fs, ch.fs);
            if (row) {
              const da = dir(prev.c), db = dir(ch.c);
              const ca = (prev.l + prev.r) / 2, cbx = (ch.l + ch.r) / 2;
              let g: number;
              const mixed = (da === 'R') !== (db === 'R') || ((prev.rtl || ch.rtl) && !(da === 'R' && db === 'R'));
              if (mixed) gap = '?';
              else if (da === 'L' && db === 'L' && cbx < ca - 0.1 * fs) gap = 'R';
              else if (da === 'R' && db === 'R' && cbx > ca + 0.1 * fs) gap = 'R';
              if (gap !== 'R' && gap !== '?') {
                g = da === 'R' && db === 'R' ? prev.l - ch.r : da === 'L' && db === 'L' ? ch.l - prev.r : Math.max(ch.l - prev.r, prev.l - ch.r);
                gap = g <= 0.12 * fs ? 'G' : g >= 0.2 * fs ? 'A' : '?';
              }
            } else {
              gap = ws || !sameBlk ? 'A' : '?';
            }
          }
        }
        capOpen = isCap;
        const o: OChar = { ...ch, gap };
        chars.push(o);
        prev = o;
        prevNode = { id, data, blk };
      }
      if (valid.length === 0 && prev) {
        // node not painted: keep prevNode so whitespace in it is not seen (a hidden node between is not whitespace)
      }
      void lastKey;
    }
    return { title: L.title, chars, ms: Date.now() - t0, samples: sampleNo };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

/** A short text view: chars with '·' for apart, '‹' reversed, '?' unknown. */
export function view(v: OVisit, from = 0, to = v.chars.length): string {
  let s = '';
  for (let k = from; k < to && k < v.chars.length; k++) {
    const x = v.chars[k]!;
    if (k > from) s += x.gap === 'A' ? '·' : x.gap === 'R' ? '‹' : x.gap === '?' ? '¿' : '';
    s += x.c;
  }
  return s;
}
