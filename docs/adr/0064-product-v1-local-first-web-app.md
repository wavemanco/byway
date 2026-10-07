# ADR-0064: Product v1 is a local-first web app on the shared engine

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude decided under the user's instruction "go with the product track. complete it first" ([ADR-0062](0062-code-first-work-mode.md)); not explicitly approved; reversible |
| **Date (local, UTC−7)** | 2026-10-07 10:48 |
| **Track** | Product & program |

## Context

The user asked to complete the product track first. The product's form was an open decision ([ADR-0042](0042-product-north-star-recommend-or-compose.md): recommend or compose a configuration for the user's problem; form still open). Candidate forms in the record were portable layers (a Claude Code skill or an MCP server), a standalone app grown from Lab, and a platform channel (05 §J). The user's first description of the app asked for "a great user interface (with proper backend)… think Apple products".

## Decision

Product v1 is a local-first web app (Next.js) for one user on one machine, built on the shared engine (gateway, runner, store, catalog, validator). Hosted multi-user deployment, auth, billing and the skill/MCP channels come later on the same engine.

## Alternatives considered

- **Portable layers first (skill / MCP)** — cheapest probe and reuses the host agent, but cannot deliver the Apple-grade experience the user described; kept as a later channel.
- **Hosted multi-user app** — adds auth, tenancy, hosting and data-residency work before anyone has used the product; deferred.

## Consequences

**Positive**

- Matches the user's original brief and the engine already chosen (ADR-0028).

**Negative**

- Single-user and local only in v1.

**Follow-ups**

- Revisit the form after first use; the engine stays host-agnostic.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T17:48:15Z — “go with the product track. complete it first. use subagents with dedicated worktrees if needed.”
- [product v1 spec](../superpowers/specs/2026-10-07-product-v1-design.md)
