// Round-12 verifier's judge: what the written page must show, built from the person's answer alone (not from the
// arbiter's model), compared with vo13's visual words.
import type { View } from './vo13.mts';

type Seg = { kind: 'out' | 'link'; text: string };
export function parseLine(line: string): Seg[] {
  const segs: Seg[] = [{ kind: 'out', text: '' }];
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '\\' && i + 1 < line.length && '[]\\'.includes(line[i + 1]!)) { segs.at(-1)!.text += line[++i]; continue; }
    if (c === '[') { segs.push({ kind: 'link', text: '' }); continue; }
    if (c === ']') { segs.push({ kind: 'out', text: '' }); continue; }
    segs.at(-1)!.text += c;
  }
  return segs;
}
const WS = /^[ \t\n\f\r]$/;
type LC = { c: string; space: boolean; part: number };
/** A line's characters (code points, whitespace dropped), whether a typed space stands before each, and its link part. */
export function lineChars(line: string): { cs: LC[]; lead: boolean; trail: boolean } {
  const cs: LC[] = [];
  let sp = false, part = -1, lead = false;
  let any = false;
  for (const seg of parseLine(line)) {
    if (seg.kind === 'link') part++;
    for (const c of seg.text) {
      if (WS.test(c)) { sp = true; if (!any) lead = true; continue; }
      cs.push({ c, space: cs.length > 0 && sp, part: seg.kind === 'link' ? part : -1 });
      sp = false;
      any = true;
    }
  }
  return { cs, lead, trail: sp && any };
}
const htrim = (t: string) => t.replace(/^[ \t\n\f\r]+|[ \t\n\f\r]+$/g, '');
const norm = (l: string) => htrim(parseLine(l).map((s) => (s.kind === 'link' ? `[${htrim(s.text.replace(/[ \t\n\f\r]+/g, ' '))}]` : s.text.replace(/[ \t\n\f\r]+/g, ' '))).join('').replace(/[ \t\n\f\r]+/g, ' '));

export type Verdict = { v: string; why?: string };
/**
 * offered[0] may be the title; lines are found in the before-page's seen characters in order (greedy).
 */
export function judge(before: View, after: View, offered: string[], answer: string[]): Verdict {
  const P = before.chars.map((x) => x.c);
  const Pjoin = P.join('');
  // index of code point k in Pjoin
  const off: number[] = [];
  { let o = 0; for (const c of P) { off.push(o); o += c.length; } off.push(o); }
  const at = new Map<number, number>();
  off.forEach((o, k) => at.set(o, k));
  type Span = { line: number; a: number; b: number; old: LC[]; nw: ReturnType<typeof lineChars>; changed: boolean };
  const spans: Span[] = [];
  let cur = 0;
  let unlocated: number[] = [];
  let titleChanged = false;
  const sqz = (t: string) => htrim(t.replace(/[ \t\n\f\r]+/g, ' '));
  for (let i = 0; i < offered.length; i++) {
    const ol = lineChars(offered[i]!);
    const changed = norm(answer[i] ?? '') !== norm(offered[i]!);
    if (!ol.cs.length) continue;
    if (i === 0 && sqz(offered[0]!) === sqz(before.title)) { if (changed) titleChanged = true; continue; }
    const t = ol.cs.map((x) => x.c).join('');
    let pos = Pjoin.indexOf(t, off[cur]);
    while (pos >= 0 && !at.has(pos)) pos = Pjoin.indexOf(t, pos + 1);
    if (pos < 0) {
      if (i === 0 && before.title.replace(/\s+/g, '') === t) { if (changed) titleChanged = true; continue; }
      if (changed) unlocated.push(i);
      continue;
    }
    const a = at.get(pos)!;
    const b = a + ol.cs.length;
    const nw = lineChars(answer[i] ?? '');
    // a whole-link line (no brackets, every old character in one link): plain words all go into that link
    const h0 = before.chars[a]!.href;
    if (!ol.cs.some((x) => x.part >= 0) && h0 !== null && before.chars.slice(a, b).every((x) => x.href === h0)) {
      for (const x of ol.cs) x.part = 0;
      if (!nw.cs.some((x) => x.part >= 0)) for (const x of nw.cs) x.part = 0;
    }
    // an edge no-break space taken out reads as a typed space there (ADR-0081)
    const zs = (c: string | undefined) => c !== undefined && /^\p{Zs}$/u.test(c) && !WS.test(c);
    if (nw.cs.length && zs(ol.cs[0]?.c) && !zs(nw.cs[0]?.c)) nw.lead = true;
    if (nw.cs.length && zs(ol.cs.at(-1)?.c) && !zs(nw.cs.at(-1)?.c)) nw.trail = true;
    spans.push({ line: i, a, b, old: ol.cs, nw, changed });
    cur = b;
  }
  if (unlocated.length) return { v: 'UNLOCATED', why: `lines ${unlocated.join(',')}` };
  if (titleChanged) {
    const want = lineChars(answer[0]!).cs.map((x) => x.c).join('');
    if (after.title.replace(/\s+/g, '') !== want) return { v: 'TITLE', why: after.title };
  }
  // Expected sequence
  type E = { c: string; href: string | null; rel: 'G' | 'A' | 'G?' | 'A?'; from: number; line: number };
  const relB = (k: number) => (before.word[k] === before.word[k - 1] ? 'G' : 'A'); // relation between k-1 and k in before
  const E: E[] = [];
  let k = 0;
  let pendingRel: 'G' | 'A' | undefined; // merged relation over deleted lines
  let typedNext = false;
  for (const s of spans.filter((x) => x.changed)) {
    for (; k < s.a; k++) {
      let rel: E['rel'] = k === 0 ? 'G' : relB(k);
      if (pendingRel) rel = pendingRel === 'A' || rel === 'A' ? 'A' : 'G';
      if (typedNext) rel = 'A';
      E.push({ c: P[k]!, href: before.chars[k]!.href, rel, from: k, line: -1 });
      pendingRel = undefined;
      typedNext = false;
    }
    // link parts of the old line: href per part
    const partHref = new Map<number, string | null>();
    s.old.forEach((x, j) => { if (x.part >= 0 && !partHref.has(x.part)) partHref.set(x.part, before.chars[s.a + j]!.href); });
    const ownParted = s.old.some((x, j) => j > 0 && !x.space && before.word[s.a + j] !== before.word[s.a + j - 1]);
    const edgeIn: 'G' | 'A' | undefined = s.a > 0 ? relB(s.a) : undefined;
    const edgeOut: 'G' | 'A' | undefined = s.b < P.length ? relB(s.b) : undefined;
    const cs = s.nw.cs;
    if (cs.length) {
      cs.forEach((x, j) => {
        let rel: E['rel'];
        if (j === 0) {
          const inn = pendingRel ? (pendingRel === 'A' || edgeIn === 'A' ? 'A' : 'G') : (edgeIn ?? 'G');
          rel = s.nw.lead || typedNext ? 'A' : inn;
        } else rel = x.space ? 'A' : ownParted ? 'G?' : 'G';
        E.push({ c: x.c, href: x.part >= 0 ? (partHref.get(x.part) ?? '??') : null, rel, from: -1, line: s.line });
      });
      pendingRel = undefined;
      typedNext = s.nw.trail;
      // the relation after the line: as before (edgeOut) unless typed
      if (edgeOut) pendingRel = edgeOut;
    } else {
      // deleted: neighbours apart if either edge was apart
      const m = edgeIn === 'A' || edgeOut === 'A' || pendingRel === 'A' ? 'A' : 'G';
      pendingRel = m;
    }
    k = s.b;
  }
  for (; k < P.length; k++) {
    let rel: E['rel'] = k === 0 ? 'G' : relB(k);
    if (pendingRel) rel = pendingRel === 'A' || rel === 'A' ? 'A' : 'G';
    if (typedNext) rel = 'A';
    E.push({ c: P[k]!, href: before.chars[k]!.href, rel, from: k, line: -1 });
    pendingRel = undefined;
    typedNext = false;
  }
  // after a changed line, the first outside char's relation: as before (relB at s.b) merged — handled through pendingRel.
  const W = after.chars;
  const ctx = (xs: string[], d: number) => `${xs.slice(Math.max(0, d - 20), d).join('')}|${xs.slice(d, d + 20).join('')}`;
  const ws = E.map((x) => x.c);
  const gs = W.map((x) => x.c);
  let d = 0;
  while (d < ws.length && d < gs.length && ws[d] === gs[d]) d++;
  if (d < ws.length || d < gs.length) return { v: 'CHARS', why: `want ${ctx(ws, d)} got ${ctx(gs, d)}` };
  const problems: string[] = [];
  const soft: string[] = [];
  const moving: string[] = [];
  const showW = (k: number) => { let t = ''; for (let x = Math.max(0, k - 25); x < Math.min(W.length, k + 25); x++) t += (x > Math.max(0, k - 25) && after.word[x] !== after.word[x - 1] ? ' ' : '') + (x === k ? '‸' : '') + W[x]!.c; return t; };
  for (let x = 1; x < E.length; x++) {
    if (after.known && (!after.known[x] || !after.known[x - 1])) continue;
    if (E[x]!.from >= 0 && E[x - 1]!.from >= 0 && before.known && (!before.known[E[x]!.from] || !before.known[E[x - 1]!.from])) continue;
    const want = E[x]!.rel;
    const got = after.word[x] === after.word[x - 1] ? 'G' : 'A';
    const got2 = after.word2[x] === after.word2[x - 1] ? 'G' : 'A';
    const ok = (g: string) => want === g || (want === 'G?' && true) || (want === 'A?' && true);
    if (ok(got)) continue;
    if (ok(got2)) { moving.push(`${E[x]!.line}:${showW(x)}`); continue; }
    const inLine = E[x]!.line >= 0 || E[x - 1]!.line >= 0;
    problems.push(`${want === 'A' ? 'GLUED' : 'SPLIT'}${inLine ? '' : '(outside)'} @${showW(x)}`);
  }
  for (let x = 0; x < E.length; x++) {
    if (E[x]!.href !== W[x]!.href) { problems.push(`LINK @${showW(x)} want ${E[x]!.href} got ${W[x]!.href}`); break; }
  }
  if (problems.length) return { v: problems[0]!.split(/[ (@]/)[0]!, why: problems.slice(0, 4).join(' ; ') + (moving.length ? ` [moving: ${moving.slice(0, 2).join(' ; ')}]` : '') };
  if (moving.length) return { v: 'ok-moving', why: moving.slice(0, 3).join(' ; ') };
  void soft;
  return { v: 'ok' };
}
