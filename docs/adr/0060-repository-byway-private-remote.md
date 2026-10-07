# ADR-0060: Version control: a git repository named byway, with a private GitHub remote (wavemanco/byway)

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User decision |
| **Date (local, UTC−7)** | 2026-10-07 06:35 |
| **Track** | Process |
| **Related** | [ADR-0057](0057-tamper-evident-record-and-disclosure.md), [ADR-0001](0001-record-architecture-decisions-as-adrs.md) |

## Context

Charter rule CR14 calls for a tamper-evident record under version control from today. Claude offered three options: local git with a remote later; local git plus a public GitHub repository; or not yet. The user answered with their own option.

## Decision

The user's answer: "local git (but this won't be called ActAI.  Name it byway) + private remote repo (push to: https://github.com/wavemanco/byway)".

- The repository is named **byway**, not ActAI.
- It has a **private** remote at https://github.com/wavemanco/byway (verified to exist, private and empty before the first push).
- The local folder on this machine is still named ActAI; renaming it is a separate step (it moves the working directory of the session).
- CR14 still requires public, timestamped records (research ADRs, the Program Registry, milestone snapshots) before the first Stage 0 registration. A private repository alone does not meet that; a public mirror or archived snapshot will be needed.

## Alternatives considered

- **Local git now, remote later** (recommended by Claude; not chosen).
- **Local git plus a public GitHub repository now** — not chosen.
- **Not yet** — not chosen.

## Consequences

**Positive**

- Version history starts now; ADR changes become diffable.

**Negative**

- The folder still sits in OneDrive, which can conflict with git under heavy churn; the code repository may later live on the WSL filesystem ([ADR-0039](0039-data-layer-postgres-cas-parquet.md), proposed).

**Follow-ups**

- Decide how CR14's public record is published (public mirror of research ADRs and registry, or archived snapshots) before Stage 0.
- Set up commit signing and branch protection (CR14).
- Decide whether to rename the local folder to byway.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T13:35:51Z — “local git (but this won't be called ActAI.  Name it byway) + private remote repo”
