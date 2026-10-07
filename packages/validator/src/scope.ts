import { OPTION_SET, type PortType } from '@byway/protocol';
import type { Node, Recipe, Role, Stage } from '@byway/recipe';
import type { Findings } from './context.ts';

/** Where a port in scope came from: a recipe input, the role of the step that produced it, or an operator. */
export type Producer = 'input' | Role | 'replicate' | 'each' | 'pick';

/** The ports available at a point in the recipe, with their producers. */
export type Scope = ReadonlyMap<PortType, Producer>;

export interface Typing {
  /** Scope on entry to each stage. */
  stageEntry: Map<Stage['stage'], Scope>;
  /** Scope on entry to every node (keyed by node object). */
  nodeEntry: Map<Node, Scope>;
}

/**
 * Type the recipe's port flow (spec: "Scope typing"). Emits ST5 for consumed ports that are not
 * in scope and PR6 for writing steps once human voice is in scope.
 */
export function typeRecipe(recipe: Recipe, findings: Findings): Typing {
  const typing: Typing = { stageEntry: new Map(), nodeEntry: new Map() };
  let scope: Map<PortType, Producer> = new Map(recipe.inputs.map((p) => [p, 'input' as Producer]));
  recipe.stages.forEach((s, i) => {
    typing.stageEntry.set(s.stage, new Map(scope));
    scope = typeNode(s.body, scope, `stages[${i}].body`, typing, findings);
  });
  return typing;
}

function typeNode(
  node: Node,
  scopeIn: Map<PortType, Producer>,
  path: string,
  typing: Typing,
  findings: Findings,
): Map<PortType, Producer> {
  typing.nodeEntry.set(node, new Map(scopeIn));
  const scope = new Map(scopeIn);
  switch (node.op) {
    case 'step': {
      for (const port of node.consumes) {
        if (!scope.has(port)) findings.add('ST5', path, `step "${node.id}" consumes ${port}, which is not in scope`);
      }
      if (node.writes && scope.has('voice')) {
        findings.add('PR6', path, `step "${node.id}" writes to the artifact after the human voice is in scope`);
      }
      for (const port of node.produces) scope.set(port, node.role);
      return scope;
    }
    case 'seq': {
      let s = scope;
      node.steps.forEach((child, i) => {
        s = typeNode(child, s, `${path}.steps[${i}]`, typing, findings);
      });
      return s;
    }
    case 'replicate': {
      const out = typeNode(node.body, scope, `${path}.body`, typing, findings);
      if (!out.has('artifact')) findings.add('ST5', path, `replicate "${node.id}" body produces no artifact`);
      scope.set(OPTION_SET, 'replicate');
      return scope;
    }
    case 'each': {
      if (!scope.has(OPTION_SET)) findings.add('ST5', path, `each "${node.id}" needs ${OPTION_SET} in scope`);
      const inner = new Map(scope);
      inner.set('artifact', 'each');
      typeNode(node.body, inner, `${path}.body`, typing, findings);
      return scope;
    }
    case 'pick': {
      if (!scope.has(OPTION_SET)) findings.add('ST5', path, `pick "${node.id}" needs ${OPTION_SET} in scope`);
      if (node.judge) {
        // The harness renders every option for the selector.
        const judgeScope = new Map(scope);
        judgeScope.set('view', 'render');
        typeNode(node.judge, judgeScope, `${path}.judge`, typing, findings);
      }
      if (node.k === 1) {
        scope.delete(OPTION_SET);
        scope.set('artifact', 'pick');
      }
      return scope;
    }
    case 'loop':
      return typeNode(node.body, scope, `${path}.body`, typing, findings);
    case 'optional':
      // Only what is guaranteed survives: the body may not run.
      typeNode(node.body, scope, `${path}.body`, typing, findings);
      return scope;
    case 'route': {
      const outs = node.branches.map((b, i) => typeNode(b.body, scope, `${path}.branches[${i}].body`, typing, findings));
      const first = outs[0] ?? scope;
      const merged = new Map<PortType, Producer>();
      for (const [port, producer] of first) if (outs.every((o) => o.has(port))) merged.set(port, producer);
      return merged;
    }
  }
}
