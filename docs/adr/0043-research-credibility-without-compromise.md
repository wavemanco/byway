# ADR-0043: Research credibility takes precedence over product interests, without compromise

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User decision |
| **Date (local, UTC−7)** | 2026-10-07 00:31 |
| **Track** | Process |
| **Related** | [ADR-0001](0001-record-architecture-decisions-as-adrs.md), [ADR-0027](0027-publishability-invariants.md), [ADR-0033](0033-parallel-research-and-product-tracks.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md), [ADR-0042](0042-product-north-star-recommend-or-compose.md) |

## Context

The same people will run the research program (harness, studies, papers) and build a product on the protocol ([ADR-0033](0033-parallel-research-and-product-tracks.md)). In design section 1, Claude assumed that "the research has to stay credible even though the same people are building a product on top of it" and proposed five rules. The user confirmed the assumption emphatically and also confirmed that the team stays small. A small team cannot get independence by splitting into separate research and product groups.

## Decision

Research credibility is a hard constraint. Where research integrity and product interests conflict, research integrity wins, "ABSOLUTELY AND WITHOUT COMPROMISE" (the user's words).

Concretely, this means:
- Credibility safeguards are not traded for speed, cost or product convenience.
- Because the team is small and self-interested, independence has to come from pre-commitment, system enforcement, external parties and disclosure rather than from separate teams.
- The specific safeguards form a credibility charter, being drafted and red-teamed in design section 1 (revision 2). Each charter rule becomes its own ADR once approved.

The team stays small (confirmed by the user; previously an unconfirmed assumption in [ADR-0022](0022-four-ordered-sub-projects-spec-first.md)).

## Alternatives considered

- No alternatives were recorded at the time.

## Consequences

**Positive**

- Settles conflicts in advance: for example, if a study's result is unfavourable to the product, it is still published in full.
- Strengthens the case for pre-commitment routes (such as a Registered Report) and for open release of everything needed to replicate the studies.

**Negative**

- Some safeguards cost time and money (external experts, an independent IRB route, open release, slower publication through a Registered Report).
- Some product choices will be constrained, for example claims in product copy and what is open-sourced.

**Follow-ups**

- Approve the credibility charter (design section 1, revision 2).
- Revisit the open decisions on the preregistration route, ethics review and open release in light of this ADR.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T07:31:30Z — “ABSOLUTELY AND WITHOUT COMPROMISE.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T07:31:30Z (reply to “The team stays small.”) — “yes”
