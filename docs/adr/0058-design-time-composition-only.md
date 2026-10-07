# ADR-0058: Design-time composition through the validator is allowed; composed recipes are always labelled Composed; runtime rewiring stays parked

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-07 06:35 |
| **Track** | Product & program |
| **Related** | [ADR-0042](0042-product-north-star-recommend-or-compose.md), [ADR-0054](0054-computed-evidence-labels-and-claims-gate.md), [ADR-0059](0059-engine-requirements-for-composition-and-credibility.md) |

## Context

The product north star ([ADR-0042](0042-product-north-star-recommend-or-compose.md)) includes building a configuration from blocks when none fits. Protocol 05 §B had classed "an LLM assembling the legos itself" as off-path, a different system. The red-team synthesis surfaced this tension and recommended allowing design-time composition under a strict validator profile while keeping runtime self-assembly parked. The charter adoption option the user chose stated this default.

## Decision

- The product may compose new configurations at design time, only through: validate → register (kind = composed, channel = workspace) → run.
- The composed validator profile allows only admitted blocks, registered knob ranges and declared template slots; frozen block prompts are untouchable; only composable exceptions; protected human checkpoints (VOICE, C6/C6a authorship) cannot be removed.
- The product recommends a canonical configuration before composing anything, and shows a composed recipe as a diff from the nearest canonical one, with its cost.
- Composed recipes are always labelled Composed and never count as evidence ([ADR-0054](0054-computed-evidence-labels-and-claims-gate.md)).
- An LLM assembling or rewiring configurations at runtime stays parked (protocol 05 §B).
- Evaluating the recommender or composer needs its own preregistered study.

## Alternatives considered

- **Recommend canonical configurations only until a composer study exists** — safer, but contradicts the north star.
- **Runtime self-assembly** — parked as off-path (05 §B).

## Consequences

**Positive**

- Makes ADR-0042's north star possible without letting composed recipes borrow evidence.

**Negative**

- Requires the validator, block admission states and composed profile before any composer ships.

**Follow-ups**

- Block admission moves through proposed, experimental, admitted and studied; the Monitor signs admission of any block that will be studied.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T13:35:51Z — option text: “design-time composition allowed, runtime rewiring parked”
- [research/2026-10-07-credibility-redteam/r_redteam_syn.md](../research/2026-10-07-credibility-redteam/r_redteam_syn.md) · USER DECISIONS (composition) and ENGINE REQUIREMENTS
- [protocol/05-more-to-explore.md](../../protocol/05-more-to-explore.md) · §B
