# ADR-0038: Model selection, pinning and routing policy for the studies

| | |
|---|---|
| **Status** | Proposed |
| **Decided by** | Proposed, pending the user's decision |
| **Date (local, UTC−7)** | 2026-10-06 00:17 |
| **Track** | Research design |
| **Related** | [ADR-0025](0025-model-access-four-providers.md), [ADR-0030](0030-own-model-gateway-sole-egress.md), [ADR-0035](0035-study-1-materials-and-arms.md) |

## Context

Model access is approved (ADR 25), but which models to use, and how to pin them, is not. Haiku 4.5 may retire from 2026-10-15 and Sonnet 4.5 retires on 2026-11-30. Claude 4.7+ rejects non-default sampling parameters, and OpenRouter load-balances across providers by default.

## Decision

Proposed, not decided:
- Use current models in every arm: a claude-opus-5-5 worker with effort set explicitly, and a claude-fable-5-1 critic. Do not use the article's exact Opus 5 / Fable 5.
- Use only models whose retirement date is at least 6 months after data collection ends.
- Use stable Gemini IDs, never 'latest' aliases.
- Never set temperature, top_p or top_k on Claude 4.7+. Handle randomness with replicates.
- Record the model string returned on every call.
- Use first-party APIs for every primary arm.
- Use OpenRouter only for models with no first-party access, pinned to one provider with fallbacks off, and log the serving provider.
- Pin the image model (e.g. Gemini 3.1 Flash Image).

## Alternatives considered

- **The article's exact pair (Opus 5 worker, Fable 5 critic)** — An exact-model replication. r_arch lists Opus 5 and Fable 5 as available until at least June and July 2027. That is earlier than the current models' listed dates (from Sept 2027, r_tooling), so they are likely to retire sooner, and whether they meet the 6-month rule depends on when data collection ends. The worker costs ~25% more, and it is less relevant to readers.
- **OpenRouter for everything** — One key, but identical requests can be served by different providers unless pinned, and primary arms would depend on a reseller.
- **Vercel AI Gateway** — Zero markup and per-request provider metadata. Routes across providers unless restricted, and can fall back to Vercel's own credentials.

## Consequences

**Positive**

- Avoids models retiring mid-study and silent switching between providers.

**Negative**

- Paper 1 becomes a replication on current models, not on the article's exact pair, and the methods section must say so.

**Follow-ups**

- User to choose between current models and the article's exact pair.
- Add a model-retirement contingency to the preregistration.
- The gateway (ADR 30) would enforce the pinning and log the serving provider.

## Evidence

- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Recommendations > ### Reproducibility design — “use only models whose retirement is at least 6 months after data collection ends.”
- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Recommendations > ### Reproducibility design — “The article's Fable 5 and Opus 5 are listed as available until at least June and July 2027.”
- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Recommendations > ### Model access layer — “Use first-party APIs for every primary arm.”
- [research/2026-10-06-harness-research/tooling.md](../research/2026-10-06-harness-research/tooling.md) · ## Recommendations > ### Model lifecycle and sampling controls — “Do not set temperature, top_p or top_k on Claude 4.7+: they return a 400 error.”
- [research/2026-10-06-harness-research/study1-draft.md](../research/2026-10-06-harness-research/study1-draft.md) · ## Options > ### Model versions — “Older models are likely retired sooner; worker ~25% more expensive; less relevant to readers.”
