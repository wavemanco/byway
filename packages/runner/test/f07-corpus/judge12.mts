// Round-11 verifier's judge (written apart from page-arbiter.ts and judge11.mts). Given the oracle's visit of the page
// before and after, the offered deck and the answer, it builds what a visitor must see: the page before, painted
// characters only, with each changed line's characters in place of its old ones; every other character, gap and link
// as before. Gaps: G glued, A apart, R reversed, ? unknown (not compared).
import type { OChar, OVisit } from './oracle12.mts';

const WS = /[ \t\n\f\r]/;
export type Parsed = { cs: string[]; space: boolean[]; part: number[]; lead: boolean; trail: boolean; brackets: boolean };

/** A deck or answer line: characters (code points, brackets out, escapes resolved), space before each, link part. */
export function parse(l: string): Parsed {
  const out: Parsed = { cs: [], space: [], part: [], lead: false, trail: false, brackets: false };
  let part = -1, inLink = false, sp = false, any = false;
  const chars = [...l];
  for (let i = 0; i < chars.length; i++) {
    let c = chars[i]!;
    if (c === '\\' && i + 1 < chars.length && '[]\\'.includes(chars[i + 1]!)) c = chars[++i]!;
    else if (c === '[') { inLink = true; part++; out.brackets = true; continue; }
    else if (c === ']') { inLink = false; continue; }
    if (WS.test(c) || /\p{Zs}/u.test(c)) { sp = true; if (!any) out.lead = true; continue; }
    if (/^\p{Cf}$/u.test(c) && c !== '‍') continue;
    out.cs.push(c);
    out.space.push(out.cs.length > 1 && sp);
    out.part.push(inLink ? part : -1);
    sp = false;
    any = true;
  }
  out.trail = any && sp;
  return out;
}
const norm = (l: string) => l.replace(/[ \t\n\f\r]+/g, ' ').trim();

/** Longest common subsequence pairs (old index, new index) for short lines; else common prefix and suffix. */
function pairs(a: string[], b: string[]): [number, number][] {
  if (a.length * b.length <= 250_000) {
    const n = a.length, m = b.length;
    const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
    const out: [number, number][] = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { out.push([i, j]); i++; j++; }
      else if (L[i + 1]![j]! >= L[i]![j + 1]!) i++;
      else j++;
    }
    return out;
  }
  const out: [number, number][] = [];
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) { out.push([p, p]); p++; }
  const tail: [number, number][] = [];
  for (let s = 0; s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]; s++) tail.push([a.length - 1 - s, b.length - 1 - s]);
  return [...out, ...tail.reverse()];
}

type Allowed = Set<OChar['gap']> | null; // null: anything
export type Verdict = { v: 'ok' | 'DIFF:chars' | 'DIFF:gap' | 'DIFF:link' | 'DIFF:title' | 'PRE'; why?: string; lenient: number; unknownGaps: number };

/** Characters with no glyph of their own (a no-break or other space, a format character) are not compared: a space
 * one parts its neighbours, a format one is dropped. */
function inked(v: OVisit): OVisit {
  const chars: OChar[] = [];
  let apart = false;
  for (const x of v.chars) {
    if (/^\p{Zs}$/u.test(x.c)) { apart = true; continue; }
    if (/^\p{Cf}$/u.test(x.c) && x.c !== '‍') continue;
    chars.push(apart && chars.length ? { ...x, gap: x.gap === '?' ? '?' : 'A' } : x);
    apart = false;
  }
  return { ...v, chars };
}
export function judge(before0: OVisit, after0: OVisit, offered: string[], answer: string[]): Verdict {
  const before = inked(before0), after = inked(after0);
  // Title.
  const t0 = norm(offered[0] ?? ''), a0 = norm(answer[0] ?? '');
  const wantTitle = a0 !== t0 ? parse(a0).cs.join('') : before.title.replace(/[ \t\n\f\r]+/g, '');
  if (after.title.replace(/[ \t\n\f\r]+/g, '') !== wantTitle) return { v: 'DIFF:title', why: `title ${JSON.stringify(after.title)} want ${JSON.stringify(a0 !== t0 ? a0 : before.title)}`, lenient: 0, unknownGaps: 0 };
  const bc = before.chars.map((x) => x.c);
  const lines: { i: number; o: Parsed; n: Parsed; changed: boolean }[] = [];
  let blankChanged = false;
  for (let i = 1; i < offered.length; i++) {
    const o = parse(offered[i]!);
    if (!o.cs.length) { if (norm(answer[i] ?? '') !== norm(offered[i]!)) blankChanged = true; continue; }
    const n = parse(answer[i] ?? '');
    const changed = norm(answer[i] ?? '') !== norm(offered[i]!) || (n.lead && norm(answer[i] ?? '') !== '' && false);
    lines.push({ i, o, n, changed: changed || ((n.lead || n.trail) && norm(answer[i] ?? '') !== norm(offered[i]!)) });
  }
  const occ = (cs: string[], from: number): number[] => {
    const out: number[] = [];
    for (let k = from; k + cs.length <= bc.length; k++) {
      let ok = true;
      for (let q = 0; q < cs.length && ok; q++) ok = bc[k + q] === cs[q];
      if (ok) out.push(k);
    }
    return out;
  };
  type Span = { a: number; b: number; o: Parsed; n: Parsed; i: number };
  let tries = 0;
  let firstFail: Verdict | undefined;
  const search = (li: number, cur: number, spans: Span[]): Verdict | undefined => {
    if (tries > 3000) return undefined;
    if (li === lines.length) {
      tries++;
      const v = verdict(spans);
      if (v.v === 'ok') return v;
      firstFail ??= v;
      return undefined;
    }
    const l = lines[li]!;
    const free = (k: number) => spans.every((sp) => k + l.o.cs.length <= sp.a || k >= sp.b);
    let at = occ(l.o.cs, cur);
    let moved = false;
    if (!at.length) { at = occ(l.o.cs, 0).filter(free); moved = true; }
    if (!at.length) {
      if (l.changed) { firstFail ??= { v: 'PRE', why: `line ${l.i} ${JSON.stringify(offered[l.i])} not painted in one piece before`, lenient: 0, unknownGaps: 0 }; return undefined; }
      return search(li + 1, cur, spans);
    }
    for (const k of at.slice(0, 6)) {
      const r = search(li + 1, moved ? cur : k + l.o.cs.length, l.changed ? [...spans, { a: k, b: k + l.o.cs.length, o: l.o, n: l.n, i: l.i }] : spans);
      if (r) return r;
      if (tries > 3000) break;
    }
    return undefined;
  };
  const verdict = (spans: Span[]): Verdict => {
    const wc: string[] = [];
    const wg: Allowed[] = [];
    const wh: (string | null | undefined)[] = []; // undefined: not checked
    let lenient = 0;
    let pending: Allowed | undefined;
    const pushOld = (k: number) => {
      wg.push(wc.length ? (pending !== undefined ? pending : before.chars[k]!.gap === '?' ? null : new Set([before.chars[k]!.gap])) : null);
      wc.push(bc[k]!);
      wh.push(before.chars[k]!.href);
      pending = undefined;
    };
    let k = 0;
    const sorted = [...spans].sort((x, y) => x.a - y.a);
    for (const sp of sorted) {
      for (; k < sp.a; k++) pushOld(k);
      const gin = sp.a > 0 ? before.chars[sp.a]!.gap : 'G';
      const gout = sp.b < bc.length ? before.chars[sp.b]!.gap : 'G';
      const { o, n } = sp;
      // The old line's links, in order: each run of one href.
      const runs: (string | null)[] = [];
      for (let q = sp.a; q < sp.b; q++) { const x = before.chars[q]!; const h = x.href; if (h !== null && (q === sp.a || before.chars[q - 1]!.href !== h || (before.chars[q - 1]! as any).aid !== (x as any).aid)) runs.push(h); }
      const wholeLink = runs.length === 1 && before.chars.slice(sp.a, sp.b).every((x) => x.href === runs[0]);
      if (!n.cs.length) {
        // Deleted: neighbours apart where either edge was apart.
        const ap = (g: string) => g === 'A' || g === 'R';
        const merged: Allowed = ap(gin) || ap(gout) ? new Set(['A', 'R']) : gin === '?' || gout === '?' ? null : new Set(['G']);
        pending = pending === undefined ? merged : pending === null || merged === null ? null : new Set([...pending, ...merged].includes('A') ? ['A', 'R'] : ['G']);
        k = sp.b;
        continue;
      }
      const pr = pairs(o.cs, n.cs);
      const from = new Int32Array(n.cs.length).fill(-1);
      for (const [x, y] of pr) from[y] = x;
      for (let q = 0; q < n.cs.length; q++) {
        let g: Allowed;
        if (q === 0) g = n.lead ? new Set(['A', 'R']) : pending !== undefined ? pending : gin === '?' ? null : new Set([gin]);
        else {
          const x = from[q]!, xp = from[q - 1]!;
          if (x > 0 && xp === x - 1 && o.space[x] === n.space[q]) { const bg = before.chars[sp.a + x]!.gap; g = bg === '?' ? null : new Set([bg]); }
          else if (n.space[q]) g = new Set(['A']);
          else {
            // The page's own parting where the old line had no space, beside a kept character: either way.
            const own = (oi: number) => oi > 0 && oi < o.cs.length && !o.space[oi] && before.chars[sp.a + oi]!.gap === 'A';
            if ((x >= 0 && own(x)) || (xp >= 0 && own(xp + 1))) { g = null; lenient++; }
            else g = new Set(['G']);
          }
        }
        pending = undefined;
        wg.push(wc.length ? g : null);
        wc.push(n.cs[q]!);
        const p = n.part[q]!;
        wh.push(wholeLink && !n.brackets ? runs[0]! : p >= 0 ? (runs[p] ?? undefined) : null);
      }
      pending = n.trail ? new Set(['A', 'R']) : gout === '?' ? null : new Set([gout]);
      k = sp.b;
    }
    for (; k < bc.length; k++) pushOld(k);
    const ac = after.chars.map((x) => x.c);
    const ctx = (cs: string[], gs: (string | null)[], i: number) => cs.slice(Math.max(0, i - 25), i + 25).map((c, j) => { const g = gs[Math.max(0, i - 25) + j]; return (j ? (g === 'A' ? '·' : g === 'R' ? '‹' : g === '?' || g === null ? '¿' : '') : '') + c; }).join('');
    const gotG = after.chars.map((x) => x.gap);
    const wantG = wg.map((s) => (s === null ? '?' : s.has('G') && s.size === 1 ? 'G' : s.has('A') ? 'A' : [...s][0]!));
    if (ac.length !== wc.length || ac.some((c, i) => c !== wc[i])) {
      let i = 0;
      while (i < ac.length && i < wc.length && ac[i] === wc[i]) i++;
      return { v: 'DIFF:chars', why: `at ${i}: want ${ctx(wc, wantG, i)} | got ${ctx(ac, gotG, i)}`, lenient, unknownGaps: 0 };
    }
    let unknown = 0;
    for (let i = 1; i < wc.length; i++) {
      const s = wg[i];
      const g = after.chars[i]!.gap;
      if (s === null || g === '?') { unknown++; continue; }
      if (!s.has(g)) return { v: 'DIFF:gap', why: `at ${i} want ${[...s].join('')} got ${g}: want ${ctx(wc, wantG, i)} | got ${ctx(ac, gotG, i)}`, lenient, unknownGaps: unknown };
    }
    for (let i = 0; i < wc.length; i++) {
      if (wh[i] === undefined) continue;
      if (after.chars[i]!.href !== wh[i]) return { v: 'DIFF:link', why: `at ${i} ${JSON.stringify(wc[i])} want href ${wh[i]} got ${after.chars[i]!.href}: ${ctx(ac, gotG, i)}`, lenient, unknownGaps: unknown };
    }
    return { v: 'ok', lenient, unknownGaps: unknown };
  };
  if (blankChanged) return { v: 'PRE', why: 'a changed line has no glyph of its own (a no-break space only): not judged', lenient: 0, unknownGaps: 0 };
  return search(0, 0, []) ?? firstFail ?? { v: 'PRE', why: 'no placement', lenient: 0, unknownGaps: 0 };
}
