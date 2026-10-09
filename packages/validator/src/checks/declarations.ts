import {
  BLOCK_OF_ROLE,
  blockAgrees,
  declaresVoice,
  machineWrites,
  personWrite,
  PICK_ACTOR,
  PICK_JUDGE_ROLES,
  placements,
  restoresWork,
  refreshesPrevious,
  SNAPSHOT_METRICS,
  unappliedCritiques,
  voiceArm,
  voiceWrite,
  walk,
  type Node,
  type Recipe,
  type Step,
} from '@byway/recipe';
import type { Findings } from '../context.ts';
import { flowRecipe } from '../flow.ts';

/**
 * ST12 (ADR-0092): what a recipe declares agrees with what it runs, nothing it puts back undoes a person's write, and
 * no person's list or critique is asked whose answer reaches the work on no path (ADR-0098).
 * Protections are granted only by what executes (@byway/recipe semantics); a declaration may add arming or refusals,
 * never take one away. So a declaration that says less than execution is refused, and for VOICE and block labels, one
 * that says anything else.
 */
export function checkDeclarations(recipe: Recipe, findings: Findings): void {
  for (const { step, path, contained, perCandidate } of placements(recipe)) {
    // A writer is one by its role and actor. Saying more (writes: true on a step that skips) stays legal: it is stricter.
    if (!contained && (machineWrites(step) || personWrite(step)) && step.writes !== true) {
      findings.add('ST12', path, `step "${step.id}" changes the work when it runs (a ${step.actor} ${step.role} step), so it must declare writes: true`, 'writer-undeclared');
    }
    if (!blockAgrees(step)) {
      const want = step.role === 'check' ? 'CRITIC or no block' : (BLOCK_OF_ROLE[step.role] ?? 'no block');
      findings.add('ST12', path, `step "${step.id}" is labelled ${step.block ?? 'with no block'}, but a ${step.role} step is ${want}`, 'block-role');
    }
    if (declaresVoice(step) && !voiceWrite(step)) {
      findings.add('ST12', path, `step "${step.id}" declares VOICE, but it does not write a person's words into the work: only a human voice step that produces the artifact does`, 'voice-not-written');
    }
    if (voiceWrite(step) && !(step.block === 'VOICE' && step.produces.includes('voice'))) {
      findings.add('ST12', path, `step "${step.id}" writes the person's words into the work, so it must declare it: block VOICE and the voice port`, 'voice-undeclared');
    }
    if (perCandidate && voiceArm(step)) {
      findings.add('ST12', path, `VOICE "${step.id}" runs once per candidate; the person's words go into the one work, after the pick`, 'voice-per-candidate');
    }
  }
  // A person's list or critique whose answer reaches the work on no path: nothing that writes the work (an AI writer, or
  // a draft of their own shown it) or picks which version it is takes it in, by any port it fills, directly or in what
  // an AI step makes from it, and in a candidate, only where a pick or an AI writer that takes the options in takes that
  // candidate up (ADR-0098). Asked in a candidate, only that candidate's own steps can take it in: replicate and each
  // hand on only the candidates' work. Asked in a lens or a gate body, it is refused as such (ST9 and ST10
  // 'human-critique'), once.
  for (const { step, path, contained, perCandidate } of unappliedCritiques(recipe)) {
    if (contained) continue;
    if (perCandidate) {
      findings.add('ST12', path, `step "${step.id}" asks a person for a list or a critique once per candidate, and their answer reaches the work on no path: replicate and each hand on only the candidates' work, so only a step of that candidate can take it in, and that candidate reaches the work only where a pick, or an AI writer that takes the options in, takes it up`, 'critique-per-candidate');
    } else {
      findings.add('ST12', path, `step "${step.id}" asks a person for a list or a critique, and their answer reaches the work on no path: nothing that writes the work or picks which version it is takes it in, directly or in what an AI step makes from it; before one does, another takes its place, or none comes after it, or the one that does works on candidates that nothing takes up`, 'critique-unapplied');
    }
  }
  walk(recipe, (node, path) => {
    if (node.op !== 'pick') return;
    if (node.actor !== PICK_ACTOR[node.mode]) {
      findings.add('ST12', path, `pick "${node.id}" is mode ${node.mode}, which is made by a ${PICK_ACTOR[node.mode]}, not a ${node.actor}`, 'pick-actor');
    }
    if (node.mode !== 'C') return;
    const j = node.judge;
    if (!j) findings.add('ST12', path, `pick "${node.id}" chooses by a judge (mode C) but names none`, 'pick-judge');
    else if (!PICK_JUDGE_ROLES.has(j.role) || j.actor !== 'model') {
      findings.add('ST12', `${path}.judge`, `pick "${node.id}"'s judge "${j.id}" is a ${j.actor} ${j.role} step; the runner asks a model judge or select step for a label`, 'pick-judge');
    }
  });
  checkSetAside(recipe, findings);
}

/** Whether a node holds a person's write whose output reaches the work (not in a lens, a gate body or a pick's judge). */
function holdsPersonWrite(n: Node): Step | undefined {
  switch (n.op) {
    case 'step':
      return personWrite(n) ? n : undefined;
    case 'seq':
      return n.steps.map(holdsPersonWrite).find(Boolean);
    case 'route':
      return n.branches.map((b) => holdsPersonWrite(b.body)).find(Boolean);
    case 'audit':
    case 'gate':
    case 'pick':
      return undefined;
    default:
      return holdsPersonWrite(n.body);
  }
}

/**
 * A finished person's write sets aside what was made before it: the option set (scope typing, ST5 'set-aside'), the
 * previous version a keep-or-revert can restore, and the earlier scored versions a critic loop's best-snapshot exit can
 * put back. Read on the exit-aware flow: a loop's gate can end the body before the write that would have refreshed them.
 */
function checkSetAside(recipe: Recipe, findings: Findings): void {
  // The person's write the previous version may predate, on some path (undefined: none).
  flowRecipe<string | undefined>(recipe, undefined, {
    step(step, path, _stage, stale, contained) {
      if (contained) return stale;
      if (restoresWork(step) && stale) {
        findings.add('ST12', path, `keep-or-revert "${step.id}" could put back the version from before "${stale}", a person's write, and undo it`, 'set-aside');
      }
      if (personWrite(step)) return step.id;
      return refreshesPrevious(step) ? undefined : stale;
    },
    join: (states) => states.find((s) => s !== undefined),
    // No step: the empty key. A step id: never empty, so its key never meets that one.
    key: (stale) => (stale === undefined ? '' : `id:${stale}`),
  });
  walk(recipe, (node, path) => {
    if (node.op !== 'loop' || !SNAPSHOT_METRICS.has(node.gate.metric)) return;
    const write = holdsPersonWrite(node.body);
    if (write) {
      findings.add('ST12', path, `loop "${node.id}" can end on its best earlier scored version, which may predate "${write.id}", a person's write inside it`, 'set-aside');
    }
  });
}
