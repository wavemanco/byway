# ADR-0004: Build the protocol through parallel research, adversarial review and a verification pass

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Accepted by continuation (Claude proposed; the user built on it without explicit approval) — needs ratification |
| **Date (local, UTC−7)** | 2026-10-05 21:09 |
| **Track** | Process |
| **Related** | [ADR-0003](0003-stay-faithful-park-off-path-findings.md), [ADR-0005](0005-ground-configurations-in-use-case-research.md), [ADR-0017](0017-mark-additions-keep-c1-article-faithful.md) |

## Context

The user authorized web research and left the method to Claude.

## Decision

The protocol was built in five stages:
1. Technique research: one researcher per technique, plus one on composition.
2. Use-case research: 7 sweeps, then a synthesis agent and a skeptic (ADR 5).
3. Claude drafted the protocol.
4. A six-agent adversarial review checked article fidelity, internal consistency, scope, usefulness and citations.
5. A verification pass re-checked every finding and gave the revised files a fresh read. Claude then fixed what remained.

Corrections are logged in 04 §Corrections. SOURCES.md lists 310 de-duplicated sources and marks with ✓ the ones an agent re-checked.

## Alternatives considered

- No alternatives were recorded at the time.

## Consequences

**Positive**

- The independent passes caught real problems before delivery: missing ⟨A⟩ marks, an unbounded re-seed loop, and success criteria that amounted to evading AI detection.
- The method and its correction log can be cited in a paper's methods section.

**Negative**

- Every researcher and reviewer was a Claude agent, so the review was not independent of the author's model family.
- The verification pass counted 112 findings: 89 resolved, 23 partially resolved and none unresolved, plus 22 new findings from the fresh read. Claude checked its own final fix round; no further independent pass ran. Yet the README says 'Everything both rounds found has been fixed'.

**Follow-ups**

- Ratify this as the documented build method (accepted by continuation).
- Fix two factual inconsistencies. The README says the use-case research covered eleven use cases, while Claude's delivery message says 15. The README should also say whether the final fix round was independently re-verified.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T04:07:29Z — “You have internet access so feel free to research.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T04:09:56Z (Claude) — “I'll run this as a research workflow: one researcher per technique, plus one on how the blocks combine.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T05:51:09Z (Claude) — “Of the 112 findings, 89 are fully resolved, 23 partially, and none unresolved.”
- [protocol/README.md](../../protocol/README.md) · How this was built — “Everything both rounds found has been fixed”
- [protocol/04-use-case-evidence.md](../../protocol/04-use-case-evidence.md) · Corrections
