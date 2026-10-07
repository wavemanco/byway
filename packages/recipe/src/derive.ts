import { recipeHash } from './hash.ts';
import type { Node, Recipe, Step } from './schema.ts';
import { children } from './walk.ts';

export type LeaveOneOutTarget = 'SEED' | 'CRITIC' | 'ASSET' | 'D3';

/** Exceptions a bypass makes unnecessary. The conformance suite verifies each derived recipe cites exactly what it needs. */
const DROPPED_EXCEPTIONS: Record<LeaveOneOutTarget, string[]> = {
  SEED: [],
  CRITIC: ['SM-2', 'SM-5'],
  ASSET: [],
  D3: ['C1-DR7', 'SM-1', 'SM-3', 'SM-4'],
};

/** Prompt template of the plain build that replaces a seeded build (the article's Baseline 1). */
export const PLAIN_BUILD_PROMPT = 'article.B1';

export class DerivationError extends Error {
  override name = 'DerivationError';
}

/** Rebuild a node tree, dropping nodes for which `drop` is true and mapping steps through `mapStep`. */
function rewrite(node: Node, drop: (n: Node) => boolean, mapStep: (s: Step) => Step, where: string): Node | undefined {
  if (drop(node)) return undefined;
  const need = (child: Node | undefined, label: string): Node => {
    if (!child) throw new DerivationError(`${where}: removing it would leave ${label} empty`);
    return child;
  };
  switch (node.op) {
    case 'step':
      return mapStep(node);
    case 'seq': {
      const steps = node.steps.map((c) => rewrite(c, drop, mapStep, where)).filter((c): c is Node => c !== undefined);
      return steps.length ? { ...node, steps } : undefined;
    }
    case 'replicate':
    case 'each':
    case 'loop':
    case 'gate':
    case 'relay':
      return { ...node, body: need(rewrite(node.body, drop, mapStep, where), `${node.op} "${node.id}"`) };
    case 'optional': {
      const body = rewrite(node.body, drop, mapStep, where);
      return body ? { ...node, body } : undefined;
    }
    case 'route':
      return {
        ...node,
        branches: node.branches.map((b) => ({ ...b, body: need(rewrite(b.body, drop, mapStep, where), `route branch "${b.name}"`) })),
      };
    case 'audit': {
      // A lens left empty is dropped, and an audit left with no lens is dropped with it.
      const lenses = node.lenses.flatMap((l) => {
        const body = rewrite(l.body, drop, mapStep, where);
        return body ? [{ ...l, body }] : [];
      });
      return lenses.length ? { ...node, lenses } : undefined;
    }
    case 'pick':
      return node.judge ? { ...node, judge: mapStep(node.judge) } : node;
  }
}

function containsCritic(node: Node): boolean {
  if (node.op === 'step') return node.role === 'critic';
  if (node.op === 'pick') return false;
  return children(node).some(containsCritic);
}

function rewriteStages(recipe: Recipe, drop: (n: Node) => boolean, mapStep: (s: Step) => Step, where: string): Recipe['stages'] {
  return recipe.stages.flatMap((s) => {
    const body = rewrite(s.body, drop, mapStep, where);
    return body ? [{ ...s, body }] : [];
  });
}

/**
 * Leave-one-out ablation using the target's registered bypass (spec: "Derivations").
 * The result is an ablation on the same channel whose parent is the source recipe's hash.
 */
export function leaveOneOut(source: Recipe, target: LeaveOneOutTarget): Recipe {
  const recipe = structuredClone(source);
  const keep = (_: Node) => false;
  const same = (s: Step) => s;
  let stages: Recipe['stages'];
  switch (target) {
    case 'SEED':
      stages = rewriteStages(recipe, keep, (s) => {
        if (s.role !== 'seed') return s;
        // A plain build from intent: it must not read the seed port (port rule 3).
        const consumes = s.consumes.filter((p) => p !== 'seed');
        const plain: Step = { ...s, role: 'build', prompt: PLAIN_BUILD_PROMPT, consumes: consumes.includes('intent') ? consumes : ['intent', ...consumes] };
        delete plain.block;
        delete plain.knobs;
        return plain;
      }, 'SEED bypass');
      break;
    case 'CRITIC':
      // A critic loop, or a one-shot critic gate, is replaced by nothing: the artifact passes through.
      stages = rewriteStages(recipe, (n) => (n.op === 'loop' || n.op === 'gate') && containsCritic(n.body), same, 'CRITIC bypass');
      break;
    case 'ASSET':
      stages = rewriteStages(recipe, (n) => n.op === 'step' && n.block === 'ASSET', same, 'ASSET bypass');
      break;
    case 'D3':
      stages = recipe.stages.filter((s) => s.stage !== 'D3');
      break;
  }
  if (JSON.stringify(stages) === JSON.stringify(recipe.stages)) {
    throw new DerivationError(`recipe "${source.id}" has nothing for the ${target} bypass to remove`);
  }
  // The D3 bypass removes the Distill blocks; declare them as sitting out so the ablation says why they are absent.
  const sitsOut = [...recipe.sitsOut];
  if (target === 'D3') {
    const d3 = recipe.stages.find((s) => s.stage === 'D3');
    const removed = new Set<string>();
    if (d3) {
      const collect = (n: Node): void => {
        if (n.op === 'step' && n.block && ['CUT', 'TELLS', 'VOICE'].includes(n.block)) removed.add(n.block);
        if (n.op !== 'pick') children(n).forEach(collect);
      };
      collect(d3.body);
    }
    for (const block of ['CUT', 'TELLS', 'VOICE'] as const) {
      if (removed.has(block) && !sitsOut.some((s) => s.block === block)) sitsOut.push({ block, reason: 'removed by the D3 leave-one-out bypass' });
    }
  }
  const { hash: _h, ...rest } = recipe;
  return {
    ...rest,
    id: `${source.id}-no-${target.toLowerCase()}`,
    title: `${source.title}, without ${target}`,
    kind: 'ablation',
    parent: { hash: recipeHash(source), derivation: { transform: 'leave-one-out', version: 1, target } },
    stages,
    sitsOut,
    exceptions: recipe.exceptions.filter((id) => !DROPPED_EXCEPTIONS[target].includes(id)),
  };
}

/**
 * The CRITIC-self manipulation: the critic stops being a fresh, isolated, bigger model and becomes
 * a self-critique in the worker's own context at the worker's tier (Study 1, SM-5).
 */
export function critiqueSelf(source: Recipe): Recipe {
  const recipe = structuredClone(source);
  let changed = false;
  const stages = rewriteStages(recipe, () => false, (s) => {
    if (s.role !== 'critic') return s;
    changed = true;
    return { ...s, isolated: false, tier: 'mid' };
  }, 'CRITIC-self');
  if (!changed) throw new DerivationError(`recipe "${source.id}" has no critic to turn into a self-critique`);
  const { hash: _h, ...rest } = recipe;
  return {
    ...rest,
    id: `${source.id}-critic-self`,
    title: `${source.title}, CRITIC-self`,
    kind: 'ablation',
    parent: { hash: recipeHash(source), derivation: { transform: 'critique-self', version: 1 } },
    stages,
    exceptions: recipe.exceptions.includes('SM-5') ? recipe.exceptions : [...recipe.exceptions, 'SM-5'],
  };
}
