# ADR-0015: Success is judged outside the loop, against a best-in-category bar, with disclosure held constant

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Accepted by continuation (Claude proposed; the user built on it without explicit approval) — needs ratification |
| **Date (local, UTC−7)** | 2026-10-05, review-fix round (22:13–22:56; delivered 22:56) |
| **Track** | Protocol |
| **Related** | [ADR-0008](0008-critic-blind-render-only-hidden-threshold.md), [ADR-0011](0011-typed-ports-and-hard-port-rules.md), [ADR-0023](0023-harness-supports-three-judging-modes.md), [ADR-0032](0032-separate-python-evaluation-side.md), [ADR-0036](0036-study-1-outcomes-and-ai-judges.md) |

## Context

Some draft success criteria relied on the loop's own critic, and some used 'flagged as AI' rates (C3, C5 and the then-C8).

## Decision

Every configuration's success criteria are judged by an evaluator other than the loop's own critic. Recipe step 9 sets the general rule: success criteria at the best-in-category bar, judged outside the loop by human panels or a held-out model, with disclosure held constant, and never by AI-detector scores (port rule 8).

How the configurations apply it:
- C1: a blind panel of at least 3 people, or a model from a different family using references the loop did not use, ranks the final page at or above the median of category exemplars.
- C3: blind pairwise tests with the same AI-assistance note on both arms, against the author's best pre-AI pieces.
- C5: a creative-director panel, plus recall, CTR and preference at or above human-made baselines, with the required AI labels applied to the test arm.
- C6: a human reader (mentor or peer) ranks the document in the top quarter of a real pile.
- C6a: at least 3 blind beta readers.
- C4 and C7: the team's or repo's own 4-week pre-adoption baseline.

## Alternatives considered

- **Criteria such as 'expert readers flag the piece as AI no more often than human-written controls' or 'No platform AI slop flags'** — Amounts to a detector-evasion objective (review finding useful-1; 04 Corrections).
- **Success judged by the loop's own critic** — Self-referential. Replaced with held-out evaluators (04 Corrections).

## Consequences

**Positive**

- Sets the evaluation stance the harness inherits: held-out judges, blind panels and constant disclosure (ADRs 23, 32).

**Negative**

- Every success claim needs an outside evaluator, which costs money and human time.
- Reference sets of category exemplars have to be assembled for each category; the protocol files do not supply them.

**Follow-ups**

- Ratify (accepted by continuation).

## Evidence

- [protocol/03-configurations.md](../../protocol/03-configurations.md) · C1 · Studio › Success criteria (judged outside the loop); Building a new configuration step 9 — “The loop's own critic is never the success judge.”
- [protocol/03-configurations.md](../../protocol/03-configurations.md) · C3, C4, C5, C6, C6a, C7 › Success criteria
- [protocol/04-use-case-evidence.md](../../protocol/04-use-case-evidence.md) · Corrections (success-criteria rows); Cross-cutting findings that shaped the protocol, #6
- [research/2026-10-05-protocol-build/review-findings.txt](../research/2026-10-05-protocol-build/review-findings.txt) · [useful-1]
