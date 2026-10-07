import { OPTION_SET, type BlockCode } from '@byway/protocol';
import { steps, walk, walkNode, type Recipe } from '@byway/recipe';
import { EXECUTION_ROLES, JUDGE_ROLES, TASTE_JUDGE_ROLES, type Findings } from '../context.ts';
import type { Typing } from '../scope.ts';

const DISTILL_ORDER: Partial<Record<BlockCode, number>> = { CUT: 0, TELLS: 1, VOICE: 2 };

/** The ten default rules (02 §6). Only called for kinds the default rules govern. */
export function checkDefaults(recipe: Recipe, typing: Typing, findings: Findings): void {
  walk(recipe, (node, path) => {
    // DR1: variety comes from a seed or a human.
    if (node.op === 'replicate') {
      let seeded = false;
      walkNode(node.body, '', 'D1', (n) => {
        if (n.op === 'step' && n.role === 'seed') seeded = true;
      });
      const entry = typing.nodeEntry.get(node);
      const humanDirection = entry?.has('taste') || entry?.has('brief');
      if (!seeded && !humanDirection) findings.add('DR1', path, `replicate "${node.id}" gets variety from neither a seed nor a human`);
    }
    // DR4: the critic's score decides when to stop, against a hidden threshold.
    if (node.op === 'loop') {
      let hasCritic = false;
      walkNode(node.body, '', 'D2', (n) => {
        if (n.op === 'step' && n.role === 'critic') hasCritic = true;
      });
      const criticMetric = node.gate.metric === 'critic-score' || node.gate.metric === 'critic-rank';
      if (hasCritic && (!criticMetric || !node.gate.hidden)) {
        findings.add('DR4', path, `critic loop "${node.id}" does not stop on the critic's score against a hidden threshold`);
      }
    }
  });

  // DR2: pick before you spend.
  if (typing.stageEntry.get('D2')?.has(OPTION_SET)) {
    const i = recipe.stages.findIndex((s) => s.stage === 'D2');
    findings.add('DR2', `stages[${i}]`, 'an unpicked option set enters D2');
  }

  let lastDistill = -1;
  let distillSeen = false;
  for (const { step, path, stage } of steps(recipe)) {
    const tasteJudge = TASTE_JUDGE_ROLES.has(step.role) && step.actor === 'model';
    // DR3: judgment is separated from production.
    if (tasteJudge && !step.isolated) findings.add('DR3', path, `judge "${step.id}" is not isolated`, 'not-isolated');
    if (tasteJudge && !step.frozenPrompt) findings.add('DR3', path, `judge "${step.id}" has no frozen prompt`, 'not-frozen');
    // DR5: big model for judgment, capable model for execution.
    if (tasteJudge && step.tier !== 'big') findings.add('DR5', path, `judge "${step.id}" should use the big tier`, 'judge-tier');
    if (EXECUTION_ROLES.has(step.role) && step.actor === 'model' && step.tier !== 'mid') {
      findings.add('DR5', path, `${step.role} step "${step.id}" should use the mid tier`, 'execution-tier');
    }
    // DR6: verify in the real render.
    if (step.role === 'critic' && step.consumes.includes('view')) {
      const producer = typingProducer(typing, step, 'view');
      if (producer !== undefined && producer !== 'render') {
        findings.add('DR6', path, `critic "${step.id}" judges a view that does not come from a render`);
      }
    }
    // DR7: Distill after Deepen, CUT → TELLS → VOICE, and nothing judges after it.
    const order = step.block ? DISTILL_ORDER[step.block] : undefined;
    if (order !== undefined) {
      if (stage !== 'D3') findings.add('DR7', path, `${step.block} runs in ${stage}, not in D3`, 'stage');
      if (order < lastDistill) findings.add('DR7', path, `${step.block} runs after a later Distill block`, 'order');
      lastDistill = Math.max(lastDistill, order);
      distillSeen = true;
    } else if (distillSeen && JUDGE_ROLES.has(step.role) && step.role !== 'tells-compare') {
      findings.add('DR7', path, `"${step.id}" judges after Distill has started`, 'judge-after');
    }
    // DR8: audit after, never ban before.
    if (EXECUTION_ROLES.has(step.role) && step.knobs && 'avoid' in step.knobs) {
      findings.add('DR8', path, `${step.role} step "${step.id}" carries an up-front ban list`);
    }
  }

  // DR9: humans own the words readers attribute to them.
  const voices = steps(recipe).filter(({ step }) => step.block === 'VOICE');
  if (voices.length) {
    for (const { step, path } of voices) {
      if (step.actor !== 'human') findings.add('DR9', path, `VOICE "${step.id}" is written by a ${step.actor}`, 'model-voice');
    }
  } else if (recipe.inputs.includes('voice')) {
    findings.add('DR9', 'inputs', 'reader-facing words come from a fixed input, not a human VOICE step', 'fixed-input');
  } else if (!recipe.sitsOut.some((s) => s.block === 'VOICE')) {
    findings.add('DR9', 'stages', 'no VOICE step, and VOICE does not sit out', 'missing');
  }

  // DR10 (advisory): bank what failed.
  if (!recipe.bank) findings.add('DR10', 'bank', 'failed prompts are not banked');
}

function typingProducer(typing: Typing, node: object, port: 'view'): string | undefined {
  for (const [n, scope] of typing.nodeEntry) if (n === node) return scope.get(port);
  return undefined;
}
