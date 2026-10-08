# ADR-0072: A GREAT-mode critic ranks the whole lineup without knowing which item is ours; the runner finds our rank

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude decided under the user's instruction "go with the product track. complete it first" ([ADR-0062](0062-code-first-work-mode.md)); not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-07 21:05 |
| **Track** | Product |

## Context

The first output contract for a GREAT-mode critic was `Rank: N of M`, the rank of our item. To answer it, the critic had to be told which item was ours. That breaks a rule of the protocol's runbook (06-runbook): "The critic never learns which design is ours". The runbook marks this as a project addition ⟨A⟩, since whether naming our item makes the critic more lenient is untested. The conflict surfaced while the prompt templates were being written.

## Decision

- A GREAT-mode critic gets the lineup as "M items, labelled A–X" and is never told which one is ours.
- It answers with its critique and then a last line ranking every label, best first (`Ranking: C, A, E, B, D`).
- The runner finds our item's position in that ranking. With several shuffles it averages the positions, and it compares the result with the hidden rank threshold (lower is better).
- OK mode does not change: one item, answered with `Score: N/10`.

## Alternatives considered

- **Keep `Rank: N of M` and name our item** — simpler, but against 06-runbook.
- **Ask the critic for a rank per item** — the same information, and easier to answer inconsistently.

## Consequences

**Positive**

- The product keeps the runbook's blind critic, the same way the research harness does.

**Negative**

- The prompt templates, the mock and the runner's parser all change together.

## Evidence

- `protocol/06-runbook.md`, critic notes — “The critic never learns which design is ours.”
- [product v1 spec](../superpowers/specs/2026-10-07-product-v1-design.md) §3.3 (critic row)
