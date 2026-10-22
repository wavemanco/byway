// ports-rendered (ADR-0097) differential: the round-11 final verifier's v12 oracle, copied unchanged except for its paths
// (this worktree). RENDERED=1 is its strict mode: an AI step sees a text port only where its template declares the slot.
// Round-11 final verifier: the round-10 final verifier's v11 oracle, copied, with two changes. SEEDNOTE defaults to
// 'prompt' (C1's article.SEED directs on every run, any other seed on half) and SEEDCARRY to '0' (a seed's direction is
// made from the problem and the string). RENDERED=1 lets an AI step see a text port only where its prompt template
// declares that slot (prompts.info(id, medium).slots), so a port taken in but never rendered carries nothing: the strict
// oracle for admitted answers. Left out (the default), the oracle follows ports as before: the generous one for refusals.
// Round-10 final verifier: the round-9 final verifier's v10 oracle, copied; only the seed stub changed (see SEEDNOTE).
// Final verifier (round 9): the round-8 verifier's oracle as the implementer copied it (semantics-2-r9/r9.oracle.test.mts),
// with one change: a seed leaves its direction note only on some runs (SEEDNOTE=half, the default; model-step.ts leaves
// one only when the seed writes a direction before its block, directionOf), so a note made before the seed can survive it.
// SEEDNOTE=always restores the copied stub.
// Round 9: the round-8 final verifier's execution oracle (verify-semantics-2-r8/v9.oracle.test.mts), copied, with three
// changes: a step inside a candidate (replicate or each) reaches «marker» on its own channel (Wc, Ic, Nc, Dc) instead of
// W, I, N, D, since a candidate is the work only where a pick or a writer takes it up (F follows that); a dedupe's
// choice is Dd, since it decides only which options a later pick may take up; and a third batch of RUNS runs leaves each
// person's answer empty with probability 1/3 (MIXED), so that an answer reached only when another is left empty is seen.
// Original header follows.
// Final verifier's execution oracle (round 8), written independently of the implementer's diff8 oracle.
// The real Interpreter runs each variant with every activity stubbed; a person's answer is a marker that is followed
// through what the run does with it:
// - a text port an AI step takes in (consumes or reads; a relay link's brief slot is "Shot N", never the brief) goes
//   into the text and the note that step makes («marker»); with INFLUENCE, also what it sees of an artifact whose
//   lineage holds the marker (‹marker›);
// - what a person is shown (the latest notes beside the work, the text they revise in place) goes into their answer;
// - every artifact keeps a lineage: the markers in its writer's prompt and the lineage of what the writer started from.
// Channels, per person's step (by id):
//   W  an AI writer outside a lens, a gate body or a judge takes «marker» in;   I  the same with ‹marker› only;
//   N  the person's own draft (not a VOICE) is shown a note holding «marker»;
//   D  an AI step that decides which version or option is the work takes «marker» in (a pick's judge, a dedupe or a
//      keep-or-revert outside a lens or a gate body, a critic or check whose verdict a loop's gate or a final check reads);
//   F  the run's final work has «marker» in its text lineage;   H  (info) a person's decision is shown it;
//   E  with that step's answer left empty: a fix passes over the empty list, or an AI writer takes the empty port in.
// MODE=refused: the targets are the person's steps a refusal names. MODE=admitted: every person's list or critique in
// the variant (the branch's personCritique), to find answers an admitted recipe never hands on.
import { readFileSync, writeFileSync } from 'node:fs';
const WT = 'C:/Users/arvik/code/byway/.worktrees/fx-ports-rendered/packages/';
vi.mock('C:/Users/arvik/code/byway/.worktrees/fx-ports-rendered/packages/runner/src/workflow/acts.ts', () => {
  const group = () => new Proxy({}, { get: (_t, name: string) => async (input: any) => (globalThis as any).__v9(name, input) });
  return { quick: group(), model: group(), media: group() };
});
const { Interpreter } = await import(WT + 'runner/src/workflow/interpreter.ts');
const sem = await import(WT + 'recipe/src/semantics.ts');
const PR = (await import(WT + 'prompts/src/index.ts')).createPromptRenderer();
const RENDERED = process.env.RENDERED === '1';
let curMedium = '';
const slotCache = new Map<string, Set<string>>();
const rendered = (prompt: string | undefined): Set<string> | undefined => {
  if (!RENDERED || !prompt) return undefined;
  const k = prompt + '@' + curMedium;
  if (!slotCache.has(k)) {
    let slots: string[] = [];
    try {
      slots = PR.info(prompt, curMedium).slots;
    } catch {
      slots = [];
    }
    slotCache.set(k, new Set(slots));
  }
  return slotCache.get(k);
};
type N = Record<string, any>;
const VARIANTS = process.env.VARIANTS!;
const RUNS = Number(process.env.RUNS ?? 24);
const OFFSET = Number(process.env.OFFSET ?? 0);
const LIMIT = Number(process.env.LIMIT ?? 1e9);
const MODE = process.env.V9MODE ?? 'refused';
const INFLUENCE = process.env.INFLUENCE !== '0';
const CLAUSES = /critique-unapplied|critique-per-candidate|human-critique/;

let rs = 1;
const rnd = () => {
  rs = (rs + 0x6d2b79f5) >>> 0;
  let t = rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const TEXT = ['critique', 'brief', 'taste'] as const;
const strong = (x: unknown): string[] => (typeof x === 'string' ? [...x.matchAll(/«([^«»]+)»/g)].map((m) => m[1]!) : []);
const weak = (x: unknown): string[] => (typeof x === 'string' ? [...x.matchAll(/‹([^‹›]+)›/g)].map((m) => m[1]!) : []);
const origin = (m: string) => (m.includes('#') ? m.slice(0, m.lastIndexOf('#')) : m);
const takes = (st: N, q: string) => (st.consumes ?? []).includes(q) || (st.reads ?? []).includes(q);
const NOTE_ROLES = new Set(['critic', 'check', 'cut', 'tells-sweep', 'overlap', 'vision']);

interface Run {
  reached: Map<string, Set<string>>;
  asked: Map<string, number>;
  notes: Map<string, string>;
  linT: Map<string, Set<string>>;
  linI: Map<string, Set<string>>;
  empty?: string;
  mixed?: boolean;
  outcome: string;
}
let cur: Run;
let n = 0;
const info = new Map<string, { contained: boolean; metric?: string; cand: boolean }>();
let gateCritics = new Set<string>();
const TRACE = process.env.TRACE;
const trace: string[] = [];
const reach = (o: string, ch: string) => {
  if (TRACE && o === TRACE) trace.push(`reach ${ch} at ${n}`);
  (cur.reached.get(o) ?? cur.reached.set(o, new Set()).get(o)!).add(ch);
};
(globalThis as any).__v9trace = (name: string, input: N) => {
  if (!TRACE) return;
  const blob = JSON.stringify({ ports: input?.ports, notes: (input?.ports?.notes ?? []).map((x: string) => cur.notes.get(x)) });
  if (blob.includes(TRACE)) trace.push(`${name} ${input?.call?.stepId ?? input?.step?.id} sees ${TRACE}: ${blob.slice(0, 600)}`);
};
const lin = (m: Map<string, Set<string>>, id: string | undefined): Set<string> => (id ? (m.get(id) ?? new Set()) : new Set());

const proto = Interpreter.prototype as N;
const origCall = proto.call;
proto.call = function (stepId: string, ctx: N) {
  const c = origCall.call(this, stepId, ctx);
  info.set(c.key, { contained: !!ctx.contained, metric: ctx.loop?.loop?.gate?.metric, cand: (ctx.path?.length ?? 0) > 0 });
  return c;
};

/** The artifacts a model step sees: the work, the options, the view's sources, a judge's candidates. */
function seen(st: N, ports: N, candidates?: string[]): string[] {
  const ids: string[] = [];
  if (takes(st, 'artifact') && ports.artifact) ids.push(ports.artifact);
  if (takes(st, 'option_set<artifact>')) ids.push(...(ports.options ?? []));
  if (takes(st, 'view')) for (const it of ports.view?.items ?? []) for (const img of it.imageArtifactIds ?? []) if (img.startsWith('img:')) ids.push(img.slice(4));
  if (candidates) ids.push(...candidates);
  return ids;
}
/** What a model step's prompt holds of the text ports, by port (a relay link's brief slot is "Shot N"). */
function promptText(st: N, ports: N, relay = false): Partial<Record<string, string>> {
  const out: Record<string, string> = {};
  const r = rendered(st.prompt);
  for (const q of TEXT) if (takes(st, q) && !(relay && q === 'brief') && (!r || r.has(q))) out[q] = ports[q] ?? '';
  return out;
}

(globalThis as any).__v9 = async (name: string, input: N) => {
  const k = ++n;
  (globalThis as any).__v9trace(name, input);
  const st: N | undefined = input?.step;
  const sid: string | undefined = input?.call?.stepId;
  const ci = input?.call?.key ? info.get(input.call.key) : undefined;
  const contained = !!ci?.contained;
  const cs = ci?.cand ? 'c' : '';
  const ports: N = input?.ports ?? {};
  const tag = `${sid}#${k}`;
  switch (name) {
    case 'modelStep': {
      const texts = promptText(st!, ports);
      const s = TEXT.flatMap((q) => strong(texts[q]));
      const w = [...TEXT.flatMap((q) => weak(texts[q])), ...(INFLUENCE ? seen(st!, ports, input.candidates).flatMap((id) => [...lin(cur.linI, id)]) : [])];
      const carry = (base: string) => base + s.map((m) => `«${m}»`).join('') + [...new Set(w)].map((m) => `‹${m}›`).join('');
      const note = (text: string) => {
        const id = `note:${tag}`;
        cur.notes.set(id, text);
        return id;
      };
      const r = st!.role;
      if (input.candidates) {
        for (const m of s) reach(origin(m), 'D' + cs);
        return { costUsd: 0, label: String.fromCharCode(65 + Math.floor(rnd() * input.candidates.length)) };
      }
      const decides = !contained && ((r === 'dedupe') || (r === 'tells-compare')) || (r === 'critic' && (ci?.metric === 'critic-score' || ci?.metric === 'critic-rank' || gateCritics.has(sid!))) || (r === 'check' && ci?.metric === 'check-clean');
      if (decides) for (const m of s) reach(origin(m), r === 'dedupe' ? 'Dd' + cs : 'D' + cs);
      switch (r) {
        case 'critic': {
          const t = carry(`C{${tag}}`);
          return { costUsd: 0, text: t, score: { kind: 'score', value: 2 + Math.floor(rnd() * 9) }, noteArtifactId: note(t) };
        }
        case 'check':
          if (rnd() < 0.35) return { costUsd: 0, text: 'No defects.', noteArtifactId: note('No defects.') };
          {
            const t = carry(`K{${tag}}`);
            return { costUsd: 0, text: t, noteArtifactId: note(t) };
          }
        case 'cut':
          if (rnd() < 0.2) return { costUsd: 0, text: 'Nothing to remove.', nothingToRemove: true, noteArtifactId: note('Nothing to remove.') };
          {
            const t = carry(`X{${tag}}`);
            return { costUsd: 0, text: t, noteArtifactId: note(t) };
          }
        case 'tells-sweep': {
          const h = Math.floor(rnd() * 3);
          const hits = Array.from({ length: h }, (_, i) => ({ pattern: carry(`P{${tag}.${i}}`), where: 'w', alternative: 'alt' }));
          const t = hits.length ? hits.map((x) => x.pattern).join('\n') : `none{${tag}}`;
          return { costUsd: 0, text: t, hits, noteArtifactId: note(h ? t : '') };
        }
        case 'overlap':
        case 'vision': {
          const t = carry(`${r === 'vision' ? 'V' : 'O'}{${tag}}`);
          return { costUsd: 0, text: t, noteArtifactId: note(t) };
        }
        case 'judge':
        case 'select':
          return { costUsd: 0, label: 'A' };
        case 'dedupe': {
          const opts: string[] = ports.options ?? [];
          const keep = opts.map((_, i) => String.fromCharCode(65 + i)).filter(() => rnd() < 0.7);
          return { costUsd: 0, keepLabels: keep.length ? keep : opts.length ? ['A'] : [] };
        }
        case 'tells-compare':
          return { costUsd: 0, keep: rnd() < 0.5 ? 'A' : 'B' };
        default: {
          // An AI writer.
          const id = `m:${tag}`;
          if (!contained) {
            for (const m of s) reach(origin(m), 'W' + cs);
            for (const m of w) reach(origin(m), 'I' + cs);
            if (cur.empty !== undefined && TEXT.some((q) => texts[q] === '' && ports[q] === '')) reach(cur.empty, 'E');
          }
          const from = seen(st!, ports);
          cur.linT.set(id, new Set([...s.map(origin), ...from.flatMap((a) => [...lin(cur.linT, a)])]));
          cur.linI.set(id, new Set([...s.map(origin), ...w.map(origin), ...from.flatMap((a) => [...lin(cur.linI, a)])]));
          if (r === 'seed') {
            // Round-10 final verifier: SEEDNOTE=half (default) directs on half the runs, always / never on all / none,
            // prompt: a seed whose prompt asks for its direction before the block (article.SEED, C1's) directs on every run,
            // any other on half. The direction is written from the prompt, so it carries what the seed's text ports hold
            // (SEEDCARRY=0: nothing).
            const mode = process.env.SEEDNOTE ?? 'prompt';
            const always = mode === 'always' || (mode === 'prompt' && st!.prompt === 'article.SEED');
            const directed = always || ((mode === 'half' || mode === 'prompt') && rnd() < 0.5);
            const text = (process.env.SEEDCARRY ?? '0') === '0' ? `S{${tag}}` : carry(`S{${tag}}`);
            return { costUsd: 0, artifactId: id, ...(directed ? { noteArtifactId: note(text) } : {}), seed: `seed${k}` };
          }
          return { costUsd: 0, artifactId: id };
        }
      }
    }
    case 'passStep': {
      if (st?.role === 'fix' && cur.empty !== undefined && !contained && ports.critique === '' && ports.emptyCritique) reach(cur.empty, 'E');
      return undefined;
    }
    case 'finishHumanStep': {
      const out: N = { costUsd: 0, text: input.resolution?.text ?? '' };
      if (sid === cur.empty && out.text === '') reach(cur.empty, ports.critique === undefined ? 'B0' : 'B1');
      if (input.kind === 'write' && st!.produces.includes('artifact')) {
        const id = `h:${tag}`;
        out.artifactId = id;
        const shown = st!.role === 'voice' ? [] : (ports.notes ?? []).map((x: string) => cur.notes.get(x) ?? '');
        cur.linT.set(id, new Set([...shown.flatMap(strong).map(origin), ...lin(cur.linT, ports.artifact)]));
        cur.linI.set(id, new Set([...shown.flatMap((t: string) => [...strong(t), ...weak(t)]).map(origin), ...lin(cur.linI, ports.artifact)]));
      }
      if (input.kind === 'compare') out.keep = input.resolution?.choice?.[0] === 'A' ? 'A' : 'B';
      return out;
    }
    case 'renderView': {
      const ids: string[] = input.artifactIds;
      const link = input.link !== undefined;
      return { costUsd: 0, view: { pool: !!input.pool, items: ids.map((id) => ({ imageArtifactIds: [`img:${id}`], ...(link && rnd() < 0.25 ? { unobservable: 'No clip was made.' } : {}) })) } };
    }
    case 'storyboardShots':
      return rnd() < 0.4 ? [1] : [1, 2, 3];
    case 'assetStep': {
      const audio = st!.consumes.includes('voice');
      const writes = st!.produces.includes('artifact') && !audio;
      const texts = promptText(st!, ports);
      const s = TEXT.flatMap((q) => strong(texts[q]));
      const w = TEXT.flatMap((q) => weak(texts[q]));
      const out: N = { costUsd: 0 };
      if (writes) {
        if (!contained) {
          for (const m of s) reach(origin(m), 'W' + cs);
          for (const m of w) reach(origin(m), 'I' + cs);
          if (cur.empty !== undefined && TEXT.some((q) => texts[q] === '' && ports[q] === '')) reach(cur.empty, 'E');
        }
        const id = `a:${tag}`;
        out.artifactId = id;
        cur.linT.set(id, new Set([...s.map(origin), ...lin(cur.linT, ports.artifact)]));
        cur.linI.set(id, new Set([...s.map(origin), ...w.map(origin), ...lin(cur.linI, ports.artifact)]));
      }
      if (st!.produces.includes('anchor') && !audio) out.anchor = `anchor:${tag}`;
      return out;
    }
    case 'relayLink': {
      const texts = promptText(st!, ports, true);
      const s = TEXT.flatMap((q) => strong(texts[q]));
      const w = TEXT.flatMap((q) => weak(texts[q]));
      if (!contained) {
        for (const m of s) reach(origin(m), 'W' + cs);
        for (const m of w) reach(origin(m), 'I' + cs);
        if (cur.empty !== undefined && TEXT.some((q) => texts[q] === '' && ports[q] === '')) reach(cur.empty, 'E');
        // Info: a brief the relay would have taken in, but its brief slot is "Shot N".
        if (takes(st!, 'brief')) for (const m of strong(ports.brief)) reach(origin(m), 'Rb');
      }
      const id = `r:${tag}`;
      cur.linT.set(id, new Set([...s.map(origin), ...lin(cur.linT, ports.artifact)]));
      cur.linI.set(id, new Set([...s.map(origin), ...w.map(origin), ...lin(cur.linI, ports.artifact)]));
      return { costUsd: 0, artifactId: id, anchor: `anchor:${tag}` };
    }
    case 'rerank':
      return { costUsd: 0, index: Math.floor(rnd() * input.snapshots.length) };
    default:
      return undefined;
  }
};

async function runOnce(recipe: N, empty: string | undefined, mixed = false): Promise<Run> {
  cur = { reached: new Map(), asked: new Map(), notes: new Map(), linT: new Map(), linI: new Map(), outcome: 'done', ...(empty !== undefined ? { empty } : {}), ...(mixed ? { mixed } : {}) };
  info.clear();
  curMedium = recipe.medium;
  const input = { runId: 'run', workspaceId: 'ws', recipe, problem: { text: 'p' }, profileId: 'demo', budgetUsd: 5, medium: recipe.medium, routes: {}, inputs: {} };
  const control = { boundary: async () => {}, machine: (fn: any) => fn(), track: (fn: any) => fn(), pending: new Map() };
  const engine = new Interpreter(input, control as never);
  let asks = 0;
  Object.assign(engine, {
    ask: async (call: N, spec: N, extra: N = {}) => {
      if (++asks > 3000) throw new Error('runaway');
      const ci = info.get(call.key);
      const shownNotes = (spec.artifactIds ?? []).flatMap((id: string) => (cur.notes.has(id) ? [cur.notes.get(id)!] : []));
      const shown = [...shownNotes, spec.initialText ?? ''];
      const carried = shown.flatMap((t: string) => [...strong(t).map((m) => `«${m}»`), ...weak(t).map((m) => `‹${m}›`)]).join('');
      let res: N;
      switch (spec.kind) {
        case 'confirm':
          for (const m of shownNotes.flatMap(strong)) reach(origin(m), 'H');
          res = { approved: rnd() < 0.5 };
          break;
        case 'choose':
          for (const m of shownNotes.flatMap(strong)) reach(origin(m), 'H');
          res = { choice: [spec.options[Math.floor(rnd() * spec.options.length)].id] };
          break;
        case 'select':
          res = { choice: spec.options.filter(() => rnd() < 0.6).map((o: N) => o.id) };
          break;
        case 'pick': {
          const ids = spec.options.map((o: N) => o.id);
          for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [ids[i], ids[j]] = [ids[j], ids[i]];
          }
          res = { choice: ids.slice(0, spec.k ?? 1) };
          break;
        }
        case 'compare':
          res = { choice: [rnd() < 0.5 ? 'A' : 'B'] };
          break;
        case 'write':
          if (extra.step && extra.step.role !== 'voice' && !ci?.contained) for (const m of shownNotes.flatMap(strong)) reach(origin(m), ci?.cand ? 'Nc' : 'N');
          res = { text: `T{${call.stepId}}` };
          break;
        default: {
          cur.asked.set(call.stepId, (cur.asked.get(call.stepId) ?? 0) + 1);
          res = cur.empty === call.stepId || (cur.mixed && rnd() < 1 / 3) ? { text: '' } : { text: `A{${call.stepId}}«${call.stepId}#${++n}»${carried}` };
        }
      }
      return { checkpointId: 'cp', ...res };
    },
  });
  try {
    const fin = await engine.runStages();
    const finalIds = fin.artifact ? [fin.artifact] : (fin.options ?? []);
    for (const id of finalIds) {
      for (const o of lin(cur.linT, id)) reach(o, 'F');
      for (const o of lin(cur.linI, id)) reach(o, 'FI');
    }
  } catch (e: any) {
    cur.outcome = e?.name ?? 'Error';
  }
  return cur;
}

function gateCriticIds(recipe: N): Set<string> {
  const out = new Set<string>();
  const visit = (x: N, inGate: boolean) => {
    if (!x) return;
    if (x.op === 'step') {
      if (inGate && x.actor === 'model' && x.role === 'critic') out.add(x.id);
      return;
    }
    (x.steps ?? []).forEach((c: N) => visit(c, inGate));
    (x.branches ?? []).forEach((b: N) => visit(b.body, inGate));
    (x.lenses ?? []).forEach((l: N) => visit(l.body, false));
    if (x.op === 'gate') visit(x.body, true);
    else if (x.op === 'pick') visit(x.judge, false);
    else if (x.body) visit(x.body, x.op === 'replicate' || x.op === 'each' || x.op === 'loop' ? false : inGate);
  };
  for (const s of recipe.stages) visit(s.body, false);
  return out;
}

it('v9 oracle', async () => {
  const all: N[] = JSON.parse(readFileSync(VARIANTS, 'utf8'));
  const variants = all.slice(OFFSET, OFFSET + LIMIT);
  const rows: N[] = [];
  const counts: N = { variants: 0, targets: 0, runs: 0, outcomes: {} };
  for (const [vi, v] of variants.entries()) {
    const recipe = v.recipe;
    let targets: N[];
    if (MODE === 'refused') {
      targets = (v.refusals ?? []).filter((x: N) => CLAUSES.test(x.clause) && x.stepId).map((x: N) => ({ stepId: x.stepId, clause: x.clause, ruleId: x.ruleId ?? x.rule, path: x.path }));
      // ADDED=1: only the answers this round newly refuses (`added`: rule:clause@stepId).
      if (process.env.ADDED === '1' && Array.isArray(v.added)) targets = targets.filter((t) => v.added.includes(`${t.ruleId}:${t.clause}@${t.stepId}`));
      const byId = new Map<string, N>();
      for (const t of targets) if (!byId.has(t.stepId)) byId.set(t.stepId, t);
      targets = [...byId.values()];
    } else {
      targets = sem.placements(recipe).filter((p: N) => sem.personCritique(p.step)).map((p: N) => ({ stepId: p.step.id, clause: 'admitted', path: p.path, perCandidate: p.perCandidate, contained: p.contained }));
    }
    if (!targets.length) continue;
    counts.variants++;
    gateCritics = gateCriticIds(recipe);
    const per = new Map<string, N>(targets.map((t) => [t.stepId, { ...t, asked: 0, askedEmpty: 0, given: {} as N, emptyE: 0 }]));
    rs = 1000 + (OFFSET + vi) * 7919;
    for (let k = 0; k < RUNS; k++) {
      const r = await runOnce(recipe, undefined);
      counts.runs++;
      counts.outcomes[r.outcome] = (counts.outcomes[r.outcome] ?? 0) + 1;
      for (const [id, row] of per) {
        if (r.asked.get(id)) row.asked++;
        for (const ch of r.reached.get(id) ?? []) row.given[ch] = (row.given[ch] ?? 0) + 1;
      }
    }
    for (const [id, row] of per) {
      rs = 5000 + (OFFSET + vi) * 7919;
      for (let k = 0; k < RUNS; k++) {
        const r = await runOnce(recipe, id);
        counts.runs++;
        if (r.asked.get(id)) row.askedEmpty++;
        if (r.reached.get(id)?.has('E')) row.emptyE++;
        if (r.reached.get(id)?.has('B0')) row.b0 = (row.b0 ?? 0) + 1;
        if (r.reached.get(id)?.has('B1')) row.b1 = (row.b1 ?? 0) + 1;
      }
    }
    rs = 9000 + (OFFSET + vi) * 7919;
    for (let k = 0; k < RUNS; k++) {
      const r = await runOnce(recipe, undefined, true);
      counts.runs++;
      for (const [id, row] of per) {
        if (r.asked.get(id)) row.askedMixed = (row.askedMixed ?? 0) + 1;
        for (const ch of r.reached.get(id) ?? []) (row.mixed ??= {})[ch] = (row.mixed[ch] ?? 0) + 1;
      }
    }
    counts.targets += per.size;
    rows.push({ idx: v.idx ?? OFFSET + vi, nearest: v.nearest, muts: v.muts, keys: v.keys, targets: [...per.values()] });
  }
  writeFileSync(process.env.OUT!, JSON.stringify({ VARIANTS, MODE, RUNS, OFFSET, INFLUENCE, SEEDNOTE: process.env.SEEDNOTE ?? 'prompt', SEEDCARRY: process.env.SEEDCARRY ?? '0', RENDERED, counts, rows, trace: trace.slice(0, 400) }));
}, 36_000_000);
