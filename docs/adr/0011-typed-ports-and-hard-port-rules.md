# ADR-0011: Sixteen typed ports and eight hard port rules

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Accepted by continuation (Claude proposed; the user built on it without explicit approval) — needs ratification |
| **Date (local, UTC−7)** | 2026-10-05 21:27 (7 rules); rule 8 added 22:17 |
| **Track** | Protocol |
| **Related** | [ADR-0007](0007-eight-block-codes-anatomy-and-glue.md), [ADR-0008](0008-critic-blind-render-only-hidden-threshold.md), [ADR-0009](0009-api-key-fencing-constraints.md), [ADR-0012](0012-loop-failure-semantics-and-budget-model.md), [ADR-0013](0013-default-rules-with-declared-exceptions.md), [ADR-0015](0015-success-judged-outside-the-loop.md) |

## Context

Blocks needed typed interfaces, and invariants were needed to keep judgment isolated from production. The first review found two problems. Some success criteria amounted to passing AI detection. And a tell catalog used inside CRITIC could leak to the worker.

## Decision

There are 16 ports: intent, seed, option_set<T>, taste, brief, artifact, view, refs, critique, score, asset, anchor, tells, voice, cred, failed.

The eight hard rules:
1. Critics see only view and refs.
2. The threshold never enters a critic prompt. In the article's version the worker holds it; ⟨A⟩ a harness may hold it instead.
3. Seeds and credentials never enter the artifact.
4. Every option_set is closed by a pick before D3 and before any RELAY chain.
5. Briefs go to builders, never to critics.
6. The human voice is locked.
7. The tell catalog never enters a generation, regeneration or critic prompt. Hard checks for objective defects are allowed.
8. ⟨A⟩ No gate or success metric uses an AI-detector score or a 'flagged as AI' rate. Required disclosures, platform AI labels and provenance metadata are always preserved.

## Alternatives considered

- **The 7-rule first draft, with no ban on detector metrics** — Some success criteria in C3, C5 and the then-C8 amounted to passing AI detection (review finding useful-1).
- **The tell catalog as an optional lens inside CRITIC** — Leaks the catalog to the worker during the loop. Removed (review finding fidelity-5).

## Consequences

**Positive**

- Gives any harness concrete isolation rules to enforce.
- Rule 8 rules out evasion use cases and keeps disclosures intact.

**Negative**

- Exceptions have to be declared: the exit re-rank (ADR 12), and C7, whose render is the diff (ADR 18).
- Today the rules are enforced by following the runbook, not by code.

**Follow-ups**

- Ratify (accepted by continuation).
- The engine (ADR 29) should enforce rules 1, 2, 5 and 7 in code. For example, it can build critic prompts only from view and refs.

## Evidence

- [protocol/02-grammar.md](../../protocol/02-grammar.md) · 3. Ports; Port rules (hard invariants) — “No gate or success metric uses an AI-detector score or a "flagged as AI" rate.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T05:17:50Z (Claude) — “a ban on gating on AI-detector scores”
- [research/2026-10-05-protocol-build/review-findings.txt](../research/2026-10-05-protocol-build/review-findings.txt) · [useful-1], [fidelity-5]
