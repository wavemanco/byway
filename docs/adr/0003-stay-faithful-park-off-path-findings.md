# ADR-0003: Stay faithful to the article and park off-path findings in More to Explore

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User decision |
| **Date (local, UTC−7)** | 2026-10-05 21:07 |
| **Track** | Process |
| **Related** | [ADR-0002](0002-techniques-become-blocks-wired-into-configurations.md), [ADR-0014](0014-seven-configurations-with-distinct-topologies.md), [ADR-0017](0017-mark-additions-keep-c1-article-faithful.md), [ADR-0018](0018-correctness-outside-v1-verify-parked.md) |

## Context

The user authorized web research, expected it to turn up techniques quite different from the article's, and wanted the generalization to stay close to the source.

## Decision

The user set the rule: generalize the techniques only 'to a certain extent', don't veer far off the article, and file findings that are quite different as 'More to Explore' items.

Claude formalized it in three ways:
- The scope rule in 01-blocks.md: 'a block generalizes the article's technique and nothing more'.
- Every protocol addition is marked ⟨A⟩, so the article-faithful version stays recoverable.
- Substantially different findings go to 05-more-to-explore.md, each with a stated reason it is off-path.

Two parts of 05 are also Claude's: the grouping into sections A–J, and a shortlist of 8 candidates for future blocks. Claude saved the preference to memory at 2026-10-05 22:32.

## Alternatives considered

- No alternatives were recorded at the time.

## Consequences

**Positive**

- The core protocol stays small and can be checked against the article.
- The rule became a lens in the review (scope discipline). It also underlies two moves Claude called 'scope calls': moving the platform configuration out (ADR 14; 05 §J cites the user's scope) and labelling C7 'adjacent' on thesis fit (ADR 18).
- About 70 off-path findings are kept, not lost. They include VERIFY, the top v2 candidate.

**Negative**

- Some well-evidenced methods that are not in the article are left out of v1, and so out of what Paper 1 tests. Examples are multi-family judge panels and learned critics.
- There are many ⟨A⟩ additions, so 'nothing more' holds only for the unmarked core. Readers must use the ⟨A⟩ marks to recover the article-faithful version.

**Follow-ups**

- Any step Study 1 adds to C1 that the article lacks should be marked as an amendment under this rule (ADR 17). Examples: freezing the critic calibration, and the automatic stand-in for D3.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T04:07:29Z — “if you find things that are quite different then what is mentioned in the article, file them as "More to Explore" items later.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T04:07:29Z — “But I don;t want to veer too much off the path here.”
- [protocol/01-blocks.md](../../protocol/01-blocks.md) · # 01 · The Block Library › How to read each block (Scope rule) — “a block generalizes the article's technique and nothing more.”
- [protocol/05-more-to-explore.md](../../protocol/05-more-to-explore.md) · Shortlist: strongest candidates for a future block; J. Channel candidate: Platform Guardrail
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T05:56:31Z (Claude) — “Two scope calls of mine.”
- Claude project memory: scope-discipline-more-to-explore.md · whole file
