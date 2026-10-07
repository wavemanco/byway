# ADR-0012: Bounded runs: loop failure semantics defined once, and a budget model in calls and images

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Accepted by continuation (Claude proposed; the user built on it without explicit approval) — needs ratification |
| **Date (local, UTC−7)** | 2026-10-05 22:17 (loop semantics); the budget model was added in the same review-fix round (README cost guidance 22:25) |
| **Track** | Protocol |
| **Related** | [ADR-0008](0008-critic-blind-render-only-hidden-threshold.md), [ADR-0010](0010-grammar-chassis-operators-wiring-compatibility.md), [ADR-0011](0011-typed-ports-and-hard-port-rules.md), [ADR-0013](0013-default-rules-with-declared-exceptions.md), [ADR-0018](0018-correctness-outside-v1-verify-parked.md), [ADR-0026](0026-budget-sized-from-power-analysis.md), [ADR-0034](0034-headless-c1-confirmatory-arm.md) |

## Context

The review found that loop-failure handling was inconsistent across files and had no bound. C1's draft went back to D1 with a new seed whenever the critic stalled ('else << D1'). The article's remedy for a loop that won't converge is to set the stopping criteria carefully. There was also no cost or time model. C1's only budget line was the article's figure that the critic used under 10% of output tokens, which ignores the cost of image input.

## Decision

Loop-until is defined once, for every configuration (02 §2):
- `max` counts total iterations, including the probe. The default is 5.
- After the probe, the loop must be converging: the best score rises by at least 1 point (rank gates: our rank improves by at least 1), or the critique names new gaps. If it isn't converging, recalibrate the bar, prompt, render, references or worker tier, restart the score trajectory, and allow one more probe.
- Plateau: a gain under 0.5 over 2 consecutive iterations means stop and go to best-snapshot selection. A separate fresh judge call re-ranks the top 2–3 snapshots, with no scores or critiques attached. This is the one default exception to port rule 1. Configurations may declare others, and C7 does (ADR 13).
- At the cap, the best snapshot goes to a human, who ships it, discards it (<< D1), or raises the cap once.
- max_backtracks = 1 per candidate; after that the candidate is dropped. A run budget (USD or turns) aborts the run and hands the best snapshots so far to a human.
- Backtracking to D1 is always a human decision.

Budget (02 §7). Runs are budgeted in critic calls, critic images, worker turns, asset calls, relay calls and human minutes. Cost controls:
- pick early;
- cache the frozen critic prompt and the reference images as a shared prefix;
- use one bar mode per loop;
- run calibration and the probe on one candidate before fanning out.
Every configuration in 03 has a stop-rules-and-cost section and a lite profile.

## Alternatives considered

- **The C1 draft gate `else << D1`: go back to D1 automatically on a stall** — Contradicts the article's advice to set stopping criteria carefully, and could re-spawn runs without limit (review findings fidelity-4, useful-4).
- **The reviewer's version: a stall (under 1 point of gain over the probe) backtracks automatically to Dk** — Proposed in review finding useful-4. Rejected in favour of recalibrating first and leaving backtracking to the human, as review finding fidelity-4 recommended.
- **Budget by the critic's share of output tokens (under 10%, the article's figure)** — Ignores that critic cost is dominated by image input (review finding useful-5).

## Consequences

**Positive**

- Any harness gets concrete stop conditions, and cost can be estimated per configuration before a run.
- The critic loops in C1, C3, C4 and C7 use the same semantics, with caps of 5, 3, 2 and 3. C5 uses a gate with one bounded automatic retry.

**Negative**

- The numeric thresholds (a 1-point convergence test, a plateau of under 0.5 over 2 iterations, a cap of 5) are protocol additions made by Claude and its review agents. They are not the article's, and none has been tested.
- Human time for VISION and VOICE is not measured.

**Follow-ups**

- Ratify (accepted by continuation).
- The Study 1 draft treats the cap of 5 as a declared amendment (ADR 34, proposed).

## Evidence

- [protocol/02-grammar.md](../../protocol/02-grammar.md) · Loop-until: failure semantics, defined once ⟨A⟩ — “`max` counts total iterations, including the probe. Default 5.”
- [protocol/02-grammar.md](../../protocol/02-grammar.md) · Port rules (hard invariants), rule 1 — “the exit re-rank in §2 is the one default exception”
- [protocol/02-grammar.md](../../protocol/02-grammar.md) · 7. Budget model ⟨A⟩
- [protocol/03-configurations.md](../../protocol/03-configurations.md) · Ordering principle and declared exceptions (C7 row); C1 · Studio › Stop rules, cost and the lite profile
- [research/2026-10-05-protocol-build/review-findings.txt](../research/2026-10-05-protocol-build/review-findings.txt) · [fidelity-4], [useful-4], [useful-5]
- [research/2026-10-06-harness-research/study1-draft.md](../research/2026-10-06-harness-research/study1-draft.md) · C1 condition rationale — “The ⟨A⟩ cap of 5 and the calibration step are declared amendments.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T05:17:50Z (Claude); 2026-10-06T05:25:44Z (Claude, README 'cost guidance') — “a single definition of how loops fail”
