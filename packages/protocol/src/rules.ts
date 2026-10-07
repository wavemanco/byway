export type RuleClass = 'invariant' | 'hard' | 'default' | 'advisory';

export const RULE_IDS = [
  'ST1', 'ST2', 'ST3', 'ST4', 'ST5', 'ST6', 'ST7', 'ST8',
  'PR1', 'PR2', 'PR3', 'PR4', 'PR5', 'PR6', 'PR7.1', 'PR7.2', 'PR8',
  'CH3', 'LS1',
  'DR1', 'DR2', 'DR3', 'DR4', 'DR5', 'DR6', 'DR7', 'DR8', 'DR9', 'DR10',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export interface RuleDef {
  id: RuleId;
  class: RuleClass;
  title: string;
  /** Where the rule comes from in the protocol or the ADR log. */
  source: string;
}

const r = (id: RuleId, cls: RuleClass, title: string, source: string): RuleDef => ({ id, class: cls, title, source });

/** Rule catalogue (spec: docs/superpowers/specs/2026-10-07-engine-recipe-core-design.md). */
export const RULES: Record<RuleId, RuleDef> = {
  ST1: r('ST1', 'invariant', 'Node ids are unique', 'engine'),
  ST2: r('ST2', 'invariant', 'Every loop has 1 ≤ probe ≤ max', '02 §2 loop-until semantics'),
  ST3: r('ST3', 'invariant', 'Counts are positive integers and every value is plain JSON', '02 §2 operators; canonical hashing'),
  ST4: r('ST4', 'invariant', 'Stages appear at most once, in order D1, D2, D3', '02 §1 chassis'),
  ST5: r('ST5', 'invariant', 'Every consumed port is in scope', '02 §3 ports'),
  ST6: r('ST6', 'invariant', 'Sit-outs have reasons and sat-out blocks are not used', '02 §5'),
  ST7: r('ST7', 'invariant', 'Knobs are registered and within range', '01 blocks (knobs)'),
  ST8: r('ST8', 'invariant', 'Cited exceptions and derivations exist, are allowed here, are needed and are cited once', '03 declared exceptions; ADR-0059'),
  PR1: r('PR1', 'hard', 'Critics see views, never process', '02 §3 port rule 1'),
  PR2: r('PR2', 'hard', 'The threshold never enters a critic prompt', '02 §3 port rule 2'),
  PR3: r('PR3', 'invariant', 'Seeds and credentials never enter the artifact', '02 §3 port rule 3'),
  PR4: r('PR4', 'hard', 'Every option_set is closed by pick before D3', '02 §3 port rule 4'),
  PR5: r('PR5', 'hard', 'Briefs go to builders, never to critics', '02 §3 port rule 5'),
  PR6: r('PR6', 'hard', 'Human voice is locked', '02 §3 port rule 6'),
  'PR7.1': r('PR7.1', 'hard', 'The tell catalog never enters a generation or critic prompt', '02 §3 port rule 7'),
  'PR7.2': r('PR7.2', 'hard', 'A human compares the TELLS alternatives', '02 §3 port rule 7'),
  PR8: r('PR8', 'invariant', 'No gate or metric uses an AI-detector score', '02 §3 port rule 8'),
  CH3: r('CH3', 'hard', 'Distill is human-judged: CUT is done by a human', '02 §1 chassis (D3)'),
  LS1: r('LS1', 'hard', 'A human decides at non-convergence and at the cap', '02 §2 loop-until semantics; ADR-0012'),
  DR1: r('DR1', 'default', 'Variety comes from a seed or a human', '02 §6 rule 1'),
  DR2: r('DR2', 'default', 'Go broad before deep, and pick before you spend', '02 §6 rule 2'),
  DR3: r('DR3', 'default', 'Judgment is separated from production', '02 §6 rule 3'),
  DR4: r('DR4', 'default', "The critic's score decides when to stop, against a hidden threshold", '02 §6 rule 4'),
  DR5: r('DR5', 'default', 'Big model for judgment, capable model for execution', '02 §6 rule 5'),
  DR6: r('DR6', 'default', 'Verify in the real render', '02 §6 rule 6'),
  DR7: r('DR7', 'default', 'Distill runs after Deepen settles, in the order CUT → TELLS → VOICE', '02 §6 rule 7'),
  DR8: r('DR8', 'default', 'Audit after, never ban before', '02 §6 rule 8'),
  DR9: r('DR9', 'default', 'Humans own the words readers attribute to them', '02 §6 rule 9'),
  DR10: r('DR10', 'advisory', 'Bank what failed', '02 §6 rule 10'),
};
