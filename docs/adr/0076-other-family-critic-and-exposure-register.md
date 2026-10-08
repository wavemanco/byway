# ADR-0076: A different-family critic where a recipe asks for one, recorded in an exposure register

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude decided under the user's instruction "go with the product track. complete it first" ([ADR-0062](0062-code-first-work-mode.md)), after the Phase 4 review; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-07 23:00 |
| **Track** | Product |

## Context

Several critics (C3, C6, C6a, C7) set `family: 'other'`: 01 CRITIC asks for a critic from a different model family for prose. The product showed "a reviewer from a different AI family" but ignored the knob (FID-1). Separately, the charter's instrument firewall (CR12, [ADR-0055](0055-instrument-firewall-and-exposure.md)) requires tracking where product use touches the model families the studies hold out as judges, and nothing recorded that (CR12-1).

## Decision

- Each model profile may name an `otherFamily` model: a big model from a different provider than its big tier.
- A critic with `family: 'other'` uses that model when its provider has a key. Otherwise a fresh session of the same family reviews, and the step says so in plain words.
- The gateway appends every judging call (critic, judge, check, rerank, gate purposes) served by a non-Anthropic family to an exposure register (`exposure.jsonl` beside the ledger). Each entry records the provider, the model, the role, the workspace and the first-use date per model line, so the evaluation side can check judge lineage.

## Alternatives considered

- **Reword the UI only** — honest, but it loses the protocol's different-family critic.
- **Bar other families from product critic duty** — avoids any exposure, but contradicts 01 CRITIC.

## Consequences

**Positive**

- The knob does what the UI says, and exposure is on record for CR12.

**Negative**

- A different-family critic needs a second provider key; without it, runs fall back with a note.

## Evidence

- Phase 4 review findings FID-1 and CR12-1 (verified 2026-10-07); `protocol/01-blocks.md` CRITIC ("Different-family critic for prose").
