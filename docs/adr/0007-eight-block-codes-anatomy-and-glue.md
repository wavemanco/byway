# ADR-0007: Eight block codes with a standard anatomy, plus glue connectors that are not blocks

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Accepted by continuation (Claude proposed; the user built on it without explicit approval) — needs ratification |
| **Date (local, UTC−7)** | 2026-10-05 21:25 (dedupe glue added after the first review) |
| **Track** | Protocol |
| **Related** | [ADR-0002](0002-techniques-become-blocks-wired-into-configurations.md), [ADR-0009](0009-api-key-fencing-constraints.md), [ADR-0010](0010-grammar-chassis-operators-wiring-compatibility.md), [ADR-0011](0011-typed-ports-and-hard-port-rules.md) |

## Context

The technique research returned one generalized write-up per technique, under working names such as 'External Dice Seeding'. The article also relies on steps between techniques that it never names: screenshots, build briefs, model tiering, API keys, and saving failed prompts.

## Decision

There are eight blocks with fixed codes:
- SEED External Seeding (T1)
- VISION Taste-Steered Brief (T2)
- CRITIC Blind Critic Loop (T3)
- ASSET Specialist Asset (T4)
- RELAY Specialist Relay (T5)
- CUT Subtraction Pass (T6)
- TELLS Tell Sweep & Swap (T7)
- VOICE Human Voice Pass (T8)

Each block states: the model tendency it counters, its core move, its procedure, its typed ports, its knobs (article default first), its guards, a fit-by-domain table, its wiring rules, its evidence, and what it keeps from the article versus what it adds. Two forces run through all eight. Variety and taste come from outside the model's default. Judgment is kept separate from production.

The unnamed steps are glue: adapters, not techniques, and never counted as blocks.
- RENDER: artifact to view
- BRIEF: direction to executable prompt
- TIER: big or mid model per role
- KEYS: scoped credentials
- BANK: failed prompts with model and date
- ?H: human checkpoint
- dedupe ⟨A⟩: used in C2 (added after the first review)

## Alternatives considered

- **The researchers' working names (e.g. 'External Dice Seeding') and T1..T8 tokens** — No tradeoff was recorded for the renaming. The final codes are used across 02, 03 and the map.
- **The grammar researcher's glue set: g:taste, g:brief, g:render, g:blind, g:gate, g:tier, g:secrets, g:bank** — No tradeoff was recorded. In the final protocol g:blind became the isolate operator (@role:tier(ports)), g:gate (hidden stopping rule with probe) became the loop-until flags (!hidden, probe, max), g:taste became ?H and g:secrets became KEYS.
- **Use CUT to merge near-duplicates in C2 (earlier draft)** — Put a Distill block inside Diverge. Replaced by dedupe glue (review finding scope-9).

## Consequences

**Positive**

- The codes are the shared vocabulary of the grammar, the configurations, the map and any executable recipe file.
- Ablations have a clean unit: remove one block and keep the glue.
- RENDER produces the view, which with human-supplied refs is all the critic may receive (port rule 1). That makes critic isolation enforceable.

**Negative**

- The codes are jargon to anyone who did not write the protocol, so an app has to translate them.
- Glue steps such as render quality and brief wording can affect results, but they are not themselves ablated.

**Follow-ups**

- Ratify (accepted by continuation).

## Evidence

- [protocol/01-blocks.md](../../protocol/01-blocks.md) · The one idea underneath all eight
- [protocol/01-blocks.md](../../protocol/01-blocks.md) · Glue: connectors the article relies on but never names
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T04:20:44Z (workflow result, block_name 'External Dice Seeding') and 04:25:12Z (Claude) — “Block library written.”
- session working file wf1.json (not preserved) · grammar.notation_proposal / grammar.glue_blocks
- [protocol/02-grammar.md](../../protocol/02-grammar.md) · 3. Ports › Port rules (hard invariants), rule 1
- [research/2026-10-05-protocol-build/review-findings.txt](../research/2026-10-05-protocol-build/review-findings.txt) · [scope-9]
