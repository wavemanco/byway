# ADR-0022: Split the testing-app work into four ordered sub-projects under a spec-first design process

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Accepted by continuation (Claude proposed; the user built on it without explicit approval) — needs ratification |
| **Date (local, UTC−7)** | 2026-10-05 23:48 |
| **Track** | Process |
| **Related** | [ADR-0001](0001-record-architecture-decisions-as-adrs.md), [ADR-0021](0021-build-testing-app-on-evaluation-harness.md), [ADR-0024](0024-evaluation-ladder-paper-one-scope.md), [ADR-0028](0028-build-approach-a-own-engine.md) |

## Context

Claude classified the testing-app request as architectural and too big for one spec. It proposed a split into sub-projects, a design process, and four working assumptions, and asked the user to correct them.

## Decision

Four sub-projects, in this order:
1. Experiment design: hypotheses, comparisons, ablations, tasks, measures, human-rating design, statistics and ethics, written so it can be pre-registered.
2. The engine and evaluation harness.
3. The app, with an operator studio and a rater view.
4. The per-configuration 'for dummies' runbooks, written against the real app.

Process: questions, then approaches, then a design presented in sections, then a written spec that the user approves before any code.

Working assumptions stated by Claude:
- The users are the owner and maybe a small team.
- It runs locally first, on the owner's API keys.
- 'Testing a configuration' means comparing it against simpler baselines and running leave-one-block-out ablations.
- C1 is tested first.

## Alternatives considered

- No alternatives were recorded at the time.

## Consequences

**Positive**

- Puts the science first, so the harness is built to serve a design that can be pre-registered.
- The spec-before-code gate gives the user a clear point at which to approve.

**Negative**

- Slower than building directly, and no design section has been presented to the user yet.

**Follow-ups**

- Ratify. The user answered every follow-up question without objecting, but never explicitly approved the split, its order, the spec-before-code gate or the assumptions.
- Two assumptions were later confirmed by explicit choices: C1 first with baselines and ablations (ADR 24), and a local-first operator app (ADR 28; approach A keeps the operator Lab local but hosts the rater app and uses cloud sandboxes for the big batch). The 'owner plus small team' assumption is still open.
- The architecture digest proposes a build order that has not been decided and would interleave sub-projects 2 and 3. Phase 0 builds the harness spine: gateway, Docker sandbox runner, render container, a Temporal interpreter running C1 plus the plain and 'be creative' baselines, artifact store, database and cost estimator. Phase 1 adds stimulus bundles, the Inspect judge worker, the rater app and a Prolific pilot (n≈20). Studio polish and the experiment designer wait for Phase 2.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:48:25Z (Claude) — “It's also too big for one spec, so I'd split it into four sub-projects, in this order”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:48:25Z (Claude) — “So I'll follow the full design process: questions, approaches, a design presented in sections, then a written spec you approve before any code.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:54:47Z; 07:02:27Z; 13:00:55Z — “go with your recommendation.”
- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Recommendations > ### Build order — “Build the rater UX to a high standard early, because rater experience affects data quality.”
