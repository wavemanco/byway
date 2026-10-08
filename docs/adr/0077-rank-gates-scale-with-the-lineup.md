# ADR-0077: Hidden rank thresholds scale with the lineup actually used

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude decided under the user's instruction "go with the product track. complete it first" ([ADR-0062](0062-code-first-work-mode.md)), after the Phase 4 review; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-07 23:00 |
| **Track** | Product |

## Context

A GREAT-mode loop stops when our version ranks at or above a hidden threshold. That threshold was written for the lineup in the recipe (for example top 3 of 10 for C3). [ADR-0071](0071-great-critic-falls-back-to-ok-without-references.md) allows GREAT mode with as few as 3 references. With a smaller lineup, the same absolute threshold is much easier to pass: rank 3 of 4 is not top 3 of 10 (GATE-1).

## Decision

A rank gate passes when the rank is at or below `max(1, floor(T × of / N))`. `T` is the recipe's threshold, `of` is the size of the lineup actually used, and `N` is the size the threshold was written for (the step's `refs` knob plus one). The threshold stays hidden from every prompt (port rule 2).

## Alternatives considered

- **Require the recipe's full reference count for GREAT mode** — simpler, but it pushes most users to OK mode.

## Consequences

**Positive**

- The bar means the same share of the lineup whatever number of references the person brings.

**Negative**

- With small lineups the gate can require rank 1.

## Evidence

- Phase 4 review finding GATE-1 (verified 2026-10-07); ADR-0071.
