# ADR-0029: A durable Temporal runner executes each configuration as a versioned recipe file

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-06 06:00 |
| **Track** | System |
| **Related** | [ADR-0010](0010-grammar-chassis-operators-wiring-compatibility.md), [ADR-0019](0019-variants-get-their-own-numbering.md), [ADR-0027](0027-publishability-invariants.md), [ADR-0028](0028-build-approach-a-own-engine.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md) |

## Context

Configurations are long-running, branching workflows with human checkpoints. The approach-A option text named a 'Temporal runner executing recipe files'. Claude's explanation alongside it said each configuration is a versioned file whose fingerprint identifies the condition.

## Decision

Use Temporal for durable orchestration. The engine runs each configuration from a versioned recipe file, a declarative spec, not from hand-written code for each configuration. A leave-one-block-out ablation is the same recipe with one step switched off. The recipe file's hash identifies the condition in the data.

## Alternatives considered

- **Hatchet (r_arch fallback)** — MIT-licensed, needs only Postgres, multi-language SDKs. Younger, with a smaller ecosystem.
- **DBOS Transact (r_tooling's recommendation)** — A library, not a server, running on Postgres or SQLite, and local-first. But all servers in one app must share a language, the community is smaller, and long waits are unverified.
- **Vercel Workflow SDK** — Best TypeScript developer experience. Its self-hosted Postgres backend is a reference implementation, so the real backend is Vercel's, which defeats local-first.
- **Inngest / Prefect / BullMQ** — Inngest's server is SSPL-licensed. Prefect's human input lives in its own UI. BullMQ has no durable step memoization.
- **Hand-code one workflow per configuration** — Rejected in r_arch: the UI could not hide the grammar while experiments stay exact, and a condition would not be identified by a spec hash.

## Consequences

**Positive**

- The app can hide the grammar behind toggles while the experiments stay exact.
- Each condition is identified by a hash, so the data cannot silently mix recipe versions.

**Negative**

- Workflow code must be deterministic.
- Temporal's 2 MB payload limit and its history limits (51,200 events or 50 MB) force three things: passing artifacts by hash, a child workflow per candidate, and continue-as-new for series configurations.
- There is a learning curve. Locally it runs on the Temporal dev server with SQLite persistence; Temporal Cloud later costs about $50 per million actions.

**Follow-ups**

- Choose the recipe format: a JSON spec compiled from the grammar (r_arch) or typed YAML (r_tooling).
- How human checkpoints (?H) bind in each run is only a proposal so far (ADR 41).
- r_tooling advises a 2-day spike before committing.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T07:20:09Z (Claude, Insight) — “Each configuration is a versioned file the engine executes, not hand-written code.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T07:20:11Z (approach option text) — “Temporal runner executing recipe files”
- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Recommendations > ### Durable orchestration and how configurations are represented — “Write ONE interpreter workflow that executes a versioned, hashed, declarative config spec (JSON) compiled from the grammar.”
- [research/2026-10-06-harness-research/tooling.md](../research/2026-10-06-harness-research/tooling.md) · ## Recommendations > ### Outer orchestration and durability — “Fallback: Temporal, if the team grows or workloads spread across machines.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T13:00:55Z — “Option 1 but we need to record this architectural decision”
