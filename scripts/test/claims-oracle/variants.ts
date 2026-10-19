/**
 * Composed variants for the claims oracle (oracle.ts): the protocol configurations, mutated at random, and kept when
 * the advisor admits them (checkAnswer, as a composed answer is checked in the product).
 *
 * Ported from the F01 semantics work's last verification (2026-10-09, ADR-0097's measurement): the round-11 final
 * verifier's generator, gen12.mts, as the ports-rendered differential ran it (scratch/ports-rendered/gen-pr.mts under
 * %TEMP%). The mutations, their weights, the bias toward C1 and the PRNG are unchanged. What changed: one code tree
 * (the one under test) instead of main against a branch; the PRNG is reset for each call instead of read from argv;
 * and the variants are returned with the recipe as admitted (the forced, parsed composed recipe the product runs).
 * The mutations' own comments are the verifiers'.
 */
import { createHash } from 'node:crypto';
import { checkAnswer } from '../../../packages/advisor/src/index.ts';
import { PROTOCOL_CONFIGS } from '../../../packages/catalog/src/index.ts';
import { createPromptRenderer } from '../../../packages/prompts/src/index.ts';

// The mutations read and write recipe trees freely, as the verifiers wrote them.
type N = Record<string, any>;

// xoshiro128**, seeded by splitmix32 from the seed (reset by generateVariants).
let sm = 0;
const splitmix = () => {
  sm = (sm + 0x9e3779b9) >>> 0;
  let z = sm;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
};
let xa = 0, xb = 0, xc = 0, xd = 0;
function reseed(seed: number): void {
  sm = ((seed >>> 0 || 1) ^ 0x2f6b1c3d) >>> 0;
  xa = splitmix();
  xb = splitmix();
  xc = splitmix();
  xd = splitmix();
  uid = 0;
}
const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;
const next = () => {
  const r = Math.imul(rotl(Math.imul(xb, 5) >>> 0, 7), 9) >>> 0;
  const t = (xb << 9) >>> 0;
  xc = (xc ^ xa) >>> 0; xd = (xd ^ xb) >>> 0; xb = (xb ^ xc) >>> 0; xa = (xa ^ xd) >>> 0; xc = (xc ^ t) >>> 0; xd = rotl(xd, 11);
  return r / 4294967296;
};
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!;
const chance = (p: number) => next() < p;
const PROMPTS = createPromptRenderer();
const fenced = (v: unknown) => '```json\n' + JSON.stringify(v, null, 2) + '\n```';
const CONFIGS: N[] = PROTOCOL_CONFIGS as unknown as N[];

// ---- tree helpers ----
const kids = (n: N): N[] => [...(n.steps ?? []), ...(n.body ? [n.body] : []), ...(n.judge ? [n.judge] : []), ...(n.branches ?? []).map((b: N) => b.body), ...(n.lenses ?? []).map((l: N) => l.body)];
const all = (r: N): N[] => {
  const out: N[] = [];
  const v = (n: N) => {
    out.push(n);
    kids(n).forEach(v);
  };
  r.stages.forEach((s: N) => v(s.body));
  return out;
};
const allSteps = (r: N) => all(r).filter((n) => n.op === 'step');
/** Every seq in the recipe, wrapping a stage body, an operator body, a branch or a lens that is not a seq into one first (sometimes). */
function seqs(r: N, wrapSome = true): N[] {
  if (wrapSome) {
    for (const st of r.stages) if (st.body.op !== 'seq' && chance(0.3)) st.body = { op: 'seq', steps: [st.body] };
    for (const n of all(r)) {
      if (n.body && n.op !== 'seq' && n.body.op !== 'seq' && chance(0.15)) n.body = { op: 'seq', steps: [n.body] };
      for (const b of n.branches ?? []) if (b.body.op !== 'seq' && chance(0.15)) b.body = { op: 'seq', steps: [b.body] };
      for (const l of n.lenses ?? []) if (l.body.op !== 'seq' && chance(0.15)) l.body = { op: 'seq', steps: [l.body] };
    }
  }
  return all(r).filter((n) => n.op === 'seq');
}
/** Detach a node from wherever it is (only from a seq with more than one entry). */
function detach(r: N, target: N): boolean {
  for (const n of all(r)) {
    if (n.op === 'seq' && n.steps.length > 1) {
      const i = n.steps.indexOf(target);
      if (i >= 0) {
        n.steps.splice(i, 1);
        return true;
      }
    }
  }
  return false;
}
function insertSomewhere(r: N, nodes: N[]): boolean {
  const ss = seqs(r);
  if (!ss.length) return false;
  const s = pick(ss);
  s.steps.splice(Math.floor(next() * (s.steps.length + 1)), 0, ...nodes);
  return true;
}
let uid = 0;
const fid = (p: string) => `${p}-g${++uid}`;
const renumber = (n: N): N => {
  const c = structuredClone(n);
  const v = (x: N) => {
    if (typeof x.id === 'string' && x.op) x.id = fid(x.id.replace(/-g\d+$/, ''));
    kids(x).forEach(v);
  };
  v(c);
  return c;
};

// ---- palette: catalog model steps (their prompts are known), by role ----
const palette: N[] = [];
for (const r of CONFIGS) for (const n of all(r)) if (n.op === 'step') palette.push({ medium: r.medium, step: structuredClone(n) });
const model = (role: string, medium?: string): N | undefined => {
  const xs = palette.filter((p) => p.step.actor === 'model' && p.step.role === role && (!medium || p.medium === medium));
  const ys = xs.length ? xs : palette.filter((p) => p.step.actor === 'model' && p.step.role === role);
  return ys.length ? structuredClone(pick(ys).step) : undefined;
};
const render = (): N => ({ op: 'step', id: fid('rnd'), role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const H = (role: string, consumes: string[], produces: string[], extra: N = {}): N => ({ op: 'step', id: fid(`you-${role}`), role, actor: 'human', consumes, produces, ...extra });
const PORTS = ['critique', 'brief', 'taste'] as const;

// A person's list or critique, in the forms admission reads as one.
function personCritique(): N {
  switch (Math.floor(next() * 9)) {
    case 0:
    case 1:
      return H('cut', ['view'], ['critique'], { block: 'CUT' });
    case 2:
      return H('vision', ['view'], ['critique'], { block: 'VISION' });
    case 3:
      return H('vision', ['view'], ['critique', pick(['brief', 'taste'])], { block: 'VISION' });
    case 4:
      return H('vision', [pick(['brief', 'taste']), 'view'], ['critique', 'brief', 'taste'].filter(() => chance(0.6)).concat(['critique']).filter((x, i, a) => a.indexOf(x) === i), { block: 'VISION' });
    case 5:
      return H('check', ['view'], ['critique']);
    case 6:
      return H(pick(['critic', 'overlap', 'dedupe', 'judge', 'select']), ['view'], ['critique']);
    case 7:
      // A reaction that revises a brief in place and also gives a critique.
      return H('vision', ['brief'], ['brief', 'critique'], { block: 'VISION' });
    default:
      return H('cut', ['view', 'critique'], ['critique'], { block: 'CUT' });
  }
}
/** An AI step that can take a text port in and make text of its own (a carrier), or replace the critique. */
function aiNoteMaker(medium: string): N | undefined {
  const role = pick(['critic', 'check', 'cut', 'tells-sweep', 'overlap', 'vision', 'vision']);
  const s = model(role, medium);
  if (!s) return undefined;
  s.id = fid(`ai-${role}`);
  if (chance(0.6)) {
    const port = pick(PORTS);
    if (chance(0.5)) s.consumes = [...new Set([...s.consumes, port])];
    else s.reads = [...new Set([...(s.reads ?? []), port])];
  }
  if (role === 'vision' && chance(0.5)) s.produces = [pick(['brief', 'taste', 'critique'])];
  return s;
}
/** Something that may take a text port to the work: an AI writer, the person's own draft, or a decider. */
function taker(medium: string): N[] | undefined {
  const k = Math.floor(next() * 10);
  const port = pick(PORTS);
  if (k <= 4) {
    const role = pick(['fix', 'fix', 'build', 'asset', ...(medium === 'media' ? ['relay'] : [])]);
    const s = model(role, medium);
    if (!s) return undefined;
    s.id = fid(`ai-${role}`);
    if (chance(0.5)) s.consumes = [...new Set([...s.consumes, port])];
    else s.reads = [...new Set([...(s.reads ?? []), port])];
    if (s.role === 'fix' && port === 'critique' && chance(0.3)) {
      s.consumes = s.consumes.filter((p: string) => p !== 'critique');
      s.reads = [...new Set([...(s.reads ?? []), 'critique'])];
    }
    s.writes = true;
    return [s];
  }
  if (k === 5) return [H(pick(['build', 'fix']), ['artifact'], ['artifact'], { writes: true })];
  if (k === 6) {
    const d = model('dedupe', medium);
    if (!d) return undefined;
    d.id = fid('ai-dedupe');
    d.consumes = [...new Set([...d.consumes, port])];
    return [d];
  }
  if (k === 7) {
    const c = model('critic', medium);
    if (!c) return undefined;
    c.id = fid('ai-critic');
    c.consumes = [...new Set([...c.consumes, port])];
    const f = model('fix', medium)!;
    f.id = fid('ai-fix');
    return [{ op: 'loop', id: fid('loop'), body: { op: 'seq', steps: [render(), c, f] }, gate: gate('critic-score') }];
  }
  if (k === 8) {
    const b = model('seed', medium) ?? model('build', medium);
    const j = model('judge', medium);
    if (!b || !j) return undefined;
    b.id = fid('cand');
    j.id = fid('judge');
    j.consumes = [...new Set([...j.consumes, port])];
    return [{ op: 'replicate', id: fid('rep'), n: 2, body: b }, { op: 'pick', id: fid('pick'), mode: 'C', k: 1, actor: 'model', judge: j }];
  }
  const t = model('tells-compare', medium);
  if (!t) return [H('build', ['artifact'], ['artifact'], { writes: true })];
  t.id = fid('ai-compare');
  t.consumes = [...new Set([...t.consumes, port])];
  return [t];
}
const gate = (metric: string): N => ({
  metric,
  ...(metric === 'critic-score' || metric === 'critic-rank' ? { threshold: pick([6, 7, 8]) } : {}),
  hidden: metric !== 'human',
  holder: metric === 'human' ? 'human' : 'harness',
  probe: 1,
  max: 1 + Math.floor(next() * 3),
  onCap: 'human',
  onNoConverge: 'recalibrate-human',
});
function wrap(body: N, medium: string): N {
  const kind = pick(['optional', 'route', 'routeOwn', 'loopH', 'loopC', 'loopK', 'relay', 'replicate', 'replicatePick', 'each', 'audit', 'audit2', 'gate', 'seq']);
  const seqBody = body.op === 'seq' ? body : { op: 'seq', steps: [body] };
  switch (kind) {
    case 'optional':
      return { op: 'optional', id: fid('opt'), trigger: 'you want it', body };
    case 'route':
      return { op: 'route', id: fid('route'), on: 'which way', branches: [{ name: 'this', body }, { name: 'that', body: render() }] };
    case 'routeOwn':
      return { op: 'route', id: fid('route'), on: 'who drafts', branches: [{ name: 'ai', body }, { name: 'you', body: H('build', ['artifact'], ['artifact'], { writes: true }) }] };
    case 'loopH':
      return { op: 'loop', id: fid('loop'), body: seqBody, gate: gate('human') };
    case 'loopC': {
      const c = model('critic', medium)!;
      c.id = fid('critic');
      seqBody.steps.splice(Math.floor(next() * (seqBody.steps.length + 1)), 0, render(), c);
      return { op: 'loop', id: fid('loop'), body: seqBody, gate: gate(pick(['critic-score', 'critic-rank'])) };
    }
    case 'loopK': {
      const c = model('check', medium)!;
      c.id = fid('check');
      seqBody.steps.splice(Math.floor(next() * (seqBody.steps.length + 1)), 0, render(), c);
      return { op: 'loop', id: fid('loop'), body: seqBody, gate: gate('check-clean') };
    }
    case 'relay':
      return { op: 'relay', id: fid('relay'), maxLinks: 1 + Math.floor(next() * 3), body: seqBody };
    case 'replicate':
      return { op: 'replicate', id: fid('rep'), n: 1 + Math.floor(next() * 3), body };
    case 'replicatePick': {
      const mode = pick(['H', 'C', 'R']);
      const p: N = { op: 'pick', id: fid('pick'), mode, k: 1, actor: mode === 'H' ? 'human' : mode === 'C' ? 'model' : 'policy' };
      if (mode === 'C') {
        p.judge = model('judge', medium);
        if (p.judge) p.judge.id = fid('judge');
        else return body;
      }
      return { op: 'seq', steps: [{ op: 'replicate', id: fid('rep'), n: 2, body }, p] };
    }
    case 'each':
      return { op: 'each', id: fid('each'), body };
    case 'audit':
      return { op: 'audit', id: fid('audit'), lenses: [{ name: 'yours', body }] };
    case 'audit2': {
      const c = model(pick(['critic', 'check', 'cut', 'overlap']), medium)!;
      c.id = fid('lens');
      const lenses = [
        { name: 'yours', body },
        { name: 'other', body: c },
      ];
      return { op: 'audit', id: fid('audit'), lenses: chance(0.5) ? lenses : lenses.reverse() };
    }
    case 'gate': {
      const c = model('critic', medium)!;
      c.id = fid('gcrit');
      seqBody.steps.splice(chance(0.5) ? 0 : seqBody.steps.length, 0, render(), c);
      const g: N = { op: 'gate', id: fid('gate'), body: seqBody, pass: { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }, onFail: 'human' };
      return g;
    }
    default:
      return seqBody;
  }
}
const humanCritSteps = (r: N) => allSteps(r).filter((s) => s.actor === 'human' && (s.role === 'cut' || (s.role !== 'voice' && s.role !== 'build' && s.role !== 'fix' && s.role !== 'tells-compare' && s.produces.includes('critique'))));
const critTakers = (r: N) => allSteps(r).filter((s) => s.actor === 'model' && (s.consumes.includes('critique') || (s.reads ?? []).includes('critique')));

const MUTS: Record<string, (r: N) => boolean> = {
  // A person's list or critique somewhere, behind a render.
  person: (r) => insertSomewhere(r, chance(0.7) ? [render(), personCritique()] : [personCritique()]),
  // A person's list, something between, and a taker after.
  personTaker(r) {
    const t = taker(r.medium);
    if (!t) return false;
    const mid = chance(0.4) ? [render()] : chance(0.5) ? [render(), aiNoteMaker(r.medium)].filter(Boolean) : [];
    return insertSomewhere(r, [render(), personCritique(), ...(mid as N[]), ...t]);
  },
  // A person's list, a carrier, and a taker of the carrier's port.
  personCarrier(r) {
    const c = aiNoteMaker(r.medium);
    const t = taker(r.medium);
    if (!c || !t) return false;
    return insertSomewhere(r, [render(), personCritique(), ...(chance(0.5) ? [render()] : []), c, ...(chance(0.3) ? [render()] : []), ...t]);
  },
  // Turn an existing person's step into one that gives a critique.
  giveCritique(r) {
    const xs = allSteps(r).filter((s) => s.actor === 'human' && s.role !== 'voice' && s.role !== 'tells-compare' && !(s.role === 'build' || s.role === 'fix'));
    if (!xs.length) return false;
    const s = pick(xs);
    s.produces = [...new Set([...s.produces, 'critique'])];
    return true;
  },
  // Move a person's list to anywhere.
  moveCut(r) {
    const xs = humanCritSteps(r);
    if (!xs.length) return false;
    const s = pick(xs);
    if (!detach(r, s)) return false;
    return insertSomewhere(r, [s]);
  },
  // Move a critique taker to anywhere (later stage, a loop, a branch...).
  moveTaker(r) {
    const xs = critTakers(r);
    if (!xs.length) return false;
    const s = pick(xs);
    if (!detach(r, s)) return false;
    return insertSomewhere(r, [s]);
  },
  // Wrap a person's list, a taker, or a random node.
  wrapNode(r) {
    const pool = chance(0.5) ? [...humanCritSteps(r), ...critTakers(r)] : all(r).filter((n) => n.op !== 'seq');
    if (!pool.length) return false;
    const target = pick(pool);
    for (const n of all(r)) {
      if (n.op === 'seq') {
        const i = n.steps.indexOf(target);
        if (i >= 0) {
          const len = 1 + Math.floor(next() * Math.min(3, n.steps.length - i));
          const range = n.steps.slice(i, i + len);
          n.steps.splice(i, len, wrap(range.length === 1 ? range[0] : { op: 'seq', steps: range }, r.medium));
          return true;
        }
      }
    }
    for (const st of r.stages) if (st.body === target) {
      st.body = wrap(target, r.medium);
      return true;
    }
    return false;
  },
  // Something between a person's list and the next step: a replacer or a carrier.
  between(r) {
    const xs = humanCritSteps(r);
    if (!xs.length) return false;
    const s = pick(xs);
    for (const n of all(r)) {
      if (n.op === 'seq') {
        const i = n.steps.indexOf(s);
        if (i >= 0) {
          const k = Math.floor(next() * 5);
          const add = k === 0 ? [render(), personCritique()] : k === 1 ? [render(), aiNoteMaker(r.medium)] : k === 2 ? [render()] : k === 3 ? (taker(r.medium) ?? []) : [wrap(render(), r.medium)];
          n.steps.splice(i + 1, 0, ...(add.filter(Boolean) as N[]));
          return true;
        }
      }
    }
    return false;
  },
  // Flip a text port on a random step.
  port(r) {
    const xs = allSteps(r).filter((s) => s.actor !== 'tool');
    if (!xs.length) return false;
    const s = pick(xs);
    const p = pick(PORTS);
    const where = s.actor === 'human' ? pick(['produces', 'consumes']) : pick(['produces', 'consumes', 'reads', 'reads']);
    const list: string[] = s[where] ?? [];
    s[where] = list.includes(p) ? list.filter((x) => x !== p) : [...list, p];
    if (where === 'reads' && !s.reads.length) delete s.reads;
    if (where === 'produces' && !s.produces.length) s.produces = [p];
    return true;
  },
  // Move a step to the start or end of another stage.
  stageHop(r) {
    const xs = [...humanCritSteps(r), ...critTakers(r), ...allSteps(r)].filter(Boolean);
    if (!xs.length || r.stages.length < 2) return false;
    const s = pick(xs);
    if (!detach(r, s)) return false;
    const st: N = pick(r.stages);
    if (st.body.op !== 'seq') st.body = { op: 'seq', steps: [st.body] };
    if (chance(0.5)) st.body.steps.unshift(s);
    else st.body.steps.push(s);
    return true;
  },
  // Remove a random node.
  remove(r) {
    const xs = all(r).filter((n) => n.op !== 'seq');
    if (!xs.length) return false;
    return detach(r, pick(xs));
  },
  // Swap two adjacent entries of a seq.
  swap(r) {
    const xs = seqs(r, false).filter((s) => s.steps.length > 1);
    if (!xs.length) return false;
    const s = pick(xs);
    const i = Math.floor(next() * (s.steps.length - 1));
    [s.steps[i], s.steps[i + 1]] = [s.steps[i + 1], s.steps[i]];
    return true;
  },
  // A copy of a step (fresh id) somewhere else.
  copy(r) {
    const xs = allSteps(r);
    if (!xs.length) return false;
    return insertSomewhere(r, [renumber(pick(xs))]);
  },
  // A critique-taking writer replaced by the person's own draft, or by a writer that takes another port.
  retarget(r) {
    const xs = critTakers(r).filter((s) => s.role === 'fix' || s.role === 'build');
    if (!xs.length) return false;
    const s = pick(xs);
    const k = Math.floor(next() * 4);
    if (k === 0) {
      s.consumes = s.consumes.filter((p: string) => p !== 'critique');
      s.reads = [...new Set([...(s.reads ?? []), 'critique'])];
    } else if (k === 1) {
      s.consumes = s.consumes.filter((p: string) => p !== 'critique');
      if (!s.consumes.length) s.consumes = ['artifact'];
      if (s.reads) s.reads = s.reads.filter((p: string) => p !== 'critique');
      if (s.reads && !s.reads.length) delete s.reads;
    } else if (k === 2) {
      s.consumes = [...new Set([...s.consumes, pick(['brief', 'taste'])])];
    } else {
      const own = H(pick(['build', 'fix']), ['artifact'], ['artifact'], { writes: true, id: s.id });
      Object.keys(s).forEach((key) => delete s[key]);
      Object.assign(s, own);
    }
    return true;
  },
};
// ---- round-9-targeted mutations ----
const H_PICK = (): N => ({ op: 'pick', id: fid('pick'), mode: 'H', k: 1, actor: 'human' });
const R_PICK = (): N => ({ op: 'pick', id: fid('pick'), mode: 'R', k: 1, actor: 'policy' });
const POOL = (): N => ({ op: 'step', id: fid('pool'), role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['option_set<artifact>'], produces: ['view'] });
/** An AI writer that takes the options in (C2's option map), sometimes a text port too. */
function optionWriter(medium: string): N | undefined {
  const s = model('build', medium) ?? model('fix', medium);
  if (!s) return undefined;
  s.id = fid('ai-optmap');
  s.consumes = [...new Set(['option_set<artifact>', ...s.consumes.filter((p: string) => p !== 'artifact' && p !== 'intent'), ...(chance(0.5) ? [pick(PORTS)] : [])])];
  s.writes = true;
  return s;
}
/** What may come after candidates: nothing, a pick, a dedupe and a pick, each and a pick, an option-map writer, a render of the pool and a pick. */
function afterCands(medium: string): N[] {
  const k = Math.floor(next() * 8);
  if (k === 0 || k === 1) return [];
  if (k === 2) return [chance(0.6) ? H_PICK() : R_PICK()];
  if (k === 3) {
    const d = model('dedupe', medium);
    return d ? [Object.assign(d, { id: fid('ai-dedupe') }), ...(chance(0.6) ? [H_PICK()] : [])] : [H_PICK()];
  }
  if (k === 4) {
    const t = taker(medium) ?? [];
    return [{ op: 'each', id: fid('each'), body: t.length === 1 ? t[0] : { op: 'seq', steps: t.length ? t : [render()] } }, ...(chance(0.6) ? [H_PICK()] : [])];
  }
  if (k === 5) {
    const w = optionWriter(medium);
    return w ? [w] : [];
  }
  if (k === 6) return [POOL(), chance(0.5) ? H_PICK() : R_PICK()];
  return [POOL(), H('vision', ['option_set<artifact>'], [pick(['taste', 'brief', 'critique'])], { block: 'VISION' }), ...(chance(0.5) ? [H_PICK()] : [])];
}
/** A lens body: a person's critique, an AI note maker, a render, a seed, or a mix. */
function lensBody(medium: string): N {
  const k = Math.floor(next() * 9);
  const ai = (): N => {
    const s = model(pick(['critic', 'check', 'cut', 'tells-sweep', 'overlap']), medium);
    if (s) s.id = fid('lens-ai');
    return s ?? render();
  };
  switch (k) {
    case 0:
      return personCritique();
    case 1:
      return { op: 'seq', steps: [render(), personCritique()] };
    case 2:
      return { op: 'seq', steps: [render(), personCritique(), render(), ai()] };
    case 3:
      return ai();
    case 4:
      return { op: 'seq', steps: [render(), ai(), personCritique()] };
    case 5: {
      const sd = model('seed', medium);
      return sd ? Object.assign(sd, { id: fid('lens-seed') }) : render();
    }
    case 6:
      return render();
    case 7: {
      const t = taker(medium) ?? [render()];
      return { op: 'seq', steps: [render(), personCritique(), ...t] };
    }
    default:
      return { op: 'seq', steps: [personCritique(), render(), personCritique()] };
  }
}
Object.assign(MUTS, {
  // A person's list (and maybe its taker) in candidates, and what may come after them.
  candTrim(r: N) {
    const t = chance(0.75) ? (taker(r.medium) ?? []) : [];
    const sd = chance(0.5) ? model('seed', r.medium) : undefined;
    if (sd) sd.id = fid('cand-seed');
    const body: N = { op: 'seq', steps: [...(sd ? [sd] : []), render(), personCritique(), ...t] };
    const rep: N = chance(0.75) ? { op: 'replicate', id: fid('rep'), n: 1 + Math.floor(next() * 3), body } : { op: 'each', id: fid('each'), body };
    return insertSomewhere(r, [rep, ...afterCands(r.medium)]);
  },
  // A person's list outside, its taker only in candidates, and what may come after them.
  candOutside(r: N) {
    const t = taker(r.medium);
    if (!t) return false;
    const sd = chance(0.5) ? model('seed', r.medium) : undefined;
    if (sd) sd.id = fid('cand-seed');
    const body = sd ? { op: 'seq', steps: [sd, render(), ...t] } : t.length === 1 ? t[0] : { op: 'seq', steps: t };
    const rep: N = chance(0.7) ? { op: 'replicate', id: fid('rep'), n: 1 + Math.floor(next() * 3), body } : { op: 'each', id: fid('each'), body };
    return insertSomewhere(r, [render(), personCritique(), ...(chance(0.3) ? [render()] : []), rep, ...afterCands(r.medium)]);
  },
  // Wrap a run of steps around a person's list in candidates.
  wrapCands(r: N) {
    const xs = humanCritSteps(r);
    if (!xs.length) return false;
    const target = pick(xs);
    for (const n of all(r)) {
      if (n.op !== 'seq') continue;
      const i = n.steps.indexOf(target);
      if (i < 0) continue;
      const from = Math.max(0, i - Math.floor(next() * 2));
      const len = i - from + 1 + Math.floor(next() * Math.min(3, n.steps.length - i));
      const range = n.steps.slice(from, from + len);
      const body = range.length === 1 ? range[0] : { op: 'seq', steps: range };
      const rep = chance(0.7) ? { op: 'replicate', id: fid('rep'), n: 1 + Math.floor(next() * 3), body } : { op: 'each', id: fid('each'), body };
      n.steps.splice(from, len, rep, ...afterCands(r.medium));
      return true;
    }
    return false;
  },
  // Remove a pick, or add one after a replicate or each.
  pickToggle(r: N) {
    if (chance(0.5)) {
      const ps = all(r).filter((n) => n.op === 'pick');
      if (!ps.length) return false;
      return detach(r, pick(ps));
    }
    for (const n of all(r)) {
      if (n.op !== 'seq') continue;
      const i = n.steps.findIndex((x: N) => x.op === 'replicate' || x.op === 'each');
      if (i >= 0 && chance(0.6)) {
        n.steps.splice(i + 1, 0, chance(0.6) ? H_PICK() : R_PICK());
        return true;
      }
    }
    return false;
  },
  // An audit whose lenses may or may not always note, and maybe a taker after it.
  lensMix(r: N) {
    const k = 1 + Math.floor(next() * 3);
    const lenses = Array.from({ length: k }, (_, i) => ({ name: `l${i}-${uid}`, body: lensBody(r.medium) }));
    const a: N = { op: 'audit', id: fid('audit'), lenses };
    const after = chance(0.6) ? (taker(r.medium) ?? []) : [];
    return insertSomewhere(r, [render(), a, ...(chance(0.3) ? [render(), H('build', ['artifact'], ['artifact'], { writes: true })] : []), ...after]);
  },
  // A one-shot gate whose body has a person's answer, first or last, and maybe a taker after it.
  gateMix(r: N) {
    const c = model('critic', r.medium);
    if (!c) return false;
    c.id = fid('gcrit');
    const p = personCritique();
    const steps = chance(0.5) ? [render(), c, p] : chance(0.5) ? [p, render(), c] : [render(), p, c];
    const g: N = { op: 'gate', id: fid('gate'), body: { op: 'seq', steps }, pass: { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }, onFail: 'human' };
    const after = chance(0.7) ? (taker(r.medium) ?? []) : [];
    return insertSomewhere(r, [chance(0.5) ? render() : { op: 'seq', steps: [render(), personCritique()] }, g, ...after]);
  },
  // A seed somewhere, and sometimes a note maker before it and the person's own draft after it.
  seedBetween(r: N) {
    const sd = model('seed', r.medium);
    if (!sd) return false;
    sd.id = fid('ai-seed');
    if (chance(0.4)) sd.consumes = [...new Set([...sd.consumes, pick(PORTS)])];
    const c = aiNoteMaker(r.medium);
    if (c) c.consumes = [...new Set([...c.consumes, 'critique'])];
    const nodes = chance(0.6) && c ? [render(), personCritique(), render(), c, sd, H('build', ['artifact'], ['artifact'], { writes: true })] : [sd];
    return insertSomewhere(r, nodes);
  },
  // Nest a fan-out in another.
  nestRep(r: N) {
    const xs = all(r).filter((n) => n.op === 'replicate' || n.op === 'each');
    if (!xs.length) return false;
    const x = pick(xs);
    const inner: N = chance(0.5) ? { op: 'replicate', id: fid('nest'), n: 1 + Math.floor(next() * 2), body: x.body } : { op: 'each', id: fid('nest'), body: x.body };
    x.body = inner;
    return true;
  },
});
// ---- round-10-targeted mutations (this verification) ----
/** A seed of the recipe's medium (its own palette) or, sometimes, of any medium; sometimes taking a text port in. */
function anySeed(medium: string): N | undefined {
  const sd = chance(0.75) ? model('seed', medium) : structuredClone(pick(palette.filter((p) => p.step.role === 'seed')).step);
  if (!sd) return undefined;
  sd.id = fid('r10-seed');
  if (chance(0.35)) {
    const p = pick(PORTS);
    if (chance(0.5)) sd.consumes = [...new Set([...sd.consumes, p])];
    else sd.reads = [...new Set([...(sd.reads ?? []), p])];
  }
  return sd;
}
/** What may take the notes or a port after a seed: the person's own draft, an AI fix that takes the critique, a taker, or nothing. */
function afterSeed(medium: string): N[] {
  const k = Math.floor(next() * 6);
  if (k <= 2) return [H(pick(['build', 'fix']), ['artifact'], ['artifact'], { writes: true })];
  if (k === 3) return taker(medium) ?? [];
  if (k === 4) return [render(), H('vision', ['view'], [pick(['critique', 'taste'])], { block: 'VISION' }), ...(chance(0.6) ? [H('build', ['artifact'], ['artifact'], { writes: true })] : [])];
  return [];
}
Object.assign(MUTS, {
  // A person's answer, an AI note maker that takes it in (or not), one or two seeds, then a draft or a taker.
  seedNote(r: N) {
    const c = aiNoteMaker(r.medium);
    const s1 = anySeed(r.medium);
    if (!s1) return false;
    if (c && chance(0.8)) c.consumes = [...new Set([...c.consumes, pick(['critique', 'critique', 'brief', 'taste'])])];
    const seeds = chance(0.25) ? [s1, anySeed(r.medium)].filter(Boolean) as N[] : [s1];
    const mid = chance(0.3) ? [render()] : [];
    const nodes = [render(), personCritique(), ...(c && chance(0.85) ? [render(), c] : []), ...mid, ...seeds, ...afterSeed(r.medium)];
    return insertSomewhere(r, nodes);
  },
  // An audit whose lenses hold seeds: alone, after a person's answer, after an AI note maker, or taking the critique in.
  seedLens(r: N) {
    const k = 1 + Math.floor(next() * 3);
    const lens = (): N => {
      const sd = anySeed(r.medium) ?? render();
      // A lens only annotates: a seed there drafts a version that is dropped (ST9 refuses a declared writer).
      if (chance(0.8)) delete sd.writes;
      switch (Math.floor(next() * 5)) {
        case 0:
          return sd;
        case 1:
          return { op: 'seq', steps: [render(), personCritique(), sd] };
        case 2: {
          const c = aiNoteMaker(r.medium);
          return { op: 'seq', steps: [render(), ...(c ? [c] : []), sd] };
        }
        case 3:
          return lensBody(r.medium);
        default:
          sd.consumes = [...new Set([...(sd.consumes ?? []), 'critique'])];
          return { op: 'seq', steps: [render(), personCritique(), render(), sd] };
      }
    };
    const lenses = Array.from({ length: k }, (_, i) => ({ name: `s${i}-${uid}`, body: lens() }));
    const a: N = { op: 'audit', id: fid('audit'), lenses };
    const before = chance(0.6) ? [render(), personCritique(), ...(chance(0.5) ? [render(), aiNoteMaker(r.medium)].filter(Boolean) as N[] : [])] : [];
    return insertSomewhere(r, [...before, render(), a, ...afterSeed(r.medium)]);
  },
  // A loop you hold: your draft, your answer, an AI note maker and a seed at the end of the round.
  seedLoop(r: N) {
    const c = aiNoteMaker(r.medium);
    const sd = anySeed(r.medium);
    if (!sd) return false;
    if (c) c.consumes = [...new Set([...c.consumes, 'critique'])];
    const body = { op: 'seq', steps: [H('build', ['artifact'], ['artifact'], { writes: true }), render(), personCritique(), ...(c ? [render(), c] : []), sd] };
    if (chance(0.5)) body.steps.reverse();
    return insertSomewhere(r, [{ op: 'loop', id: fid('loop'), body, gate: gate('human') }]);
  },
  // Your answer, then a seed that takes it in directly (its build applies it), then maybe another seed or note maker.
  seedTakes(r: N) {
    const sd = anySeed(r.medium);
    if (!sd) return false;
    const p = pick(PORTS);
    if (chance(0.5)) sd.consumes = [...new Set([...sd.consumes, p])];
    else sd.reads = [...new Set([...(sd.reads ?? []), p])];
    const after = chance(0.5) ? [render(), aiNoteMaker(r.medium)].filter(Boolean) as N[] : [];
    const wrapIt = chance(0.3);
    const core = [render(), personCritique(), sd, ...after, ...afterSeed(r.medium)];
    return insertSomewhere(r, wrapIt ? [wrap({ op: 'seq', steps: core }, r.medium)] : core);
  },
});
// ---- round-11-targeted mutations (this verification) ----
/** C1's seed (article.SEED), sometimes taking a text port in. Only a web-page recipe may use it. */
function c1Seed(): N {
  const sd = structuredClone(palette.find((p) => p.step.role === 'seed' && p.step.prompt === 'article.SEED')!.step);
  sd.id = fid('c1-seed');
  if (chance(0.2)) {
    const p = pick(PORTS);
    if (chance(0.5)) sd.consumes = [...new Set([...sd.consumes, p])];
    else sd.reads = [...new Set([...(sd.reads ?? []), p])];
  }
  return sd;
}
Object.assign(MUTS, {
  // Your answer, an AI note maker that takes it in, maybe a render, a C1 seed (or two), then your draft or a taker.
  c1SeedNote(r: N) {
    if (r.medium !== 'web-page') return false;
    const c = aiNoteMaker(r.medium);
    if (c && chance(0.85)) c.consumes = [...new Set([...c.consumes, pick(['critique', 'critique', 'brief', 'taste'])])];
    const seeds = chance(0.2) ? [c1Seed(), c1Seed()] : [c1Seed()];
    const opt = chance(0.25);
    const seedPart: N[] = opt ? [{ op: 'optional', id: fid('opt'), trigger: 'reseed', body: seeds.length === 1 ? seeds[0] : { op: 'seq', steps: seeds } }] : seeds;
    const nodes = [render(), personCritique(), ...(c && chance(0.85) ? [render(), c] : []), ...(chance(0.3) ? [render()] : []), ...seedPart, ...afterSeed(r.medium)];
    return insertSomewhere(r, nodes);
  },
  // An audit with C1 seeds in some lenses, after your answer and maybe a note maker, then your draft or a taker.
  c1SeedLens(r: N) {
    if (r.medium !== 'web-page') return false;
    const k = 1 + Math.floor(next() * 3);
    const lens = (): N => {
      const sd = c1Seed();
      delete sd.writes;
      switch (Math.floor(next() * 5)) {
        case 0:
          return sd;
        case 1:
          return { op: 'seq', steps: [render(), personCritique(), sd] };
        case 2: {
          const c = aiNoteMaker(r.medium);
          return { op: 'seq', steps: [render(), ...(c ? [c] : []), sd] };
        }
        case 3:
          return lensBody(r.medium);
        default:
          return { op: 'seq', steps: [render(), sd, render(), personCritique()] };
      }
    };
    const lenses = Array.from({ length: k }, (_, i) => ({ name: `c${i}-${uid}`, body: lens() }));
    const before = chance(0.7) ? [render(), personCritique(), ...(chance(0.6) ? ([render(), aiNoteMaker(r.medium)].filter(Boolean) as N[]) : [])] : [];
    return insertSomewhere(r, [...before, render(), { op: 'audit', id: fid('audit'), lenses }, ...afterSeed(r.medium)]);
  },
  // A loop you hold (or a critic loop): your draft, your answer, an AI note maker and a C1 seed somewhere in the round.
  c1SeedLoop(r: N) {
    if (r.medium !== 'web-page') return false;
    const c = aiNoteMaker(r.medium);
    if (c) c.consumes = [...new Set([...c.consumes, 'critique'])];
    const steps = [H('build', ['artifact'], ['artifact'], { writes: true }), render(), personCritique(), ...(c ? [render(), c] : [])];
    steps.splice(Math.floor(next() * (steps.length + 1)), 0, c1Seed());
    const metric = pick(['human', 'human', 'critic-score']);
    if (metric !== 'human') {
      const k = model('critic', r.medium)!;
      k.id = fid('critic');
      steps.splice(Math.floor(next() * (steps.length + 1)), 0, render(), k);
    }
    return insertSomewhere(r, [{ op: 'loop', id: fid('loop'), body: { op: 'seq', steps }, gate: gate(metric) }]);
  },
  // Candidates with a C1 seed, your answer and a note maker inside, then a pick, a writer or nothing.
  c1SeedCand(r: N) {
    if (r.medium !== 'web-page') return false;
    const c = aiNoteMaker(r.medium);
    if (c) c.consumes = [...new Set([...c.consumes, 'critique'])];
    const inner = [render(), personCritique(), ...(c ? [render(), c] : []), c1Seed(), ...(chance(0.6) ? [H('build', ['artifact'], ['artifact'], { writes: true })] : (taker(r.medium) ?? []))];
    const body = { op: 'seq', steps: inner };
    const rep = chance(0.7) ? { op: 'replicate', id: fid('rep'), n: 1 + Math.floor(next() * 3), body } : { op: 'each', id: fid('each'), body };
    return insertSomewhere(r, [rep, ...afterCands(r.medium)]);
  },
  // Legitimate shapes: your CUT, then its AI fix later (a later stage, the next round of a loop, behind a render, in a
  // route branch, under an optional), sometimes with a C1 seed or a render between that does not touch the critique.
  legitCut(r: N) {
    const cut = H('cut', ['view'], ['critique'], { block: 'CUT' });
    const d3 = r.stages.find((st: N) => st.stage === 'D3');
    const fix = model('fix', r.medium);
    if (!fix) return false;
    fix.id = fid('ai-fix');
    if (!fix.consumes.includes('critique')) fix.consumes = [...fix.consumes, 'critique'];
    const mid: N[] = chance(0.4) && r.medium === 'web-page' ? [c1Seed()] : chance(0.3) ? [render()] : [];
    const k = Math.floor(next() * 5);
    if (k === 0) {
      if (r.stages.length < 2) return false;
      const ia = Math.floor(next() * (r.stages.length - 1));
      const ib = ia + 1 + Math.floor(next() * (r.stages.length - ia - 1));
      const a = r.stages[ia];
      const b = r.stages[ib];
      for (const st of [a, b]) if (st.body.op !== 'seq') st.body = { op: 'seq', steps: [st.body] };
      a.body.steps.push(render(), H('vision', ['view'], ['critique'], { block: 'VISION' }), ...mid);
      b.body.steps.unshift(fix);
      return true;
    }
    const ins = (nodes: N[]): boolean => {
      if (!d3 || chance(0.3)) return insertSomewhere(r, nodes);
      if (d3.body.op !== 'seq') d3.body = { op: 'seq', steps: [d3.body] };
      d3.body.steps.splice(Math.floor(next() * (d3.body.steps.length + 1)), 0, ...nodes);
      return true;
    };
    if (k === 1) return ins( [{ op: 'loop', id: fid('loop'), body: { op: 'seq', steps: [fix, render(), cut, ...mid] }, gate: gate('human') }]);
    if (k === 2) return ins( [render(), cut, ...mid, render(), fix]);
    if (k === 3) return ins( [render(), cut, ...mid, { op: 'route', id: fid('route'), on: 'which way', branches: [{ name: 'fix', body: fix }, { name: 'own', body: H('build', ['artifact'], ['artifact'], { writes: true }) }] }]);
    return ins([render(), cut, ...mid, { op: 'optional', id: fid('opt'), trigger: 'fix it', body: fix }]);
  },
});
// ---- round-11 C1 shapes that keep main's other rules (D3 for a CUT, no judge with extra ports, ports in scope) ----
/** A model VISION from the palette that takes your critique in (consumes or reads) and makes a brief, a taste or a critique. */
function c1Carrier(): N | undefined {
  const xs = palette.filter((p) => p.step.actor === 'model' && p.step.role === 'vision' && !p.step.consumes.includes('option_set<artifact>') && !p.step.consumes.includes('view'));
  if (!xs.length) return undefined;
  const s = structuredClone(pick(xs).step);
  s.id = fid('c1-carrier');
  s.consumes = ['intent', ...(chance(0.5) ? ['critique'] : [])];
  if (!s.consumes.includes('critique')) s.reads = ['critique'];
  else delete s.reads;
  s.produces = [pick(['taste', 'brief', 'critique', 'taste'])];
  return s;
}
/** Where in C1 a shape goes: the end of D2 (after the pick), the start of D3, or after apply-cut. */
function c1Place(r: N, nodes: N[], inD3Only = false): boolean {
  const d2 = r.stages.find((s: N) => s.stage === 'D2');
  const d3 = r.stages.find((s: N) => s.stage === 'D3');
  const k = inD3Only ? 1 + Math.floor(next() * 2) : Math.floor(next() * 3);
  if (k === 0 && d2) {
    if (d2.body.op !== 'seq') d2.body = { op: 'seq', steps: [d2.body] };
    d2.body.steps.push(...nodes);
    return true;
  }
  if (!d3) return false;
  if (d3.body.op !== 'seq') d3.body = { op: 'seq', steps: [d3.body] };
  const ac = d3.body.steps.findIndex((x: N) => x.id === 'apply-cut');
  const at = k === 1 || ac < 0 ? 0 : ac + 1;
  d3.body.steps.splice(at, 0, ...nodes);
  return true;
}
/** Your answer: a direction given as a critique (anywhere), or a CUT (D3 only). */
function c1Answer(d3: boolean): N {
  if (d3 && chance(0.4)) return H('cut', ['view'], ['critique'], { block: 'CUT' });
  return H('vision', ['view'], pick([['critique'], ['critique'], ['critique', 'taste'], ['critique', 'brief']]), { block: 'VISION' });
}
/** What may take the notes or a port in after the seed. */
function c1After(): N[] {
  const k = Math.floor(next() * 6);
  if (k <= 1) return [H('build', ['artifact'], ['artifact'], { writes: true })];
  if (k === 2) {
    const port = pick(['critique', 'taste']);
    const f = structuredClone(palette.find((p) => p.step.id === 'critic-fix')!.step);
    f.id = fid('c1-fix');
    f.consumes = ['artifact', port];
    return [render(), H('vision', ['view'], [port], { block: 'VISION' }), f];
  }
  if (k === 3) {
    const f = structuredClone(palette.find((p) => p.step.id === 'critic-fix')!.step);
    f.id = fid('c1-fix');
    f.consumes = ['artifact', pick(['critique', 'taste', 'brief'])];
    return [f];
  }
  if (k === 4) return [render(), H('vision', ['view'], ['taste'], { block: 'VISION' })];
  return [];
}
Object.assign(MUTS, {
  c1Shape(r: N) {
    if (r.id !== 'c1' && r.medium !== 'web-page') return false;
    const d3Only = chance(0.3);
    const ans = c1Answer(d3Only);
    const c = chance(0.85) ? c1Carrier() : undefined;
    const sd = c1Seed();
    const seeds = chance(0.15) ? [sd, c1Seed()] : [sd];
    const sp: N[] = chance(0.2) ? [{ op: 'optional', id: fid('opt'), trigger: 'reseed', body: seeds.length === 1 ? seeds[0] : { op: 'seq', steps: seeds } }] : seeds;
    const nodes = [render(), ans, ...(c ? [c] : []), ...(chance(0.3) ? [render()] : []), ...sp, ...c1After()];
    if (ans.role === 'cut') return c1Place(r, nodes, true);
    return c1Place(r, nodes, d3Only);
  },
  c1LensShape(r: N) {
    if (r.id !== 'c1' && r.medium !== 'web-page') return false;
    const sd = c1Seed();
    delete sd.writes;
    const k = Math.floor(next() * 4);
    // A lens must return an annotation: a critique of yours or a model critic.
    const crit = (): N => {
      const x = structuredClone(palette.find((p) => p.step.id === 'critic-check')!.step);
      x.id = fid('c1-lcrit');
      return x;
    };
    const seedLens = k === 0 ? { op: 'seq', steps: [sd, render(), H('vision', ['view'], ['critique'], { block: 'VISION' })] } : k === 1 ? { op: 'seq', steps: [render(), H('vision', ['view'], ['critique'], { block: 'VISION' }), sd] } : k === 2 ? { op: 'seq', steps: [sd, render(), crit()] } : { op: 'seq', steps: [render(), crit(), sd] };
    const lenses = [{ name: `s-${uid}`, body: seedLens }, ...(chance(0.5) ? [{ name: `o-${uid}`, body: { op: 'seq', steps: [render(), crit()] } }] : [])];
    const before = chance(0.8) ? [render(), c1Answer(false), ...(chance(0.7) ? [c1Carrier()].filter(Boolean) as N[] : [])] : [];
    return c1Place(r, [...before, render(), { op: 'audit', id: fid('audit'), lenses: chance(0.5) ? lenses : lenses.reverse() }, ...c1After()]);
  },
  c1LoopShape(r: N) {
    if (r.id !== 'c1' && r.medium !== 'web-page') return false;
    const c = c1Carrier();
    const steps = [H('build', ['artifact'], ['artifact'], { writes: true }), render(), c1Answer(false), ...(c ? [c] : [])];
    steps.splice(Math.floor(next() * (steps.length + 1)), 0, c1Seed());
    if (chance(0.5)) steps.reverse();
    return c1Place(r, [{ op: 'loop', id: fid('loop'), body: { op: 'seq', steps }, gate: gate('human') }]);
  },
  c1CandShape(r: N) {
    if (r.id !== 'c1' && r.medium !== 'web-page') return false;
    const c = c1Carrier();
    const inner = [c1Seed(), render(), c1Answer(false), ...(c ? [c] : []), ...(chance(0.5) ? [c1Seed()] : []), ...c1After()];
    const body = { op: 'seq', steps: inner };
    const rep = chance(0.7) ? { op: 'replicate', id: fid('rep'), n: 1 + Math.floor(next() * 3), body } : { op: 'each', id: fid('each'), body };
    return c1Place(r, [rep, ...(chance(0.7) ? [H_PICK()] : [])]);
  },
});

const NAMES = Object.keys(MUTS);
const WEIGHTS: Record<string, number> = { person: 2, personTaker: 3, personCarrier: 2, giveCritique: 2, moveCut: 2, moveTaker: 2, wrapNode: 3, between: 2, port: 2, stageHop: 1, remove: 1, swap: 1, copy: 1, retarget: 1, candTrim: 3, candOutside: 2, wrapCands: 2, pickToggle: 2, lensMix: 2, gateMix: 2, seedBetween: 2, nestRep: 1, seedNote: 5, seedLens: 3, seedLoop: 2, seedTakes: 3, c1SeedNote: 6, c1SeedLens: 4, c1SeedLoop: 3, c1SeedCand: 3, legitCut: 3, c1Shape: 10, c1LensShape: 5, c1LoopShape: 4, c1CandShape: 4 };
const BAG = NAMES.flatMap((n) => Array(WEIGHTS[n] ?? 1).fill(n) as string[]);

export interface Variant {
  /** The protocol configuration it was made from. */
  nearest: string;
  /** The mutations that applied, in order. */
  muts: string[];
  /** The recipe as the advisor admitted it. */
  recipe: N;
}

export interface GenerateStats {
  tries: number;
  unique: number;
  admitted: number;
  refused: number;
  byMut: Record<string, number>;
}

/**
 * `tries` mutated recipes from `seed`; the ones the advisor admits, in order, with counts. The same seed and tries give
 * the same variants.
 */
export function generateVariants(tries: number, seed: number): { variants: Variant[]; stats: GenerateStats } {
  reseed(seed);
  const out: Variant[] = [];
  const seen = new Set<string>();
  const stats: GenerateStats = { tries: 0, unique: 0, admitted: 0, refused: 0, byMut: {} };
  for (let t = 0; t < tries; t++) {
    stats.tries++;
    const nearest = chance(0.3) ? CONFIGS.find((c) => c.id === 'c1')! : pick(CONFIGS);
    const r = structuredClone(nearest);
    delete r.hash;
    const k = 1 + Math.floor(next() * 4);
    const done: string[] = [];
    for (let j = 0; j < k; j++) {
      const m = pick(BAG);
      try {
        if (MUTS[m]!(r)) done.push(m);
      } catch {
        /* a mutation that could not apply */
      }
    }
    if (!done.length) continue;
    const key = createHash('sha1').update(`${nearest.id}|${JSON.stringify(r)}`).digest('base64');
    if (seen.has(key)) continue;
    seen.add(key);
    stats.unique++;
    const verdict = checkAnswer(fenced(r), nearest as never, { prompts: PROMPTS, catalog: CONFIGS as never }, `composed-${nearest.id}`);
    if (verdict.violations.length || !verdict.recipe) {
      stats.refused++;
      continue;
    }
    stats.admitted++;
    for (const d of done) stats.byMut[d] = (stats.byMut[d] ?? 0) + 1;
    out.push({ nearest: nearest.id, muts: done, recipe: verdict.recipe as unknown as N });
  }
  return { variants: out, stats };
}
