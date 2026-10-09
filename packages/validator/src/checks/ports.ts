import { OPTION_SET } from '@byway/protocol';
import { steps, walk, walkNode, type Json, type Node, type PassCondition, type Recipe } from '@byway/recipe';
import { CODE_MEDIA, DETECTOR_PATTERN, JUDGE_ROLES, type Findings } from '../context.ts';
import type { Typing } from '../scope.ts';

const VIEW_PORTS = new Set(['view', 'refs']);

function containsCritic(body: Node): boolean {
  let found = false;
  walkNode(body, '', 'D2', (n) => {
    if (n.op === 'step' && n.role === 'critic') found = true;
  });
  return found;
}

/** A critic loop whose critic runs in the worker's own context while the worker holds the threshold. */
export function sharesThresholdContext(loop: Extract<Node, { op: 'loop' }>): boolean {
  if (loop.gate.holder !== 'worker') return false;
  let shared = false;
  walkNode(loop.body, '', 'D2', (n) => {
    if (n.op === 'step' && n.role === 'critic' && !n.isolated) shared = true;
  });
  return shared;
}

function mentionsDetector(value: Json): boolean {
  if (typeof value === 'string') return DETECTOR_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(mentionsDetector);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => DETECTOR_PATTERN.test(k) || mentionsDetector(v));
  }
  return false;
}

/**
 * PR2 on a threshold: hidden, and held by the worker or the harness. A gate with no threshold (a human stop decision,
 * `*[H]`, or a clean defect check) has nothing to hide; a critic metric without a threshold is an ST2/ST10 error.
 */
function checkThreshold(kind: 'loop' | 'gate', id: string, g: PassCondition, path: string, findings: Findings): void {
  if (DETECTOR_PATTERN.test(g.metric)) findings.add('PR8', path, `${kind} "${id}" gates on an AI-detector metric`);
  if (g.threshold === undefined) return;
  if (!g.hidden) findings.add('PR2', path, `${kind} "${id}" does not hide its threshold`, 'not-hidden');
  if (g.holder !== 'worker' && g.holder !== 'harness') findings.add('PR2', path, `${kind} "${id}" threshold is held by ${g.holder}`, 'holder');
}

/** Port rules (02 §3) except PR6 (checks/voice.ts), the D3 human-judgment rule (CH3) and loop human handling (LS1). */
export function checkPorts(recipe: Recipe, typing: Typing, findings: Findings): void {
  const codeView = recipe.medium !== undefined && CODE_MEDIA.has(recipe.medium);
  for (const { step, path, stage } of steps(recipe)) {
    const judge = JUDGE_ROLES.has(step.role) && step.actor === 'model';
    // PR1: critics see views, never process.
    if (judge) {
      if (!step.isolated) findings.add('PR1', path, `judge "${step.id}" is not isolated, so it sees process`, 'not-isolated');
      const extra = step.consumes.filter((p) => !VIEW_PORTS.has(p));
      if (extra.length) {
        findings.add('PR1', path, `judge "${step.id}" consumes ${extra.join(', ')}; judges accept only view and refs`, 'extra-ports');
      }
      // Port rule 1 names code: when the medium is a code diff, the view a judge sees is the code itself.
      if (codeView && step.consumes.includes('view')) {
        findings.add('PR1', path, `judge "${step.id}" sees the ${recipe.medium} itself: for code, the view is the code`, 'code-view');
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
    // PR7.1: the tell catalog only enters the post-generation sweep, and that sweep never runs in a worker's context.
    if (step.consumes.includes('tells')) {
      if (step.role !== 'tells-sweep') findings.add('PR7.1', path, `step "${step.id}" reads the tell catalog`, 'reader');
      else if (step.actor === 'model' && !step.isolated) {
        findings.add('PR7.1', path, `TELLS sweep "${step.id}" is not isolated, so the catalog enters the worker's context`, 'sweep-not-isolated');
      }
    }
    // PR7.2: a human compares the TELLS alternatives.
    if (step.role === 'tells-compare' && step.actor !== 'human') {
      findings.add('PR7.2', path, `TELLS alternatives in "${step.id}" are compared by a ${step.actor}, not a human`);
    }
    // CH3: Distill (D3) is human-judged. A CUT a configuration moves out of D3 is a stage matter for DR7 instead.
    if (step.role === 'cut' && stage === 'D3' && step.actor !== 'human') {
      findings.add('CH3', path, `CUT "${step.id}" in Distill is judged by a ${step.actor}, not a human`);
    }
    // PR8: no AI-detector anything.
    if ((step.knobs && mentionsDetector(step.knobs)) || (step.prompt && DETECTOR_PATTERN.test(step.prompt))) {
      findings.add('PR8', path, `step "${step.id}" refers to an AI detector`);
    }
    // PR4 (part): RELAY only after a pick.
    if (step.role === 'relay' && typing.nodeEntry.get(step)?.may.has(OPTION_SET)) {
      findings.add('PR4', path, `RELAY "${step.id}" may run on an unpicked option set`, 'relay-unpicked');
    }
  }

  walk(recipe, (node, path, stage) => {
    if (node.op === 'loop') {
      const g = node.gate;
      // PR2: the threshold is hidden and held by the worker or the harness, and never shares a context with the critic.
      checkThreshold('loop', node.id, g, path, findings);
      if (sharesThresholdContext(node)) {
        findings.add('PR2', path, `loop "${node.id}" critic shares the worker's context, which holds the threshold`, 'shared-context');
      }
      // LS1: humans decide at non-convergence and at the cap.
      if (containsCritic(node.body) && (g.onCap !== 'human' || g.onNoConverge !== 'recalibrate-human')) {
        findings.add('LS1', path, `critic loop "${node.id}" hands ${g.onCap !== 'human' ? 'the cap' : 'non-convergence'} to a policy`);
      } else if (g.metric === 'human' && g.onCap !== 'human') {
        // A loop a person holds ends only on their answer, the last round too (ADR-0093).
        findings.add('LS1', path, `loop "${node.id}" is yours to end, but hands its last round to a policy`);
      }
    }
    if (node.op === 'gate') checkThreshold('gate', node.id, node.pass, path, findings);
    // PR4 (part): every option set is closed by a pick before any RELAY chain.
    if (node.op === 'relay' && typing.nodeEntry.get(node)?.may.has(OPTION_SET)) {
      findings.add('PR4', path, `relay chain "${node.id}" may run on an unpicked option set`, 'relay-unpicked');
    }
    // PR4 (part): no per-option work inside Distill.
    if (node.op === 'each' && stage === 'D3') findings.add('PR4', path, `each "${node.id}" carries an option set into D3`, 'each-in-d3');
  });

  // PR4: every option set is closed by a pick before D3 (on every path).
  if (typing.stageEntry.get('D3')?.may.has(OPTION_SET)) {
    const i = recipe.stages.findIndex((s) => s.stage === 'D3');
    findings.add('PR4', `stages[${i}]`, `an unpicked option set may enter D3`, 'd3-entry');
  }
}
