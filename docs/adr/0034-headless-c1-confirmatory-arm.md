# ADR-0034: Use a headless C1 ('C1-H') as Paper 1's confirmatory arm, and test human-in-the-loop C1 separately

| | |
|---|---|
| **Status** | Proposed |
| **Decided by** | Proposed, pending the user's decision |
| **Date (local, UTC−7)** | 2026-10-06 00:17 (surfaced to the user 00:20) |
| **Track** | Research design |
| **Related** | [ADR-0008](0008-critic-blind-render-only-hidden-threshold.md), [ADR-0012](0012-loop-failure-semantics-and-budget-model.md), [ADR-0017](0017-mark-additions-keep-c1-article-faithful.md), [ADR-0024](0024-evaluation-ladder-paper-one-scope.md), [ADR-0035](0035-study-1-materials-and-arms.md) |

## Context

C1 as the article ran it has human steps: VISION taste, the plain? gate, the pick, CUT/TELLS judgment, and VOICE. If someone who knows the hypothesis performs them, reviewers will discount the result. Claude told the user this decision is theirs and said it would come up in the Study 1 section. It has not yet been put to them.

## Decision

Proposed (r_study1), not decided. In the confirmatory arm, 'C1-H (headless)', every human checkpoint becomes a preregistered rule:
- VISION is excluded; Study 1 uses the seed route only.
- The plain? gate is always on.
- There is no pick; every candidate is evaluated.
- CUT and TELLS run as a labelled AI stand-in, D3-auto, which is itself ablated.
- VOICE is neutralized by a fixed human copy deck (ADR 35).
- RELAY is excluded.
The paper always calls this arm C1-H, never C1.

Study 1b tests human-in-the-loop C1 separately:
- 8 professional designer-operators following scripted SOPs;
- 24 of the Study 1 briefs, assigned in a Latin square, with operator as a random effect;
- operators know the condition but not the hypotheses;
- the same harness and raters;
- about $12–15k.

## Alternatives considered

- **r_methods' 'C1-auto': each ?H becomes a preregistered rule. The initial pick keeps all 4 seeds, and the final pick is the in-loop critic's top rank or a random draw. D3 is either run by an agent with frozen protocol prompts or dropped. Human-in-the-loop C1 is a separate exploratory arm with 4 or more operators.** — Keeps a final selection step. No operator variance or experimenter bias, fully reproducible and cheap. It departs from the article's human-finished workflow, and an agent-run D3 is a deviation. Human taste becomes exploratory rather than confirmatory.
- **Trained, blinded operators following SOPs at full Study 1 scale** — Most faithful to C1. Very expensive at 48 briefs × arms × 4 candidates. Operator skill becomes a confound, and operators can't be blind to their own condition.
- **AI stand-ins for every human step, including VISION and VOICE** — Cheap and reproducible. But it changes the construct (the article claims human taste matters) and contradicts the blocks' own guards.
- **Restrict Study 1 to the stages that can be automated** — A clean causal test, but D3 goes untested unless something stands in.
- **The owner performs all checkpoints** — Easiest, and closest to the article's demo. But it means a single unblinded operator who wants the result, and reviewers will reject it as confirmatory evidence.
- **r_ux: the owner performs the human steps blind to variant, or the Finish stage is left out of the comparison (alongside a fixed automatic stand-in)** — r_ux notes that this choice changes what the paper can claim. Even blind to variant, the owner is still a single operator who knows the hypothesis (see r_methods above). Leaving Finish out leaves D3 untested.

## Consequences

**Positive**

- Removes the strongest reviewer objection: an unblinded operator who wants the result.
- Every checkpoint becomes a preregistered rule, so runs are reproducible.

**Negative**

- Paper 1 could claim results only for C1-H, not for C1 as the article runs it, and the article's claim is that human taste matters.
- Study 1b would need a second preregistration and a 'Your turn' inbox that hides variant labels. It would cost about $12–15k on top of the ~$24k core estimate.
- C1-H relies on two amendments already declared in 03-configurations: #5, a loop cap of 5 in total, and #6, critic calibration. On top of these it adds a study-specific rule: calibrate the critic once in the pilot, then freeze it with no recalibration mid-study (to be marked per ADR 17).
- Running D3-auto on every candidate with no pick departs from port rule 4 in 02-grammar, which says every option_set is closed by pick before D3. It would need a declared exception, and r_study1 does not mention this.

**Follow-ups**

- User to decide in the Study 1 design section.
- If adopted, choose between r_study1's C1-H and r_methods' C1-auto.
- If adopted, declare the port rule 4 exception for running D3-auto on unpicked candidates.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T07:20:09Z (Claude) — “This decision is yours; I'll raise it in the Study 1 section.”
- [research/2026-10-06-harness-research/study1-draft.md](../research/2026-10-06-harness-research/study1-draft.md) · ## Recommendations > ### Definition of the C1-H treatment arm — “In the paper, always call this arm 'C1-H (headless)' and never just 'C1'.”
- [research/2026-10-06-harness-research/study1-draft.md](../research/2026-10-06-harness-research/study1-draft.md) · ## Options > ### How to handle the human-in-the-loop blocks — “Two preregistrations. Paper 1 can claim only 'C1-H'.”
- [research/2026-10-06-harness-research/methods.md](../research/2026-10-06-harness-research/methods.md) · ## Options > ### How C1's human checkpoints (?H pick, CUT/TELLS/VOICE) enter Paper 1 — “Single unblinded operator who wants the result: reviewers will reject this as confirmatory evidence”
- [protocol/03-configurations.md](../../protocol/03-configurations.md) · C1 > ### Amendments to the article ⟨A⟩ (rows 5 and 6) — “probe 1–2, no cap → cap 5 total, plateau rule, best-snapshot re-rank, human-decided backtrack (02 §2)”
- [protocol/02-grammar.md](../../protocol/02-grammar.md) · ### Port rules (hard invariants), rule 4 — “Every `option_set` is closed by `pick` before D3 and before any RELAY chain.”
