# ADR-0025: Model access: Anthropic, OpenAI, Google Gemini and OpenRouter, with more added as needed

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User decision |
| **Date (local, UTC−7)** | 2026-10-05 23:55 |
| **Track** | Research design |
| **Related** | [ADR-0009](0009-api-key-fencing-constraints.md), [ADR-0030](0030-own-model-gateway-sole-egress.md), [ADR-0038](0038-model-selection-pinning-and-routing.md) |

## Context

Claude asked which model access the user has, or would set up, for the experiments. It was a multi-select with four options: Anthropic, OpenAI, Google Gemini and fal.ai. The user typed a custom answer. It named Anthropic, OpenAI and Gemini, added OpenRouter (which was not offered), did not name fal.ai, and ended 'we can get what we need.'

## Decision

The experiments can draw on Anthropic, OpenAI, Google Gemini and OpenRouter. The user will set up further access when it is needed. fal.ai was not named, but it was not ruled out.

## Alternatives considered

- **fal.ai key (offered; not named by the user)** — One key for many image and video models (ASSET, RELAY). Needed for C1's optional video step and later for C5.

## Consequences

**Positive**

- Three model families plus a router make cross-family critics and judges possible.

**Negative**

- fal.ai is not set up yet. The option text said it is needed for C1's optional video step (RELAY) and later for C5. Study 1 is proposed to exclude RELAY anyway (ADR 35).
- By default, OpenRouter load-balances identical requests across providers, so it needs provider pinning (ADR 38, proposed).

**Follow-ups**

- Which model versions to use is still a proposal (ADR 38).
- 'we can get what we need' leaves room to add providers later, e.g. fal.ai for media work in Paper 2 and beyond.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:54:57Z (CLAUDE-ASKS 'Model access', fal.ai option) — “One key for many image and video models (ASSET, RELAY). Needed for C1's optional video step and later for C5.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:55:55Z — “Anthropic, OpenAI, Gemini, Openrouter - we can get what we need.”
- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Recommendations > ### Model access layer (Anthropic, OpenAI, Gemini, OpenRouter, fal) — “By default OpenRouter load-balances, so identical requests can be served by different providers.”
