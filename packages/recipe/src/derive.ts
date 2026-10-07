import { recipeHash } from './hash.ts';
import type { Node, Recipe, Step } from './schema.ts';

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
    case 'pick':
      return node.judge ? { ...node, judge: mapStep(node.judge) } : node;
  }
}

function containsCritic(node: Node): boolean {
  switch (node.op) {
    case 'step':
      return node.role === 'critic';
    case 'seq':
      return node.steps.some(containsCritic);
    case 'route':
      return node.branches.some((b) => containsCritic(b.body));
    case 'pick':
      return false;
    default:
      return containsCritic(node.body);
  }
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
        const plain: Step = { ...s, role: 'build', prompt: PLAIN_BUILD_PROMPT };
        delete plain.block;
        delete plain.knobs;
        return plain;
      }, 'SEED bypass');
      break;
    case 'CRITIC':
      stages = rewriteStages(recipe, (n) => n.op === 'loop' && containsCritic(n.body), same, 'CRITIC bypass');
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
  const { hash: _h, ...rest } = recipe;
  return {
    ...rest,
    id: `${source.id}-no-${target.toLowerCase()}`,
    title: `${source.title}, without ${target}`,
    kind: 'ablation',
    parent: { hash: recipeHash(source), derivation: { transform: 'leave-one-out', version: 1, target } },
    stages,
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
    exceptions: [...recipe.exceptions, 'SM-5'],
  };
}
