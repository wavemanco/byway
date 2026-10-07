# ADR-0008: CRITIC is a blind, render-only, frozen-prompt loop with a hidden threshold, plus calibration

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Accepted by continuation (Claude proposed; the user built on it without explicit approval) — needs ratification |
| **Date (local, UTC−7)** | 2026-10-05 21:25 (GREAT-mode prompt fixed 22:23) |
| **Track** | Protocol |
| **Related** | [ADR-0007](0007-eight-block-codes-anatomy-and-glue.md), [ADR-0011](0011-typed-ports-and-hard-port-rules.md), [ADR-0012](0012-loop-failure-semantics-and-budget-model.md), [ADR-0015](0015-success-judged-outside-the-loop.md), [ADR-0017](0017-mark-additions-keep-c1-article-faithful.md), [ADR-0034](0034-headless-c1-confirmatory-arm.md) |

## Context

CRITIC carries most of the article's Define stage. Evidence on LLM judges of taste is weak and comes mostly from older models.

## Decision

Article-faithful core:
- A separate critic, in a fresh context, sees only the render.
- It gets the same prompt every round: infer the intended aesthetic, imagine a top studio's version, list the biggest gaps, and give a score out of 10.
- The work is done at 9/10 or above. The critic never sees that threshold.
- Run a probe of 1–2 iterations first. Use a big model as critic and a capable model as worker.
- Use the BAD/OK/GREAT criteria ladder, with references as a moodboard.

Additions ⟨A⟩:
- An external harness may hold the threshold instead of the worker.
- A calibration step runs before the probe.
- An iteration cap, with plateau and best-snapshot rules (ADR 12).
- A GREAT gate: our design must rank 1st among position-shuffled references (4 in the article's tip, up to 10 ⟨A⟩). In the runbook's GREAT prompt, the critic ranks all designs and lists gaps for each one, so it never needs to know which design is ours. The prompt was fixed at 22:23.
- For prose, the option of a critic from a different model family, and a clause naming the intended feeling.
- Multi-surface renders and a taste-only guard.

In practice (06 runbook), isolation means a Read-only subagent, or a headless call run from an empty temporary folder.

## Alternatives considered

- **Self-Refine (a same-model critique loop)** — The article argues against self-review (05 §B).
- **A panel of judges from several model families (PoLL)** — Contradicts the article's single big critic. Listed to test, not adopted (05 shortlist #4).
- **Pairwise tournament selection (PairS)** — A selection method, not the article's refinement loop (05 shortlist #3).
- **Learned critics or reference sets (UIClip, WQRM) as the engine behind CRITIC** — Not an article technique. Parked in 05 §I, which notes that whether CRITIC works at all on visuals and prose depends on this.
- **BAD-mode criteria ('looks beautiful, not AI-generated')** — Too subjective according to the article. Never used.

## Consequences

**Positive**

- Keeps judgment separate from production, which is the protocol's central idea.
- Calibration and the cap give the loop a defined way to fail, instead of spending without limit.

**Negative**

- How reliable current frontier critics are has not been measured. Evidence from older models puts unanchored LLM judges near chance on UI quality and prose.
- The hidden threshold is an article prescription that nobody else has tested.

**Follow-ups**

- Ratify the ⟨A⟩ parts (accepted by continuation).
- Study 1 proposes calibrating the critic once in the pilot and then freezing it (ADR 34, proposed).

## Evidence

- [protocol/01-blocks.md](../../protocol/01-blocks.md) · CRITIC · Blind Critic Loop (Procedure, Knobs, Guards, Reliability caveat, Keep/Additions)
- [protocol/06-runbook.md](../../protocol/06-runbook.md) · C1 · Studio › 2 · Critic isolation; 4 · The critic loop (GREAT-mode variant)
- [protocol/05-more-to-explore.md](../../protocol/05-more-to-explore.md) · Shortlist #3–#5; B. Critic and judge variants; I. From the use-case research
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T05:23:07Z (Claude) — “I'll make the critic list gaps for every design it didn't rank first, so it never needs to know which design is ours.”
