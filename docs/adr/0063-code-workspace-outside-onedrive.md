# ADR-0063: The code checkout lives outside OneDrive, at C:\Users\arvik\code\byway

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude decided under the user's instruction to proceed with code ([ADR-0062](0062-code-first-work-mode.md)); not explicitly approved; reversible |
| **Date (local, UTC−7)** | 2026-10-07 09:45 |
| **Track** | System |
| **Related** | [ADR-0039](0039-data-layer-postgres-cas-parquet.md), [ADR-0060](0060-repository-byway-private-remote.md) |

## Context

The byway repository ([ADR-0060](0060-repository-byway-private-remote.md)) was initialised in the ActAI folder, which sits in OneDrive. The architecture research warned that live database files, thousands of `node_modules` files and gigabytes of artifacts in a synced folder risk sync conflicts and corruption, and recommended the WSL ext4 filesystem ([ADR-0039](0039-data-layer-postgres-cas-parquet.md), proposed). This machine has Node 24, pnpm 11, Python 3.13, uv and Docker 29.5.3 on Windows, and a running Ubuntu WSL distribution; the Claude Code session's tools run on Windows.

## Decision

- The working checkout for code is `C:\Users\arvik\code\byway`, a clone of `wavemanco/byway`, on the Windows filesystem outside OneDrive.
- Postgres and other service data live in Docker named volumes, not in bind-mounted folders; generated artifacts go to a gitignored data directory outside OneDrive.
- The OneDrive `ActAI` checkout becomes an old copy once the clone exists: all further commits are made in the code checkout. The user can delete or keep the OneDrive copy.
- WSL ext4 remains an option if file-system performance becomes a problem (for example, heavy Docker bind mounts during confirmatory generation).

## Alternatives considered

- **Keep working in the OneDrive folder** — rejected: sync conflicts and corruption risk for `node_modules`, databases and artifacts.
- **WSL ext4 (`~/byway` in Ubuntu)** — fastest for Docker and installs, but every command and file edit in this session would cross the Windows/WSL boundary; kept as a later option.

## Consequences

**Positive**

- No OneDrive sync of build output or live data.
- Session tools work natively.

**Negative**

- Two checkouts exist until the OneDrive copy is retired; edits made there would drift.
- Docker bind mounts from Windows paths are slower than from ext4.

## Evidence

- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Risks (first bullet)
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T16:40:58Z — “Let's code.”
