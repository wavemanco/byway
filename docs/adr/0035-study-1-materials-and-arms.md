# ADR-0035: Study 1 materials and arms: sampled briefs, a fixed human copy deck, three baselines, C1-H and five ablations

| | |
|---|---|
| **Status** | Proposed |
| **Decided by** | Proposed, pending the user's decision |
| **Date (local, UTC−7)** | 2026-10-06 00:17 |
| **Track** | Research design |
| **Related** | [ADR-0024](0024-evaluation-ladder-paper-one-scope.md), [ADR-0026](0026-budget-sized-from-power-analysis.md), [ADR-0034](0034-headless-c1-confirmatory-arm.md), [ADR-0036](0036-study-1-outcomes-and-ai-judges.md), [ADR-0037](0037-confirmatory-analysis-and-multiplicity-plan.md) |

## Context

Rungs 1+2 need baselines (replication) and leave-one-block-out ablations (mechanisms). Briefs are a random stimulus factor, so their number, not the number of raters, sets the effective sample size. Copy differs widely between unconstrained runs and drives preference. The first reviewer objection will be that C1 simply spends more compute and selects harder. The two study-design digests disagree on how to control for compute and how to stratify the briefs. When Paper 1's scope was locked, Claude described the baselines as plain and "be creative" (dialogue 2026-10-06T07:02:36Z). r_study1 uses the article's 'random' prompt in that slot and adds B-Skill.

## Decision

Proposed (the r_study1 design), not decided.

Briefs:
- 60 landing-page briefs: 12 for development (the pilot and prompt freezing) and 48 confirmatory, sealed by SHA-256 hash until the frozen run.
- Drawn as a stratified random sample of real launches, e.g. Product Hunt daily launches plus Show HN for developer tools, January–June 2026, with a published random seed. 12 strata × 5 briefs.
- Each brief is fictionalized and written into a fixed 80–120-word template.
- A preregistered pilot rule raises the confirmatory set to 60 (cap 64) if variance exceeds assumptions.

Copy:
- An independent freelance copywriter, not the protocol authors, writes one copy deck per brief (~$40 per brief, covering the deck and fictionalization). Each string is marked REQUIRED or OPTIONAL.
- Every arm receives the deck verbatim. Compliance is checked by a DOM text diff plus OCR on generated images.
- VOICE is studied separately.

Arms (9 per brief):
- Baselines:
  - B-Plain;
  - B-Random, the article's 'random' prompt (recorded in the article notes as 'Give me something totally unique. Make every design decision completely at random.'; the exact wording is still to be confirmed against the article);
  - B-Skill, Anthropic's frontend-design SKILL.md pinned to a commit.
- C1-H (ADR 34).
- Ablations: −SEED, −CRITIC, CRITIC-self (compute-matched: the worker reviews its own screenshots), −ASSET and −D3.

Generation:
- A branched, prefix-sharing tree, with ablation contrasts on matched lineages.
- K=4 candidates per arm per brief, all evaluated: about 1,728 confirmatory pages.
- Every arm gets the same worker, sandbox, static-build requirement and image tool. The critic runs in OK mode.
- Infrastructure failures get one retry, and the analysis is intention-to-treat.

Deferred: −RELAY, −VISION, −VOICE, separate −CUT/−TELLS, a critic-tier ablation, GREAT mode, and −pick.

## Alternatives considered

- **r_methods set: baselines plain, 'be creative' and a compute-matched best-of-N (the plain prompt sampled N times on C1's token budget, selected by the same critic); ablations −SEED, −CRITIC loop, −blind critic, −stronger critic, −ASSET, −D3; 2 runs per cell** — Isolates seeding and critique directly from extra sampling and selection, and keeps the 'be creative' baseline named when the scope was locked. It adds a generation arm and has no strong practitioner baseline such as B-Skill.
- **Full ablation set (adds a −CUT/−TELLS split, a critic tier and −RELAY)** — Exhaustive, but adds $60–100 per brief and more multiplicity. RELAY can't be judged from static stimuli.
- **Minimal ablations (−SEED and −CRITIC only)** — Cheapest. Misses ASSET, D3 and the compute-matched control reviewers will demand.
- **24 briefs, or 96+ briefs** — 24 gives simulated power of about 0.79 for a 60/40 H1, and the ablations are underpowered. 96+ is needed only to detect 55/45 ablation effects, and roughly doubles generation cost again.
- **r_methods briefs: 48 = 6 product categories × 8, fictional brands** — Same size with fewer strata. The sampling frame is not specified as real launches.
- **LLM-generated or team-written briefs** — Faster and easier to control, but synthetic briefs may carry the model's own defaults, and team-written ones risk allegiance bias.
- **AI copy as generated, AI copy with text blurred, or human VOICE in every arm** — More naturalistic, or more faithful to C1. But raters would judge wording as well as design, blurring interacts with typography, and human writing variance would enter every arm.

## Consequences

**Positive**

- Controls the biggest confounds: copy, compute and hand-picked briefs.
- Sealed confirmatory briefs and the split between development and confirmatory briefs limit researcher degrees of freedom.

**Negative**

- Generation costs about $144 per brief ($180 with contingency) and scales with the number of briefs.
- A fixed copy deck departs from the article's flow, where copy is generated and then voiced by a human, so VOICE drops out of Study 1.
- Sampling, fictionalizing and copywriting take time, and a copywriter has to be recruited.
- The baseline set differs from the plain and "be creative" baselines named when Paper 1's scope was locked, so the user needs to confirm it.

**Follow-ups**

- Choose the compute control: CRITIC-self (r_study1) or a compute-matched best-of-N (r_methods).
- Confirm the baseline set against the plain and "be creative" framing locked for Paper 1.
- Get the article's exact 'random', seed and image prompts (see open decisions).
- Decide whether to add the optional GPT-5.6 Sol worker arm (see open decisions).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T07:20:09Z (Claude) — “The power simulations point to 48 test briefs, plus 12 for the pilot.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T07:02:36Z (Claude) — “It tests whether C1 beats the plain and "be creative" baselines on design tasks”
- the article (Chimala, Lenny's Newsletter, Sep 1 2026; PDF at C:/Users/arvik/Downloads/protocol.pdf), via Claude's reading notes · TECHNIQUE 1: Use seed strings to inject variety — “Give me something totally unique. Make every design decision completely at random.”
- [research/2026-10-06-harness-research/study1-draft.md](../research/2026-10-06-harness-research/study1-draft.md) · ## Recommendations > ### Task set (briefs) — “Draw from a stratified random sample of real product launches”
- [research/2026-10-06-harness-research/study1-draft.md](../research/2026-10-06-harness-research/study1-draft.md) · ## Recommendations > ### Copy control (removes the biggest confound) — “An independent freelance copywriter, not the protocol authors, writes one copy deck per brief”
- [research/2026-10-06-harness-research/study1-draft.md](../research/2026-10-06-harness-research/study1-draft.md) · ## Recommendations > ### Generation counts and unit of analysis — “The unit of evaluation is EVERY candidate; there is no human or AI pick before evaluation.”
- [research/2026-10-06-harness-research/study1-draft.md](../research/2026-10-06-harness-research/study1-draft.md) · ## Questions (first item) — “The protocol files only paraphrase it.”
- [research/2026-10-06-harness-research/methods.md](../research/2026-10-06-harness-research/methods.md) · ## Recommendations > ### Arms: what C1 is compared against, and how human checkpoints are handled — “A compute-matched best-of-N with the same selector isolates the effect of seeding and critique.”
