# ADR-0033: Run two tracks in parallel: harness, evaluation and paper; and a product that draws on the harness

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User decision |
| **Date (local, UTC−7)** | 2026-10-06 06:00 |
| **Track** | Product & program |
| **Related** | [ADR-0001](0001-record-architecture-decisions-as-adrs.md), [ADR-0021](0021-build-testing-app-on-evaluation-harness.md), [ADR-0028](0028-build-approach-a-own-engine.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md) |

## Context

The user stated this while choosing the build approach. It refines the earlier framing (ADR 21), when the user wrote that they did not mean 'a product yet', though what was built might become the product.

## Decision

Two tracks run in parallel, or in close sequence:
- (a) the harness, evaluation and research-paper work;
- (b) the product.
The product rests on an explicit working assumption that the approach works, and it evolves as test results come in. The product must draw on the harness in some form.

## Alternatives considered

- No alternatives were recorded at the time.

## Consequences

**Positive**

- The product can start before results are in, and evolve as they arrive.

**Negative**

- A product track adds an interest that the paper's conflict-of-interest and allegiance statement must declare, on top of the authors' allegiance to their own protocol.
- The engine has to serve both reproducible research and fast product iteration.

**Follow-ups**

- How the engine serves both tracks is only a proposal so far (ADR 41).
- The product's form is still open (see open decisions). Candidates include portable layers (skills, MCP) inside existing hosts, per 04-use-case-evidence; the app itself; or the Platform Guardrail channel in 05-more-to-explore.
- Open-sourcing and licensing are still open (r_arch questions; see open decisions).
- Feed back into the product track any results that weaken the working assumption.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T13:00:55Z — “two things will be done in parallel (or close sequencing)”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T13:00:55Z — “I know it is a major assumption but we will make it and let it evolve as and when tests come in”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T13:00:55Z — “And the product obviously needs to draw upon the harness itself in some form or shape.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:46:40Z — “I don't mean a product yet (though what we build now may become the product)”
- [research/2026-10-06-harness-research/study1-draft.md](../research/2026-10-06-harness-research/study1-draft.md) · ## Recommendations > ### What goes in the preregistration, and the publication route — “Conflict of interest: the authors designed the protocol (allegiance).”
- [protocol/04-use-case-evidence.md](../../protocol/04-use-case-evidence.md) · item 10 'The market gap' — “Ship configurations as portable layers (skills, MCP) inside existing hosts.”
- [protocol/05-more-to-explore.md](../../protocol/05-more-to-explore.md) · ## J. Channel candidate: Platform Guardrail — “it is the likeliest distribution channel for these blocks”
