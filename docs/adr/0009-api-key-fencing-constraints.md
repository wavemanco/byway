# ADR-0009: Fence API keys: separate capped keys in a gitignored file, never in artifacts

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Accepted by continuation (Claude proposed; the user built on it without explicit approval) — needs ratification |
| **Date (local, UTC−7)** | 2026-10-05 21:25 |
| **Track** | Process |
| **Related** | [ADR-0007](0007-eight-block-codes-anatomy-and-glue.md), [ADR-0011](0011-typed-ports-and-hard-port-rules.md), [ADR-0030](0030-own-model-gateway-sole-egress.md) |

## Context

ASSET and RELAY call external generators that need API keys. The article prescribes basic developer key hygiene. The research also found that AI-assisted commits leaked secrets at 3.2% vs. a 1.5% baseline (GitGuardian 2026, cited in 01 ASSET guards).

## Decision

The article's key hygiene is adopted as the KEYS glue:
- Use separate, revocable keys with tight spend caps, used only locally by the agent and never stored in code or the product.
- Keep them in a gitignored .env.agents file. The article gives this as a tip for people who paste keys often. The 06 runbook makes it the standard setup and adds: put the file in .gitignore before the first key goes in.
- State in AGENTS.md/CLAUDE.md that the keys are for development only and must never ship.

The cred port flows only to generator tool calls. Port rule 3 says credentials never enter the artifact. A critic from a different model family reads its key from .env.agents through a script.

## Alternatives considered

- **OAuth/MCP access to generator catalogs (e.g. fal's hosted MCP)** — Keeps credentials out of prompts and files. Listed as a likely successor (05 §D).
- **Enterprise secrets governance (vaults, short-lived tokens)** — Far heavier than the article's developer-key hygiene (05 §D).

## Consequences

**Positive**

- Sets a security baseline that later system work must not weaken. The harness gateway builds on it by keeping keys out of sandboxes entirely (ADR 30).

**Negative**

- This is developer-key hygiene only. There is no vault and no short-lived tokens, which a hosted product would need.

**Follow-ups**

- Ratify. These rules come from the article and the runbook, not from an explicit user instruction.

## Evidence

- [protocol/01-blocks.md](../../protocol/01-blocks.md) · ASSET › Procedure step 4 (Fence the credentials); ASSET › Guards (Key leakage); Glue (KEYS)
- [protocol/02-grammar.md](../../protocol/02-grammar.md) · Port rules (hard invariants), rule 3 — “Seeds and credentials never enter the artifact.”
- [protocol/06-runbook.md](../../protocol/06-runbook.md) · C1 · Studio › 0 · Setup; 2 · Critic isolation
- [protocol/05-more-to-explore.md](../../protocol/05-more-to-explore.md) · D. Generation infrastructure and specialist tooling
- the article (Chimala, Lenny's Newsletter, Sep 1 2026; PDF at C:/Users/arvik/Downloads/protocol.pdf), via Claude's reading notes · TECHNIQUE 4
