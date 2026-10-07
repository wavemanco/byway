# ADR-0023: The harness supports lay, expert-panel and automated/AI judging; the mix is decided per study

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User decision |
| **Date (local, UTC−7)** | 2026-10-05 23:49 |
| **Track** | Research design |
| **Related** | [ADR-0015](0015-success-judged-outside-the-loop.md), [ADR-0032](0032-separate-python-evaluation-side.md), [ADR-0036](0036-study-1-outcomes-and-ai-judges.md) |

## Context

Claude asked who should judge the experiments' outputs and offered four options. It recommended 'Humans primary': lay raters plus a small expert panel as the primary outcome, with automated metrics and held-out AI judges as secondary. The user picked none of the offered options and typed their own answer.

## Decision

Design the harness to support all three judging modes named in options 1–3:
- lay raters (e.g. Prolific);
- an expert panel, including an expert-panel-only study;
- automated metrics plus held-out AI judges.
Which mix a given study uses is decided later. This is the user's own typed answer, not Claude's recommended option. Its wording closely follows the offered 'Not sure yet' option, but it names all three modes explicitly.

## Alternatives considered

- **Humans primary (Claude's recommendation): lay raters plus a small expert panel as primary; automated metrics and held-out AI judges as secondary** — Strongest for journals. Needs ethics/IRB approval.
- **Expert panel only** — Strong on quality claims, with smaller samples. Journals still expect ethics review for human-subject data.
- **Automated + AI judges only** — Cheapest and fastest, but weaker for reputable venues. The protocol also says the loop's critic can't judge success.
- **Not sure yet: support both human and automated judging and decide the mix later** — Defers the choice of mix. The user's answer is close to this option but names lay, expert and automated/AI judging separately.

## Consequences

**Positive**

- The harness can serve any judging mix without a rebuild.

**Negative**

- All three modes must be first-class parts of the harness: the Judge rater app, an expert-panel mode (invite links on the same Judge screen, per r_ux), the AI-judge worker and the metric pipeline.
- Any human judging brings an ethics-review requirement (see open decisions).

**Follow-ups**

- The specific mix for Paper 1 is only a proposal so far (ADR 36).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:48:28Z (CLAUDE-ASKS 'Judges', option 1) — “Humans primary (Recommended)”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:48:28Z (CLAUDE-ASKS 'Judges', option 4 'Not sure yet') — “Design the harness to support both human and automated judging; decide the mix later.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:49:26Z — “Design the harness to support option 1, 2 and 3; we will decide the mix later.”
- [research/2026-10-06-harness-research/ux.md](../research/2026-10-06-harness-research/ux.md) · ## Recommendations > ### Expert and AI-judge queues reuse the Judge UI — “Expert panels use the same Judge screen through invite links.”
