/**
 * Two corpus properties of admission (ADR-0092), ported from the 2026-10-08 verification (revise-A-r3-1b/oracle.mts):
 *
 * 1. Declaration monotonicity: a declaration can only add refusals. For every refused recipe in the acceptance corpus,
 *    no single change of `writes` (true, false, absent), the 'voice' port (added, removed), `keepsVoice` (true, absent)
 *    or the block label (each of the 8, absent) on any step makes checkAnswer accept it.
 * 2. Placement soundness: for C1–C7 and C6a, every single move of one seq child to another seq position that admission
 *    accepts keeps every checkpoint protection, judged by a trace-level model of the interpreter (loops unrolled twice,
 *    with a way out after every exit point; optionals both ways; every route branch; containers contained):
 *    - the nearest recipe's checkpoints that occur on every trace occur on every trace here too, one to one;
 *    - after each VOICE occurrence, no more distinct model writer steps of a role than the nearest recipe has;
 *    - no pick, keep-or-revert or scored-loop exit brings back what was made before a person's write.
 *
 * Stated limits: the oracle shares the step-level predicates (personWrite, voiceWrite, the effects table) with the
 * rules, its writers-after criterion is the profile's own unit, and it tries single moves only.
 */
import { describe, expect, it } from 'vitest';
import { c1, c3, c4, c5, c6, PROTOCOL_CONFIGS } from '@byway/catalog';
import { authorWrite, covers, feedsGate, machineWrites, personWrite, restoresWork, SNAPSHOT_METRICS, steps, voiceScope, voiceWrite, type Recipe, type Step, type VoiceScope } from '@byway/recipe';
import { checkAnswer } from '../src/index.ts';
import { fencedJson, PROMPTS } from './helpers.ts';

type N = Record<string, any>;
const clone = (r: Recipe | N): N => {
  const c = structuredClone(r) as N;
  delete c.hash;
  return c;
};
const refused = (r: N, nearest: Recipe): boolean => checkAnswer(fencedJson(r), nearest, { prompts: PROMPTS, catalog: PROTOCOL_CONFIGS }, 'composed-corpus').violations.length > 0;

function mapNodes(n: N, f: (n: N) => N): N {
  const m = f(n);
  if (m !== n) return m;
  const c: N = { ...n };
  if (c.steps) c.steps = c.steps.map((x: N) => mapNodes(x, f));
  if (c.body) c.body = mapNodes(c.body, f);
  if (c.branches) c.branches = c.branches.map((b: N) => ({ ...b, body: mapNodes(b.body, f) }));
  if (c.lenses) c.lenses = c.lenses.map((b: N) => ({ ...b, body: mapNodes(b.body, f) }));
  if (c.judge) c.judge = mapNodes(c.judge, f);
  return c;
}
const edit = (r: N, id: string, f: (s: N) => N): N => ({ ...r, stages: r.stages.map((s: N) => ({ ...s, body: mapNodes(s.body, (n) => (n.op === 'step' && n.id === id ? f(n) : n)) })) });
const findStep = (r: Recipe, id: string): Step => steps(r).find(({ step }) => step.id === id)!.step;
const without = (s: N, key: string): N => Object.fromEntries(Object.entries(s).filter(([k]) => k !== key));
const stageOf = (r: N, stage: string): N => r.stages.find((s: N) => s.stage === stage);
const at = (seq: N, id: string): number => seq.steps.findIndex((s: N) => s.id === id);

// ---- 1. Declaration monotonicity --------------------------------------------------------------------------------

const BLOCKS = ['SEED', 'VISION', 'CRITIC', 'ASSET', 'RELAY', 'CUT', 'TELLS', 'VOICE'];
const MUTATIONS: { name: string; f: (s: N) => N }[] = [
  { name: 'writes:true', f: (s) => ({ ...s, writes: true }) },
  { name: 'writes:false', f: (s) => ({ ...s, writes: false }) },
  { name: 'writes:absent', f: (s) => without(s, 'writes') },
  { name: '+voice', f: (s) => ({ ...s, produces: s.produces.includes('voice') ? s.produces : ['voice', ...s.produces] }) },
  { name: '-voice', f: (s) => ({ ...s, produces: s.produces.filter((p: string) => p !== 'voice') }) },
  { name: 'keepsVoice:true', f: (s) => ({ ...s, keepsVoice: true }) },
  { name: 'keepsVoice:absent', f: (s) => without(s, 'keepsVoice') },
  ...BLOCKS.map((b) => ({ name: `block:${b}`, f: (s: N) => ({ ...s, block: b }) })),
  { name: 'block:absent', f: (s) => without(s, 'block') },
];

const c3fix = findStep(c3, 'revise');
const c4fix = { ...findStep(c4, 'revise'), id: 'ai-polish' };
const fixAfterC3 = { op: 'step', id: 'ai-polish', role: 'fix', actor: 'model', tier: 'mid', prompt: c3fix.prompt, consumes: ['artifact', 'critique'], produces: ['artifact'], writes: true };
const render = (id: string): N => ({ op: 'step', id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const checkGate = (max: number, onCap: string): N => ({ metric: 'check-clean', hidden: false, holder: 'harness', probe: 1, max, onCap, onNoConverge: onCap === 'human' ? 'recalibrate-human' : 'continue' });
const appendLast = (r: N, node: N): N => {
  const last = r.stages.at(-1);
  last.body = last.body.op === 'seq' ? { ...last.body, steps: [...last.body.steps, node] } : { op: 'seq', steps: [last.body, node] };
  return r;
};
const insertAfter = (r: N, stage: string, afterId: string, ...nodes: N[]): N => {
  const s = stageOf(r, stage).body;
  s.steps.splice(at(s, afterId) + 1, 0, ...nodes);
  return r;
};
const movedAfterLateVoice = (id: string): N => {
  const r = clone(c5);
  const d2 = stageOf(r, 'D2').body;
  const [w] = d2.steps.splice(at(d2, id), 1);
  const d3 = stageOf(r, 'D3').body;
  d3.steps.splice(at(d3, 'voice') + 1, 0, w);
  return r;
};
const k1c1 = (): N => {
  const r = clone(c1);
  const d3 = stageOf(r, 'D3').body;
  const i = at(d3, 'voice');
  d3.steps = [...d3.steps.slice(0, i), { op: 'loop', id: 'final-pass', body: { op: 'seq', steps: [render('final-render'), findStep(c1, 'critic-check'), d3.steps[i]] }, gate: checkGate(1, 'policy-best-snapshot') }];
  return r;
};

/** The verification's refused bases (G1, a stage-2 retry-scope case, waits for that stage). */
const BASES: [string, Recipe, N][] = [
  ['S1', c4, appendLast(clone(c4), { ...c4fix, writes: false })],
  ['M2', c3, { ...edit(clone(c3), 'voice', () => ({ ...c3fix, id: 'voice-pass', produces: ['voice', 'artifact'] })), sitsOut: [{ block: 'VOICE', reason: 'x' }] }],
  ['W2', c3, edit(clone(c3), 'voice', (n) => ({ ...n, role: 'vision' }))],
  ['W1', PROTOCOL_CONFIGS[1]!, edit(clone(PROTOCOL_CONFIGS[1]!), 'voice', (n) => ({ ...n, produces: ['voice'] }))],
  ['Q1', PROTOCOL_CONFIGS[1]!, insertAfter(clone(PROTOCOL_CONFIGS[1]!), 'D1', 'voice', { op: 'pick', id: 'final-pick', mode: 'R', k: 1, actor: 'policy' })],
  ['V1', c3, appendLast(edit(clone(c3), 'voice', (n) => ({ ...n, produces: ['artifact'] })), fixAfterC3)],
  ['V2c', c5, (() => {
    const r = clone(c5);
    const d3 = stageOf(r, 'D3').body;
    d3.steps = d3.steps.filter((s: N) => s.id !== 'voice');
    return r;
  })()],
  ['X1', c3, edit(clone(c3), 'voice', (n) => ({ ...n, role: 'build' }))],
  ['X3', c3, edit(clone(c3), 'tells-compare', (n) => ({ op: 'seq', steps: [n, { op: 'step', id: 'fake-voice', role: 'vision', block: 'VOICE', actor: 'human', consumes: ['view'], produces: ['voice', 'artifact'] }] }))],
  ['C6+writer', c6, appendLast(clone(c6), fixAfterC3)],
  ['K1-C1', c1, k1c1()],
  ['K2b', c5, movedAfterLateVoice('render-in-scene')],
  ['K2f', c5, movedAfterLateVoice('vo-audio')],
];

describe('declaration monotonicity: no single declaration change admits a refused recipe', () => {
  let total = 0;
  it.each(BASES)('%s', (_name, nearest, base) => {
    expect(refused(base, nearest), 'the base is refused').toBe(true);
    const admitted: string[] = [];
    for (const { step } of steps(base as Recipe)) {
      for (const m of MUTATIONS) {
        total++;
        if (!refused(edit(clone(base), step.id, m.f), nearest)) admitted.push(`${step.id} ${m.name}`);
      }
    }
    expect(admitted).toEqual([]);
  }, 120_000);

  it('tried every change (one per step, declaration and base)', () => {
    expect(total).toBe(BASES.reduce((n, [, , base]) => n + steps(base as Recipe).length * MUTATIONS.length, 0));
  });
});

// ---- 2. Placement soundness against an execution oracle ---------------------------------------------------------

type Ev = { t: 'step'; s: N; stage: string; contained: boolean; cand: boolean; loops: string[] } | { t: 'options' } | { t: 'pick' } | { t: 'snap'; loop: string };
type Out = { ev: Ev[]; exit?: string };
type Ctx = { stage: string; contained: boolean; cand: boolean; loop: { id: string; metric: string } | null; loops: string[] };
const CAP = 60_000;
class TooMany extends Error {}

function then(a: Out[], b: () => Out[]): Out[] {
  const out: Out[] = [];
  for (const p of a) {
    if (p.exit) {
      out.push(p);
      continue;
    }
    for (const o of b()) {
      out.push({ ev: p.ev.concat(o.ev), ...(o.exit ? { exit: o.exit } : {}) });
      if (out.length > CAP) throw new TooMany();
    }
  }
  return out;
}

/** The runs a node can make, as event traces: the interpreter's control flow, written independently of the rules. */
function gen(n: N, ctx: Ctx): Out[] {
  switch (n.op) {
    case 'step': {
      const e: Ev = { t: 'step', s: n, stage: ctx.stage, contained: ctx.contained, cand: ctx.cand, loops: ctx.loops };
      // interpreter.ts: a model critic or check that reports to the loop's gate may end the body right after it.
      if (!ctx.contained && ctx.loop && feedsGate(n as Step, ctx.loop.metric)) return [{ ev: [e] }, { ev: [e], exit: ctx.loop.id }];
      return [{ ev: [e] }];
    }
    case 'seq':
      return n.steps.reduce((acc: Out[], c: N) => then(acc, () => gen(c, ctx)), [{ ev: [] }]);
    case 'loop': {
      const scored = SNAPSHOT_METRICS.has(n.gate.metric);
      const inner: Ctx = { ...ctx, loop: { id: n.id, metric: n.gate.metric }, loops: [...ctx.loops, n.id] };
      let partial: Out[] = [{ ev: [] }];
      const done: Out[] = [];
      const finish = (ev: Ev[]) => {
        done.push({ ev });
        if (scored) done.push({ ev: ev.concat([{ t: 'snap', loop: n.id }]) });
      };
      for (let round = 1; round <= 2; round++) {
        const next: Out[] = [];
        for (const p of partial) {
          for (const o of gen(n.body, inner)) {
            const ev = p.ev.concat(o.ev);
            if (o.exit === n.id) finish(ev);
            else if (o.exit) done.push({ ev, exit: o.exit });
            else if (n.gate.metric === 'human') {
              done.push({ ev });
              if (round < 2) next.push({ ev });
            } else if (round < 2) next.push({ ev });
            else finish(ev);
            if (done.length + next.length > CAP) throw new TooMany();
          }
        }
        partial = next;
      }
      return done;
    }
    case 'relay':
      return [0, 1].reduce((acc: Out[]) => then(acc, () => gen(n.body, ctx)), [{ ev: [] }]);
    case 'optional':
      return [{ ev: [] }, ...gen(n.body, ctx)];
    case 'route':
      return n.branches.flatMap((b: N) => gen(b.body, ctx));
    case 'replicate':
    case 'each':
      return gen(n.body, { ...ctx, loop: null, cand: true }).map((o) => ({ ev: o.ev.concat([{ t: 'options' }]) }));
    case 'audit':
      return [{ ev: n.lenses.flatMap((l: N) => gen(l.body, { ...ctx, contained: true, loop: null })[0]!.ev) }];
    case 'gate':
      return [{ ev: gen(n.body, { ...ctx, contained: true, loop: null })[0]!.ev }];
    case 'pick':
      return [{ ev: [{ t: 'pick' }] }];
  }
  return [{ ev: [] }];
}
function traces(r: N): Ev[][] {
  let acc: Out[] = [{ ev: [] }];
  for (const st of r.stages) acc = then(acc, () => gen(st.body, { stage: st.stage, contained: false, cand: false, loop: null, loops: [] }));
  return acc.map((o) => o.ev);
}

type K = { kind: 'voice' | 'author'; stage: string; scope?: VoiceScope };
const ckOf = (e: Ev, medium: Recipe['medium']): K | undefined => {
  if (e.t !== 'step' || e.contained || e.cand) return undefined;
  if (voiceWrite(e.s as Step)) return { kind: 'voice', stage: e.stage, scope: voiceScope(e.s as Step, medium) };
  return authorWrite(e.s as Step) ? { kind: 'author', stage: e.stage } : undefined;
};
const kCovers = (h: K, w: K) => h.kind === w.kind && h.stage === w.stage && (h.kind === 'author' || covers(h.scope!, w.scope!));
const kName = (k: K) => `${k.kind}:${k.stage}${k.scope ? `:${k.scope.base}${k.scope.keyLines ? '/key-lines' : ''}` : ''}`;
const narrowFirst = (a: K, b: K) => Number(!!b.scope?.keyLines) - Number(!!a.scope?.keyLines);

/** The checkpoints on every trace (the multiset minimum). */
function guaranteed(tr: Ev[][], medium: Recipe['medium']): K[] {
  const per = tr.map((t) => t.map((e) => ckOf(e, medium)).filter((k): k is K => !!k));
  const out: K[] = [];
  for (const name of new Set(per.flatMap((ks) => ks.map(kName)))) {
    const min = Math.min(...per.map((ks) => ks.filter((k) => kName(k) === name).length));
    const example = per.flat().find((k) => kName(k) === name)!;
    for (let i = 0; i < min; i++) out.push(example);
  }
  return out;
}
/** Per VOICE occurrence (stage:base#n), the most distinct model writer steps of each role after it on any trace. */
function writersAfterVoice(tr: Ev[][], medium: Recipe['medium']): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const t of tr) {
    const occurrences = new Map<string, number>();
    t.forEach((e, i) => {
      if (e.t !== 'step' || e.contained || e.cand || !voiceWrite(e.s as Step)) return;
      const base = `${e.stage}:${voiceScope(e.s as Step, medium).base}`;
      const n = (occurrences.get(base) ?? 0) + 1;
      occurrences.set(base, n);
      const seen = new Set<N>();
      const counts = new Map<string, number>();
      for (const f of t.slice(i + 1)) {
        // Distinct writer steps, the profile's unit: a writer that runs once per shot is still one writer.
        if (f.t === 'step' && !f.contained && machineWrites(f.s as Step) && !seen.has(f.s)) {
          seen.add(f.s);
          counts.set(f.s.role, (counts.get(f.s.role) ?? 0) + 1);
        }
      }
      const m = out.get(`${base}#${n}`) ?? new Map<string, number>();
      for (const [role, c] of counts) m.set(role, Math.max(m.get(role) ?? 0, c));
      out.set(`${base}#${n}`, m);
    });
  }
  return out;
}
interface Nearest {
  guaranteed: K[];
  writers: Map<string, Map<string, number>>;
}
/** Every protection a move breaks, by the traces alone. */
function breaches(r: N, nearest: Nearest): string[] {
  const bad = new Set<string>();
  for (const t of traces(r)) {
    const have = t.map((e) => ckOf(e, r.medium)).filter((k): k is K => !!k);
    const used = new Set<K>();
    for (const w of [...nearest.guaranteed].sort(narrowFirst)) {
      const h = have.find((x) => !used.has(x) && kCovers(x, w));
      if (h) used.add(h);
      else bad.add(`missing ${kName(w)}`);
    }
    let wrote = false;
    let optionsSince = true;
    let stale = false;
    const writeLoops = new Set<string>();
    for (const e of t) {
      if (e.t === 'options') optionsSince = true;
      if (e.t === 'pick' && wrote && !optionsSince) bad.add('pick after a person’s write');
      if (e.t === 'snap' && writeLoops.has(e.loop)) bad.add(`snapshot of ${e.loop} from before a person’s write`);
      if (e.t !== 'step' || e.contained) continue;
      if (!e.cand && restoresWork(e.s as Step) && stale) bad.add(`restore after a person’s write (${e.s.id})`);
      if (!e.cand && personWrite(e.s as Step)) {
        wrote = true;
        optionsSince = false;
        stale = true;
        e.loops.forEach((l) => writeLoops.add(l));
      } else if (machineWrites(e.s as Step) && e.s.role !== 'asset' && e.s.role !== 'relay') stale = false;
    }
  }
  for (const [key, roles] of writersAfterVoice(traces(r), r.medium)) {
    const allowed = nearest.writers.get(key) ?? new Map<string, number>();
    for (const [role, c] of roles) if (c > (allowed.get(role) ?? 0)) bad.add(`writers after ${key}: ${role} ${c} > ${allowed.get(role) ?? 0}`);
  }
  return [...bad];
}

type Path = (string | number)[];
function seqs(r: N): { path: Path; seq: N }[] {
  const out: { path: Path; seq: N }[] = [];
  const visit = (n: N, path: Path) => {
    if (n.op === 'seq') {
      out.push({ path, seq: n });
      n.steps.forEach((c: N, i: number) => visit(c, [...path, 'steps', i]));
      return;
    }
    if (n.body) visit(n.body, [...path, 'body']);
    if (n.branches) n.branches.forEach((b: N, i: number) => visit(b.body, [...path, 'branches', i, 'body']));
    if (n.lenses) n.lenses.forEach((l: N, i: number) => visit(l.body, [...path, 'lenses', i, 'body']));
  };
  r.stages.forEach((s: N, i: number) => visit(s.body, ['stages', i, 'body']));
  return out;
}
const atPath = (o: N, path: Path): N => path.reduce((x: N, k) => x[k], o);

describe('the oracle is not vacuous: it sees the breaches the verification found', () => {
  const against = (nearest: Recipe, r: N) => {
    const t = traces(clone(nearest));
    return breaches(r, { guaranteed: guaranteed(t, nearest.medium), writers: writersAfterVoice(t, nearest.medium) }).join('; ');
  };
  it('K1: VOICE after a check that can end its loop', () => expect(against(c1, k1c1())).toMatch(/missing voice:D3:all/));
  it('K2b: a writer moved past the late VOICE', () => expect(against(c5, movedAfterLateVoice('render-in-scene'))).toMatch(/writers after D3:on-screen#1: relay/));
  it('Q1: a pick after VOICE', () => expect(against(PROTOCOL_CONFIGS[1]!, BASES.find(([n]) => n === 'Q1')![2])).toMatch(/pick after/));
  it('R1: a keep-or-revert right after the human cut', () => {
    const r = clone(c3);
    const d3 = stageOf(r, 'D3').body;
    const [tc] = d3.steps.splice(at(d3, 'tells-compare'), 1);
    d3.steps.splice(2, 0, tc);
    expect(against(c3, r)).toMatch(/restore after/);
  });
});

describe('placement soundness: no single move admission accepts breaks a checkpoint protection', () => {
  const tally = { moves: 0, admitted: 0, tooMany: 0 };
  it.each(PROTOCOL_CONFIGS.map((r) => [r.id, r] as const))('%s', (_id, nearest) => {
    const nTraces = traces(clone(nearest));
    const n: Nearest = { guaranteed: guaranteed(nTraces, nearest.medium), writers: writersAfterVoice(nTraces, nearest.medium) };
    expect(breaches(clone(nearest), n), 'the nearest recipe against itself').toEqual([]);
    const holes: string[] = [];
    const sources = seqs(clone(nearest)).flatMap(({ path, seq }) => seq.steps.map((_: N, i: number) => ({ path, i })));
    for (const src of sources) {
      const base = clone(nearest);
      const from = atPath(base, src.path);
      const [node] = from.steps.splice(src.i, 1);
      if (!from.steps.length) continue;
      for (const dst of seqs(base)) {
        for (let j = 0; j <= dst.seq.steps.length; j++) {
          if (JSON.stringify(dst.path) === JSON.stringify(src.path) && j === src.i) continue;
          const r = clone(base);
          atPath(r, dst.path).steps.splice(j, 0, node);
          tally.moves++;
          if (refused(r, nearest)) continue;
          tally.admitted++;
          let found: string[];
          try {
            found = breaches(r, n);
          } catch (e) {
            if (!(e instanceof TooMany)) throw e;
            tally.tooMany++;
            continue;
          }
          if (found.length) holes.push(`${node.id ?? node.op} -> ${dst.path.join('.')}[${j}]: ${found.join('; ')}`);
        }
      }
    }
    expect(holes).toEqual([]);
  }, 300_000);

  it('swept every single move of the eight configurations', () => {
    // The verification's sweep made 3,453 such moves; the oracle could follow every admitted one.
    expect(tally.moves).toBe(3453);
    expect(tally.tooMany).toBe(0);
    expect(tally.admitted).toBeGreaterThan(0);
  });
});
