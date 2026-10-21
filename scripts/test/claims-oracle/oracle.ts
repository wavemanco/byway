/**
 * The claims oracle: every claim a composed recipe's explainer makes (and the run's VOICE wording), checked against
 * what the real Interpreter does when it runs the recipe with its activities stubbed and random answers (F01, ADR-0092,
 * ADR-0097, ADR-0098). The claims are read from the advisor's presentation; what ran is read from the stubbed calls.
 * The structure the checks need is read here, independently of @byway/recipe's semantics.
 *
 * Ported from the F01 semantics work's last verification (2026-10-09): the ports-rendered differential's
 * claims-pr.oracle.test.mts (the round-11 final verifier's claims12h with ADR-0097's RENDERED check; under %TEMP%,
 * scratch/ports-rendered/). The checks are unchanged. What changed: the environment switches are options; the
 * switches that loosened or skipped checks for other corpora (LOOSE_D, LOOSE_G, REFUSED) are gone; the corpus is passed
 * in, not read from a file; the report is returned, not written; the presentation can be given (the RENDERED control,
 * in place of PRES=main); and an audio ASSET finishes skipped, as the real activity does (activities/asset.ts). The
 * checks' own comments are the verifiers'. One fix to the oracle itself: the random answers' product is taken exactly
 * (see the generator below).
 *
 * The J check's kinds for a step refused as unapplied or as asked per candidate (J-REFUSED-BUT-APPLIED,
 * J2-REFUSED-BUT-REACHES-WORK-VIA-AI-DIRECTION, J3-PER-CANDIDATE-REFUSED-BUT-APPLIED) read a variant's unappliedSteps
 * and perCandidateSteps, which only rounds 6 to 8's re-admission scripts set, on their refused corpora. The corpus here
 * is admitted variants only, as in ADR-0097's measurement (gen-pr.mts set neither), so those kinds never fire. The
 * check of a refused step runs only under the FORCE_J control, which takes every person's list or critique as refused
 * and reports J-FORCED(control) where an AI writer took the answer in; on the admitted variants an answer given and
 * never applied is reported (info). That a person's answer reaches the work is the validator's rule ST12
 * ('critique-unapplied', 'critique-per-candidate'), guarded by the validator's and the advisor's tests
 * (packages/validator/test/semantics-rules.test.ts, packages/advisor/test/prompt-shows-admission.test.ts), not here.
 *
 * The test file that uses this module must mock `packages/runner/src/workflow/acts.ts` with `respond` (see
 * claims-oracle.test.ts), so the Interpreter's activities come here.
 */
import { COMPOSED_EXPLAINERS, presentComposed } from '../../../packages/advisor/src/index.ts';
import { createPromptRenderer } from '../../../packages/prompts/src/index.ts';
import { lockedScripts, walk } from '../../../packages/recipe/src/index.ts';
import { isAudioAsset } from '../../../packages/runner/src/activities/asset.ts';
import { Interpreter } from '../../../packages/runner/src/workflow/interpreter.ts';
import * as wording from '../../../packages/runner/src/workflow/wording.ts';

/** The options the verifiers set through the environment. */
export interface OracleOptions {
  /** Runs per variant (the verifiers used 12 or 16). */
  runs: number;
  /** When a seed's direction comes back as a note: 'prompt' (C1's seed, which asks for it first, on every run; others on half), 'half', 'always' or 'never'. */
  seedNote?: 'prompt' | 'half' | 'always' | 'never';
  /** ADR-0097's check: an applier said to apply a step's findings is shown the critique by its prompt's template. */
  rendered?: boolean;
  /** Control: claims that a step is held to its notes, keeps the person's words or is locked are taken as made everywhere. */
  force?: boolean;
  /** Control: every AI VISION is taken as claiming its directions are shown to your next VISION. */
  forceReact?: boolean;
  /** Control: every person's list or critique is taken as refused, so the check fires where an AI writer takes it in. */
  forceJ?: boolean;
  /** The presentation whose claims are checked (default: the advisor's presentComposed of the recipe). */
  present?: (recipe: N) => N;
}

/** What the oracle found: counts of what it checked, and each problem kind with examples. */
export interface OracleReport {
  stats: { variants: number; runs: number; outcomes: Record<string, number>; claimed: Record<string, number> };
  problems: Record<string, { count: number; examples: N[]; by: Record<string, number>; variants: number[] }>;
}

// The checks read recipe trees and stubbed calls freely, as the verifiers wrote them.
type N = Record<string, any>;

// RENDERED: the template slots the real library declares, read independently of @byway/recipe's promptShows.
const PR = createPromptRenderer();
const rendersCritique = (step: any, medium: string): boolean => {
  const id = step.role === 'asset' && !(step.prompt && PR.has(step.prompt)) ? 'helper.asset.briefs' : step.prompt;
  try {
    return PR.info(id, medium).slots.includes('critique');
  } catch {
    return true;
  }
};
const E = COMPOSED_EXPLAINERS;
let opts: OracleOptions = { runs: 12 };

// The random answers: the verifiers' linear congruential generator, with its product taken exactly (Math.imul). As
// they wrote it, `seed * 1103515245` passed a double's 53 bits and lost its low bits, so it was not the generator
// intended, and its states end in short cycles: from the measurement's seeds, after a median of 3,929 draws, in one of
// 10,466 draws (20,398 of the 20,695 seeds) or of 10 to 378 draws (the other 297). Each variant is seeded afresh
// (judgeVariants: 1000 + idx * 7919) and its runs draw a few hundred answers (at most 1,000), so a variant's place in
// the corpus made no difference, and only 23 of the measurement's 20,695 variants, whose draws went round a cycle of 10
// to 378 draws, repeated answers across their runs (ADR-0097's Later note).
let seed = 1;
const rnd = () => {
  seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Structural facts read independently of the code under test. */
function structure(recipe: N) {
  const steps = new Map<string, N>();
  const contained = new Set<string>();
  const visit = (n: N, inBox: boolean) => {
    if (n.op === 'step') {
      steps.set(n.id, n);
      if (inBox) contained.add(n.id);
      return;
    }
    if (n.steps) n.steps.forEach((c: N) => visit(c, inBox));
    if (n.op === 'audit') n.lenses.forEach((l: N) => visit(l.body, true));
    else if (n.op === 'gate') visit(n.body, true);
    else if (n.op === 'pick') {
      if (n.judge) visit(n.judge, true);
    } else if (n.branches) n.branches.forEach((b: N) => visit(b.body, inBox));
    else if (n.body) visit(n.body, inBox);
  };
  for (const s of recipe.stages) visit(s.body, false);
  return { steps, contained };
}

interface Run {
  events: N[];
  created: Map<string, { i: number; parent?: string; by: string; stepId: string }>;
  outcome: string;
  final?: N;
}

let cur: Run;
let counter = 0;
const newArt = (prefix: string, stepId: string, parent: string | undefined): string => {
  const id = `${prefix}:${stepId}#${++counter}`;
  cur.created.set(id, { i: cur.events.length, ...(parent ? { parent } : {}), by: prefix, stepId });
  return id;
};

/** The stubbed activities: each call is recorded as an event of the current run, with a canned or random answer. */
export async function respond(name: string, input: any): Promise<unknown> {
  const ev: N = { type: name, stepId: input?.call?.stepId, key: input?.call?.key, candidate: input?.call?.candidate, role: input?.step?.role, step: input?.step, critiqueIn: input?.ports?.critique, briefIn: input?.ports?.brief, tasteIn: input?.ports?.taste, artifactIn: input?.ports?.artifact, shot: input?.shot ?? input?.ports?.shot, linkStart: input?.ports?.linkStart, anchorIn: input?.ports?.anchor, sbArt: input?.artifactId };
  cur.events.push(ev);
  if (cur.events.length > 20000) throw new Error('runaway');
  const n = ++counter;
  const sid = ev.stepId;
  switch (name) {
    case 'modelStep': {
      const r = input.step.role;
      const tag = `${sid}#${n}`;
      if (input.candidates) {
        ev.judge = true;
        return { costUsd: 0, label: LABELS[Math.floor(rnd() * input.candidates.length)] };
      }
      switch (r) {
        case 'critic':
          return (ev.out = { costUsd: 0, text: `CRIT{${tag}}`, score: { kind: 'score', value: rnd() < 0.4 ? 10 : 3 }, noteArtifactId: `note:${tag}` });
        case 'check':
          return (ev.out = { costUsd: 0, text: rnd() < 0.4 ? 'No defects.' : `CHECK{${tag}}`, noteArtifactId: `note:${tag}` });
        case 'cut':
          return (ev.out = rnd() < 0.25 ? { costUsd: 0, text: 'Nothing to remove.', nothingToRemove: true, noteArtifactId: `note:${tag}` } : { costUsd: 0, text: `CUT{${tag}}`, noteArtifactId: `note:${tag}` });
        case 'tells-sweep': {
          const k = Math.floor(rnd() * 3);
          const hits = Array.from({ length: k }, (_, i) => ({ pattern: `P{${tag}}-${i}`, alternative: 'alt' }));
          return (ev.out = { costUsd: 0, text: hits.map((h, i) => `${i + 1}. "${h.pattern}" -> "alt"`).join('\n') || `No stock patterns found {${tag}}.`, hits, noteArtifactId: `note:${tag}` });
        }
        case 'overlap':
          return (ev.out = { costUsd: 0, text: `OVL{${tag}}`, noteArtifactId: `note:${tag}` });
        case 'vision':
          return (ev.out = { costUsd: 0, text: `VIS{${tag}}`, noteArtifactId: `note:VIS:${tag}` });
        case 'judge':
        case 'select':
          return (ev.out = { costUsd: 0, label: 'A' });
        case 'dedupe': {
          const opts = input.ports.options ?? [];
          const keep = opts.map((_: string, i: number) => LABELS[i]).filter(() => rnd() < 0.7);
          return (ev.out = { costUsd: 0, keepLabels: keep.length ? keep : opts.length ? ['A'] : [] });
        }
        case 'tells-compare':
          return (ev.out = { costUsd: 0, keep: rnd() < 0.5 ? 'A' : 'B' });
        default: {
          ev.writer = true;
          const id = newArt('m', sid, input.ports.artifact);
          ev.made = id;
          // Round-10 final verifier: a seed's direction is a note on half the runs (SEEDNOTE=half, the default here), every run
          // (always), none (never), or every run for a prompt that asks for it first (prompt: article.SEED) and half for others.
          const mode = opts.seedNote ?? 'half';
          const directed = r === 'seed' && (mode === 'always' || (mode === 'prompt' && input.step.prompt === 'article.SEED') || ((mode === 'half' || mode === 'prompt') && rnd() < 0.5));
          if (directed) ev.seedNote = true;
          return (ev.out = { costUsd: 0, artifactId: id, ...(r === 'seed' || input.step.consumes.includes('seed') ? { seed: `SEED${n}` } : {}), ...(directed ? { noteArtifactId: `note:SEED:${tag}` } : {}) });
        }
      }
    }
    case 'finishHumanStep': {
      const st = input.step;
      const out: N = { costUsd: 0, text: input.resolution?.text ?? '' };
      if (input.kind === 'write' && st.produces.includes('artifact')) {
        const id = newArt('h', sid, input.ports.artifact);
        ev.made = id;
        out.artifactId = id;
      }
      if (input.kind === 'compare') out.keep = input.resolution?.choice?.[0] === 'A' ? 'A' : 'B';
      ev.kind = input.kind;
      return (ev.out = out);
    }
    case 'renderView': {
      const ids: string[] = input.artifactIds;
      return { costUsd: 0, view: { pool: !!input.pool, items: ids.map((id) => ({ imageArtifactIds: [`img:${id}`] })) } };
    }
    case 'storyboardShots':
      {
        const memo = ((cur as N).shotsBy ??= new Map<string, number[]>());
        if (!memo.has(input.artifactId)) memo.set(input.artifactId, rnd() < 0.5 ? [1] : [1, 2, 3]);
        return (ev.out = memo.get(input.artifactId));
      }
    case 'assetStep': {
      // An audio ASSET has no executor in v1 and finishes skipped (activities/asset.ts), so it writes nothing.
      if (isAudioAsset(input.step)) return (ev.out = { costUsd: 0, skipped: true });
      ev.writer = input.step.produces.includes('artifact');
      const out: N = { costUsd: 0 };
      if (ev.writer) out.artifactId = ev.made = newArt('a', sid, input.ports.artifact);
      if (input.step.produces.includes('anchor')) out.anchor = `anchor:${sid}#${n}`;
      return (ev.out = out);
    }
    case 'relayLink': {
      ev.writer = true;
      const id = (ev.made = newArt('r', sid, input.ports.artifact));
      return (ev.out = { costUsd: 0, artifactId: id, anchor: `anchor:${sid}#${n}` });
    }
    case 'rerank':
      return { costUsd: 0, index: Math.floor(rnd() * input.snapshots.length) };
    default:
      return undefined;
  }
}

async function runOnce(recipe: N): Promise<Run> {
  cur = { events: [], created: new Map(), outcome: 'done' };
  const input = { runId: 'run', workspaceId: 'ws', recipe, problem: { text: 'p' }, profileId: 'demo', budgetUsd: 5, medium: recipe.medium, routes: {}, inputs: {} };
  const control = { boundary: async () => {}, machine: (fn: any) => fn(), track: (fn: any) => fn(), pending: new Map() };
  const engine = new Interpreter(input as never, control as never);
  Object.assign(engine, {
    ask: async (call: N, spec: N, extra: N = {}) => {
      const ev: N = { type: 'ask', kind: spec.kind, stepId: call.stepId, key: call.key, candidate: call.candidate, prompt: spec.prompt, artifactIds: spec.artifactIds ?? [], initialText: spec.initialText, options: spec.options, step: extra.step };
      cur.events.push(ev);
      let res: N;
      switch (spec.kind) {
        case 'confirm':
          res = { approved: rnd() < 0.5 };
          break;
        case 'choose':
          res = { choice: [spec.options[Math.floor(rnd() * spec.options.length)].id] };
          break;
        case 'select':
          res = { choice: spec.options.filter(() => rnd() < 0.5).map((o: N) => o.id) };
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
        case 'directive':
          res = { text: rnd() < 0.3 ? '' : `DIR{${call.stepId}}` };
          break;
        default:
          res = { text: `TXT{${call.stepId}}` };
      }
      ev.answer = res;
      return { checkpointId: 'cp', ...res };
    },
  });
  try {
    cur.final = await engine.runStages();
  } catch (e: any) {
    cur.outcome = `${e?.name ?? 'Error'}: ${String(e?.message ?? e).slice(0, 160)}`;
  }
  return cur;
}

/** Each shown step: its lead unit's id, label and explainer. */
function shownSteps(recipe: N, pres: N, st: ReturnType<typeof structure>) {
  const nodes = new Map<string, N>();
  walk(recipe as never, (n: N) => {
    if (n.id !== undefined && !nodes.has(n.id)) nodes.set(n.id, n);
  });
  const out: N[] = [];
  for (const stage of pres.stages)
    for (const s of stage.steps) {
      const units = s.stepIds.map((id: string) => nodes.get(id)).filter((n: N | undefined) => n && (n.op === 'step' || n.op === 'pick'));
      const lead = units.find((u: N) => !(u.op === 'step' && u.role === 'render')) ?? units[0];
      out.push({ lead, units, label: s.label, explainer: s.explainer, who: s.who });
    }
  return out;
}

const ancestors = (run: Run, id: string | undefined): string[] => {
  const out: string[] = [];
  let x = id;
  const seen = new Set<string>();
  while (x && !seen.has(x)) {
    seen.add(x);
    out.push(x);
    x = run.created.get(x)?.parent;
  }
  return out;
};

/** The candidate path of an event's call (`run/step/where/n`): events of one seq share it; nested fan-outs extend it. */
const whereOf = (x: N): string | undefined => (typeof x.key === 'string' ? x.key.split('/')[2] : undefined);
const samePath = (x: N, e: N): boolean => {
  const a = whereOf(x);
  const b = whereOf(e);
  if (a === undefined || b === undefined) return true;
  return a === b || b === '-' || a.startsWith(`${b}.`);
};
const isPersonWriteSpec =(st: N | undefined): boolean => !!st && st.actor === 'human' && ['voice', 'build', 'fix'].includes(st.role) && st.produces.includes('artifact');
/** Independent of voiceScope: a person write that can reach a storyboard's voice-over (copy.ts / human.ts by variant). */
const canTouchScript = (st: N, medium: string): boolean => isPersonWriteSpec(st) && !(st.role === 'voice' && medium === 'media' && st.variant !== 'VOICE-early' && st.variant !== 'claim-log');

/** Runs every variant `options.runs` times and checks each claim its presentation makes against what ran. */
export async function judgeVariants(variants: readonly { nearest: string; muts: string[]; recipe: N }[], options: OracleOptions): Promise<OracleReport> {
  opts = options;
  const RUNS = options.runs;
  const RENDERED = options.rendered ?? true;
  const problems = new Map<string, N>();
  const add = (kind: string, v: N, detail: N) => {
    const p = (problems.get(kind) ?? problems.set(kind, { count: 0, examples: [], by: {}, variants: [] }).get(kind)!) as N;
    p.count++;
    const sub = `${detail.explainer ?? ''}`;
    p.by[sub] = (p.by[sub] ?? 0) + 1;
    if (!p.variants.includes(v.idx)) p.variants.push(v.idx);
    if (p.examples.length < 6) p.examples.push({ nearest: v.nearest, muts: v.muts, idx: v.idx, ...detail });
  };
  const stats: N = { variants: 0, runs: 0, outcomes: {} as N, claimed: {} as N };
  const claimed = (k: string) => (stats.claimed[k] = (stats.claimed[k] ?? 0) + 1);
  let idx = -1;
  for (const variant of variants) {
    idx++;
    const v: N = { ...variant, idx };
    const recipe = v.recipe;
    const st = structure(recipe);
    const pres = opts.present ? opts.present(recipe) : presentComposed(recipe as never, { name: 'x', promise: 'x', bestFor: [], code: 'x' });
    const shown = shownSteps(recipe, pres, st);
    const locked = new Set([...lockedScripts(recipe as never)].map((s: N) => s.id));
    stats.variants++;
    seed = 1000 + idx * 7919;
    const runs: Run[] = [];
    for (let k = 0; k < RUNS; k++) {
      const r = await runOnce(recipe);
      runs.push(r);
      stats.runs++;
      const o = r.outcome.split(':')[0]!;
      stats.outcomes[o] = (stats.outcomes[o] ?? 0) + 1;
      if (o !== 'done' && o !== 'RunFailure' && o !== 'RunStopped') add('UNEXPECTED-OUTCOME', v, { outcome: r.outcome });
    }
    const explainerOf = new Map<string, N>();
    for (const s of shown) if (s.lead?.op === 'step') explainerOf.set(s.lead.id, s);

    // --- B: explainer lock vs run lock vs lockedScripts --------------------------------------------------------
    for (const s of shown) {
      if (s.lead?.op !== 'step') continue;
      if (s.explainer === E.voiceScriptLocked) {
        claimed('voiceScriptLocked');
        if (!locked.has(s.lead.id)) add('EXPLAINER-LOCK-NOT-IN-LOCKEDSCRIPTS', v, { step: s.lead.id });
      } else if (locked.has(s.lead.id)) add('LOCKEDSCRIPTS-BUT-EXPLAINER-NOT-LOCKED', v, { step: s.lead.id, explainer: s.explainer });
    }

    for (const run of runs) {
      const evs = run.events;
      const finalArt: string | undefined = run.final?.artifact;
      const laterWork = (from: number): string[] => [...evs.slice(from).filter((e) => e.artifactIn && !st.contained.has(e.stepId)).map((e) => e.artifactIn), ...(finalArt ? [finalArt] : [])];
      evs.forEach((e, i) => {
        // --- A: the run's VOICE wording -------------------------------------------------------------------------
        if (e.type === 'ask' && e.kind === 'write' && e.step?.role === 'voice') {
          const fin = evs.slice(i + 1).find((x) => x.type === 'finishHumanStep' && x.key === e.key);
          const made: string | undefined = fin?.made;
          const isLockedPrompt = (opts.force && e.step?.variant === 'VOICE-early') || e.prompt === wording.SCRIPT_LOCKED_PROMPT || /locked/i.test(e.prompt);
          if (isLockedPrompt) {
            claimed('run-locked-prompt');
            if (!locked.has(e.stepId)) add('RUN-LOCK-NOT-IN-LOCKEDSCRIPTS', v, { step: e.stepId });
            const ex = explainerOf.get(e.stepId);
            if (ex && ex.explainer !== E.voiceScriptLocked) add('RUN-LOCK-BUT-EXPLAINER-NOT', v, { step: e.stepId, explainer: ex.explainer });
            // L1: a later person write that can reach the voice-over
            const later = evs.slice(i + 1).find((x) => x.type === 'ask' && x.kind === 'write' && x.step && canTouchScript(x.step, recipe.medium) && !st.contained.has(x.stepId));
            if (later) add('L1-LOCKED-BUT-LATER-PERSON-WRITE', v, { step: e.stepId, later: later.stepId, laterVariant: later.step.variant, outcome: run.outcome });
            if (made) {
              // L2: the work goes back to a version older than the locked script
              const at = run.created.get(made)!.i;
              const finAt = evs.indexOf(fin as N);
              const older = laterWork(finAt + 1).find((a) => run.created.has(a) && run.created.get(a)!.i < at && !ancestors(run, a).includes(made));
              if (older) add('L2-LOCKED-BUT-RESTORED-OLDER', v, { step: e.stepId, older, outcome: run.outcome });
              // L3: a machine writer that is not held to keep the words, whose output reaches the work
              const w = evs.slice(i + 1).find((x) => x.writer && x.made && !x.step?.keepsVoice && !st.contained.has(x.stepId));
              if (w) add('L3-LOCKED-BUT-UNHELD-MACHINE-WRITE', v, { step: e.stepId, writer: w.stepId });
            }
          }
          // USED: "used exactly as you write it/them" in every VOICE prompt (not claims)
          if (/used exactly as you write/.test(e.prompt) && run.outcome === 'done') {
            claimed('run-used-prompt');
            if (!made) add('USED-BUT-NOT-WRITTEN', v, { step: e.stepId, contained: st.contained.has(e.stepId), produces: e.step.produces, prompt: e.prompt.slice(0, 40) });
            else if (!st.contained.has(e.stepId)) {
              const fin2 = finalArt;
              const ok = fin2 ? ancestors(run, fin2).includes(made) : false;
              // a later person write may replace it (not locked); only a machine or a pick dropping it is a false "used"
              const laterPerson = evs.slice(i + 1).some((x) => x.type === 'ask' && x.kind === 'write' && isPersonWriteSpec(x.step));
              if (!ok && !laterPerson) add('USED-BUT-DROPPED', v, { step: e.stepId, final: fin2, made });
            } else add('USED-BUT-CONTAINED', v, { step: e.stepId });
          }
        }
        // --- C: "the AI wrote the rest" ---------------------------------------------------------------------------
        if (e.type === 'ask' && e.kind === 'write') {
          const ex = explainerOf.get(e.stepId);
          if (ex && (opts.force && (e.step?.variant === 'claim-log' || e.step?.knobs?.scope === 'key-lines') || ex.explainer === E.voiceClaimsAiRest || ex.explainer === E.voiceKeyLinesAiRest)) {
            claimed('aiWroteRest');
            const fin = evs.slice(i + 1).find((x) => x.type === 'finishHumanStep' && x.key === e.key);
            const work = fin?.artifactIn;
            const human = ancestors(run, work).find((a) => run.created.get(a)?.by === 'h');
            if (human) add('C-AI-WROTE-REST-BUT-PERSON-WROTE', v, { step: e.stepId, by: run.created.get(human)?.stepId });
            if (!work) add('C-AI-WROTE-REST-NO-WORK', v, { step: e.stepId });
          }
        }
        // --- D: notes only ----------------------------------------------------------------------------------------
        if (e.type === 'modelStep' && (e.role === 'cut' || e.role === 'tells-sweep') && e.step?.actor === 'model') {
          const ex = explainerOf.get(e.stepId);
          if (ex && (opts.force || ex.explainer === E.cutNothingDeleted || ex.explainer === E.tellsFlagsOnly)) {
            claimed('notesOnly');
            const tag = `${e.stepId}#`;
            const applied = evs.slice(i + 1).find((x) => x.writer && x.made && typeof x.critiqueIn === 'string' && x.critiqueIn.includes(`{${tag}`) && !st.contained.has(x.stepId) && (x.step?.consumes?.includes('critique') || x.step?.reads?.includes('critique')));
            if (applied) add('D-NOTES-ONLY-BUT-APPLIED', v, { step: e.stepId, writer: applied.stepId });
          }
        }
        // --- H: the swap question ---------------------------------------------------------------------------------
        if (e.type === 'ask' && e.kind === 'select' && st.steps.get(e.stepId)?.role === 'tells-sweep') {
          claimed('swapAsk');
          // decides something: the next model writer or pass that takes a critique gets the chosen ones
          const chosen = (e.answer.choice ?? []).length;
          const rest = evs.slice(i + 1).filter((x) => samePath(x, e));
          const here = rest.filter((x) => whereOf(x) === undefined || whereOf(x) === whereOf(e));

          const j = rest.findIndex((x) => here.includes(x) && (x.writer || x.type === 'passStep') && (x.step?.consumes?.includes('critique') || x.step?.reads?.includes('critique')));
          const upto = j < 0 ? rest.length : j;
          const replaced = here.filter((x) => rest.indexOf(x) < upto).find((x) => x.type === 'modelStep' && x.out && typeof x.out.text === 'string' && !x.judge && !['vision'].includes(x.role)) ?? here.filter((x) => rest.indexOf(x) < upto).find((x) => x.type === 'finishHumanStep' && (x.kind === 'directive' || (x.step?.produces ?? []).includes('critique')));
          if (j < 0) add('H-ASKED-BUT-NO-SWAP-STEP-RAN', v, { step: e.stepId, outcome: run.outcome });
          else if (replaced) add('H-ASKED-BUT-REPLACED-BEFORE-SWAP', v, { step: e.stepId, by: replaced.stepId });
          else if (chosen && rest[j]!.type !== 'passStep' && !String(rest[j]!.critiqueIn ?? '').includes(`P{${e.stepId}#`)) add('H-ASKED-BUT-SWAP-GOT-OTHER', v, { step: e.stepId, swap: rest[j]!.stepId, crit: String(rest[j]!.critiqueIn).slice(0, 60) });
        }
        if (e.type === 'modelStep' && e.role === 'tells-sweep' && e.step?.actor === 'model' && (e.out?.hits?.length ?? 0) > 0) {
          const ex = explainerOf.get(e.stepId);
          const asked = evs.slice(i + 1).filter((x) => samePath(x, e)).slice(0, 3).some((x) => x.type === 'ask' && x.kind === 'select' && x.stepId === e.stepId);
          if (!asked) {
            const w = evs.slice(i + 1).filter((x) => samePath(x, e)).find((x) => x.writer && (x.step?.consumes?.includes('critique') || x.step?.reads?.includes('critique')));
            if (w && w.step?.role === 'fix' && w.step?.consumes?.includes('critique') && (e.out.hits as N[]).every((h) => String(w.critiqueIn ?? '').includes(h.pattern)))
              add('H-NOT-ASKED-BUT-FINDS-REACHED-SWAP-STEP(info)', v, { step: e.stepId, swap: w.stepId, explainer: ex?.explainer, lead: ex?.lead?.id });
          }
          if (ex?.explainer === E.tellsApplies) {
            claimed('tellsApplies');
            if (!asked) add('H-SAYS-YOU-CHOOSE-BUT-NOT-ASKED', v, { step: e.stepId });
          }
          if (ex?.explainer === E.tellsAppliesAll) {
            claimed('tellsAppliesAll');
            if (asked) add('H-SAYS-ALL-BUT-ASKED', v, { step: e.stepId });
            const applier = ex.units.find((u: N) => u !== ex.lead && u.op === 'step' && u.role !== 'render');
            const after = evs.slice(i + 1);
            const again = after.findIndex((x) => x.type === 'modelStep' && x.stepId === e.stepId && whereOf(x) === whereOf(e));
            const w = applier && (again < 0 ? after : after.slice(0, again)).filter((x) => samePath(x, e)).find((x) => x.stepId === applier.id && (x.writer || x.type === 'passStep'));
            if (w && !(e.out.hits as N[]).every((h) => String(w.critiqueIn ?? '').includes(h.pattern))) add('H-SAYS-ALL-BUT-NOT-ALL-SWAPPED', v, { step: e.stepId, applier: applier.id, crit: String(w.critiqueIn).slice(0, 60) });
          }
        }
        // --- I: "the AI fixes them" / "removes it" ----------------------------------------------------------------
        if ((e.writer || e.type === 'passStep') && e.step) {
          for (const ex of shown) {
            if (ex.lead?.op !== 'step' || !ex.units.some((u: N) => u.id === e.stepId) || ex.lead.id === e.stepId) continue;
            if (![E.criticApplies, E.cutApplies, E.checkApplies, E.tellsApplies, E.tellsAppliesAll, E.cutYoursApplies].includes(ex.explainer)) continue;
            claimed('applies');
            if (RENDERED && e.type !== 'passStep' && e.step.actor === 'model' && !rendersCritique(e.step, recipe.medium)) add('I-APPLIES-BUT-PROMPT-NEVER-SHOWS', v, { lead: ex.lead.id, applier: e.stepId, prompt: e.step.prompt, explainer: ex.explainer });
            // the lead ran since this applier last ran (or since the start)
            const prevApplier = evs.slice(0, i).map((x, j) => (x.stepId === e.stepId && (x.writer || x.type === 'passStep') ? j : -1)).filter((j) => j >= 0).at(-1) ?? -1;
            const leadRan = evs.slice(prevApplier + 1, i).some((x) => x.stepId === ex.lead.id && (x.type === 'modelStep' || x.type === 'finishHumanStep'));
            const ci = String(e.critiqueIn ?? '');
            const fromLead = ci.includes(`{${ex.lead.id}#`) || ci.includes(`{${ex.lead.id}}`) || (ci.includes('No defects.') && ex.lead.role === 'check') || ci === 'No swaps chosen.' || ci === 'Nothing to remove.' || (ci === '' && ex.lead.actor === 'human');
            if (!leadRan && e.type !== 'passStep' && !fromLead) add('I-APPLIES-STALE-CRITIQUE(info)', v, { lead: ex.lead.id, applier: e.stepId, crit: ci.slice(0, 40), explainer: ex.explainer });
            if (leadRan && e.type !== 'passStep' && !fromLead) add('I-APPLIES-BUT-OTHER-CRITIQUE', v, { lead: ex.lead.id, applier: e.stepId, crit: String(e.critiqueIn).slice(0, 60), explainer: ex.explainer });
          }
        }
        // --- K: skipped steps -------------------------------------------------------------------------------------
        if (e.type === 'skipStep') {
          const ex = explainerOf.get(e.stepId);
          if (ex && ![E.skipped, E.compositingSkipped, E.audioSkipped].includes(ex.explainer)) add('K-SKIPPED-BUT-EXPLAINER-SAYS-RUNS', v, { step: e.stepId, explainer: ex.explainer });
        }
        // --- F: seeds ---------------------------------------------------------------------------------------------
      });
    }
    // --- E: reacted to (existential over runs) ----------------------------------------------------------------------
    for (const s of shown) {
      if (s.lead?.op !== 'step' || s.lead.role !== 'vision' || s.lead.actor !== 'model') continue;
      const claimsReact = s.explainer === E.visionAiToReact || s.label === 'Directions to react to';
      if (claimsReact) claimed('reactedTo');
      let ran = 0;
      let reacted = 0;
      const instead = new Set<string>();
      for (const run of runs) {
        const evs = run.events;
        let saw = false;
        evs.forEach((e, i) => {
          if (e.type !== 'modelStep' || e.stepId !== s.lead.id) return;
          saw = true;
          const tag = `VIS{${e.stepId}#`;
          const note = e.out?.noteArtifactId;
          const nextReact = evs.slice(i + 1).find((x) => x.type === 'ask' && x.step?.role === 'vision' && x.step?.actor === 'human');
          if (nextReact) instead.add(`${nextReact.stepId}<-${nextReact.artifactIds.filter((a: string) => a.startsWith('note:')).map((a: string) => a.replace(/#\d+$/, '')).join('+') || 'no-note'}`);
          else instead.add('no-later-person-vision');
          if (evs.slice(i + 1).some((x) => x.type === 'ask' && x.step?.role === 'vision' && x.step?.actor === 'human' && ((note && x.artifactIds.includes(note)) || String(x.initialText ?? '').includes(tag)))) reacted++;
        });
        if (saw) ran++;
      }
      if (claimsReact && ran > 0 && reacted === 0) add('E-REACT-CLAIM-BUT-NEVER-SHOWN', v, { step: s.lead.id, ran, label: s.label, instead: [...instead] });
      if (claimsReact && ran > 0 && reacted > 0 && reacted < ran) add('E-REACT-SOMETIMES-NOT-SHOWN(info)', v, { step: s.lead.id, ran, reacted });
      if (!claimsReact && reacted > 0) add('E-NO-REACT-CLAIM-BUT-SHOWN(info)', v, { step: s.lead.id, ran, reacted });
    }
    // --- E-STRICT (added, round 5): every time claimed directions are made, your next VISION is shown them --------
    for (const s of shown) {
      if (s.lead?.op !== 'step' || s.lead.role !== 'vision' || s.lead.actor !== 'model') continue;
      const claims = opts.forceReact ? true : s.explainer === E.visionAiToReact || s.label === 'Directions to react to';
      if (!claims) continue;
      claimed('reactedToStrict');
      for (const run of runs) {
        run.events.forEach((e, i) => {
          if (e.type !== 'modelStep' || e.stepId !== s.lead.id) return;
          const tag = `VIS{${e.stepId}#`;
          const note = e.out?.noteArtifactId;
          const next = run.events.slice(i + 1).find((x) => x.type === 'ask' && x.step?.role === 'vision' && x.step?.actor === 'human');
          if (!next) return;
          const seen = (note && next.artifactIds.includes(note)) || String(next.initialText ?? '').includes(tag);
          if (!seen) add(opts.forceReact ? 'E-STRICT-FORCED(control)' : 'E-STRICT-NEXT-VISION-NOT-SHOWN', v, { step: s.lead.id, next: next.stepId, shown: next.artifactIds.filter((a: string) => a.startsWith('note:')).map((a: string) => a.replace(/#d+$/, '')) });
        });
      }
    }
    // --- H-info (added, round 5): a swap question asked where the sweep's explainer does not say you choose ---------
    for (const run of runs) {
      for (const e of run.events) {
        if (e.type !== 'ask' || e.kind !== 'select' || st.steps.get(e.stepId)?.role !== 'tells-sweep') continue;
        const ex = explainerOf.get(e.stepId);
        if (ex && ex.explainer !== E.tellsApplies) add('H-ASKED-BUT-NOT-SAID(info)', v, { step: e.stepId, explainer: ex.explainer });
      }
    }
    // --- J (added, round 6): a person's list or critique, and whether an AI writer took it in ---------------------
    // (The port: no variant here carries unappliedSteps or perCandidateSteps, so the refused kinds below do not fire;
    // the file's header says why.)
    {
      const isPersonCritique = (x: N) => x.actor === 'human' && !['voice', 'build', 'fix', 'tells-compare'].includes(x.role) && (x.role === 'cut' || x.produces.includes('critique'));
      const fills = (p: N): string[] => (p.role === 'cut' ? ['critique'] : ['critique', 'brief', 'taste'].filter((q) => p.produces.includes(q)));
      const takesIt = (x: N, port: string) => x.writer && x.made && !st.contained.has(x.stepId) && (x.step?.consumes?.includes(port) || x.step?.reads?.includes(port));
      for (const p of [...st.steps.values()].filter(isPersonCritique)) {
        let answered = 0;
        let applied = 0;
        for (const run of runs) {
          let a = false;
          let w = false;
          run.events.forEach((e, i) => {
            if (e.type !== 'ask' || e.stepId !== p.id) return;
            const text = String(e.answer?.text ?? '');
            if (!text.trim()) return;
            a = true;
            if (run.events.slice(i + 1).some((x) => fills(p).some((port) => takesIt(x, port) && String(x[`${port}In`] ?? '').includes(text)))) w = true;
          });
          if (a) answered++;
          if (w) applied++;
        }
        // J2 (this verification): the answer reached an AI direction (a model VISION) by a port it fills, and that
        // direction's own output then reached an AI writer that wrote the work (not contained), on some run.
        {
          let viaDirection = 0;
          for (const run of runs) {
            let hit = false;
            run.events.forEach((e, i) => {
              if (hit || e.type !== 'ask' || e.stepId !== p.id) return;
              const text = String(e.answer?.text ?? '');
              if (!text.trim()) return;
              const later = run.events.slice(i + 1);
              for (const d of later) {
                if (d.type !== 'modelStep' || d.role !== 'vision' || d.step?.actor !== 'model') continue;
                if (!fills(p).some((port) => (d.step?.consumes?.includes(port) || d.step?.reads?.includes(port)) && String(d[`${port}In`] ?? '').includes(text))) continue;
                const tag = `VIS{${d.stepId}#`;
                if (later.some((x) => x.writer && x.made && !st.contained.has(x.stepId) && ['critique', 'brief', 'taste'].some((q) => (x.step?.consumes?.includes(q) || x.step?.reads?.includes(q)) && String(x[`${q}In`] ?? '').includes(tag)))) hit = true;
              }
            });
            if (hit) viaDirection++;
          }
          if (viaDirection > 0) add((v.unappliedSteps ?? []).includes(p.id) ? 'J2-REFUSED-BUT-REACHES-WORK-VIA-AI-DIRECTION' : 'J2-REACHES-WORK-VIA-AI-DIRECTION(info)', v, { step: p.id, runs: viaDirection });
        }
        // J3 (this verification): a step refused as asked per candidate whose answer an AI writer took in.
        if ((v.perCandidateSteps ?? []).includes(p.id) && applied > 0) add('J3-PER-CANDIDATE-REFUSED-BUT-APPLIED', v, { step: p.id, answered, applied });
        // FORCE_J (control): every such step is taken as refused, so the check must fire where answers are applied.
        if (opts.forceJ || (v.unappliedSteps ?? []).includes(p.id)) {
          claimed('refusedPersonCritique');
          if (answered > 0) claimed('refusedAnswered');
          if (applied > 0) add(opts.forceJ ? 'J-FORCED(control)' : 'J-REFUSED-BUT-APPLIED', v, { step: p.id, answered, applied });
        } else {
          claimed('personCritique');
          if (answered > 0) claimed('personAnswered');
          if (applied > 0) claimed('personApplied');
          if (answered > 0 && applied === 0) add('J-ANSWERED-NEVER-APPLIED(info)', v, { step: p.id, answered });
          if (applied > 0 && applied < answered) add('J-SOMETIMES-NOT-APPLIED(info)', v, { step: p.id, answered, applied });
        }
      }
    }
    // --- F: seeds ------------------------------------------------------------------------------------------------
    for (const s of shown) {
      if (s.lead?.op !== 'step' || s.lead.role !== 'seed' || s.lead.actor !== 'model') continue;
      if (s.explainer !== E.seed && s.explainer !== E.seedOne) continue;
      claimed(s.explainer === E.seed ? 'seedFanOut' : 'seedOne');
      for (const run of runs) {
        const calls = run.events.filter((e) => e.type === 'modelStep' && e.stepId === s.lead.id);
        const groups = new Map<string, number>();
        for (const c of calls) {
          const [, , where, n] = String(c.key).split('/');
          const parent = where === '-' ? '-' : where!.split('.').slice(0, -1).join('.');
          const g = `${parent}/${n}/${c.candidate === undefined ? 'solo' : 'cand'}`;
          groups.set(g, (groups.get(g) ?? 0) + 1);
        }
        const multi = [...groups].some(([g, c]) => c > 1 && g.endsWith('cand'));
        if (s.explainer === E.seedOne && multi) add('F-SEED-ONE-BUT-SEVERAL-SESSIONS', v, { step: s.lead.id });
        if (s.explainer === E.seed && calls.length && calls.every((c) => c.candidate === undefined)) add('F-SEED-SEPARATE-BUT-ONE-SESSION', v, { step: s.lead.id });
      }
    }
    // --- G: relay outside a chain: one clip of the last shot -------------------------------------------------------
    for (const s of shown) {
      if (s.lead?.op !== 'step' || s.lead.role !== 'relay' || s.lead.actor !== 'model') continue;
      for (const run of runs) {
        const evs = run.events;
        evs.forEach((e, i) => {
          if (e.type !== 'relayLink' || e.stepId !== s.lead.id) return;
          if (s.explainer === E.relayOne) {
            claimed('relayOne');
            const shots = [...evs.slice(0, i)].reverse().find((x) => x.type === 'storyboardShots' && x.sbArt === e.artifactIn)?.out;
            if (e.linkStart !== undefined) add('G-RELAY-ONE-BUT-IN-CHAIN', v, { step: e.stepId });
            else if (shots && e.shot !== shots.at(-1)) add('G-RELAY-ONE-NOT-LAST-SHOT', v, { step: e.stepId, shot: e.shot, shots });
          } else if (s.explainer === E.relay) {
            claimed('relayChain');
            if (e.linkStart === undefined && evs.slice(0, i).every((x) => x.type !== 'relayLink')) {
              /* first link starts from the anchor frame */
            }
          }
        });
      }
    }
  }
  const report = { stats, problems: Object.fromEntries([...problems].map(([k, p]) => [k, p])) };
  return report as OracleReport;
}
