# ADR-0040: Plain-language vocabulary and a recipe-first UX that hides the block grammar

| | |
|---|---|
| **Status** | Proposed |
| **Decided by** | Proposed, pending the user's decision |
| **Date (local, UTC−7)** | 2026-10-06 00:17 |
| **Track** | Product & program |
| **Related** | [ADR-0002](0002-techniques-become-blocks-wired-into-configurations.md), [ADR-0021](0021-build-testing-app-on-evaluation-harness.md), [ADR-0028](0028-build-approach-a-own-engine.md), [ADR-0029](0029-temporal-runner-versioned-recipe-files.md) |

## Context

The user found the way blocks connect too esoteric. The architecture digest (r_arch) argued that the notation is the esoteric part, not the concepts. It added that because the config spec is the single source of truth, a simple UI and exact experiments can coexist. The UX digest (r_ux) turned this into a recipe-first design with plain names.

## Decision

Proposed (r_ux), not decided. Lab never shows more than two levels of detail:
1. Recipe cards. Configurations appear under plain names, e.g. C1 Landing Page Studio, C2 Idea Generator, C6a Fiction Second Reader.
2. A steps strip: Explore → Refine → Finish.
   - Each step has an on/off toggle, so a skip-one test is one click.
   - A 'Who does this?' control offers You / Automatic stand-in / Skip.
   - A read-only wiring diagram sits behind an 'i' button.

Plain names replace protocol terms, for example:
- SEED → Random spark
- CRITIC → Outside critique
- ?H → Your turn
- condition → Variant
- ablation → Skip-one test
- pre-registration → Lock plan
A 'Show technical names' toggle reveals the protocol codes, and every export includes a glossary mapping plain names to codes.

Other choices:
- No node editor in v1.
- Study setup is a single Study sheet, with a live cost and power sidebar.
- 'Apple-grade' means Apple's quality bar in a cross-platform browser app, with HIG principles as acceptance criteria. It does not mean a native macOS app.

## Alternatives considered

- **Plain names only** — Simplest, but breaks traceability to the protocol docs and the methods section.
- **Protocol codes (SEED, CRITIC…)** — No translation layer, but keeps the esoteric feel the user wants removed.
- **r_arch's recipe UX: recipes with a short per-recipe wizard (brief → references → budget → what you'll be asked to decide), a run timeline of plain-language step cards, and the block graph as an advanced read-only toggle** — Same recipe-first idea. It uses a wizard for setup, which r_ux argues against for study setup because the steps depend on each other.
- **A node-graph editor (Runway/ComfyUI-style)** — Full expressiveness, but it is exactly the 'too esoteric' experience, and it makes it easy to build invalid or confounded studies.
- **Pipelines built through chat** — Lowest barrier, but not reproducible enough for a paper, and hard to lock and audit.
- **A linear wizard or YAML-only study setup** — A wizard is familiar but fails when steps depend on each other. YAML is fastest to build but fails 'easy to use'.

## Consequences

**Positive**

- Addresses the user's 'too esoteric' concern without losing traceability to the protocol codes.

**Negative**

- Two vocabularies to maintain.
- New topologies need a recipe file, which only experts edit.

**Follow-ups**

- User to approve the plain names and the two levels of detail in the app design section.

## Evidence

- [research/2026-10-06-harness-research/architecture.md](../research/2026-10-06-harness-research/architecture.md) · ## Recommendations > ### UX approach (hiding the block grammar) — “The esoteric part is the notation, not the concepts.”
- [research/2026-10-06-harness-research/ux.md](../research/2026-10-06-harness-research/ux.md) · ## Recommendations > ### Plain-language vocabulary (replace protocol jargon) — “Stages: D1 Diverge → Explore · D2 Deepen → Refine · D3 Distill → Finish.”
- [research/2026-10-06-harness-research/ux.md](../research/2026-10-06-harness-research/ux.md) · ## Recommendations > ### Hiding the block grammar: recipes over raw graphs — “Don't ship a node editor in v1.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:46:40Z — “Needs to be easy to use (the current way of how blocks work with each other is a bit too esoteric).”
