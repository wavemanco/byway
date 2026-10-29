/**
 * Which of a person's admitted answers a finished run left unused (F01 (a), ADR-0098 decision 7's some-path reading,
 * the owner's choice of 2026-10-29: "Tell the person at run time"). Admission admits a person's list or critique
 * (`personCritique`) that some path hands on to the work, so on a run that takes another path the answer can go
 * unapplied: a route branch the run did not take, an optional declined, a gate that ended the round before the writer,
 * an AI list that found nothing so the fix asked no model, the last link of a relay. Nothing here refuses anything:
 * admission, the validator's ruleset and its pinned hash are unchanged. This reads what actually ran, so the run can say
 * so.
 *
 * Read from the run's events, after the run: for each answer, the steps that started after the person sent it and did
 * something (a step that finished skipped, or passed with nothing to do, did not). The recipe is cut down to those steps
 * (and the answer's own), each other step and pick left out at its place, and the shared semantics' walk of what reaches
 * the work (`answersReachingWork`, the walk ST12 'critique-unapplied' reads) is run on what is left. The actual run is one
 * of the paths of that cut-down recipe: it went through only the steps kept, in the recipe's own order. So where the walk
 * finds that no path hands the answer on to the work the run delivered, this run did not, and the answer went unused.
 * Where it cannot tell, it says nothing (the same conservative reading admission makes; ADR-0098 decision 7): every path
 * the cut-down recipe holds counts, not only the one the run took.
 *
 * Not in the workflow bundle: the interpreter imports none of it (the web app reads it from the run's events).
 */
import type { Node, Recipe, Seq } from './schema.ts';
import { answersReachingWork, personCritique, placements } from './semantics.ts';

/** An event as the run's view holds it (RunEvent): only what this reads. */
export interface RunTraceEvent {
  seq: number;
  type: string;
  stepId?: string | undefined;
  candidate?: number | undefined;
  data: Record<string, unknown>;
}

/** A question as the run's view holds it (CheckpointRecord): only what this reads. */
export interface RunTraceCheckpoint {
  id: string;
  stepId: string;
  candidate?: number | undefined;
  kind: string;
  prompt: string;
  status: string;
  resolution?: { text?: string | undefined } | undefined;
}

/** An answer of the person's that no step of the run took to the work it delivered. */
export interface UnusedAnswer {
  /** The question it answered. */
  checkpointId: string;
  stepId: string;
  candidate?: number;
  /** The question as the person was asked it. */
  question: string;
}

/** A place a step or pick that did not run after the answer is left out at: it does nothing to what the walk follows. */
const NOTHING: Seq = { op: 'seq', steps: [] };

/** The recipe with only the steps `keep` names, and every pick, each other step left out at its place (paths unchanged). */
function cutDown(recipe: Recipe, keep: (id: string) => boolean): Recipe {
  const cut = (n: Node): Node | undefined => {
    switch (n.op) {
      case 'step':
        return keep(n.id) ? n : undefined;
      // Always kept: a pick that keeps every option runs with no event of its own, and a pick only narrows the options,
      // so keeping one never lets the walk find more reach than the run had (the check of F01 (a)).
      case 'pick':
        return n;
      case 'seq': {
        const steps = n.steps.map(cut);
        return steps.some((s) => s !== undefined) ? { ...n, steps: steps.map((s) => s ?? NOTHING) } : undefined;
      }
      case 'route': {
        const bodies = n.branches.map((b) => cut(b.body));
        return bodies.some((b) => b !== undefined) ? { ...n, branches: n.branches.map((b, i) => ({ ...b, body: bodies[i] ?? NOTHING })) } : undefined;
      }
      case 'audit': {
        const bodies = n.lenses.map((l) => cut(l.body));
        return bodies.some((b) => b !== undefined) ? { ...n, lenses: n.lenses.map((l, i) => ({ ...l, body: bodies[i] ?? NOTHING })) } : undefined;
      }
      default: {
        const body = cut(n.body);
        return body ? ({ ...n, body } as Node) : undefined;
      }
    }
  };
  return { ...recipe, stages: recipe.stages.map((s) => ({ ...s, body: cut(s.body) ?? NOTHING })) };
}

/**
 * Whether the answer asked at `stepId` reaches the work on no path of the recipe cut down to that step and the steps in
 * `ranAfter` (those that did something after the answer was sent). False when the step is not a person's list or
 * critique: only those are what decision 7's some-path reading admits on some path.
 */
export function answerUnusedAfter(recipe: Recipe, stepId: string, ranAfter: ReadonlySet<string>): boolean {
  const cut = cutDown(recipe, (id) => id === stepId || ranAfter.has(id));
  const asked = placements(cut).filter((p) => p.step.id === stepId && personCritique(p.step));
  if (!asked.length) return false;
  const reached = answersReachingWork(cut, asked);
  return asked.every((p) => !reached.has(p.path));
}

/**
 * The person's admitted answers that a run which finished with its work left unused (F01 (a)): each answered question
 * of a list or critique of theirs (`personCritique`) with a non-empty answer that the run used as their answer (not one
 * asked again because it could not be used), which no path of what ran after it hands on to the delivered work
 * (`answerUnusedAfter`). Read it only for a run that finished: until then a later step may still take an answer in.
 */
export function unusedAnswers(recipe: Recipe, events: readonly RunTraceEvent[], checkpoints: readonly RunTraceCheckpoint[]): UnusedAnswer[] {
  const critiques = new Set(placements(recipe).filter((p) => personCritique(p.step)).map((p) => p.step.id));
  if (!critiques.size) return [];
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const at = (e: RunTraceEvent) => `${e.stepId}#${e.candidate ?? ''}`;
  const out: UnusedAnswer[] = [];
  for (const cp of checkpoints) {
    if (cp.status !== 'resolved' || !critiques.has(cp.stepId) || (cp.kind !== 'react' && cp.kind !== 'directive')) continue;
    if (!cp.resolution?.text?.trim()) continue;
    const sent = ordered.find((e) => e.type === 'checkpoint-resolved' && e.data.checkpointId === cp.id);
    if (!sent) continue;
    // The answer the step used: its step finished after it, with no question of its own asked again in between (an
    // answer byway could not use is asked again, and the later answer is the one the step used).
    const here = `${cp.stepId}#${cp.candidate ?? ''}`;
    const next = ordered.find((e) => e.seq > sent.seq && at(e) === here && (e.type === 'step-finished' || e.type === 'checkpoint-opened' || e.type === 'step-failed'));
    if (next?.type !== 'step-finished') continue;
    // The steps that started after the answer was sent and did something: a step that finished skipped (it could not
    // run, or a judge had nothing to see) or passed (nothing to apply, so no model was asked) took nothing in.
    const started = new Map<string, number>();
    const ranAfter = new Set<string>();
    for (const e of ordered) {
      if (!e.stepId) continue;
      if (e.type === 'step-started') started.set(at(e), e.seq);
      else if (e.type === 'step-finished' && (started.get(at(e)) ?? e.seq) > sent.seq && e.data.skipped !== true && e.data.passed !== true) ranAfter.add(e.stepId);
    }
    if (answerUnusedAfter(recipe, cp.stepId, ranAfter)) out.push({ checkpointId: cp.id, stepId: cp.stepId, ...(cp.candidate !== undefined ? { candidate: cp.candidate } : {}), question: cp.prompt });
  }
  return out;
}
