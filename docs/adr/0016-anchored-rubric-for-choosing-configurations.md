# ADR-0016: Choose configurations with an anchored seven-criterion rubric plus inclusion and veto rules

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Accepted by continuation (Claude proposed; the user built on it without explicit approval) — needs ratification |
| **Date (local, UTC−7)** | 2026-10-05 22:56 (ranked in the synthesis at 21:51; anchored after review) |
| **Track** | Protocol |
| **Related** | [ADR-0005](0005-ground-configurations-in-use-case-research.md), [ADR-0014](0014-seven-configurations-with-distinct-topologies.md), [ADR-0020](0020-c6a-fiction-sounding-board.md) |

## Context

The use-case research produced ranked candidates. The review found that the first rubric had no anchors, that its single evidence criterion mixed evidence of the pain with evidence that the fix works, and that rejected use cases were never scored, so the rubric did not actually decide inclusion.

## Decision

Seven criteria are scored 1–5 against anchors: Pain, Freq, Pull, Evid-pain, Evid-fix, Thesis, Blocks. 04 says a single rater, 'the protocol author', did the scoring, so the numbers are 'structured judgment, not measurement'. In this session that rater was Claude: the synthesis agent's ranking, rescored by Claude after review. The user did not score anything. The rubric informs inclusion but does not decide it alone.

A configuration exists if no veto applies and either:
- its total or its thesis fit is high, or
- it is a standalone form of one of the article's stages (C2).
C4 is the stated exception: it is included on volume as a partial fit. Provisional rows are left out of the ranking.

Rejected use cases carry vetoes, and four of them also carry scores: AI analyst reports (accuracy; 23), SEO at scale (evasion; 23), fiction as a standalone target (24, now served by C6a), and cold outreach (21). Scholarly papers (integrity norms), humanizers (misuse) and platform default (a channel, not a use case) are vetoed without a score.

## Alternatives considered

- **The first rubric: no anchors, one mixed 'Evid' criterion, rejected use cases unscored** — Not auditable, and it did not actually decide inclusion (review finding useful-15; 04 Corrections).
- **Let the rubric total decide which configurations exist, as the draft claimed it did** — Review finding useful-15 showed the draft's rubric never actually did this. Under the final scores, C2 and C4 (22 each) total less than three vetoed use cases (23–24), so totals alone would not reproduce the chosen set.

## Consequences

**Positive**

- Inclusion decisions can be audited. Every rejected use case carries its veto, and most carry their scores.

**Negative**

- A single rater did all the scoring, and that rater was the AI that wrote the protocol, so the scores carry allegiance.
- Evid-fix is low almost everywhere. Whether the protocol's fixes work end to end is its biggest open question.
- C6a was added on request, outside the rubric (ADR 20).

**Follow-ups**

- Ratify (accepted by continuation).
- Disclose in any paper that cites the configuration set that a single AI rater produced the scores. Consider independent human re-scoring.

## Evidence

- [protocol/04-use-case-evidence.md](../../protocol/04-use-case-evidence.md) · Scoring rubric; Rejected (scored, then vetoed); How to read the tables — “The rubric informed which configurations exist, but did not decide it alone.”
- [protocol/04-use-case-evidence.md](../../protocol/04-use-case-evidence.md) · Corrections (rubric row)
- [research/2026-10-05-protocol-build/review-findings.txt](../research/2026-10-05-protocol-build/review-findings.txt) · [useful-15] — “The scores are my judgment, applied consistently”
- [research/2026-10-05-protocol-build/use-case-synthesis.txt](../research/2026-10-05-protocol-build/use-case-synthesis.txt) · ranked use cases #1–#10
