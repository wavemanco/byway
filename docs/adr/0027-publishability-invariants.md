# ADR-0027: Publishability invariants: locked plan, full archive, interleaved randomized runs, blinded stimuli, judges kept apart from the loop

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Accepted by continuation (Claude proposed; the user built on it without explicit approval) — needs ratification |
| **Date (local, UTC−7)** | 2026-10-06 00:20 (built on at 06:00) |
| **Track** | Research design |
| **Related** | [ADR-0015](0015-success-judged-outside-the-loop.md), [ADR-0028](0028-build-approach-a-own-engine.md), [ADR-0029](0029-temporal-runner-versioned-recipe-files.md), [ADR-0032](0032-separate-python-evaluation-side.md), [ADR-0039](0039-data-layer-postgres-cas-parquet.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md) |

## Context

Claude presented these five properties as shared by all three build approaches, so choosing approach A builds on them. Current Claude models reject non-default temperature settings and API outputs are nondeterministic, so exact re-runs are impossible.

## Decision

The harness enforces five invariants:
1. A locked plan: a frozen, pre-registered design matrix. The harness refuses any condition outside it.
2. A full archive of every request, response, screenshot and decision, plus repeated runs. Reproducibility comes from the archive, not from re-running.
3. Conditions run in random, interleaved order.
4. Stimuli are blinded, with opaque IDs and stripped metadata.
5. Judges are kept apart from the generation loop.

## Alternatives considered

- No alternatives were recorded at the time.

## Consequences

**Positive**

- Reproducibility becomes archival: every artifact can be re-judged later, including by new judges.
- Blinding and interleaving remove obvious confounds from run order and labelling.

**Negative**

- The harness has to build run manifests, a content-addressed store, a replay cache and an interleaving scheduler (r_arch).
- The paper must state that results can be inspected again but not regenerated exactly.

**Follow-ups**

- Ratify. The user chose approach A, which builds on these invariants, but never explicitly approved them.
- The storage design that implements the archive is only a proposal so far (ADR 39).
- The locked plan depends on a preregistration route that is still open (see open decisions).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T07:20:09Z (Claude) — “All three share the parts that make the work publishable: a locked plan, a full archive, conditions run in random interleaved order, blinded stimuli, and judges kept apart from the loop.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T07:20:09Z (Claude) — “So the harness saves every request, response, screenshot and decision, and runs repeats.”
- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Summary — “Reproducibility has to come from archiving, not re-running.”
- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Recommendations > ### Reproducibility design (what the paper's methods and replication package rely on) — “the harness refuses conditions outside the frozen, preregistered matrix, and the scheduler interleaves conditions in randomized order.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T13:00:55Z — “Option 1 but we need to record this architectural decision”
