# ADR-0032: A separate Python evaluation side runs AI judges (Inspect AI), metrics and statistics

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-06 06:00 |
| **Track** | System |
| **Related** | [ADR-0015](0015-success-judged-outside-the-loop.md), [ADR-0023](0023-harness-supports-three-judging-modes.md), [ADR-0027](0027-publishability-invariants.md), [ADR-0028](0028-build-approach-a-own-engine.md), [ADR-0036](0036-study-1-outcomes-and-ai-judges.md), [ADR-0037](0037-confirmatory-analysis-and-multiplicity-plan.md), [ADR-0039](0039-data-layer-postgres-cas-parquet.md) |

## Context

The protocol requires success to be judged outside the loop: the loop's critic never judges success. Claude argued that separating production from evaluation matters more than which framework is used.

## Decision

Evaluation is a separate Python side, kept apart from the production side in code. r_arch places it as a py/eval worker on its own Temporal task queue inside the monorepo. It runs held-out AI judges through Inspect AI, computes automated metrics and does the statistics. It reads only archived, frozen results and never takes part in generation.

## Alternatives considered

- **Inspect AI as the engine for everything, including generation (approach B / r_tooling)** — Logs reviewers recognise, a sandbox agent bridge and retries. But it mixes the system under test with the test, and has no durable wait for human picks.
- **promptfoo** — Good for CI regression on frozen prompts. Built around single calls per prompt and provider, not multi-stage agent pipelines. OpenAI-owned since 2026-03.
- **OpenAI Evals** — OpenAI is winding the product down.
- **MLflow GenAI** — Self-hostable, with tracing and judges. A generic MLOps shape that needs more glue code.
- **Braintrust / LangSmith / W&B Weave** — Polished UIs. Base retention is 14–30 days, self-hosting requires Enterprise or a licence, and the archival story is weak.
- **A fully custom judging harness** — Total control, but less credible to reviewers than a known framework.

## Consequences

**Positive**

- Enforces in code the protocol rule that the loop's critic never judges success (ADR 15).
- Inspect logs use a format the AI-evaluation community knows, and they can sit next to human ratings under the same stimulus IDs.

**Negative**

- A second language to maintain.
- The approved option text puts 'stats' on the Python side, but the digests recommend R for the confirmatory mixed models. This is unresolved (ADR 39).

**Follow-ups**

- Which AI judges to use, and how to validate them, is only a proposal so far (ADR 36).
- Decide whether confirmatory statistics run in Python or R (ADR 39).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T07:20:09Z (Claude, Insight) — “The side that judges outputs stays a fixed scientific instrument that only reads archived results.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T07:20:11Z (approach option text) — “separate Python evaluation side (Inspect AI judges, stats)”
- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Recommendations > ### Overall architecture — “py/eval: a Python Temporal worker running Inspect AI judges and automated metrics, plus the analysis code.”
- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Recommendations > ### Separate the evaluation plane from the production plane — “Everything that judges reads ONLY bundles”
- [protocol/03-configurations.md](../../protocol/03-configurations.md) · C1 · Studio › Success criteria (judged outside the loop) — “The loop's own critic is never the success judge.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T13:00:55Z — “Option 1 but we need to record this architectural decision”
