# ADR-0018: Correctness stays outside v1: CRITIC judges taste only, C7 is 'adjacent', and VERIFY is parked

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Accepted by continuation (Claude proposed; the user built on it without explicit approval) — needs ratification |
| **Date (local, UTC−7)** | 2026-10-05 22:56 |
| **Track** | Protocol |
| **Related** | [ADR-0003](0003-stay-faithful-park-off-path-findings.md), [ADR-0011](0011-typed-ports-and-hard-port-rules.md), [ADR-0013](0013-default-rules-with-declared-exceptions.md), [ADR-0014](0014-seven-configurations-with-distinct-topologies.md) |

## Context

The research found that work where accuracy matters most (research reports, code correctness) cannot be fixed by a blind taste critic. The article has no correctness judge. In the draft, inherited from the synthesis's Lean Diff Gate, C7's critic reported correctness and requirement findings from the diff, test output and acceptance criteria, with a mutation-test sub-loop. That broke port rules 1 and 5 and duplicated the off-path VERIFY candidate.

## Decision

CRITIC judges taste, not truth, and no configuration guarantees correctness.
- A tool-grounded VERIFY block is #1 on the 05 shortlist, not part of v1.
- Use cases where accuracy is the main pain, such as AI analyst reports, are rejected until VERIFY exists.
- C4's claim log is an owner sign-off, explicitly not a fact check.

C7 Lean Diff stays, labelled 'adjacent':
- Its render is the diff plus CI status.
- A reviewer from a different model family judges scope creep, readability and fit with the repo's conventions, against exemplary merged PRs.
- CUT runs on both sides of the loop.
- Tests and CI are external, and the implementer never edits the test gate. Spec-only tests with a mutation bar moved to 05 §C as the first VERIFY candidate.
- This is a declared exception to port rule 1 and to default rule 7.
- The chooser asks about bloat and reviewability, not correctness.
Claude flagged C7 to the user as one of its two scope calls.

## Alternatives considered

- **Add a ninth, non-blind claim-to-source VERIFY block in v1** — The use-case synthesis called it a prerequisite for any research or analysis configuration, but filed it under MORE as off-path. 05 keeps it out of v1 because the article has no correctness judge.
- **C7's critic as a correctness and requirements reviewer, with a mutation-test sub-loop (draft)** — Breaks the critic-isolation rules and the protocol's taste-only scope (review findings useful-7, scope-1).
- **Move C7 entirely to 05 as the first VERIFY configuration** — The reviewer's Option B (useful-7). Would drop the code use case from v1.

## Consequences

**Positive**

- Keeps the protocol's claims honest: it is about taste and distinctiveness, not accuracy.
- Keeps the code use case in v1 with the critic confined to reviewability. Its departure from critic isolation (the diff as the render) is declared rather than silent.

**Negative**

- Configurations for research and analysis wait for v2.
- C7 is only adjacent to the article's argument, so it is weak evidence about the protocol.

**Follow-ups**

- Ratify (accepted by continuation). The C7 call was flagged to the user but not explicitly approved.

## Evidence

- [protocol/README.md](../../protocol/README.md) · Limits — “No correctness guarantee. CRITIC judges taste, not truth.”
- [protocol/03-configurations.md](../../protocol/03-configurations.md) · C7 · Lean Diff: agent-written code changes (adjacent); Ordering principle and declared exceptions (C7 row)
- [protocol/05-more-to-explore.md](../../protocol/05-more-to-explore.md) · Shortlist #1; C. Correctness and verification (spec-only tests, moved out of C7)
- [research/2026-10-05-protocol-build/use-case-synthesis.txt](../research/2026-10-05-protocol-build/use-case-synthesis.txt) · ## MORE (Ninth block: claim-to-source verification); ## REJECTED; ## RECOMMENDED CONFIGS (Lean Diff Gate) — “An accuracy problem, not a distinctiveness one.”
- [research/2026-10-05-protocol-build/review-findings.txt](../research/2026-10-05-protocol-build/review-findings.txt) · [useful-7], [scope-1]
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T05:56:31Z (Claude) — “C7 (code) is only adjacent to the article's argument.”
