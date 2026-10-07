# ADR-0024: Evaluation ladder: Paper 1 covers rungs 1+2 (C1 replication plus leave-one-block-out ablations); generalization is Paper 2

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-05 23:54 (reconfirmed 2026-10-06 00:02) |
| **Track** | Research design |
| **Related** | [ADR-0002](0002-techniques-become-blocks-wired-into-configurations.md), [ADR-0021](0021-build-testing-app-on-evaluation-harness.md), [ADR-0022](0022-four-ordered-sub-projects-spec-first.md), [ADR-0026](0026-budget-sized-from-power-analysis.md), [ADR-0034](0034-headless-c1-confirmatory-arm.md), [ADR-0035](0035-study-1-materials-and-arms.md) |

## Context

Claude asked what the first paper should show, with four options: Staged program (recommended), Broad comparison, Block mechanisms and Article replication. Instead of choosing, the user asked whether the options were related. Claude did not answer. It asked a narrower follow-up ('How many rungs should the first paper cover?'), and the user picked 'Rungs 1+2 (Recommended)'.

The user then pointed out that their question had gone unanswered. Claude explained that three of the options were steps on one ladder and the fourth was the whole ladder. It said it would treat steps 1 and 2 as decided unless that changed the user's mind. The user replied 'go with your recommendation.'

## Decision

The research program is a ladder:
1. Replication: does C1 beat a plain prompt and a 'be creative' prompt on design tasks?
2. Mechanisms: remove one block at a time.
3. Generalization: C3, C6a and C2.
4. Coverage: every configuration.

Paper 1 covers rungs 1 and 2 in one experiment with shared tasks, raters and baselines. Rung 3 becomes Paper 2, on the same harness.

## Alternatives considered

- **Rung 1 only (a fast C1 replication)** — Smallest budget and quickest result. Claude argued it is thin, because reviewers will ask which part does the work.
- **Rungs 1–3 in one paper** — The strongest single claim, but the biggest budget and longest timeline. Claude estimated it would roughly double the study.
- **Broad comparison (original framing): several configurations against baselines** — A wider claim, with less depth per configuration and a larger budget.
- **Block mechanisms only (original framing)** — Strongest internal validity, narrower scope. Claude argued ablations can't be interpreted without the baseline effect.
- **Article replication only (original framing)** — Fastest and smallest.

## Consequences

**Positive**

- Rungs 1 and 2 share tasks, raters and baselines. Each ablation is just another condition in the same experiment, judged on the same briefs by the same raters.
- Paper 2 can reuse the same harness.

**Negative**

- Paper 1's claims are limited to design (C1). The text configurations wait for Paper 2, which needs new rater pools and prose measures.
- Claude argued at the time that rungs 1+2 together 'cost little more than step 1'. The later itemized cost model does not bear this out for generation. Of about $144 per brief, the five ablation arms take about $85, against about $60 for C1-H plus the three baselines, even with branched generation (r_study1).

**Follow-ups**

- Rung 4, the 'coverage program', is Claude's framing and was not separately approved.
- The exact arms, baselines and outcomes are still proposals (ADRs 34–37).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:51:04Z — “aren;t these four options related somehow, evolving from one to the other in some way?”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:54:47Z — “Rungs 1+2 (Recommended)”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:59:07Z — “I asked a question here and never got a response.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:59:57Z (Claude) — “I'm treating steps 1 and 2 as decided unless this changes your mind.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:59:57Z (Claude) — “Together they cost little more than step 1.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T07:02:27Z — “go with your recommendation.”
- [research/2026-10-06-harness-research/study1-draft.md](../research/2026-10-06-harness-research/study1-draft.md) · ## Recommendations > ### Itemized cost model (shown before any spend) — “Per brief at K=4: C1-H $38, -SEED $31, CRITIC-self $29, -CRITIC $15, -ASSET $10, -D3 $0”
