# ADR-0026: Size the Study 1 budget from a power analysis and show an itemized cost before any spend

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-05 23:56 |
| **Track** | Research design |
| **Related** | [ADR-0012](0012-loop-failure-semantics-and-budget-model.md), [ADR-0024](0024-evaluation-ladder-paper-one-scope.md), [ADR-0030](0030-own-model-gateway-sole-egress.md), [ADR-0035](0035-study-1-materials-and-arms.md) |

## Context

Claude asked what budget range Study 1 should plan for, covering model API costs and human-rater payments. It recommended sizing the budget from statistical power instead of picking a band up front.

## Decision

Run a power analysis first. Then show the user the sample size and an itemized cost (API plus raters) before anything is spent. The user sets the spending ceiling at that point.

## Alternatives considered

- **Lean: under $3k** — Fewer tasks, mostly automated and AI-judge measures, and a modest human-rater study. Workshop or short-paper level.
- **Standard: $3k–$15k** — Enough tasks, conditions and raters for a full conference or journal paper on rungs 1+2.
- **Generous: $15k+** — Multiple model families, larger rater pools, expert panels and replication runs.

## Consequences

**Positive**

- Spend is tied to statistical need, and the user sees itemized costs before any money is spent.

**Negative**

- The power simulation points to 48 confirmatory briefs. The preliminary itemized cost model sized to that puts the all-in cost at about $20–24k (CORE ≈ $24k, LEAN ≈ $20k). That is above the 'Standard: $3k–$15k' band the user was shown and inside 'Generous: $15k+'.
- Showing an itemized cost before any spend requires a pre-spend cost estimator in the harness. The research digests also recommend a live cost meter and hard per-study and per-run caps; these are not yet decided.

**Follow-ups**

- The user has not set a ceiling yet.
- Claude said a ~$3k pilot comes first, to replace the estimates with measured costs. The user has not explicitly approved that spend (see open decisions).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:56:06Z (CLAUDE-ASKS 'Budget') — “I run a power analysis first, then show you the sample size and an itemized cost (API + raters) before anything is spent. You set the ceiling then.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:56:19Z — “Size it from power (Recommended)”
- [research/2026-10-06-harness-research/study1-draft.md](../research/2026-10-06-harness-research/study1-draft.md) · ## Recommendations > ### Itemized cost model (shown before any spend) — “Totals: CORE ≈ $24k. LEAN ≈ $20k”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T07:20:09Z (Claude) — “A ~$3k pilot comes first and replaces the estimates with measured costs.”
