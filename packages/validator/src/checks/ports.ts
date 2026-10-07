import { OPTION_SET } from '@byway/protocol';
import { steps, walk, walkNode, type Json, type Node, type Recipe } from '@byway/recipe';
import { DETECTOR_PATTERN, JUDGE_ROLES, type Findings } from '../context.ts';
import type { Typing } from '../scope.ts';

const VIEW_PORTS = new Set(['view', 'refs']);

function containsCritic(body: Node): boolean {
  let found = false;
  walkNode(body, '', 'D2', (n) => {
    if (n.op === 'step' && n.role === 'critic') found = true;
  });
  return found;
}

function mentionsDetector(value: Json): boolean {
  if (typeof value === 'string') return DETECTOR_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(mentionsDetector);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => DETECTOR_PATTERN.test(k) || mentionsDetector(v));
  }
  return false;
}

/** Port rules (02 §3), the D3 human-judgment rule (CH3) and loop human handling (LS1). PR6 is checked during typing. */
export function checkPorts(recipe: Recipe, typing: Typing, findings: Findings): void {
  for (const { step, path } of steps(recipe)) {
    const judge = JUDGE_ROLES.has(step.role) && step.actor === 'model';
    // PR1: critics see views, never process.
    if (judge) {
      if (!step.isolated) findings.add('PR1', path, `judge "${step.id}" is not isolated, so it sees process`, 'not-isolated');
      const extra = step.consumes.filter((p) => !VIEW_PORTS.has(p));
      if (extra.length) {
        findings.add('PR1', path, `judge "${step.id}" consumes ${extra.join(', ')}; judges accept only view and refs`, 'extra-ports');
      }
    }
    // PR2 (part): judges never receive scores.
    if (JUDGE_ROLES.has(step.role) && step.consumes.includes('score')) {
      findings.add('PR2', path, `judge "${step.id}" receives a score`, 'judge-score');
    }
    // PR3: seeds and credentials never enter the artifact.
    if (step.consumes.includes('seed') && step.role !== 'seed') findings.add('PR3', path, `step "${step.id}" reads the seed`);
    if (step.consumes.includes('cred') && step.actor !== 'tool') findings.add('PR3', path, `step "${step.id}" reads a credential`);
    // PR5: briefs go to builders, never to critics.
    if (JUDGE_ROLES.has(step.role) && step.consumes.includes('brief')) findings.add('PR5', path, `judge "${step.id}" reads the brief`);
    // PR7.1: the tell catalog only enters the post-generation sweep.
    if (step.consumes.includes('tells') && step.role !== 'tells-sweep') {
      findings.add('PR7.1', path, `step "${step.id}" reads the tell catalog`);
    }
    // PR7.2: a human compares the TELLS alternatives.
    if (step.role === 'tells-compare' && step.actor !== 'human') {
      findings.add('PR7.2', path, `TELLS alternatives in "${step.id}" are compared by a ${step.actor}, not a human`);
    }
    // CH3: Distill is human-judged.
    if (step.role === 'cut' && step.actor !== 'human') findings.add('CH3', path, `CUT "${step.id}" is judged by a ${step.actor}, not a human`);
    // PR8: no AI-detector anything.
    if ((step.knobs && mentionsDetector(step.knobs)) || (step.prompt && DETECTOR_PATTERN.test(step.prompt))) {
      findings.add('PR8', path, `step "${step.id}" refers to an AI detector`);
    }
    // PR4 (part): RELAY only after a pick.
    if (step.role === 'relay') {
      const entry = typing.nodeEntry.get(step);
      if (entry?.has(OPTION_SET)) findings.add('PR4', path, `RELAY "${step.id}" runs on an unpicked option set`, 'relay-unpicked');
    }
  }

  walk(recipe, (node, path, stage) => {
    if (node.op === 'loop') {
      const g = node.gate;
      // PR2: the threshold is hidden and held by the worker or the harness.
      if (!g.hidden) findings.add('PR2', path, `loop "${node.id}" does not hide its threshold`, 'not-hidden');
      if (g.holder !== 'worker' && g.holder !== 'harness') {
        findings.add('PR2', path, `loop "${node.id}" threshold is held by ${g.holder}`, 'holder');
      }
      const selfCritic = (() => {
        let found = false;
        walkNode(node.body, '', stage, (n) => {
          if (n.op === 'step' && n.role === 'critic' && !n.isolated && g.holder === 'worker') found = true;
        });
        return found;
      })();
      if (selfCritic) {
        findings.add('PR2', path, `loop "${node.id}" critic shares the worker's context, which holds the threshold`, 'shared-context');
      }
      if (DETECTOR_PATTERN.test(g.metric)) findings.add('PR8', path, `loop "${node.id}" gates on an AI-detector metric`);
      // LS1: humans decide at non-convergence and at the cap.
      if (containsCritic(node.body) && (g.onCap !== 'human' || g.onNoConverge !== 'recalibrate-human')) {
        findings.add('LS1', path, `critic loop "${node.id}" hands ${g.onCap !== 'human' ? 'the cap' : 'non-convergence'} to a policy`);
      }
    }
    // PR4 (part): no per-option work inside Distill.
    if (node.op === 'each' && stage === 'D3') findings.add('PR4', path, `each "${node.id}" carries an option set into D3`, 'each-in-d3');
  });

  // PR4: every option set is closed by a pick before D3.
  const d3 = typing.stageEntry.get('D3');
  if (d3?.has(OPTION_SET)) {
    const i = recipe.stages.findIndex((s) => s.stage === 'D3');
    findings.add('PR4', `stages[${i}]`, `an unpicked option set enters D3`, 'd3-entry');
  }
}
