# ADR-0001: Record architecture decisions as ADRs

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User decision |
| **Date (local, UTC−7)** | 2026-10-06 06:00 |
| **Track** | Process |
| **Related** | [ADR-0022](0022-four-ordered-sub-projects-spec-first.md), [ADR-0027](0027-publishability-invariants.md), [ADR-0033](0033-parallel-research-and-product-tracks.md) |

## Context

When the user chose the build approach for the testing app ('Option 1', i.e. approach A), they also asked that this decision, and every architectural decision taken until then, be recorded. The user wants the experiments to be publishable in reputable journals. Claude intends this log to support the paper's methods and allegiance statements by showing who decided what. In the same answer the user announced a parallel product track that will draw on the harness and build on the same choices.

## Decision

The user's requirement: record this architectural decision, 'and in fact every other architectural decision' taken until now.

Claude's operationalization (not the user's wording):
- Decisions are recorded as numbered, MADR-style ADRs covering protocol, research design, system, product and process decisions.
- The log is kept current as new decisions land. This forward-looking part is Claude's reading; the user's words cover decisions already taken.
- Each record has a status (accepted, proposed or superseded) and one of four provenance labels: user_decision, user_approved_recommendation, accepted_by_continuation or proposed_pending. Claude's recommendations are never labelled as user decisions.

This record is ADR 1. ADRs 2–33 follow in the order they were decided. ADRs 34–41 are still proposals and come last.

## Alternatives considered

- No alternatives were recorded at the time.

## Consequences

**Positive**

- Every decision traces to a dated user message, a user answer, or work Claude delivered. The paper's methods and allegiance statements can cite that trail.
- Choices Claude made that the user only built on are flagged as accepted_by_continuation. They are not silently treated as agreed.
- Settled and pending decisions are kept apart, so the spec cannot quietly assume a proposal.

**Negative**

- The log must be updated whenever a decision changes, or it will mislead readers of the paper.
- The records for past decisions depend on Claude's reading of the transcript. For the whole protocol phase, provenance rests mostly on continuation, not on explicit approval.

**Follow-ups**

- User to confirm the ADR format, the provenance scheme and the rule to keep the log current. All three are Claude's operationalization, not the user's wording.
- User to ratify every accepted_by_continuation ADR (see open decisions).
- Decide where the ADR log lives (for example next to protocol/, or in the harness repo) so it is versioned with the work.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T13:00:55Z — “Option 1 but we need to record this architectural decision (and in fact every other architectural decision) we have taken until now.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T07:20:11Z (Claude-asks: build approach options A/B/C)
- Claude project memory: record-architecture-decisions.md · body (Claude-authored memory note) — “Never mark Claude's recommendations as user decisions.”
