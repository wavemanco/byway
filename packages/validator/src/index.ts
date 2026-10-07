import { BLOCKS, BLOCK_CODES, EXCEPTIONS, RULES, type BlockCode, type ExceptionDef, type RuleClass, type RuleId } from '@byway/protocol';
import { recipeHash, type Recipe } from '@byway/recipe';
import { checkDefaults } from './checks/defaults.ts';
import { checkPorts } from './checks/ports.ts';
import { checkStructural } from './checks/structural.ts';
import { Findings, type Finding } from './context.ts';
import { typeRecipe } from './scope.ts';

export interface Violation extends Finding {
  class: RuleClass;
}

export interface Verdict {
  ok: boolean;
  recipeHash: string;
  violations: Violation[];
  warnings: Violation[];
  /** Cited exceptions that suppressed at least one finding. */
  exceptionsUsed: string[];
  /** Rules suspended by the recipe's derivation (e.g. DR1 for a SEED leave-one-out ablation). */
  suspended: RuleId[];
}

/** Kinds governed by the ten default rules. Baselines and experiments are checked against invariants and hard rules only. */
const DEFAULT_KINDS = new Set<Recipe['kind']>(['protocol-config', 'variant', 'ablation', 'composed']);

function derivationSuspends(recipe: Recipe): RuleId[] {
  const d = recipe.parent?.derivation;
  if (d?.transform !== 'leave-one-out' || !d.target) return [];
  if (!(BLOCK_CODES as readonly string[]).includes(d.target)) return [];
  return [...BLOCKS[d.target as BlockCode].bypass.suspends];
}

function exceptionProblem(recipe: Recipe, id: string, ex: ExceptionDef | undefined): string | undefined {
  if (!ex) return `exception "${id}" is not in the catalogue`;
  if (!ex.kinds.includes(recipe.kind)) return `exception "${id}" is not allowed for kind ${recipe.kind}`;
  if (!ex.channels.includes(recipe.channel)) return `exception "${id}" is not allowed on channel ${recipe.channel}`;
  if (ex.families.length && !ex.families.includes(recipe.family)) return `exception "${id}" is limited to ${ex.families.join(', ')}`;
  if (ex.requiresDerivation && recipe.parent?.derivation.transform !== ex.requiresDerivation) {
    return `exception "${id}" requires the ${ex.requiresDerivation} derivation`;
  }
  return undefined;
}

/** An exception suppresses a finding only for rules it relaxes and, where it is clause-scoped, only for those clauses. */
function relaxesFinding(ex: ExceptionDef, f: Finding): boolean {
  if (!ex.relaxes.includes(f.ruleId)) return false;
  const clauses = ex.clauses?.[f.ruleId];
  return clauses === undefined || (f.clause !== undefined && clauses.includes(f.clause));
}

const byRuleThenPath = (a: Finding, b: Finding) =>
  a.ruleId === b.ruleId ? a.path.localeCompare(b.path) : a.ruleId.localeCompare(b.ruleId, 'en', { numeric: true });

/** Validate a recipe against the protocol's rules (spec: "Rules", "Exceptions", "Verdict"). Pure: never mutates its input. */
export function validate(recipe: Recipe): Verdict {
  const findings = new Findings();
  const typing = typeRecipe(recipe, findings);
  checkStructural(recipe, findings);
  checkPorts(recipe, typing, findings);
  if (DEFAULT_KINDS.has(recipe.kind)) checkDefaults(recipe, typing, findings);

  const suspended = derivationSuspends(recipe);
  const valid: ExceptionDef[] = [];
  const st8: Finding[] = [];
  recipe.exceptions.forEach((id, i) => {
    const ex = EXCEPTIONS[id];
    const problem = exceptionProblem(recipe, id, ex);
    if (problem || !ex) st8.push({ ruleId: 'ST8', path: `exceptions[${i}]`, message: problem ?? id });
    else valid.push(ex);
  });

  const used = new Set<string>();
  const violations: Violation[] = [];
  const warnings: Violation[] = [];
  for (const f of [...findings.list, ...st8]) {
    const cls = RULES[f.ruleId].class;
    if (cls === 'advisory') {
      warnings.push({ ...f, class: cls });
      continue;
    }
    if (suspended.includes(f.ruleId)) continue;
    if (cls === 'hard' || cls === 'default') {
      const ex = valid.find((e) => relaxesFinding(e, f));
      if (ex) {
        used.add(ex.id);
        continue;
      }
    }
    violations.push({ ...f, class: cls });
  }
  valid.forEach((ex) => {
    if (!used.has(ex.id)) {
      const i = recipe.exceptions.indexOf(ex.id);
      violations.push({ ruleId: 'ST8', class: 'invariant', path: `exceptions[${i}]`, message: `exception "${ex.id}" is unused: nothing it relaxes is violated` });
    }
  });

  violations.sort(byRuleThenPath);
  warnings.sort(byRuleThenPath);
  return {
    ok: violations.length === 0,
    recipeHash: recipeHash(recipe),
    violations,
    warnings,
    exceptionsUsed: recipe.exceptions.filter((id) => used.has(id)),
    suspended,
  };
}

export type { Finding } from './context.ts';
