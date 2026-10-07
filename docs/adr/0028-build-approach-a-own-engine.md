# ADR-0028: Build approach A: own TypeScript engine, a local Lab, a hosted Judge app, and a separate evaluation side

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-06 06:00 |
| **Track** | System |
| **Related** | [ADR-0027](0027-publishability-invariants.md), [ADR-0029](0029-temporal-runner-versioned-recipe-files.md), [ADR-0030](0030-own-model-gateway-sole-egress.md), [ADR-0031](0031-hardened-docker-sandboxes-pinned-renderer.md), [ADR-0032](0032-separate-python-evaluation-side.md), [ADR-0033](0033-parallel-research-and-product-tracks.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md) |

## Context

Six research threads (methods, measures, tooling, Study 1, UX, architecture) produced three build approaches. Claude recommended A, borrowing Inspect AI from B for the AI judges and cloud sandboxes from C for the confirmatory batch. The tooling digest had recommended a different split: Inspect AI as the inner engine plus DBOS. Claude reconciled the digests in favour of A. The user answered 'Option 1', and the first option listed was A.

## Decision

Adopt approach A:
- A TypeScript app and engine with two faces. Lab, the operator app, runs locally. Judge, the rater app that raters reach from Prolific or expert invite links, is hosted, because a laptop cannot be a public endpoint.
- A Temporal runner executes recipe files (ADR 29).
- An in-house model gateway handles all model calls (ADR 30).
- Generation runs in hardened Docker sandboxes, with a pinned screenshot renderer. Cloud sandboxes are used only for the big confirmatory batch (ADR 31).
- A separate Python evaluation side runs the AI judges (Inspect AI), metrics and statistics (ADR 32).

## Alternatives considered

- **B · Inspect-first (Python): Inspect AI runs the configurations and judges; DBOS handles long studies and human checkpoints; a web front end sits on a Python backend** — Fastest route to a credible harness, with a log format the evaluation community knows. But Inspect is a batch eval tool, not an app backend, so the live studio and human checkpoints get bolted on. It mixes the system under test with the test, and the product path is weaker.
- **C · Hosted-first (Vercel): Vercel Workflow, Vercel Sandbox, AI Gateway and hosted Postgres (Neon)** — Deploys in minutes, with massive parallelism and a smooth product path. But it is not local-first and managed versions can't be pinned. Failures on your own keys can be retried on Vercel's credentials, which silently changes who pays. US data residency by default, and vendor lock-in.
- **The tooling digest's split: Inspect AI as the inner execution engine plus DBOS Transact as the outer orchestrator, with only the UI in TypeScript** — Reuses the most plumbing and produces logs reviewers recognise. Same product-path and system-under-test concerns as B.
- **A native macOS app (r_ux)** — Rejected: the owner is on Windows and raters use any desktop browser. Apple-grade is a quality bar, not a platform.
- **Serve raters through a tunnel from the laptop (r_arch)** — Free, but risks uptime and security, and exposes the experiment machine.
- **Qualtrics or Gorilla for rating** — Built-in device restriction and Prolific integration. Clumsy for image-heavy pairwise trials, synced scroll and hotkeys, and their logs are harder to join with run data.

## Consequences

**Positive**

- The best path to a product without a rewrite, e.g. Next.js plus Temporal Cloud, with swappable sandbox providers.
- The system under test stays separate from the test, which enforces the rule that the loop's critic never judges success.
- Lab, the engine and generation run locally for development and pilots. Only Judge is hosted from the start; cloud sandboxes come later, for the confirmatory batch.

**Negative**

- The most custom code of the three approaches (gateway, runner, recipe interpreter), in at least two languages.
- This machine fits only about 5–7 sandboxes at once.
- Judge must be online from day one, which brings hosting, security and data-residency choices.

**Follow-ups**

- The Judge hosting provider and data residency are still open (see open decisions).
- Who needs Lab access, and so whether Lab needs a login, is still open (see open decisions).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T07:20:09Z (Claude) — “I recommend A, borrowing two pieces from the others.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T07:20:11Z (CLAUDE-ASKS 'Approach', option 1) — “A · Own engine + eval side (Recommended)”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T13:00:55Z — “Option 1 but we need to record this architectural decision”
- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Recommendations > ### Public rater endpoint — “The laptop cannot be the public endpoint, so the rater plane is the one part that must be hosted from day one.”
- [research/2026-10-06-harness-research/ux.md](../research/2026-10-06-harness-research/ux.md) · ## Recommendations > ### Overall product shape: two faces, one engine — “'Local-first' therefore applies to Lab only.”
- [research/2026-10-06-harness-research/tooling.md](../research/2026-10-06-harness-research/tooling.md) · ## Summary — “Inspect AI as the inner engine.”
- [research/2026-10-06-harness-research/tooling.md](../research/2026-10-06-harness-research/tooling.md) · ## Questions — “Is a Python backend acceptable, with Inspect, DBOS and the analysis in Python and only the app UI in TypeScript?”
