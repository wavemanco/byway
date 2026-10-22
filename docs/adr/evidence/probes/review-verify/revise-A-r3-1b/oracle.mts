// revise-A-r3-1b: (1) declaration monotonicity over writes, produces 'voice', keepsVoice and every block label;
// (2) a placement sweep checked against an execution oracle: every single move of one seq child of C1-C7 to any other
// seq position is judged by the r3-1b rules (sem.mts plus today's other checkAnswer findings) and by an independent
// trace-level model of the interpreter; any move the rules admit that breaks a checkpoint protection is a HOLE.
// Read-only imports of repo source; output only in this folder.
import { PROTOCOL_CONFIGS, c1, c2, c3, c4, c5, c6, c6a, c7 } from 'file:///C:/Users/arvik/code/byway/packages/catalog/src/index.ts';
import { checkAnswer } from 'file:///C:/Users/arvik/code/byway/packages/advisor/src/compose.ts';
import { steps } from 'file:///C:/Users/arvik/code/byway/packages/recipe/src/index.ts';
import { writeFileSync } from 'node:fs';
import { authorWrite, covers, feedsGate, personWrite, prompts, restores, revised, revisedR3, setExits, voiceScope, voiceWrite, writesWorkModel } from './sem.mts';

type N = any;
const OUT = 'C:/Users/arvik/AppData/Local/Temp/byway-review-verify/round3/revise-A-r3-1b/oracle.out.json';
const clone = (r: N) => { const c = JSON.parse(JSON.stringify(r)); delete c.hash; return c; };
const SUPERSEDED = (id: string) => id === 'COMPOSED-VOICE' || id === 'COMPOSED-AUTHOR' || id === 'PR6';
const todayAll = (r: N, nearest: N): string[] => (checkAnswer(JSON.stringify(r), nearest, { prompts, catalog: PROTOCOL_CONFIGS }, 'composed-test') as N).violations.map((v: N) => v.ruleId + (v.clause ? ':' + v.clause : ''));
const newVerdict = (r: N, nearest: N): { refused: boolean; why: string[] } => {
  const adds = revised(r, nearest);
  if (adds.length) return { refused: true, why: adds };
  const other = todayAll(r, nearest).filter((x) => !SUPERSEDED(x.split(':')[0]!));
  return { refused: other.length > 0, why: other };
};
const newVerdictR3 = (r: N, nearest: N): { refused: boolean; why: string[] } => {
  const adds = revisedR3(r, nearest);
  if (adds.length) return { refused: true, why: adds };
  const other = todayAll(r, nearest).filter((x) => !SUPERSEDED(x.split(':')[0]!));
  return { refused: other.length > 0, why: other };
};

// ---------------- execution oracle (independent of the rules) ----------------
type Ev = { t: 'step'; s: N; stage: string; contained: boolean; cand: boolean; loops: string[] } | { t: 'options' } | { t: 'pick' } | { t: 'snap'; loop: string };
type Out = { ev: Ev[]; exit?: string };
type Ctx = { stage: string; contained: boolean; cand: boolean; loop: { id: string; metric: string } | null; loops: string[] };
const CAP = 60000;
class TooMany extends Error {}
const seqCompose = (a: Out[], b: (o: Out) => Out[]): Out[] => {
  const out: Out[] = [];
  for (const p of a) {
    if (p.exit) { out.push(p); continue; }
    for (const o of b(p)) { out.push({ ev: p.ev.concat(o.ev), ...(o.exit ? { exit: o.exit } : {}) }); if (out.length > CAP) throw new TooMany(); }
  }
  return out;
};
function gen(n: N, ctx: Ctx): Out[] {
  switch (n.op) {
    case 'step': {
      const e: Ev = { t: 'step', s: n, stage: ctx.stage, contained: ctx.contained, cand: ctx.cand, loops: ctx.loops };
      // interpreter.ts:317 + afterGateStep: a model critic/check reporting to the loop may leave the body right after it.
      if (!ctx.contained && ctx.loop && feedsGate(n, ctx.loop.metric)) return [{ ev: [e] }, { ev: [e], exit: ctx.loop.id }];
      return [{ ev: [e] }];
    }
    case 'seq': return n.steps.reduce((acc: Out[], c: N) => seqCompose(acc, () => gen(c, ctx)), [{ ev: [] }]);
    case 'loop': {
      const scored = n.gate.metric === 'critic-score' || n.gate.metric === 'critic-rank';
      const inner: Ctx = { ...ctx, loop: { id: n.id, metric: n.gate.metric }, loops: [...ctx.loops, n.id] };
      let partial: Out[] = [{ ev: [] }];
      const done: Out[] = [];
      const finish = (ev: Ev[], maySnap: boolean) => { done.push({ ev }); if (maySnap && scored) done.push({ ev: ev.concat([{ t: 'snap', loop: n.id }]) }); };
      for (let round = 1; round <= 2; round++) {
        const next: Out[] = [];
        for (const p of partial) for (const o of gen(n.body, inner)) {
          const ev = p.ev.concat(o.ev);
          if (o.exit === n.id) { finish(ev, true); continue; }
          if (o.exit) { done.push({ ev, exit: o.exit }); continue; }
          if (n.gate.metric === 'human') { done.push({ ev }); if (round < 2) next.push({ ev }); }
          else if (round < 2) next.push({ ev });
          else finish(ev, true);
          if (done.length + next.length > CAP) throw new TooMany();
        }
        partial = next;
      }
      return done;
    }
    case 'relay': return [0, 1].reduce((acc: Out[]) => seqCompose(acc, () => gen(n.body, ctx)), [{ ev: [] }]);
    case 'optional': return [{ ev: [] }, ...gen(n.body, ctx)];
    case 'route': return n.branches.flatMap((b: N) => gen(b.body, ctx));
    case 'replicate': case 'each': return gen(n.body, { ...ctx, loop: null, cand: true }).map((o) => ({ ev: o.ev.concat([{ t: 'options' }]) }));
    case 'audit': return [{ ev: n.lenses.flatMap((l: N) => gen(l.body, { ...ctx, contained: true, loop: null })[0]!.ev) }];
    case 'gate': return [{ ev: gen(n.body, { ...ctx, contained: true, loop: null })[0]!.ev }];
    case 'pick': return [{ ev: [{ t: 'pick' }] }];
  }
  return [{ ev: [] }];
}
function traces(r: N): Ev[][] {
  let acc: Out[] = [{ ev: [] }];
  for (const st of r.stages) acc = seqCompose(acc, () => gen(st.body, { stage: st.stage, contained: false, cand: false, loop: null, loops: [] }));
  return acc.map((o) => o.ev);
}
type K = { kind: 'voice' | 'author'; stage: string; base?: string; keyLines?: boolean };
const ckOf = (e: N, medium: string): K | undefined => (e.t !== 'step' || e.contained || e.cand ? undefined : voiceWrite(e.s) ? { kind: 'voice', stage: e.stage, ...voiceScope(e.s, medium) } : authorWrite(e.s) ? { kind: 'author', stage: e.stage } : undefined);
const kc = (h: K, w: K) => h.kind === w.kind && h.stage === w.stage && (h.kind === 'author' || covers(h, w));
const kname = (k: K) => `${k.kind}:${k.stage}${k.kind === 'voice' ? `:${k.base}${k.keyLines ? '/kl' : ''}` : ''}`;
/** Checkpoints on every trace (multiset minimum over traces). */
function guaranteed(tr: Ev[][], medium: string): K[] {
  const per = tr.map((t) => t.map((e) => ckOf(e, medium)).filter(Boolean) as K[]);
  const names = new Set(per.flatMap((ks) => ks.map(kname)));
  const out: K[] = [];
  for (const nm of names) { const min = Math.min(...per.map((ks) => ks.filter((k) => kname(k) === nm).length)); const ex = per.flatMap((x) => x).find((k) => kname(k) === nm)!; for (let i = 0; i < min; i++) out.push(ex); }
  return out;
}
const executedWriter = (e: N) => e.t === 'step' && !e.contained && writesWorkModel(e.s);
/** Per VOICE occurrence (stage:base#n), the most model writers of each role that run after it on any trace. */
function writersAfterVoice(tr: Ev[][], medium: string): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const t of tr) {
    const occ = new Map<string, number>();
    t.forEach((e: N, i) => {
      if (e.t !== 'step' || e.contained || e.cand || !voiceWrite(e.s)) return;
      const sc = voiceScope(e.s, medium); const base = `${e.stage}:${sc.base}`; const n = (occ.get(base) ?? 0) + 1; occ.set(base, n);
      const key = `${base}#${n}`; const counts = new Map<string, number>();
      // Distinct writer steps (the profile's unit), not executions: a writer that runs per shot is still one writer.
      const seen = new Set<N>();
      for (const f of t.slice(i + 1) as N[]) if (executedWriter(f) && !seen.has(f.s)) { seen.add(f.s); counts.set(f.s.role, (counts.get(f.s.role) ?? 0) + 1); }
      const m = out.get(key) ?? new Map<string, number>();
      for (const [role, c] of counts) m.set(role, Math.max(m.get(role) ?? 0, c));
      out.set(key, m);
    });
  }
  return out;
}
function oracle(r: N, nearest: N, cacheN: { tr: Ev[][]; g: K[]; w: Map<string, Map<string, number>> }): string[] {
  const tr = traces(r);
  const bad = new Set<string>();
  for (const t of tr) {
    // P1: every checkpoint the nearest has on every run is on this run too, uncontained, one to one (wider covers narrower).
    const have = t.map((e) => ckOf(e, r.medium)).filter(Boolean) as K[]; const used = new Set<K>();
    for (const w of [...cacheN.g].sort((a, b) => Number(!!b.keyLines) - Number(!!a.keyLines))) { const h = have.find((x) => !used.has(x) && kc(x, w)); if (h) used.add(h); else bad.add(`P1:missing(${kname(w)})`); }
    // P3: nothing put back after a person's write reads an alternative made before it.
    let wrote = false; let optionsSince = true; let stale = false; const writeLoops = new Set<string>();
    for (const e of t as N[]) {
      if (e.t === 'options') optionsSince = true;
      if (e.t === 'pick' && wrote && !optionsSince) bad.add('P3:pick-after-write');
      if (e.t === 'snap' && writeLoops.has(e.loop)) bad.add(`P3:snapshot-before-write(${e.loop})`);
      if (e.t !== 'step') continue;
      if (!e.contained && !e.cand && restores(e.s) && stale) bad.add(`P3:restore-after-write(${e.s.id})`);
      if (!e.contained && !e.cand && personWrite(e.s)) { wrote = true; optionsSince = false; stale = true; e.loops.forEach((l: string) => writeLoops.add(l)); }
      else if (!e.contained && writesWorkModel(e.s) && e.s.role !== 'asset' && e.s.role !== 'relay') stale = false;
    }
  }
  // P2: per VOICE occurrence, no more model writers of a role after it than the nearest has after its counterpart.
  const wR = writersAfterVoice(tr, r.medium);
  for (const [key, m] of wR) { const allowed = cacheN.w.get(key) ?? new Map(); for (const [role, c] of m) if (c > (allowed.get(role) ?? 0)) bad.add(`P2:writers-after(${key}:${role} ${c}>${allowed.get(role) ?? 0})`); }
  return [...bad];
}

// ---------------- (1) declaration monotonicity ----------------
const report: N = { mono: {}, sweep: {} };
const BLOCKS = ['SEED', 'VISION', 'CRITIC', 'ASSET', 'RELAY', 'CUT', 'TELLS', 'VOICE'];
const mutations: { name: string; f: (s: N) => N }[] = [
  { name: 'writes:true', f: (s) => ({ ...s, writes: true }) },
  { name: 'writes:false', f: (s) => ({ ...s, writes: false }) },
  { name: 'writes:absent', f: (s) => { const { writes: _w, ...x } = s; return x; } },
  { name: '+voice', f: (s) => ({ ...s, produces: s.produces.includes('voice') ? s.produces : ['voice', ...s.produces] }) },
  { name: '-voice', f: (s) => ({ ...s, produces: s.produces.filter((p: string) => p !== 'voice') }) },
  { name: 'keepsVoice:true', f: (s) => ({ ...s, keepsVoice: true }) },
  { name: 'keepsVoice:absent', f: (s) => { const { keepsVoice: _k, ...x } = s; return x; } },
  ...BLOCKS.map((b) => ({ name: `block:${b}`, f: (s: N) => ({ ...s, block: b }) })),
  { name: 'block:absent', f: (s) => { const { block: _b, ...x } = s; return x; } },
];
function mapNodes(n: N, f: (n: N) => N): N { const m = f(n); if (m !== n) return m; const c: N = { ...n }; if (c.steps) c.steps = c.steps.map((x: N) => mapNodes(x, f)); if (c.body) c.body = mapNodes(c.body, f); if (c.branches) c.branches = c.branches.map((b: N) => ({ ...b, body: mapNodes(b.body, f) })); if (c.lenses) c.lenses = c.lenses.map((b: N) => ({ ...b, body: mapNodes(b.body, f) })); if (c.judge) c.judge = mapNodes(c.judge, f); return c; }
const edit = (r: N, id: string, f: (s: N) => N) => ({ ...r, stages: r.stages.map((s: N) => ({ ...s, body: mapNodes(s.body, (n: N) => (n.op === 'step' && n.id === id ? f(n) : n)) })) });
const findStep = (r: N, pred: (s: N) => boolean) => (steps(r) as N[]).map((x) => x.step).find(pred);
const appendLast = (r: N, node: N) => { const last = r.stages.at(-1); last.body = last.body.op === 'seq' ? { ...last.body, steps: [...last.body.steps, node] } : { op: 'seq', steps: [last.body, node] }; return r; };
const insAfter = (r: N, afterId: string | null, ...nodes: N[]) => { const st = r.stages[0]; const i = afterId === null ? st.body.steps.length - 1 : st.body.steps.findIndex((s: N) => s.id === afterId); st.body.steps.splice(i + 1, 0, ...nodes); return r; };
const fixC3 = findStep(c3, (s: N) => s.role === 'fix' && s.actor === 'model');
const fixAfterC4 = { ...findStep(c4, (s: N) => s.role === 'fix' && s.actor === 'model'), id: 'ai-polish' };
const fixAfterC3 = { op: 'step', id: 'ai-polish', role: 'fix', actor: 'model', tier: 'mid', prompt: fixC3.prompt, consumes: ['artifact', 'critique'], produces: ['artifact'], writes: true };
const pickR = { op: 'pick', id: 'final-pick', mode: 'R', k: 1, actor: 'policy' };
const c1check = findStep(c1, (s: N) => s.id === 'critic-check');
const checkGate = (max: number, onCap: string) => ({ metric: 'check-clean', hidden: false, holder: 'harness', probe: 1, max, onCap, onNoConverge: onCap === 'human' ? 'recalibrate-human' : 'continue' });
const renderStep = (id: string) => ({ op: 'step', id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const moveAfterD3Voice = (id: string) => { const r = clone(c5); const d2 = r.stages.find((s: N) => s.stage === 'D2'); const d3 = r.stages.find((s: N) => s.stage === 'D3'); const j = d2.body.steps.findIndex((s: N) => s.op === 'step' && s.id === id); const [w] = d2.body.steps.splice(j, 1); const i = d3.body.steps.findIndex((s: N) => s.op === 'step' && s.id === 'voice'); d3.body.steps.splice(i + 1, 0, w); return r; };
const B: [string, N, N][] = [
  ['S1', c4, appendLast(clone(c4), { ...fixAfterC4, writes: false })],
  ['M2', c3, (() => { const rr = edit(clone(c3), 'voice', () => ({ ...fixC3, id: 'voice-pass', produces: ['voice', 'artifact'] })); rr.sitsOut = [...rr.sitsOut, { block: 'VOICE', reason: 'x' }]; return rr; })()],
  ['W2', c3, edit(clone(c3), 'voice', (n) => ({ ...n, role: 'vision' }))],
  ['W1', c2, edit(clone(c2), 'voice', (n) => ({ ...n, produces: ['voice'] }))],
  ['Q1', c2, insAfter(clone(c2), 'voice', pickR)],
  ['V1', c3, appendLast(edit(clone(c3), 'voice', (n) => ({ ...n, produces: ['artifact'] })), fixAfterC3)],
  ['V2c', c5, (() => { const r1 = clone(c5); const d3b = r1.stages.find((s: N) => s.stage === 'D3'); d3b.body.steps = d3b.body.steps.filter((s: N) => !(s.op === 'step' && s.id === 'voice')); return r1; })()],
  ['X1', c3, edit(clone(c3), 'voice', (n) => ({ ...n, role: 'build' }))],
  ['X3', c3, edit(clone(c3), 'tells-compare', (n) => ({ op: 'seq', steps: [n, { op: 'step', id: 'fake-voice', role: 'vision', block: 'VOICE', actor: 'human', consumes: ['view'], produces: ['voice', 'artifact'] }] }))],
  ['C6+writer', c6, appendLast(clone(c6), { ...fixAfterC3, prompt: findStep(c6, (s: N) => s.actor === 'model' && s.role === 'build')?.prompt ?? fixAfterC3.prompt })],
  ['K1-C1', c1, (() => { const r = clone(c1); const d3 = r.stages.find((s: N) => s.stage === 'D3'); const i = d3.body.steps.findIndex((s: N) => s.op === 'step' && s.id === 'voice'); const v = d3.body.steps[i]; d3.body.steps = [...d3.body.steps.slice(0, i), { op: 'loop', id: 'final-pass', body: { op: 'seq', steps: [renderStep('final-render'), c1check, v] }, gate: checkGate(1, 'policy-best-snapshot') }]; return r; })()],
  ['K2b', c5, moveAfterD3Voice('render-in-scene')],
  ['K2f', c5, moveAfterD3Voice('vo-audio')],
  ['G1', c1, (() => { const r = clone(c1); const d2 = r.stages.find((s: N) => s.stage === 'D2'); const each = d2.body.steps[0]; const crit = findStep(c1, (s: N) => s.role === 'critic'); each.body.steps.push(renderStep('cand-render')); each.body.steps.push({ op: 'gate', id: 'cand-gate', body: { ...crit, id: 'cand-critic' }, pass: { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }, retry: { stage: 'D2', times: 1 }, onFail: 'human' }); return r; })()],
];
let tried = 0, flips = 0; const flipList: N[] = [];
for (const [name, nearest, r] of B) {
  const base = newVerdict(r, nearest);
  if (!base.refused) { console.log('BASE NOT REFUSED', name); flipList.push({ name, baseNotRefused: true }); continue; }
  for (const { step } of steps(r) as N[]) for (const m of mutations) {
    tried++;
    const v = newVerdict(edit(clone(r), step.id, m.f), nearest);
    if (!v.refused) { flips++; flipList.push({ name, step: step.id, mutation: m.name }); console.log('FLIP', name, step.id, m.name); }
  }
}
console.log(`monotonicity: ${tried} single declaration changes (writes, produces voice, keepsVoice, 8 blocks + none) on ${B.length} refused bases; admitted: ${flips}`);
report.mono = { tried, flips, flipList };

// ---------------- (2) placement sweep against the oracle ----------------
type Pos = { path: (string | number)[]; index: number };
function seqChildren(r: N): { path: (string | number)[]; seq: N }[] {
  const out: { path: (string | number)[]; seq: N }[] = [];
  const v = (n: N, path: (string | number)[]) => {
    if (n.op === 'seq') { out.push({ path, seq: n }); n.steps.forEach((c: N, i: number) => v(c, [...path, 'steps', i])); return; }
    if (n.body) v(n.body, [...path, 'body']);
    if (n.branches) n.branches.forEach((b: N, i: number) => v(b.body, [...path, 'branches', i, 'body']));
    if (n.lenses) n.lenses.forEach((l: N, i: number) => v(l.body, [...path, 'lenses', i, 'body']));
  };
  r.stages.forEach((s: N, i: number) => v(s.body, ['stages', i, 'body']));
  return out;
}
const at = (o: N, path: (string | number)[]) => path.reduce((x, k) => x[k], o);
const t0 = Date.now();
for (const N0 of PROTOCOL_CONFIGS as N[]) {
  const nTr = traces(N0);
  const cacheN = { tr: nTr, g: guaranteed(nTr, N0.medium), w: writersAfterVoice(nTr, N0.medium) };
  const self = oracle(clone(N0), N0, cacheN);
  const stats = { moves: 0, admitted: 0, refused: 0, holes: [] as N[], todayHoles: [] as N[], r3Holes: [] as N[], newOnly: {} as Record<string, number>, newOnlyEx: {} as Record<string, string>, overStrict: 0, tooMany: 0, nearestGuaranteed: cacheN.g.map(kname), nearestTraces: nTr.length, selfOracle: self };
  const sources = seqChildren(N0).flatMap(({ path, seq }) => seq.steps.map((_: N, i: number) => ({ path, i })));
  for (const src of sources) {
    const base = clone(N0);
    const srcSeq = at(base, src.path); const [node] = srcSeq.steps.splice(src.i, 1);
    if (!srcSeq.steps.length) continue;
    for (const dst of seqChildren(base)) {
      for (let j = 0; j <= dst.seq.steps.length; j++) {
        if (JSON.stringify(dst.path) === JSON.stringify(src.path) && (j === src.i)) continue;
        const r = clone(base); at(r, dst.path).steps.splice(j, 0, node);
        stats.moves++;
        const v = newVerdict(r, N0);
        let o: string[];
        try { o = oracle(r, N0, cacheN); } catch (e) { if (e instanceof TooMany) { stats.tooMany++; continue; } throw e; }
        const move = `${node.id ?? node.op} -> ${dst.path.join('.')}[${j}]`;
        if (v.refused) {
          stats.refused++;
          if (!o.length) {
            stats.overStrict++;
            // Refused only because of a rule r3-1b adds or changes, while the oracle finds every protection intact.
            const other = todayAll(r, N0).filter((x) => !SUPERSEDED(x.split(':')[0]!));
            if (!other.length) { const rule = v.why.map((w) => w.replace(/\(.*$/, '')).sort().join('+'); stats.newOnly[rule] = (stats.newOnly[rule] ?? 0) + 1; if (!stats.newOnlyEx[rule]) stats.newOnlyEx[rule] = `${move}: ${v.why.join(', ')}`; }
          }
        }
        else { stats.admitted++; if (o.length) stats.holes.push({ move, oracle: o }); }
        // Baselines: today's rules, and the r3 rules on the r3 flow (no exit forks, always-run without exit points).
        if (o.length) {
          if (!todayAll(r, N0).length) stats.todayHoles.push({ move, oracle: o });
          setExits(false); const r3 = newVerdictR3(r, N0); setExits(true);
          if (!r3.refused) stats.r3Holes.push({ move, oracle: o });
        }
      }
    }
  }
  report.sweep[N0.id] = stats;
  console.log(`${N0.id}: moves ${stats.moves}, admitted ${stats.admitted}, HOLES ${stats.holes.length} (today ${stats.todayHoles.length}, r3 ${stats.r3Holes.length}), refused ${stats.refused} (oracle-clean among refused ${stats.overStrict}), tooMany ${stats.tooMany}, nearest traces ${nTr.length}, guaranteed ${JSON.stringify(stats.nearestGuaranteed)}, self-oracle ${JSON.stringify(self)}  [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
  for (const h of stats.holes.slice(0, 8)) console.log("   HOLE", h.move, JSON.stringify(h.oracle));
  for (const h of stats.r3Holes.slice(0, 6)) console.log("   r3-hole", h.move, JSON.stringify(h.oracle));
  for (const h of stats.todayHoles.slice(0, 4)) console.log("   today-hole", h.move, JSON.stringify(h.oracle));
  console.log("   refused only by r3-1b rules with the oracle clean:", JSON.stringify(stats.newOnly), JSON.stringify(stats.newOnlyEx));
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}
writeFileSync(OUT, JSON.stringify(report, null, 2));
