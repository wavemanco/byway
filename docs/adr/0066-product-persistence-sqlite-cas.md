# ADR-0066: Product persistence: node:sqlite records and content-addressed artifact files outside the repo

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude decided under the user's instruction "go with the product track. complete it first" ([ADR-0062](0062-code-first-work-mode.md)); not explicitly approved; reversible |
| **Date (local, UTC−7)** | 2026-10-07 10:48 |
| **Track** | System |

## Context

The product needs durable records (workspaces, runs, events, checkpoints) and artifacts. [ADR-0039](0039-data-layer-postgres-cas-parquet.md) (proposed) recommended Postgres for the research harness. A local single-user product does not need a database server; Node 24 ships `node:sqlite`.

## Decision

The product stores records in SQLite through `node:sqlite` and artifacts in a content-addressed file store, both in `BYWAY_DATA_DIR` (default `%LOCALAPPDATA%\byway` on Windows, `~/.byway` elsewhere; never in OneDrive or the repo). Product data is separate from any research store and never feeds a study (ADR-0041 rule 3). The research harness may still choose Postgres.

## Alternatives considered

- **Postgres in Docker** — heavier to run locally for one user; still an option for the harness.

## Consequences

**Positive**

- No database server to run; one file to back up.

**Negative**

- `node:sqlite` is still marked experimental in Node 24.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T17:48:15Z — “go with the product track. complete it first. use subagents with dedicated worktrees if needed.”
- [product v1 spec](../superpowers/specs/2026-10-07-product-v1-design.md)
