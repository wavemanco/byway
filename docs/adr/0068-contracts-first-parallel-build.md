# ADR-0068: Build the product contracts-first, in parallel git worktrees

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude decided under the user's instruction "go with the product track. complete it first" ([ADR-0062](0062-code-first-work-mode.md)); not explicitly approved; reversible. The user explicitly allowed "subagents with dedicated worktrees". |
| **Date (local, UTC−7)** | 2026-10-07 10:48 |
| **Track** | Process |

## Context

The product spans several packages that can be built at the same time. Parallel agents need stable interfaces and isolation.

## Decision

`packages/contracts` defines the gateway, store, runner and advisor interfaces before parallel work starts. Each work package is built test-first in its own worktree (`.worktrees/<name>`, branch `product/<name>`) and may not edit the contracts, root configuration or another package. Branches are merged into `main` only when all tests and the typecheck pass.

## Alternatives considered

- **One agent, sequentially** — simpler merges, much slower.

## Consequences

**Positive**

- Parallel progress with clear seams.

**Negative**

- Merge work and contract changes need coordination.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T17:48:15Z — “go with the product track. complete it first. use subagents with dedicated worktrees if needed.”
- [product v1 spec](../superpowers/specs/2026-10-07-product-v1-design.md)
