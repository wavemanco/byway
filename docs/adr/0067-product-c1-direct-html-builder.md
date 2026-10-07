# ADR-0067: In the product, C1 builds single-file HTML pages by direct model generation and renders them with Playwright

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude decided under the user's instruction "go with the product track. complete it first" ([ADR-0062](0062-code-first-work-mode.md)); not explicitly approved; reversible |
| **Date (local, UTC−7)** | 2026-10-07 10:48 |
| **Track** | System |

## Context

The article's C1 runs a coding agent (Claude Code) that builds a web project. The research harness keeps that fidelity requirement (Docker sandboxes, ADR-0031). The product needs C1 to run on any machine without Docker or agent CLIs.

## Decision

The product's C1 builder asks the worker model for a complete single-file HTML page and renders it with Playwright Chromium (network blocked except font and CDN allowlists). The recipe is unchanged; only the executor differs, and product runs carry no research evidence.

## Alternatives considered

- **Coding-agent CLI in a Docker sandbox** — most faithful; required for Study 1; too heavy for the product's first version.

## Consequences

**Positive**

- C1 runs anywhere Node and Playwright run.

**Negative**

- Single-file pages are less capable than a full project; product results are not comparable with Study 1 arms.

**Follow-ups**

- Offer the agent-CLI executor in the product once sandboxes exist in the engine.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T17:48:15Z — “go with the product track. complete it first. use subagents with dedicated worktrees if needed.”
- [product v1 spec](../superpowers/specs/2026-10-07-product-v1-design.md)
