# ADR-0014: Seven configurations with distinct topologies, one specification contract, a chooser and a recipe; the platform configuration (former C8) moved out

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Accepted by continuation (Claude proposed; the user built on it without explicit approval) — needs ratification |
| **Date (local, UTC−7)** | 2026-10-05 22:24 (delivered 22:56) |
| **Track** | Protocol |
| **Related** | [ADR-0003](0003-stay-faithful-park-off-path-findings.md), [ADR-0005](0005-ground-configurations-in-use-case-research.md), [ADR-0006](0006-blocks-may-sit-out-with-reasons.md), [ADR-0016](0016-anchored-rubric-for-choosing-configurations.md), [ADR-0018](0018-correctness-outside-v1-verify-parked.md), [ADR-0019](0019-variants-get-their-own-numbering.md), [ADR-0020](0020-c6a-fiction-sounding-board.md) |

## Context

The configurations had to differ in how the blocks connect, not just in settings, and the user asked that they be grounded in use-case research. The use-case synthesis proposed eight configurations, including a headless Platform Guardrail. The review found that this one was wired almost entirely from off-path capabilities, and it has no human taste in the loop.

## Decision

There are seven configurations:
- C1 Studio: the article's own workflow (pages, apps, decks, brand systems).
- C2 Divergence Engine: D1 only. Its output is a decision, and it can feed C1, C3 or C5 as a configuration-as-block.
- C3 Voice Series: an outer loop across a series, with a portfolio review every 5 pieces.
- C4 Reader-Ready: a short linear chain for internal documents. A partial fit.
- C5 Media Relay: a chain of specialists. Its Still and Video modes are provisional, and Video needs an evasion-risk screen before use at scale.
- C6 Sounding Board: inverted authorship, where the human writes and parallel auditors only annotate.
- C7 Lean Diff: agent-written code. Adjacent to the article (ADR 18).

Each configuration states:
- its pain, with counter-evidence and market;
- its wiring, in notation and as a diagram;
- block roles, and sit-outs with reasons;
- stop rules, cost and a lite profile;
- success criteria judged outside the loop;
- declared exceptions and ⟨A⟩ amendments.
A decision-tree chooser routes users to a configuration. A 10-step recipe covers building a new one.

The former C8, Platform Guardrail, is removed from the set. It now lives in 05 §J as a channel candidate, with sketch wiring, its external dependencies and guardrails, and 03 keeps a short pointer to it. Claude told the user this was one of 'Two scope calls of mine'. Later, Claude chose not to reuse the number C8 for the fiction variant, to avoid confusion (ADR 19).

## Alternatives considered

- **The synthesis's eight proposed configurations, including Headless Platform Guardrail, under different names (Studio Build, Seeded Angle to Owned Voice, Lean Diff Gate, Media Pipeline, Human-Led Sounding Board)** — The platform configuration breaks the user's scope rule because it rests on off-path machinery. The others were renamed.
- **Keep C8, but have VISION and CRITIC sit out and list its external dependencies** — The reviewer's Option B. Still mostly machinery outside the blocks (review finding scope-2).
- **Keep C8 and add a guardrails block** — Proposed in review finding useful-2. Addresses misuse but not the scope problem.

## Consequences

**Positive**

- Defines what 'test every configuration' covers: C1–C7 plus C6a.
- Keeps v1 inside the user's scope rule (ADR 3).

**Negative**

- Three configurations are weaker fits: C4 is partial, C5's modes are provisional, and C7 is adjacent.
- The likeliest distribution channel (AI app builders, coding-agent vendors and skill authors, per 05 §J) is outside v1.
- The visual map has to be kept in sync with 03 by hand, as the C6a patch showed.

**Follow-ups**

- Ratify, including the C8 move. The user was told about it but never explicitly approved it.

## Evidence

- [protocol/03-configurations.md](../../protocol/03-configurations.md) · # 03 · Configurations (topology table); Choosing a configuration; Building a new configuration — “They differ in topology, not just settings”
- [research/2026-10-05-protocol-build/use-case-synthesis.txt](../research/2026-10-05-protocol-build/use-case-synthesis.txt) · ## RECOMMENDED CONFIGS
- [protocol/05-more-to-explore.md](../../protocol/05-more-to-explore.md) · J. Channel candidate: Platform Guardrail — “This was configuration C8 in an earlier draft.”
- [research/2026-10-05-protocol-build/review-findings.txt](../research/2026-10-05-protocol-build/review-findings.txt) · [scope-2], [useful-2]
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T05:24:44Z and 05:56:31Z (Claude) — “A headless platform-level configuration was moved to More to Explore because it relies mostly on off-path parts.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:28:55Z (Claude) — “I'm not using C8 because an earlier draft used that number for the platform configuration”
