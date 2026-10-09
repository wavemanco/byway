/**
 * What a recipe runs, as a value two recipes can be compared by (F08, ADR-0092 stage 3): its semantic projection.
 *
 * Built from FIELD_ROLES (semantics.ts), so every field of every schema object is accounted for: a 'name' field (an
 * id, a title, a question shown to people) is dropped, a 'semantic-set' field is sorted, a 'semantic' field is kept as
 * it is, and children are projected in turn. A seq is only order, so nested seqs are flattened and a seq of one is
 * its child. Two recipes with equal projections run the same; the composed diff says "The same steps" only then.
 *
 * Of the recipe's own fields, only those that say how it runs are compared (RUN_FIELDS). The others identify it, and
 * the composer forces them on every composed recipe (compose.ts forceComposed): its kind, channel, family, schema and
 * parent. A sit-out is compared by its block; its reason is text for people.
 *
 * Admission only (it hashes with @byway/canonical): not part of the workflow's `@byway/recipe/semantics`.
 */
import { contentHash } from '@byway/canonical';
import type { Json, Node, Recipe } from './schema.ts';
import { FIELD_ROLES, type FieldRole } from './semantics.ts';

/** The recipe fields that say how it runs. */
export const RUN_FIELDS = ['medium', 'inputs', 'stages', 'sitsOut', 'exceptions', 'bank'] as const satisfies readonly (keyof Recipe)[];

type Kind = keyof typeof FIELD_ROLES;

const canonical = (v: Json): string => contentHash(v);
const sortSet = (xs: readonly Json[]): Json[] => [...xs].sort((a, b) => (canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0));

/** Project one schema object of a kind by its field roles; `child` says how to project each child field. */
function byRoles(kind: Kind, value: Record<string, unknown>, child: (field: string, v: unknown) => Json): Json {
  const roles = FIELD_ROLES[kind] as Record<string, FieldRole>;
  const out: Record<string, Json> = {};
  for (const [field, role] of Object.entries(roles)) {
    const v = value[field];
    if (v === undefined || role === 'name') continue;
    if (role === 'semantic-set') out[field] = sortSet(v as Json[]);
    else if (role === 'child') out[field] = child(field, v);
    else out[field] = v as Json;
  }
  return out;
}

/** A node's projection: its semantic fields, and its children's. */
export function projectNode(n: Node): Json {
  switch (n.op) {
    case 'seq': {
      const flat = n.steps.flatMap((c) => {
        const p = projectNode(c);
        return isSeq(p) ? p.steps : [p];
      });
      return flat.length === 1 ? flat[0]! : { op: 'seq', steps: flat };
    }
    case 'step':
      return byRoles('step', n as unknown as Record<string, unknown>, () => null);
    case 'gate':
      return byRoles('oneShotGate', n as unknown as Record<string, unknown>, (field, v) =>
        field === 'body' ? projectNode(v as Node) : byRoles(field === 'pass' ? 'pass' : 'retry', v as Record<string, unknown>, () => null),
      );
    case 'loop':
      return byRoles('loop', n as unknown as Record<string, unknown>, (field, v) => (field === 'body' ? projectNode(v as Node) : byRoles('gate', v as Record<string, unknown>, () => null)));
    case 'audit':
      return byRoles('audit', n as unknown as Record<string, unknown>, (_f, v) => (v as Record<string, unknown>[]).map((l) => byRoles('lens', l, () => projectNode(l.body as Node))));
    case 'route':
      return byRoles('route', n as unknown as Record<string, unknown>, (_f, v) => (v as Record<string, unknown>[]).map((b) => byRoles('branch', b, () => projectNode(b.body as Node))));
    default:
      return byRoles(n.op, n as unknown as Record<string, unknown>, (_f, v) => projectNode(v as Node));
  }
}

const isSeq = (p: Json): p is { op: 'seq'; steps: Json[] } => p !== null && typeof p === 'object' && !Array.isArray(p) && (p as Record<string, Json>).op === 'seq';

/** A recipe's projection: the fields that say how it runs (RUN_FIELDS), each projected. */
export function projectRecipe(r: Recipe): Json {
  const out: Record<string, Json> = {};
  for (const field of RUN_FIELDS) {
    const v = r[field];
    if (v === undefined) continue;
    if (field === 'stages') out.stages = r.stages.map((s) => byRoles('stage', s as unknown as Record<string, unknown>, () => projectNode(s.body)));
    else if (field === 'sitsOut') out.sitsOut = sortSet(r.sitsOut.map((s) => s.block));
    else out[field] = (Array.isArray(v) ? sortSet(v as Json[]) : v) as Json;
  }
  return out;
}

/** Whether two recipes run the same: their projections are equal. */
export const sameRun = (a: Recipe, b: Recipe): boolean => contentHash(projectRecipe(a)) === contentHash(projectRecipe(b));

/** Whether two nodes run the same, children included. */
export const sameNode = (a: Node, b: Node): boolean => contentHash(projectNode(a)) === contentHash(projectNode(b));
