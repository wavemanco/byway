import { BLOCKS, ROLE_KNOBS, type KnobDef } from '@byway/protocol';
import { steps, walk, walkNode, type Json, type Node, type Recipe, type Step } from '@byway/recipe';
import { ANNOTATION_PORTS, CRITIC_METRICS, DETECTOR_PATTERN, KNOWN_GATE_METRICS, MAX_GATE_RETRIES, type Findings } from '../context.ts';

const STAGE_ORDER = { D1: 1, D2: 2, D3: 3 } as const;

/** Every step inside a node. */
function stepsWithin(node: Node): Step[] {
  const out: Step[] = [];
  walkNode(node, '', 'D1', (n) => {
    if (n.op === 'step') out.push(n);
  });
  return out;
}

export function checkStructural(recipe: Recipe, findings: Findings): void {
  // ST1: unique ids.
  const seen = new Map<string, string>();
  walk(recipe, (node, path) => {
    const id = 'id' in node ? node.id : undefined;
    if (id === undefined) return;
    const first = seen.get(id);
    if (first) findings.add('ST1', path, `id "${id}" is already used at ${first}`);
    else seen.set(id, path);
  });

  walk(recipe, (node, path, stage) => {
    // ST2: loop gates are well formed.
    if (node.op === 'loop') {
      const g = node.gate;
      // Written as positive conditions so NaN fails them.
      if (!(Number.isInteger(g.probe) && Number.isInteger(g.max) && g.probe >= 1 && g.max >= g.probe)) {
        findings.add('ST2', path, `loop "${node.id}" needs integers 1 ≤ probe ≤ max (probe=${g.probe}, max=${g.max})`);
      }
      if (g.threshold !== undefined && !Number.isFinite(g.threshold)) findings.add('ST2', path, `loop "${node.id}" threshold is not a finite number`);
      if (CRITIC_METRICS.has(g.metric) && g.threshold === undefined) findings.add('ST2', path, `loop "${node.id}" gates on ${g.metric} without a threshold`);
      if (!KNOWN_GATE_METRICS.has(g.metric) && !DETECTOR_PATTERN.test(g.metric)) {
        findings.add('ST2', path, `loop "${node.id}" uses an unknown gate metric "${g.metric}"`);
      }
    }
    // ST3: counts.
    if (node.op === 'replicate' && !(Number.isInteger(node.n) && node.n >= 1)) findings.add('ST3', path, `replicate "${node.id}" needs an integer n ≥ 1`);
    if (node.op === 'pick' && !(Number.isInteger(node.k) && node.k >= 1)) findings.add('ST3', path, `pick "${node.id}" needs an integer k ≥ 1`);
    if (node.op === 'relay' && !(Number.isInteger(node.maxLinks) && node.maxLinks >= 1)) {
      findings.add('ST3', path, `relay "${node.id}" needs an integer maxLinks ≥ 1`);
    }
    // ST9: audit lenses only annotate.
    if (node.op === 'audit') checkAudit(node, path, findings);
    // ST10: one-shot gates.
    if (node.op === 'gate') checkGate(recipe, node, path, stage, findings);
  });

  // ST4: stage order.
  let last = 0;
  recipe.stages.forEach((s, i) => {
    const order = STAGE_ORDER[s.stage];
    if (order <= last) findings.add('ST4', `stages[${i}]`, `stage ${s.stage} is repeated or out of order`);
    last = Math.max(last, order);
  });

  // ST6: sit-outs.
  const used = new Set(steps(recipe).flatMap(({ step }) => (step.block ? [step.block] : [])));
  recipe.sitsOut.forEach((s, i) => {
    if (s.reason.trim() === '') findings.add('ST6', `sitsOut[${i}]`, `${s.block} sits out without a reason`);
    if (used.has(s.block)) findings.add('ST6', `sitsOut[${i}]`, `${s.block} sits out but is used`);
  });

  // ST7: knobs.
  for (const { step, path } of steps(recipe)) checkKnobs(step, path, findings);
}

/** ST9: no lens step writes, every lens returns an annotation, and lens names are distinct. */
function checkAudit(node: Extract<Node, { op: 'audit' }>, path: string, findings: Findings): void {
  const names = new Set<string>();
  node.lenses.forEach((lens, i) => {
    const where = `${path}.lenses[${i}]`;
    if (names.has(lens.name)) findings.add('ST9', where, `audit "${node.id}" has two lenses named "${lens.name}"`, 'duplicate-lens');
    names.add(lens.name);
    const within = stepsWithin(lens.body);
    for (const s of within) {
      if (s.writes) findings.add('ST9', where, `lens "${lens.name}" step "${s.id}" writes; lenses only annotate`, 'writes');
    }
    if (!within.some((s) => s.produces.some((p) => (ANNOTATION_PORTS as readonly string[]).includes(p)))) {
      findings.add('ST9', where, `lens "${lens.name}" returns no annotation (${ANNOTATION_PORTS.join(' or ')})`, 'no-annotation');
    }
  });
}

/** ST10: a gate has no fix step, a known metric (with a threshold when it is a critic's), and a bounded, earlier retry. */
function checkGate(recipe: Recipe, node: Extract<Node, { op: 'gate' }>, path: string, stage: Recipe['stages'][number]['stage'], findings: Findings): void {
  for (const s of stepsWithin(node.body)) {
    if (s.writes) findings.add('ST10', path, `gate "${node.id}" step "${s.id}" writes; a one-shot gate has no fix step`, 'writes');
  }
  const p = node.pass;
  if (!KNOWN_GATE_METRICS.has(p.metric) && !DETECTOR_PATTERN.test(p.metric)) {
    findings.add('ST10', path, `gate "${node.id}" uses an unknown metric "${p.metric}"`, 'metric');
  }
  if (CRITIC_METRICS.has(p.metric) && !(p.threshold !== undefined && Number.isFinite(p.threshold))) {
    findings.add('ST10', path, `gate "${node.id}" gates on ${p.metric} without a finite threshold`, 'metric');
  }
  if (!node.retry) return;
  const { stage: target, times } = node.retry;
  if (!(Number.isInteger(times) && times >= 1 && times <= MAX_GATE_RETRIES)) {
    findings.add('ST10', path, `gate "${node.id}" retries ${times} times; a retry is 1–${MAX_GATE_RETRIES} automatic re-runs`, 'retry-count');
  }
  if (!recipe.stages.some((s) => s.stage === target) || STAGE_ORDER[target] > STAGE_ORDER[stage]) {
    findings.add('ST10', path, `gate "${node.id}" in ${stage} retries ${target}, which is not this or an earlier stage of the recipe`, 'retry-stage');
  }
}

function knobDefs(step: Step): Record<string, KnobDef> {
  if (step.block) return BLOCKS[step.block].knobs;
  if (step.role === 'build' || step.role === 'fix' || step.role === 'select') return ROLE_KNOBS[step.role];
  return {};
}

function checkKnobs(step: Step, path: string, findings: Findings): void {
  if (!step.knobs) return;
  const defs = knobDefs(step);
  for (const [name, value] of Object.entries(step.knobs)) {
    const def = defs[name];
    if (!def) {
      findings.add('ST7', `${path}.knobs.${name}`, `knob "${name}" is not registered for ${step.block ?? step.role}`);
    } else if (!knobValueOk(def, value)) {
      findings.add('ST7', `${path}.knobs.${name}`, `knob "${name}" has an invalid value ${JSON.stringify(value)}`);
    }
  }
}

function knobValueOk(def: KnobDef, value: Json): boolean {
  switch (def.type) {
    case 'enum':
      return typeof value === 'string' && def.values.includes(value);
    case 'enum[]':
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((v) => typeof v === 'string' && def.values.includes(v)) &&
        new Set(value).size === value.length
      );
    case 'int':
      return typeof value === 'number' && Number.isInteger(value) && value >= def.min && value <= def.max;
    case 'bool':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string';
    case 'string[]':
      return Array.isArray(value) && value.every((v) => typeof v === 'string');
  }
}
