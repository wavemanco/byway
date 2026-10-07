# ADR-0041: One engine for research and product: studies pin frozen engine and recipe versions, the product evolves on newer ones, and human checkpoints bind per study

| | |
|---|---|
| **Status** | Accepted (2026-10-07 06:35; proposed 2026-10-06 06:00) |
| **Decided by** | User-approved recommendation: approved as part of design section 1, revision 2, which the user settled by answering its four settling questions (charter, Monitor, open source, git). The structure and rules below were not individually discussed. |
| **Date (local, UTC−7)** | 2026-10-07 06:35 |
| **Track** | Product & program |
| **Related** | [ADR-0027](0027-publishability-invariants.md), [ADR-0029](0029-temporal-runner-versioned-recipe-files.md), [ADR-0032](0032-separate-python-evaluation-side.md), [ADR-0033](0033-parallel-research-and-product-tracks.md), [ADR-0042](0042-product-north-star-recommend-or-compose.md), [ADR-0043](0043-research-credibility-without-compromise.md), charter ADR-0044 to [ADR-0057](0057-tamper-evident-record-and-disclosure.md), [ADR-0059](0059-engine-requirements-for-composition-and-credibility.md) |

## Context

The user requires the product to draw on the harness (ADR 33). Claude had argued that the side running configurations is what could become a product, while the judging side stays a fixed scientific instrument. The separate evaluation side itself was part of the approved Approach A (ADR 32). Locked studies must not change when the product changes.

## Decision

Proposed, not decided.

One shared engine (recipe files, runner, gateway, sandboxes) serves both tracks.
- Research studies pin frozen engine and recipe versions in a locked, hashed study snapshot. The snapshot covers recipe versions, prompts, models, the seeds policy, the analysis plan, the harness commit and container digests.
- The harness refuses any condition outside the frozen matrix.
- The product evolves on newer engine and recipe versions without touching locked studies. This mirrors Lab's separate 'Playground' and locked 'Studies' areas.
- The evaluation side stays a fixed instrument that reads only archived results.

Each study binds every human checkpoint to one of four modes (r_tooling):
- live (the owner acts in the app; extending this to product users is Claude's addition);
- a preregistered policy (confirmatory studies);
- an AI proxy;
- replay of a recorded decision.

Design section 1 (presented to the user on 2026-10-06, awaiting approval) adds five rules and one default:
- A study locks exact versions: one engine release and specific recipe versions, by fingerprint.
- Results flow one way: if a study shows a step adds nothing, the product default changes in a new recipe version; the studied version is never edited.
- Product usage data never enters a confirmatory study; it may feed future studies only with separate consent and a separate preregistration.
- Dependency direction: the evaluation side never imports product code and the product never depends on the evaluation side; the product may reuse cheap automated checks (sameness check, defect check) as features.
- Conflict of interest is declared: the paper states that the authors build a product on this protocol.
- Workspaces from day one: every engine record belongs to a workspace (cheap now, required for a product).

## Alternatives considered

- No alternatives were recorded at the time. Applies to the split between pinned research versions and evolving product versions. The entries below concern how human checkpoints bind.
- **r_arch: ?H handled as Temporal Updates from the studio's human-task inbox, or an automated pick policy chosen per study** — Updates durably record each human approval in the event history, which doubles as an audit trail. Offers two modes (human or policy), not four, so there is no AI proxy or replay.
- **Checkpoints as durable in-workflow waits (signals) without a binding layer (r_tooling)** — Natural for interactive runs, but hides human variance inside runs and makes it harder to swap in a policy.
- **Inspect's intervention/approval mechanism for checkpoints** — Built in, but meant for tool approvals, not multi-day taste decisions.

## Consequences

**Positive**

- Product changes can never alter published results.
- Any checkpoint can be switched between a human, a policy, an AI proxy and a replay without changing the recipe.

**Negative**

- Recipes need explicit versioning and must declare their checkpoints. Every human decision is stored as a hashed artifact.
- Paper claims apply only to the pinned versions, not to whatever the product later runs.

**Follow-ups**

- User to confirm in the system design section.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T07:20:09Z (Claude, Insight) — “The side that runs configurations is what could become a product.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T13:00:55Z — “And the product obviously needs to draw upon the harness itself in some form or shape.”
- [research/2026-10-06-harness-research/ux.md](../research/2026-10-06-harness-research/ux.md) · ## Recommendations > ### Study setup flow — “Locking freezes recipe versions, prompts, models, seeds policy and the analysis plan into a hashed snapshot”
- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Recommendations > ### Reproducibility design — “the harness refuses conditions outside the frozen, preregistered matrix”
- [research/2026-10-06-harness-research/tooling.md](../research/2026-10-06-harness-research/tooling.md) · ## Recommendations > ### Human checkpoints and replication package (build) — “Bind each checkpoint per study to one of:”
- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Recommendations > ### Durable orchestration and how configurations are represented — “?H and pick(H): Temporal Updates sent from the studio's human-task inbox, or an automated pick policy chosen per study.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06 (Claude, design section 1: two tracks on one engine)
