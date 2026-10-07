# ADR-0030: An in-house model gateway handles every model call: it logs each call, caps spend and keeps keys out of sandboxes

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-06 06:00 |
| **Track** | System |
| **Related** | [ADR-0009](0009-api-key-fencing-constraints.md), [ADR-0025](0025-model-access-four-providers.md), [ADR-0026](0026-budget-sized-from-power-analysis.md), [ADR-0028](0028-build-approach-a-own-engine.md), [ADR-0031](0031-hardened-docker-sandboxes-pinned-renderer.md), [ADR-0038](0038-model-selection-pinning-and-routing.md) |

## Context

Publishable results need every call logged and costed, and generated code is untrusted. The tooling and architecture digests both report that the LiteLLM PyPI package was compromised on 2026-03-24 and stole environment keys from proxy hosts. The approach-A option text named an 'own model gateway'. Claude's description said it logs every call, caps spend and keeps keys out of sandboxes.

## Decision

All model traffic goes through a small gateway the project builds and controls. It logs every call, enforces spend caps, and holds the API keys so that keys never enter a sandbox.

## Alternatives considered

- **LiteLLM proxy** — Covers many providers and injects credentials. But it is an extra Python service that holds every key, and its PyPI package was compromised on 2026-03-24.
- **Vercel AI Gateway** — No markup, budgets and zero data retention. But it adds a cloud hop, falls back to Vercel's credentials when your own keys fail, and its budgets are soft caps. Fits approach C.
- **OpenRouter for everything** — One key and one API. But by default it sends identical requests to different providers, and the primary arms would depend on a reseller.
- **Direct provider APIs through Inspect's native providers, with no gateway (r_tooling)** — Cleanest provenance: exact model IDs, native batch and Files API, no hidden fallbacks. But several keys and invoices, and the cost meter must be built in-house.

## Consequences

**Positive**

- Keys, costs and logs live in one audited place, which feeds the cost ledger behind the budget decision (ADR 26).
- Extends the KEYS rules (ADR 9): keys never enter a sandbox.

**Negative**

- Custom code to maintain, including streaming and tool-call pass-through for each provider.
- Every run depends on it, so it is a single point of failure.

**Follow-ups**

- The architecture digest proposes details that have not yet been decided. The gateway would be the only network path out for model traffic. It would log hashes, the model ID actually served, provider, tokens, cost and latency. It would apply hard stops and inject keys. Agent CLIs would reach it through base-URL environment variables. Its dependencies would be pinned by hash and kept minimal.
- Provider pinning and OpenRouter routing rules are only proposed so far (ADR 38).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T07:20:09Z (approach table, column A) — “A small model gateway logs every call, caps spend and keeps keys out of sandboxes.”
- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Recommendations > ### Model access layer (Anthropic, OpenAI, Gemini, OpenRouter, fal) — “Build a thin TypeScript model gateway that is the only egress for model traffic.”
- [research/2026-10-06-harness-research/tooling.md](../research/2026-10-06-harness-research/tooling.md) · ## Recommendations > ### Model access, routing, cost tracking and version pinning — “Do not put a LiteLLM proxy in the trust path.”
- [research/2026-10-06-harness-research/tooling.md](../research/2026-10-06-harness-research/tooling.md) · ## Options > ### Model access and routing — “Cost meter must be built in-house”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T13:00:55Z — “Option 1 but we need to record this architectural decision”
