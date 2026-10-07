# ADR-0037: Confirmatory analysis and multiplicity plan for Study 1

| | |
|---|---|
| **Status** | Proposed |
| **Decided by** | Proposed, pending the user's decision |
| **Date (local, UTC−7)** | 2026-10-06 00:17 |
| **Track** | Research design |
| **Related** | [ADR-0026](0026-budget-sized-from-power-analysis.md), [ADR-0035](0035-study-1-materials-and-arms.md), [ADR-0036](0036-study-1-outcomes-and-ai-judges.md), [ADR-0039](0039-data-layer-postgres-cas-parquet.md) |

## Context

Raters, briefs and outputs are crossed random factors. The ablations are many-to-one comparisons, and some will probably come out null, so the plan needs multiplicity control and a way to support 'no meaningful effect' claims. The two study-design digests disagree on the primary test and on how the hypothesis families are grouped.

## Decision

Proposed, not decided.

Both study-design digests (r_study1, r_methods) propose:
- A preregistered analysis with three hypothesis families and Holm correction within each, with the ablations as their own family. They group the other contrasts differently. r_study1 uses replication (quality), distinctiveness and ablations. r_methods puts H1 (C1 vs plain) alone first and gates a second family (the other baselines plus distinctiveness) behind it.
- TOST equivalence tests for any claim that a block adds nothing (±0.08 win-rate margin in r_study1; 45–55% bounds in r_methods).
- Non-inferiority tests to protect the quality floors.
- Blind analysis: the code is frozen on simulated data (r_study1 adds scrambled labels) before unblinding.
- Product-category moderators treated as exploratory (r_study1 makes the rater-type interaction secondary).

Only one digest proposes:
- Bayesian hierarchical estimates as robustness or secondary analysis (r_methods). r_study1's robustness check is a frequentist logistic GLMM.
- Intention-to-treat for failed candidates (r_study1; r_measures keeps failing pages in for its guardrails).

The primary test is unresolved: a cluster-level test across briefs (r_study1), or a mixed-effects Bradley-Terry model (r_methods).

## Alternatives considered

- **r_study1: per-brief win proportion, one-sample t-test against .50 across briefs, Holm within families; logistic GLMM as a robustness check; hierarchical BT for the global ranking; TOST margin ±0.08** — Robust with few clusters, matches the power simulation, and transparent. Slightly conservative.
- **r_methods: a mixed-effects logistic (Bradley-Terry) model per contrast with crossed random effects; hierarchical gatekeeping (H1, then Holm families); TOST bounds 45–55%; Bayesian hierarchical BT with ROPE as robustness/secondary** — Familiar to CHI/ACL/NeurIPS reviewers. Maximal random-effects structures can fail to converge, so the order for simplifying the model must be preregistered.
- **A Bayesian hierarchical Bradley-Terry model as primary** — Uses all pairs, with natural partial pooling. Priors draw scrutiny, and decision rules are harder to preregister.
- **Per-pair binomial or t-tests** — Simple, but ignores clustering by rater and brief and inflates false positives. Rejected by r_methods as weak practice; r_study1 does not consider it.
- **r_measures: Holm across the two primaries, Benjamini-Hochberg across secondaries** — Controls false discoveries among many secondary outcomes, but uses a different correction logic from the families above.

## Consequences

**Positive**

- Null ablation results become interpretable (TOST) instead of ambiguous.
- Blind analysis and frozen code limit researcher degrees of freedom.

**Negative**

- The power simulation has to match whichever primary test is chosen.
- Some ablation results will be inconclusive by design.

**Follow-ups**

- Choose the primary test, the family grouping and the multiplicity scheme.
- Decide whether Bayesian estimates are reported as robustness checks.
- Defend the smallest effect of interest and the equivalence bounds in the preregistration.
- Which language runs the confirmatory models is tied to ADR 39.

## Evidence

- [research/2026-10-06-harness-research/study1-draft.md](../research/2026-10-06-harness-research/study1-draft.md) · ## Recommendations > ### Analysis plan — “Primary test, per contrast: a cluster-level analysis.”
- [research/2026-10-06-harness-research/study1-draft.md](../research/2026-10-06-harness-research/study1-draft.md) · ## Recommendations > ### Research questions and directional hypotheses (Holm families) — “F1 = H1a–c.”
- [research/2026-10-06-harness-research/methods.md](../research/2026-10-06-harness-research/methods.md) · ## Recommendations > ### Analysis models — “Confirmatory model: a mixed-effects logistic (Bradley-Terry) model per contrast”
- [research/2026-10-06-harness-research/methods.md](../research/2026-10-06-harness-research/methods.md) · ## Recommendations > ### Multiple-comparison control for baselines and ablations — “Use hierarchical gatekeeping.”
- [research/2026-10-06-harness-research/methods.md](../research/2026-10-06-harness-research/methods.md) · ## Options > ### Confirmatory inference framework — “Ignores rater and brief clustering, which inflates false positives (Barr et al.); seen as weak practice”
