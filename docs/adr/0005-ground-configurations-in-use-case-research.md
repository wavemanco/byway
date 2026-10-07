# ADR-0005: Ground the configurations in use-case research, run in parallel with the technique research

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User decision |
| **Date (local, UTC−7)** | 2026-10-05 21:15 (sequencing chosen by Claude 21:16) |
| **Track** | Process |
| **Related** | [ADR-0004](0004-parallel-research-adversarial-review-build-method.md), [ADR-0014](0014-seven-configurations-with-distinct-topologies.md), [ADR-0016](0016-anchored-rubric-for-choosing-configurations.md) |

## Context

Before the configurations were built, the user suggested use-case research so that the configurations' usability would be grounded in research, market realities and real pain points. The user left the sequencing to Claude.

## Decision

Configurations are chosen from use-case research covering pain points, market realities and counter-evidence. The user originated this requirement.

Using the authority the user delegated, Claude ran this research in parallel with the technique research. Claude also designed the sweeps: 7 of them (knowledge work and 'workslop', design tools, writing and marketing, software engineering, research/strategy/decks, practitioner voices, the market map), followed by a synthesis agent and a skeptic.

## Alternatives considered

- **Run the use-case research after the technique research, when configuration-building starts** — This is closest to the user's own wording ('when you start building the configurations'). Claude judged the two independent and both prerequisites for the configurations, so it ran them concurrently. No further tradeoff was recorded.

## Consequences

**Positive**

- Produced 04-use-case-evidence.md: use-case cards with counter-evidence, a scoring rubric, a list of rejected use cases, and evidence gaps.
- Each configuration names the pain it addresses and the evidence against it.

**Negative**

- The research justifies which configurations exist, not that they work. Evidence that the protocol's fixes work (Evid-fix) is low almost everywhere.
- Market figures are mostly vendor or aggregator estimates (04 intro).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T04:15:56Z — “You ight also want to do a use case research when you start building the configurations”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T04:15:56Z — “How you sequence this use case research vis a vis the rest of the work I will leave that to you.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T04:16:25Z (Claude) — “The two don't depend on each other, and both need to be done before I design the configurations.”
- [protocol/04-use-case-evidence.md](../../protocol/04-use-case-evidence.md) · How the evidence was gathered and checked (intro); How to read the tables
