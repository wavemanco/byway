# ADR-0020: C6a Fiction Sounding Board, with C6's fiction line pointing to it

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-05 23:27 (pointer approved 23:46) |
| **Track** | Protocol |
| **Related** | [ADR-0006](0006-blocks-may-sit-out-with-reasons.md), [ADR-0014](0014-seven-configurations-with-distinct-topologies.md), [ADR-0016](0016-anchored-rubric-for-choosing-configurations.md), [ADR-0019](0019-variants-get-their-own-numbering.md) |

## Context

Claude answered the fiction question with C6, with C2 in front. It noted that C6's reason for benching SEED (content must be true facts about the sender) does not apply to fiction. It offered a fiction mode that restores SEED and VISION and adds a fiction tell catalog. The user accepted, with the numbering change in ADR 19. Claude then set the variant's specific parameters and delivered them at 23:33. The user's next message approved the C6 pointer without commenting on those parameters.

## Decision

C6a keeps C6's inverted authorship: the author writes every sentence, and the blocks only annotate. It adds:
- Seeded premise/form cards: SEED ×6, plus a vanilla ×3 overlap flag.
- A VISION story brief written for the author, not for a drafting agent.
- A fiction TELLS catalog, with categories from Chakrabarty, Laban & Wu (CHI 2025).
- A CRITIC from a model family that never touched the text, ranking pages against at least 4 published passages.

ASSET and RELAY sit out. The declared exceptions are the same as C6's (rules 4 and 7).

Guardrails:
- published passages only, never other writers' unpublished manuscripts;
- no fine-tuning or style imitation of a named living author's books;
- the publisher's or venue's disclosure rules apply;
- no detector scores.

The chooser now asks about fiction before the series question. The 04 card records that C6a was added on request, not chosen by the research. C6's description now points to C6a.

The user approved the concept. The specific counts and guardrails are Claude's, accepted by continuation.

## Alternatives considered

- **Plain C6 with C2 in front (Claude's first answer)** — C6 benches SEED, though fiction is one of SEED's strongest domains.
- **C3 Voice Series, if the AI is to draft** — The evidence ties sameness to model-written text, so AI should be kept to outlines and angles.

## Consequences

**Positive**

- Fiction now has a configuration whose authorship model matches the evidence: the human writes and the blocks only annotate.

**Negative**

- The use-case research still rejects fiction as a standalone market target. C6a exists by request, outside the rubric (ADR 16).
- The critic is the weak link for prose. It needs GREAT mode with published exemplars and a model from a different family.

**Follow-ups**

- Ratify C6a's specific parameters (×6 seeds, ×3 vanilla runs, at least 4 published passages, the guardrails), which Claude set after the user approved the concept.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:25:15Z (Claude offer) — “I can add a "Fiction mode" to C6 that puts SEED and VISION back in”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:27:57Z — “yes, add the fiction mode to C6”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:33:30Z (Claude delivery of C6a specifics)
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:46:40Z — “yes, point C6's fiction line to C6a.”
- [protocol/03-configurations.md](../../protocol/03-configurations.md) · C6a · Fiction Sounding Board: a variant of C6; C6 · Sounding Board (intro pointer); Choosing a configuration
- [protocol/01-blocks.md](../../protocol/01-blocks.md) · TELLS catalog, ⟨A⟩ Fiction (C6a) row
- [protocol/04-use-case-evidence.md](../../protocol/04-use-case-evidence.md) · Fiction → C6a (variant added on request)
