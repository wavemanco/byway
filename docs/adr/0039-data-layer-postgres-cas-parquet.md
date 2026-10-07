# ADR-0039: Data layer: Postgres and a content-addressed artifact store on WSL ext4, with Parquet data freezes for analysis

| | |
|---|---|
| **Status** | Proposed |
| **Decided by** | Proposed, pending the user's decision |
| **Date (local, UTC−7)** | 2026-10-06 00:17 |
| **Track** | System |
| **Related** | [ADR-0027](0027-publishability-invariants.md), [ADR-0031](0031-hardened-docker-sandboxes-pinned-renderer.md), [ADR-0032](0032-separate-python-evaluation-side.md), [ADR-0037](0037-confirmatory-analysis-and-multiplicity-plan.md) |

## Context

The project folder sits inside OneDrive. Live Postgres files, Temporal's SQLite file and gigabytes of artifacts in a synced folder risk sync conflicts and corruption. Docker bind mounts from /mnt/c are also slow. Paper-grade archives need indefinite retention and open export, but SaaS eval tools keep data for 14–30 days on their base tiers. The confirmatory models need crossed random effects, which the digests recommend fitting in R.

## Decision

Proposed, not decided.

Location:
- Move the code repo and all data directories to the WSL ext4 filesystem (e.g. ~/actai). Only the protocol docs stay in OneDrive.
- Back up with dated snapshots: pg_dump plus an rsync of the artifact store.

Database:
- Postgres, running in Docker.
- Tables for studies, prereg locks, conditions (with spec hash), briefs, runs, steps, seeds, model calls, cost ledger, artifacts, stimuli, judges, raters, assignments, ratings and exclusions.
- Append-only event tables.

Artifacts:
- Stored by SHA-256 content hash on local disk, behind an S3-shaped interface.
- They move to Cloudflare R2 or S3 when deployed.

System of record:
- Kept in open formats the project owns: Inspect .eval logs, Parquet/JSONL manifests and hash-addressed blobs.
- Any SaaS tool is only a mirror or a UI.

Analysis:
- DuckDB attaches Postgres read-only and copies dated, hashed snapshots to Parquet, so every analysis is tied to a data freeze.
- Python (uv-locked) handles judge logs and cost analysis.
- R (renv-locked) handles mixed-effects, ordinal and Bradley-Terry models.
- Reports are rendered with Quarto.

## Alternatives considered

- **Keep the repo and data in the OneDrive-synced project folder (status quo)** — No migration, but risks sync conflicts and corruption, and bind mounts are slow.
- **MinIO, SeaweedFS or Garage for local object storage** — MinIO's community edition has been in maintenance mode since Dec 2025. SeaweedFS and Garage add operational overhead not needed at this scale, and Garage is AGPL.
- **Braintrust / LangSmith / W&B Weave as the system of record** — Polished UIs. But base retention is 14–30 days (Braintrust, LangSmith), and self-hosting needs Enterprise or a licence, which conflicts with archival reproducibility.
- **r_tooling: R brms (cmdstanr) for confirmatory analysis, plus Python Bambi/pandas for exploration** — Ordinal models, crossed random effects, priors and power simulation in one framework, widely accepted by reviewers. Two languages, and Stan compile times.
- **Python only (PyMC/Bambi or statsmodels)** — One language. Weaker support for ordinal mixed models, and more custom code.

## Consequences

**Positive**

- Implements the full-archive invariant (ADR 27) and produces the replication package directly.
- Repeated renders are deduplicated by hash.

**Negative**

- Adds R as a third language. This departs from the approved option text, which put 'stats' on the Python side (ADR 32), although r_arch, the digest behind Approach A, already routed statistics through 'R/Python'.
- Data sits on one disk until it migrates, so a backup routine is required.

**Follow-ups**

- User to decide whether confirmatory statistics run in R or stay in Python.
- Set up the backup routine before the pilot.

## Evidence

- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Risks (first bullet, OneDrive) — “Move the repo and all data directories to the WSL ext4 filesystem (e.g. ~/actai). Keep only the protocol docs in OneDrive.”
- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Recommendations > ### Storage and database — “Postgres (in Docker) is the experiment database.”
- [research/2026-10-06-harness-research/tooling.md](../research/2026-10-06-harness-research/tooling.md) · ## Summary — “Do not make a SaaS eval platform the system of record.”
- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Recommendations > ### Analysis pipeline — “DuckDB ATTACHes Postgres read-only and COPYs frozen snapshots to Parquet, so every analysis is tied to a dated, hashed data freeze.”
- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Summary — “plus DuckDB to Parquet to R/Python for the statistics”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T07:20:11Z (Claude's question, option A text) — “separate Python evaluation side (Inspect AI judges, stats)”
- [research/2026-10-06-harness-research/tooling.md](../research/2026-10-06-harness-research/tooling.md) · ## Recommendations > ### Analysis stack — “Confirmatory analysis in R brms (cmdstanr backend)”
