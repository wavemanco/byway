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
  /** Idempotent: path-sensitive checks visit loop bodies twice. */
  add(ruleId: RuleId, path: string, message: string, clause?: string): void {
    if (this.list.some((f) => f.ruleId === ruleId && f.path === path && f.clause === clause && f.message === message)) return;
    this.list.push(clause === undefined ? { ruleId, path, message } : { ruleId, path, message, clause });
  }
}

/** Steps that judge a render: they must see views only (port rules 1, 2, 5). */
export const JUDGE_ROLES: ReadonlySet<Role> = new Set<Role>(['critic', 'judge', 'check', 'tells-compare']);

/** Steps that judge taste: big tier, isolated, frozen prompt (default rules 3 and 5). */
export const TASTE_JUDGE_ROLES: ReadonlySet<Role> = new Set<Role>(['critic', 'judge']);

/** Execution steps: mid tier (default rule 5), no ban lists (default rule 8). */
export const EXECUTION_ROLES: ReadonlySet<Role> = new Set<Role>(['build', 'fix']);

/**
 * Gate metrics. `human`: a person decides (`*[H]`, no threshold). `check-clean`: stop when a defect check reports
 * no defects (03 C5 per-shot repair; no threshold, no score).
 */
export const KNOWN_GATE_METRICS: ReadonlySet<string> = new Set(['critic-score', 'critic-rank', 'human', 'check-clean']);

/** Metrics that compare a critic's verdict with a threshold; such a gate needs a threshold (ST2, ST10). */
export const CRITIC_METRICS: ReadonlySet<string> = new Set(['critic-score', 'critic-rank']);

/** What a parallel-audit lens may return: annotations only (02 §2). */
export const ANNOTATION_PORTS = ['critique', 'score'] as const;

/** Media whose judged view is the work itself as code: port rule 1 names code explicitly (03 C7 exception). */
export const CODE_MEDIA: ReadonlySet<string> = new Set(['code-diff']);

/** Upper bound on automatic re-runs after a failed one-shot gate (02 §2 Retry: "bounded", e.g. once). */
export const MAX_GATE_RETRIES = 3;

/** Port rule 8: anything that looks like an AI-detector score or "flagged as AI" rate. */
export const DETECTOR_PATTERN = /(ai[-_ ]?detect|detector|gptzero|zerogpt|originality\.ai|flagged[-_ ]?as[-_ ]?ai)/i;
