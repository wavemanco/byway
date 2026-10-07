# ADR-0065: Product v1 scope: all eight configurations, recommender, composer, computed labels, demo mode

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude decided under the user's instruction "go with the product track. complete it first" ([ADR-0062](0062-code-first-work-mode.md)); not explicitly approved; reversible |
| **Date (local, UTC−7)** | 2026-10-07 10:48 |
| **Track** | Product & program |

## Context

The user asked for the product track to be completed. The north star needs a recommender and, as the lego set grows, a composer; the charter requires computed, honest labels (CR11).

## Decision

Product v1 runs all eight configurations (C1–C7, C6a) end to end with in-app human checkpoints; recommends through the protocol's chooser with an intake model; composes at design time through the validator when nothing fits; computes evidence labels from the (empty) study registry, so every recipe reads "Untested"; and includes a demo mode with a deterministic mock provider so the product works without keys. Video generation runs only when a fal.ai key is configured. Details: [product v1 spec](../superpowers/specs/2026-10-07-product-v1-design.md).

## Alternatives considered

- **C1 only first** — faster, but leaves the recommender with one destination.

## Consequences

**Positive**

- The north star is usable end to end.

**Negative**

- Large build; prompt quality for eight configurations is the main quality risk.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T17:48:15Z — “go with the product track. complete it first. use subagents with dedicated worktrees if needed.”
- [product v1 spec](../superpowers/specs/2026-10-07-product-v1-design.md)
