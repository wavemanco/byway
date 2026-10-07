import type { RuleId } from '@byway/protocol';
import type { Role } from '@byway/recipe';

export interface Finding {
  ruleId: RuleId;
  path: string;
  message: string;
  /** Which clause of the rule was breached; exceptions can be scoped to clauses. */
  clause?: string;
}

/** Raw findings, before rule classes, suspensions and exceptions are applied. */
export class Findings {
  readonly list: Finding[] = [];
  add(ruleId: RuleId, path: string, message: string, clause?: string): void {
    this.list.push(clause === undefined ? { ruleId, path, message } : { ruleId, path, message, clause });
  }
}

/** Steps that judge a render: they must see views only (port rules 1, 2, 5). */
export const JUDGE_ROLES: ReadonlySet<Role> = new Set<Role>(['critic', 'judge', 'check', 'tells-compare']);

/** Steps that judge taste: big tier, isolated, frozen prompt (default rules 3 and 5). */
export const TASTE_JUDGE_ROLES: ReadonlySet<Role> = new Set<Role>(['critic', 'judge']);

/** Execution steps: mid tier (default rule 5), no ban lists (default rule 8). */
export const EXECUTION_ROLES: ReadonlySet<Role> = new Set<Role>(['build', 'fix']);

export const KNOWN_GATE_METRICS: ReadonlySet<string> = new Set(['critic-score', 'critic-rank', 'human']);

/** Port rule 8: anything that looks like an AI-detector score or "flagged as AI" rate. */
export const DETECTOR_PATTERN = /(ai[-_ ]?detect|detector|gptzero|zerogpt|originality\.ai|flagged[-_ ]?as[-_ ]?ai)/i;
