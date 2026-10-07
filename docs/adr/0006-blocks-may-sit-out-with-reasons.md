# ADR-0006: Blocks may sit out of a configuration, and every sit-out is declared with a reason

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User decision |
| **Date (local, UTC−7)** | 2026-10-05 21:15 |
| **Track** | Protocol |
| **Related** | [ADR-0002](0002-techniques-become-blocks-wired-into-configurations.md), [ADR-0014](0014-seven-configurations-with-distinct-topologies.md), [ADR-0020](0020-c6a-fiction-sounding-board.md) |

## Context

The configurations were about to be designed.

## Decision

A configuration may leave some blocks out. 02 §5 defines when each block sits out. Every configuration declares its sit-outs with reasons. 03's coverage table marks each block in each configuration as central, optional, reduced or sitting out.

The user set the rule. Requiring a stated reason for every sit-out was Claude's addition.

## Alternatives considered

- No alternatives were recorded at the time.

## Consequences

**Positive**

- Configurations stay lean, and what each one leaves out is explicit. For example, C6 leaves out SEED because its content must be true facts about the sender, and C7 leaves out SEED, ASSET and RELAY.
- Declaring sit-outs is step 7 of the recipe for building a new configuration, so the rule carries forward.

**Negative**

- A block that sits out cannot be ablated in that configuration. Later studies can only test the blocks each configuration actually uses.

**Follow-ups**

- Ratify the requirement to state a reason, which Claude added to the user's rule.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T04:15:56Z — “Note that some configurations might let a few 'blocks' sit out and that is fine.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T04:16:25Z (Claude) — “each one can say which blocks sit out and why”
- [protocol/02-grammar.md](../../protocol/02-grammar.md) · 5. When a block sits out
- [protocol/03-configurations.md](../../protocol/03-configurations.md) · Block coverage
