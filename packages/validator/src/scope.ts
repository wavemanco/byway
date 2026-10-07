import { OPTION_SET, type PortType } from '@byway/protocol';
import type { Actor, Node, Recipe, Role, Stage } from '@byway/recipe';
import type { Findings } from './context.ts';

/** Who may have produced a port: a recipe input, a step (with its role and actor) or an operator. */
export interface Producer {
  kind: 'input' | 'step' | 'operator';
  role?: Role;
  actor?: Actor;
  op?: 'replicate' | 'each' | 'pick';
}

/**
 * Typing state at a point in the recipe.
 * - `must`: ports present on every path, each with every producer that may have made it (for ST5 and provenance rules).
 * - `may`: ports present on at least one path (for "may still be open" rules such as PR4 and DR2).
 */
export interface ScopeState {
  must: ReadonlyMap<PortType, readonly Producer[]>;
  may: ReadonlySet<PortType>;
}

export interface Typing {
  stageEntry: Map<Stage['stage'], ScopeState>;
  nodeEntry: Map<Node, ScopeState>;
}

interface MutableState {
  must: Map<PortType, Producer[]>;
  may: Set<PortType>;
}

const clone = (s: ScopeState): MutableState => ({
  must: new Map([...s.must].map(([k, v]) => [k, [...v]])),
  may: new Set(s.may),
});

function addProducers(list: Producer[], more: readonly Producer[]): Producer[] {
  const out = [...list];
  for (const p of more) {
    if (!out.some((q) => q.kind === p.kind && q.role === p.role && q.actor === p.actor && q.op === p.op)) out.push(p);
  }
  return out;
}

/** Ports guaranteed after one of several alternative paths: present on all of them, with every possible producer. */
function mergeAlternatives(states: ScopeState[]): MutableState {
  const [first, ...rest] = states;
  const must = new Map<PortType, Producer[]>();
  const may = new Set<PortType>();
  if (!first) return { must, may };
  for (const [port, producers] of first.must) {
    if (rest.every((s) => s.must.has(port))) {
      must.set(port, rest.reduce((acc, s) => addProducers(acc, s.must.get(port) ?? []), [...producers]));
    }
  }
  for (const s of states) for (const p of s.may) may.add(p);
  return { must, may };
}

/** Type the recipe's port flow (spec: "Scope typing"). Emits ST5 for consumed ports that are not guaranteed in scope. */
export function typeRecipe(recipe: Recipe, findings: Findings): Typing {
  const typing: Typing = { stageEntry: new Map(), nodeEntry: new Map() };
  let state: ScopeState = {
    must: new Map(recipe.inputs.map((p) => [p, [{ kind: 'input' } as Producer]])),
    may: new Set(recipe.inputs),
  };
  recipe.stages.forEach((s, i) => {
    typing.stageEntry.set(s.stage, clone(state));
    state = typeNode(s.body, state, `stages[${i}].body`, typing, findings);
  });
  return typing;
}

function typeNode(node: Node, input: ScopeState, path: string, typing: Typing, findings: Findings): ScopeState {
  typing.nodeEntry.set(node, clone(input));
  const st = clone(input);
  switch (node.op) {
    case 'step': {
      for (const port of node.consumes) {
        if (!st.must.has(port)) findings.add('ST5', path, `step "${node.id}" consumes ${port}, which is not in scope on every path`);
      }
      for (const port of node.produces) {
        st.must.set(port, [{ kind: 'step', role: node.role, actor: node.actor }]);
        st.may.add(port);
      }
      return st;
    }
    case 'seq': {
      let s: ScopeState = st;
      node.steps.forEach((child, i) => {
        s = typeNode(child, s, `${path}.steps[${i}]`, typing, findings);
      });
      return s;
    }
    case 'replicate': {
      const out = typeNode(node.body, st, `${path}.body`, typing, findings);
      if (!out.must.has('artifact')) findings.add('ST5', path, `replicate "${node.id}" body produces no artifact`);
      st.must.set(OPTION_SET, [{ kind: 'operator', op: 'replicate' }]);
      st.may.add(OPTION_SET);
      return st;
    }
    case 'each': {
      if (!st.must.has(OPTION_SET)) findings.add('ST5', path, `each "${node.id}" needs ${OPTION_SET} in scope`);
      const inner = clone(st);
      inner.must.set('artifact', [{ kind: 'operator', op: 'each' }]);
      inner.may.add('artifact');
      typeNode(node.body, inner, `${path}.body`, typing, findings);
      return st;
    }
    case 'pick': {
      if (!st.must.has(OPTION_SET)) findings.add('ST5', path, `pick "${node.id}" needs ${OPTION_SET} in scope`);
      if (node.judge) {
        // The harness renders every option for the selector.
        const judgeScope = clone(st);
        judgeScope.must.set('view', [{ kind: 'step', role: 'render', actor: 'tool' }]);
        judgeScope.may.add('view');
        typeNode(node.judge, judgeScope, `${path}.judge`, typing, findings);
      }
      if (node.k === 1) {
        st.must.delete(OPTION_SET);
        st.may.delete(OPTION_SET);
        st.must.set('artifact', [{ kind: 'operator', op: 'pick' }]);
        st.may.add('artifact');
      }
      return st;
    }
    case 'loop':
      // Typed once: ports must be available on the first iteration (ST5). Back-edge effects are checked by the path rules.
      return typeNode(node.body, st, `${path}.body`, typing, findings);
    case 'optional': {
      const ran = typeNode(node.body, st, `${path}.body`, typing, findings);
      return mergeAlternatives([st, ran]);
    }
    case 'route':
      return mergeAlternatives(node.branches.map((b, i) => typeNode(b.body, st, `${path}.branches[${i}].body`, typing, findings)));
  }
}
