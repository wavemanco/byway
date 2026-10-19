// revise-A-r3-1b: prototype of the r3-1b admission semantics, run read-only against b33f1285.
// New over r3: runsEveryTime (loop exits after a gate feed), authorWrite = any non-voice person write, COMP-1 by
// (stage, scope) with the wider-covers-narrower order, the writer allowance per VOICE counterpart, ST10 'retry-scope',
// ST12 'block-role'. Kept from r3: personWrite/voiceWrite, ST12 voice clauses and writer-undeclared, PR6 on voiceArm,
// containment, set-aside, DR9 detection. Output only in this folder.
import { CATALOG, PROTOCOL_CONFIGS, c1, c2, c3, c4, c5, c6, c6a, c7 } from 'file:///C:/Users/arvik/code/byway/packages/catalog/src/index.ts';
import { checkAnswer } from 'file:///C:/Users/arvik/code/byway/packages/advisor/src/compose.ts';
import { createPromptRenderer } from 'file:///C:/Users/arvik/code/byway/packages/prompts/src/index.ts';
import { steps } from 'file:///C:/Users/arvik/code/byway/packages/recipe/src/index.ts';
import { humanKind } from 'file:///C:/Users/arvik/code/byway/packages/runner/src/workflow/wording.ts';
import { writeFileSync } from 'node:fs';

type N = any;
const OUT = 'C:/Users/arvik/AppData/Local/Temp/byway-review-verify/round3/revise-A-r3-1b/r31b.out.json';
const OPTION_SET = 'option_set<artifact>';
export const prompts: any = (createPromptRenderer as any)();

// ---------------- semantics (prototype) ----------------
export const HUMAN_WRITE_ROLES = new Set(['voice', 'build', 'fix']);
export const personWrite = (s: N) => s.actor === 'human' && HUMAN_WRITE_ROLES.has(s.role) && s.produces.includes('artifact');
export const voiceWrite = (s: N) => personWrite(s) && s.role === 'voice';
/** r3-1b: a human build and a human fix execute identically (wording.ts:17-21/43-45, human.ts:113-121, `authored` :408). */
export const authorWrite = (s: N) => personWrite(s) && s.role !== 'voice';
export const declaresVoice = (s: N) => s.block === 'VOICE' || s.produces.includes('voice');
export const voiceArm = (s: N) => voiceWrite(s) || declaresVoice(s);
export const voiceScope = (s: N, medium: string) => ({
  base: s.variant === 'claim-log' ? 'claims' : medium === 'media' ? (s.variant === 'VOICE-early' ? 'script' : 'on-screen') : 'all',
  keyLines: s.knobs?.scope === 'key-lines',
});
/** A wider VOICE covers a narrower one of the same base: every-line covers key-lines, never the reverse. */
export const covers = (have: N, want: N) => have.base === want.base && (!have.keyLines || want.keyLines);
const MODEL_WRITER_ROLES = new Set(['build', 'seed', 'fix', 'voice', 'relay', 'render']);
const KNOWN_MODEL_ROLES = new Set([...MODEL_WRITER_ROLES, 'asset', 'critic', 'check', 'cut', 'tells-sweep', 'tells-compare', 'vision', 'judge', 'select', 'dedupe', 'overlap']);
export const writesWorkModel = (s: N) => s.actor === 'model' && (MODEL_WRITER_ROLES.has(s.role) || (s.role === 'asset' && s.produces.includes('artifact')) || !KNOWN_MODEL_ROLES.has(s.role));
export const changesWork = (s: N, contained: boolean) => (!contained && writesWorkModel(s)) || s.writes === true;
export const restores = (s: N) => s.role === 'tells-compare';
/** The one block each role instantiates (protocol has 8 blocks); a check may carry CRITIC or nothing. */
export const BLOCK_OF_ROLE: Record<string, string | undefined> = { seed: 'SEED', vision: 'VISION', critic: 'CRITIC', asset: 'ASSET', relay: 'RELAY', cut: 'CUT', 'tells-sweep': 'TELLS', 'tells-compare': 'TELLS', voice: 'VOICE' };
export const blockOk = (s: N) => (s.role === 'check' ? s.block === undefined || s.block === 'CRITIC' : s.block === BLOCK_OF_ROLE[s.role]);
/** The steps that report to a loop's gate (interpreter.ts:317 + afterGateStep :574-583): model critic for critic-*, model check for check-clean. */
export const feedsGate = (s: N, metric: string) => s.actor === 'model' && ((s.role === 'critic' && (metric === 'critic-score' || metric === 'critic-rank')) || (s.role === 'check' && metric === 'check-clean'));

/**
 * runsEveryTime: the uncontained steps a run always reaches when it passes their stage. Not inside an optional, a route,
 * a pick judge, an audit lens or a gate body; and not after a step that may report to an enclosing loop's gate in that
 * loop's body (the gate can leave the body right after it: threshold, clean, plateau, stopped, cap; interpreter.ts
 * :577-606 and LoopExit at :512-518). replicate/each/audit/gate drop ctx.loop, so nothing inside them reports to an
 * outer loop. A relay passes ctx.loop on, so a report inside a link can end the relay part-way.
 */
export function everyTime(r: N): { s: N; stage: string }[] {
  const out: { s: N; stage: string }[] = [];
  type L = { metric: string; fed: boolean } | null;
  const v = (n: N, st: string, cond: boolean, loop: L): void => {
    switch (n.op) {
      case 'step':
        if (!cond && !loop?.fed) out.push({ s: n, stage: st });
        if (loop && feedsGate(n, loop.metric)) loop.fed = true;
        return;
      case 'seq': n.steps.forEach((c: N) => v(c, st, cond, loop)); return;
      case 'loop': v(n.body, st, cond || !!loop?.fed, { metric: n.gate.metric, fed: false }); return;
      case 'replicate': case 'each': v(n.body, st, cond || !!loop?.fed, null); return;
      case 'relay': v(n.body, st, cond, loop); return;
      case 'optional': v(n.body, st, true, loop); return;
      case 'route': n.branches.forEach((b: N) => v(b.body, st, true, loop)); return;
      case 'audit': case 'gate': case 'pick': return;
    }
  };
  r.stages.forEach((x: N) => v(x.body, x.stage, false, null));
  return out;
}
/** Today's alwaysRunSteps (profile.ts:64-87) minus lens and gate bodies, as r3 had it, for comparison. */
export function alwaysRunR3(r: N): { s: N; stage: string }[] {
  const out: { s: N; stage: string }[] = [];
  const v = (n: N, st: string) => {
    switch (n.op) {
      case 'step': out.push({ s: n, stage: st }); return;
      case 'seq': n.steps.forEach((c: N) => v(c, st)); return;
      case 'optional': case 'route': case 'pick': case 'audit': case 'gate': return;
      default: v(n.body, st);
    }
  };
  r.stages.forEach((x: N) => v(x.body, x.stage));
  return out;
}

// Flow walker with containment (validator flow.ts semantics + `contained`); loop and relay bodies run twice.
// r3-1b: a loop's gate may end its body right after a step that reports to it (exit point), so the state after every
// exit point also reaches the loop's exit (EXITS = true). EXITS = false is the r3 / today's flow.ts walk.
export let EXITS = true;
export const setExits = (v: boolean) => { EXITS = v; };
export function flow<S>(r: N, init: S, step: (s: N, st: S, contained: boolean) => S, join: (xs: S[]) => S): S {
  type X = { metric: string; exits: S[] } | null;
  const f = (n: N, s: S, c: boolean, x: X): S => {
    switch (n.op) {
      case 'step': { const o = step(n, s, c); if (EXITS && x && !c && feedsGate(n, x.metric)) x.exits.push(o); return o; }
      case 'seq': return n.steps.reduce((a: S, y: N) => f(y, a, c, x), s);
      case 'replicate': case 'each': return join([s, f(n.body, s, c, null)]);
      case 'loop': { const own: X = { metric: n.gate.metric, exits: [] }; const a = f(n.body, s, c, own); const b = f(n.body, join([s, a]), c, own); return join([a, b, ...own.exits]); }
      case 'relay': { const a = f(n.body, s, c, x); const b = f(n.body, join([s, a]), c, x); return join([a, b]); }
      case 'audit': n.lenses.forEach((l: N) => f(l.body, s, true, null)); return s;
      case 'gate': f(n.body, s, true, null); return s;
      case 'optional': return join([s, f(n.body, s, c, x)]);
      case 'route': return join(n.branches.map((b: N) => f(b.body, s, c, x)));
      case 'pick': if (n.judge) f(n.judge, s, true, null); return s;
    }
    return s;
  };
  return r.stages.reduce((s: S, st: N) => f(st.body, s, false, null), init);
}

// ---------------- rules ----------------
function st12Voice(r: N): string[] {
  const out: string[] = [];
  for (const { step } of steps(r) as N[]) {
    if (declaresVoice(step) && !voiceWrite(step)) out.push(`ST12:voice-not-written(${step.id})`);
    if (voiceWrite(step) && !(step.block === 'VOICE' && step.produces.includes('voice'))) out.push(`ST12:voice-undeclared(${step.id})`);
  }
  return out;
}
function blockRole(r: N): string[] {
  return (steps(r) as N[]).filter(({ step }) => !blockOk(step)).map(({ step }) => `ST12:block-role(${step.id})`);
}
function writerUndeclared(r: N): string[] {
  const out: string[] = [];
  flow<null>(r, null, (s, st, c) => { if (!c && (writesWorkModel(s) || personWrite(s)) && s.writes !== true) out.push(`ST12:writer-undeclared(${s.id})`); return st; }, () => null);
  return [...new Set(out)];
}
export function pr6(r: N): string[] {
  const hits = new Set<string>();
  flow<boolean>(r, false, (s, armed, c) => {
    if (armed && s.actor !== 'human' && changesWork(s, c) && !s.keepsVoice) hits.add(`PR6(${s.id})`);
    return armed || (!c && voiceArm(s));
  }, (xs) => xs.some(Boolean));
  return [...hits];
}
function containedHuman(r: N): string[] {
  const out: string[] = [];
  const v = (n: N, c: string | undefined) => {
    switch (n.op) {
      case 'step': if (c && (personWrite(n) || declaresVoice(n))) out.push(`${c}:human-write(${n.id})`); return;
      case 'seq': n.steps.forEach((x: N) => v(x, c)); return;
      case 'audit': n.lenses.forEach((l: N) => v(l.body, 'ST9')); return;
      case 'gate': v(n.body, 'ST10'); return;
      case 'pick': if (n.judge) v(n.judge, 'ST12'); return;
      case 'route': n.branches.forEach((b: N) => v(b.body, c)); return;
      default: if (n.body) v(n.body, c);
    }
  };
  r.stages.forEach((x: N) => v(x.body, undefined));
  return out;
}
/** ST10 'retry-scope' (r3-1b): a retrying one-shot gate never sits inside replicate, each or an audit lens. */
function retryScope(r: N): string[] {
  const out: string[] = [];
  const v = (n: N, concurrent: boolean) => {
    if (n.op === 'gate' && n.retry && concurrent) out.push(`ST10:retry-scope(${n.id})`);
    const conc = concurrent || n.op === 'replicate' || n.op === 'each' || n.op === 'audit';
    for (const c of [...(n.steps ?? []), ...(n.body ? [n.body] : []), ...(n.branches ?? []).map((b: N) => b.body), ...(n.lenses ?? []).map((l: N) => l.body)]) v(c, conc);
  };
  r.stages.forEach((x: N) => v(x.body, false));
  return out;
}
export function setAside(r: N): string[] {
  type S = { must: boolean };
  const typing = (withWrites: boolean) => {
    const miss: string[] = [];
    const t = (n: N, s: S): S => {
      switch (n.op) {
        case 'step': { if (n.consumes.includes(OPTION_SET) && !s.must) miss.push(`ST5:set-aside(step:${n.id})`); let o = { ...s }; if (n.produces.includes(OPTION_SET)) o = { must: true }; if (withWrites && personWrite(n)) o = { must: false }; return o; }
        case 'seq': return n.steps.reduce((a: S, c: N) => t(c, a), s);
        case 'replicate': t(n.body, s); return { must: true };
        case 'each': if (!s.must) miss.push(`ST5:set-aside(each:${n.id})`); t(n.body, { must: false }); return s;
        case 'pick': if (!s.must) miss.push(`ST5:set-aside(pick:${n.id})`); return n.k === 1 ? { must: false } : s;
        case 'loop': case 'relay': return t(n.body, s);
        case 'gate': t(n.body, s); return s;
        case 'optional': { const o = t(n.body, s); return { must: s.must && o.must }; }
        case 'route': { const os = n.branches.map((b: N) => t(b.body, s)); return { must: os.every((x: S) => x.must) }; }
        case 'audit': return s;
      }
      return s;
    };
    r.stages.reduce((s: S, st: N) => t(st.body, s), { must: r.inputs.includes(OPTION_SET) });
    return miss;
  };
  const base = typing(false);
  const out = typing(true).filter((x) => !base.includes(x));
  const containsPW = (n: N): boolean => n.op === 'step' ? personWrite(n) : [...(n.steps ?? []), ...(n.body ? [n.body] : []), ...(n.branches ?? []).map((b: N) => b.body)].some(containsPW);
  flow<boolean>(r, false, (s, stale, c) => {
    if (restores(s) && stale) out.push(`ST12:set-aside(previous:${s.id})`);
    if (c) return stale;
    if (personWrite(s)) return true;
    if (writesWorkModel(s) && s.role !== 'asset' && s.role !== 'relay') return false;
    return stale;
  }, (xs) => xs.some(Boolean));
  const scan = (n: N) => { if (n.op === 'loop' && ['critic-score', 'critic-rank'].includes(n.gate.metric) && containsPW(n.body)) out.push(`ST12:set-aside(snapshots:${n.id})`); for (const c of [...(n.steps ?? []), ...(n.body ? [n.body] : []), ...(n.branches ?? []).map((b: N) => b.body), ...(n.lenses ?? []).map((l: N) => l.body)]) scan(c); };
  r.stages.forEach((st: N) => scan(st.body));
  return [...new Set(out)];
}

// COMP-1 (r3-1b): protected checkpoints counted one to one over runsEveryTime steps, wider covers narrower.
type Key = { kind: 'voice' | 'author'; stage: string; base?: string; keyLines?: boolean; step: N };
export function checkpoints(r: N, pick: (r: N) => { s: N; stage: string }[]): Key[] {
  const out: Key[] = [];
  for (const x of pick(r)) {
    if (voiceWrite(x.s)) out.push({ kind: 'voice', stage: x.stage, ...voiceScope(x.s, r.medium), step: x.s });
    else if (authorWrite(x.s)) out.push({ kind: 'author', stage: x.stage, step: x.s });
  }
  return out;
}
const keyCovers = (h: Key, w: Key) => h.kind === w.kind && h.stage === w.stage && (h.kind === 'author' || covers(h, w));
export const keyName = (k: Key) => `${k.kind}:${k.stage}${k.kind === 'voice' ? `:${k.base}${k.keyLines ? '/key-lines' : ''}` : ''}`;
/** Match each wanted checkpoint to a distinct covering one (narrowest wants first, narrowest covering have first). */
export function match(want: Key[], have: Key[]): Map<Key, Key | undefined> {
  const used = new Set<Key>();
  const m = new Map<Key, Key | undefined>();
  const narrowFirst = (a: Key, b: Key) => Number(!!a.keyLines) - Number(!!b.keyLines);
  for (const w of [...want].sort((a, b) => -narrowFirst(a, b))) {
    const h = have.filter((x) => !used.has(x) && keyCovers(x, w)).sort(narrowFirst).reverse()[0];
    if (h) used.add(h);
    m.set(w, h);
  }
  return m;
}
export function comp1(r: N, nearest: N, pick = everyTime): string[] {
  const m = match(checkpoints(nearest, pick), checkpoints(r, pick));
  return [...m].filter(([, h]) => !h).map(([w]) => `${w.kind === 'voice' ? 'COMPOSED-VOICE' : 'COMPOSED-AUTHOR'}:missing(${keyName(w)})`);
}

// Writers after a mark, per role (validator stepsAfter semantics with changesWork; non-human, uncontained).
export function writersAfter(r: N, mark: (s: N) => boolean): Map<string, number> {
  const seen = new Set<N>();
  flow<boolean>(r, false, (s, armed, c) => {
    if (armed && s.actor !== 'human' && changesWork(s, c)) seen.add(s);
    return armed || (!c && mark(s));
  }, (xs) => xs.some(Boolean));
  const m = new Map<string, number>();
  for (const s of seen) m.set(s.role, (m.get(s.role) ?? 0) + 1);
  return m;
}
/** r3-1b: the writer allowance per VOICE counterpart (all VOICE writes, optional ones included). Unmatched VOICE: 0. */
function extraWritersPerVoice(r: N, nearest: N): string[] {
  const all = (rr: N) => (steps(rr) as N[]).map((x) => x.step);
  const keysOf = (rr: N): Key[] => { const out: Key[] = []; const visit = (n: N, st: string) => { if (n.op === 'step') { if (voiceWrite(n)) out.push({ kind: 'voice', stage: st, ...voiceScope(n, rr.medium), step: n }); return; } for (const c of [...(n.steps ?? []), ...(n.body ? [n.body] : []), ...(n.branches ?? []).map((b: N) => b.body), ...(n.lenses ?? []).map((l: N) => l.body)]) visit(c, st); }; rr.stages.forEach((s: N) => visit(s.body, s.stage)); return out; };
  void all;
  const want = keysOf(nearest), have = keysOf(r);
  const m = match(want, have);
  const counterpartOf = new Map<Key, Key>();
  for (const [w, h] of m) if (h) counterpartOf.set(h, w);
  const out: string[] = [];
  for (const h of have) {
    const w = counterpartOf.get(h);
    const allowed = w ? writersAfter(nearest, (s) => s === w.step) : new Map<string, number>();
    const got = writersAfter(r, (s) => s === h.step);
    for (const [role, n] of got) if (n > (allowed.get(role) ?? 0)) out.push(`COMPOSED-VOICE:extra-writer-after(${h.step.id}:${role} ${n}>${allowed.get(role) ?? 0})`);
  }
  // A declared-only VOICE (refused by ST12) is also a mark with allowance 0: declarations only add refusals.
  for (const s of all(r)) if (declaresVoice(s) && !voiceWrite(s)) { const got = writersAfter(r, (x) => x === s); for (const [role, n] of got) out.push(`COMPOSED-VOICE:extra-writer-after(${s.id}:${role} ${n}>0)`); }
  return [...new Set(out)];
}
function authorWriters(r: N, nearest: N): string[] {
  if (!checkpoints(nearest, everyTime).some((k) => k.kind === 'author')) return [];
  const out: string[] = [];
  flow<boolean>(r, false, (s, armed, c) => { if (armed && s.actor !== 'human' && changesWork(s, c)) out.push(`COMPOSED-AUTHOR:writer-after(${s.id})`); return armed || (!c && authorWrite(s)); }, (xs) => xs.some(Boolean));
  return [...new Set(out)];
}
export function dr9(r: N): string[] {
  const out: string[] = [];
  const vs = (steps(r) as N[]).filter(({ step }) => step.block === 'VOICE' || voiceWrite(step));
  for (const { step } of vs) { if (step.actor !== 'human') out.push(`DR9:model-voice(${step.id})`); if (step.knobs?.scope === 'key-lines') out.push(`DR9:key-lines(${step.id})`); }
  if (!(steps(r) as N[]).some(({ step }) => voiceWrite(step))) { if (r.inputs.includes('voice')) out.push('DR9:fixed-input'); else if (!r.sitsOut.some((s: N) => s.block === 'VOICE')) out.push('DR9:missing'); }
  return out;
}
/** All-kinds rules (validator) added by r3 and r3-1b. */
function voicePerCandidate(r: N): string[] {
  const out: string[] = [];
  const v = (n: N, inCand: boolean) => {
    if (n.op === 'step') { if (inCand && voiceArm(n)) out.push(`ST12:voice-per-candidate(${n.id})`); return; }
    const c = inCand || n.op === 'replicate' || n.op === 'each';
    for (const x of [...(n.steps ?? []), ...(n.body ? [n.body] : []), ...(n.branches ?? []).map((b: N) => b.body), ...(n.lenses ?? []).map((l: N) => l.body)]) v(x, c);
  };
  r.stages.forEach((x: N) => v(x.body, false));
  return out;
}
export const kindRules = (r: N) => [...st12Voice(r), ...blockRole(r), ...writerUndeclared(r), ...pr6(r), ...containedHuman(r), ...retryScope(r), ...setAside(r), ...voicePerCandidate(r)];
/** Composed-only rules (profile). */
export const composedRules = (r: N, nearest: N) => [...comp1(r, nearest), ...extraWritersPerVoice(r, nearest), ...authorWriters(r, nearest)];
export function revised(r: N, nearest?: N): string[] {
  return [...kindRules(r), ...(nearest ? composedRules(r, nearest) : [])];
}


/** The r3 rules as designed (for baselines): always-run without exit points, author = human build, writer allowance per role after any VOICE. */
export function revisedR3(r: N, nearest?: N): string[] {
  const kind = [...st12Voice(r), ...writerUndeclared(r), ...pr6(r), ...containedHuman(r), ...setAside(r), ...voicePerCandidate(r)];
  if (!nearest) return kind;
  const ck = (rr: N): Key[] => alwaysRunR3(rr).flatMap((x) => (voiceWrite(x.s) ? [{ kind: 'voice' as const, stage: x.stage, ...voiceScope(x.s, rr.medium), step: x.s }] : personWrite(x.s) && x.s.role === 'build' ? [{ kind: 'author' as const, stage: x.stage, step: x.s }] : []));
  const miss = [...match(ck(nearest), ck(r))].filter(([, h]) => !h).map(([w]) => `COMPOSED-${w.kind}:missing`);
  const allowed = writersAfter(nearest, voiceArm), got = writersAfter(r, voiceArm);
  const extra = [...got].filter(([role, n]) => n > (allowed.get(role) ?? 0)).map(([role]) => `COMPOSED-VOICE:extra(${role})`);
  const author: string[] = [];
  if (ck(nearest).some((k) => k.kind === 'author')) flow<boolean>(r, false, (s, armed, c) => { if (armed && s.actor !== 'human' && changesWork(s, c)) author.push(`COMPOSED-AUTHOR:writer-after(${s.id})`); return armed || (!c && personWrite(s) && s.role === 'build'); }, (xs) => xs.some(Boolean));
  return [...kind, ...miss, ...extra, ...new Set(author)];
}
