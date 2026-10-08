# ADR-0075: The person chooses which cliché-sweep hits to swap, one by one

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude decided under the user's instruction "go with the product track. complete it first" ([ADR-0062](0062-code-first-work-mode.md)), after the Phase 4 fidelity review; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-07 23:00 |
| **Track** | Product |

## Context

In the article, the cliché sweep ends with a decision for each hit. The product as first built swapped every hit at once. The person could only keep all the swaps or none, yet the swap prompt told the model "a person chose these swaps" (review finding TELLS-1).

## Decision

After a TELLS sweep whose hits feed a swap step, the run opens a `select` checkpoint, "Which of these should be swapped? Choose any, or none.", with one option per hit. Only the chosen hits reach the swap step. If none are chosen, the step changes nothing and says so. The before/after comparison that follows stays as it is. `select` is a new checkpoint kind (contracts v5): choose any number of options, including none.

This is runner behaviour, so recipe wiring and recipe hashes do not change.

## Alternatives considered

- **Keep all-or-none and reword the prompt** — honest, but it drops the article's per-instance judgement.
- **A human step in the recipe** — would change recipe hashes, including C1's.

## Consequences

**Positive**

- The prompt's statement is true, and the article's technique is kept.

**Negative**

- Each TELLS sweep adds one more "Your turn".

## Evidence

- Phase 4 review finding TELLS-1 (verified 2026-10-07); `protocol/01-blocks.md` TELLS.
