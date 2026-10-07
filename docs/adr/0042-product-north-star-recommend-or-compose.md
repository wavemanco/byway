# ADR-0042: Product north star: a user brings a problem; the product recommends a configuration or composes one

| | |
|---|---|
| **Status** | Accepted (as a direction; the product's form is still open) |
| **Decided by** | User decision |
| **Date (local, UTC−7)** | 2026-10-07 00:31 |
| **Track** | Product & program |
| **Related** | [ADR-0014](0014-seven-configurations-with-distinct-topologies.md), [ADR-0016](0016-anchored-rubric-for-choosing-configurations.md), [ADR-0033](0033-parallel-research-and-product-tracks.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md), [ADR-0043](0043-research-credibility-without-compromise.md) |

## Context

In design section 1, Claude assumed the product's audience and form were not yet decided. The user agreed they are not fully decided, but stated where the product should go. Some use cases are already clear from the use-case research (04) and others will build on them. The protocol already has a chooser in 03-configurations that routes a use case to a configuration by asking up to seven questions, and the lego set is expected to grow (for example, the parked VERIFY block, ADR-0018).

## Decision

The product's north star, in the user's words: "any user would have a problem and our product will recommend a configuration (or build one based on the user's need - especially true when we have more pieces in our 'lego set') and solve for the user's needs."

What this fixes now:
- The product is problem-first, not configuration-first. It takes a user's problem and returns a configuration to run.
- Two capabilities are in scope over time: **recommend** an existing configuration, and **compose** a new one from blocks when none fits.
- The lego set is expected to grow, so composition gains value as blocks are added.

What stays open: the product's audience, form and distribution (see the open decision "The product's form and distribution" in the [index](README.md)).

## Alternatives considered

- No alternatives were recorded at the time. Earlier research listed candidate product forms (portable skills/MCP layers, a standalone app grown from Lab, a platform-guardrail channel; 04 cross-cutting finding #10 and 05 §J); the north star is compatible with all of them.

## Consequences

**Positive**

- Gives the shared engine a clear long-term requirement: recipes must be data that a program can select, assemble and check, not hand-written code per configuration (consistent with [ADR-0029](0029-temporal-runner-versioned-recipe-files.md)).
- The chooser in 03 becomes the seed of the recommender.

**Negative**

- Composed configurations will not have been tested when first produced. They must never borrow the evidence of studied configurations (see [ADR-0043](0043-research-credibility-without-compromise.md)).
- Composition needs a machine-checkable grammar: typed ports, the compatibility table and the default rules must be enforceable by a validator, not just documented.

**Follow-ups**

- Design section 1 (revision 2) to derive the engine requirements this implies (block registry, validator, evidence labels).
- How the recommender and composer are themselves evaluated belongs to the product spec.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T07:31:30Z — “In an ideal world any user would have a problem and our product will recommend a configuration (or build one based on the user's need”
- [protocol/03-configurations.md](../../protocol/03-configurations.md) · Chooser
- [protocol/05-more-to-explore.md](../../protocol/05-more-to-explore.md) · §J Channel candidate: Platform Guardrail
