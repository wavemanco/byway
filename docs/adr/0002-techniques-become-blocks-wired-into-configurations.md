# ADR-0002: Generalize the eight techniques into domain-general blocks wired into use-case configurations

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User decision |
| **Date (local, UTC−7)** | 2026-10-05 21:07 |
| **Track** | Protocol |
| **Related** | [ADR-0003](0003-stay-faithful-park-off-path-findings.md), [ADR-0006](0006-blocks-may-sit-out-with-reasons.md), [ADR-0007](0007-eight-block-codes-anatomy-and-glue.md), [ADR-0010](0010-grammar-chassis-operators-wiring-compatibility.md), [ADR-0014](0014-seven-configurations-with-distinct-topologies.md), [ADR-0017](0017-mark-additions-keep-c1-article-faithful.md) |

## Context

Claude had read Chimala's article (Lenny's Newsletter). It describes eight techniques for AI-built UI design as a numbered list, grouped as Discover, Define and Deliver. In one message, the user asked for two things: generalize the techniques beyond design, and turn the list into a protocol with configurations.

## Decision

- Each of the eight techniques becomes one domain-general, composable block (a 'lego'). The user asked for generalization only 'to a certain extent', not without limit.
- The blocks form a protocol. Each use case gets its own configuration, which may wire the blocks in sequence, nested, or in parallel.
- Design stays one use case among many, and one configuration must 'result in the design use case' (the user's words). Claude made that configuration, C1 Studio, reproduce the article's own workflow, and 03 maps the article's technique examples onto its wiring.
- The user asked for a 'map for applying these skills as a coherent system'. It was delivered as 02-grammar.md, 03-configurations.md and a visual map (map/off-center-map.html).

The user set this direction. The block codes, the grammar and the configuration set are Claude's designs and have their own ADRs (7, 10 and 14).

## Alternatives considered

- **Keep the article's numbered list of techniques** — Allows no composition and no per-use-case wiring. The user rejected it ('Right now they form a numbered list.').

## Consequences

**Positive**

- Everything later is built in units of blocks: the grammar, the configurations, the map, and the leave-one-block-out ablations planned for Paper 1.
- C1 gives a replication target tied directly to the article.

**Negative**

- Outside design, the configurations rest on generalization and use-case research, not on the article's own demonstrations.
- The blocks interact in ways that are hard to follow. The user later said 'the current way of how blocks work with each other is a bit too esoteric' and asked that the app be easy to use.

**Follow-ups**

- How the app hides the block grammar is still only a proposal (ADR 40).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T04:07:29Z — “I need you to generalize these steps outside of the design use case the author focuses on.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T04:07:29Z — “I want something that becomes a protocol. And depending on use case, there may be different 'configurations' of the protocol.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T04:07:29Z — “Each technique is basically a lego.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T04:07:29Z — “One of these configurations, should result in the design use case.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:46:40Z — “the current way of how blocks work with each other is a bit too esoteric”
- [protocol/03-configurations.md](../../protocol/03-configurations.md) · C1 · Studio: the article's configuration › How the article's examples map onto this wiring
