# ADR-0061: Study 1 technical design choices: all recommendations in protocol v1.1 accepted

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose "Accept all recommendations") |
| **Date (local, UTC−7)** | 2026-10-07 09:40 |
| **Track** | Research design |
| **Related** | [ADR-0024](0024-evaluation-ladder-paper-one-scope.md), [ADR-0034](0034-headless-c1-confirmatory-arm.md), [ADR-0035](0035-study-1-materials-and-arms.md), [ADR-0036](0036-study-1-outcomes-and-ai-judges.md), [ADR-0037](0037-confirmatory-analysis-and-multiplicity-plan.md), [ADR-0038](0038-model-selection-pinning-and-routing.md), [ADR-0045](0045-registered-reports-only-no-fallback.md), [ADR-0047](0047-stage-0-before-pilot-unblinding.md), [ADR-0062](0062-code-first-work-mode.md) |

## Context

The Study 1 design pass produced [protocol v1.1](../study1/protocol-v1.1-draft.md): a Registered Report-grade draft reviewed by three AI passes (a Stage 1 reviewer, a charter auditor and a feasibility auditor; all Claude, the same model family as the study's worker and critic). It listed 24 user decisions (D1–D24). Claude grouped about fifteen technical ones and asked whether to accept all recommendations or walk through them; the user chose "Accept all recommendations". The user also asked to move non-code matters (people, pricing, outside actions) to the [playbook](../playbook.md) and [backlog](../backlog.md) ([ADR-0062](0062-code-first-work-mode.md)).

## Decision

These recommendations from protocol v1.1 Appendix B.1 are accepted:

| # | Decision | Accepted option |
|---|---|---|
| D3 | Model profile | `claude-opus-5-5` worker and `claude-fable-5-1` critic, pinned; one fixed effort level in every arm (high); a pinned, dated OpenAI image snapshot; one workspace per arm; a registered successor rule (newest generally available same-tier model with ≥ 90 days to retirement, plus a bridging check) |
| D5 | Smallest effect of interest and equivalence margin | Δ = .08, declared openly as resource-based; every equivalence test repeated at ±.06 and reported side by side; no product default dropped or demoted unless equivalence also holds at ±.06 |
| D6 | Error control | Family-wise within each family; H1a gates F1 and F2 only; F3, F3-EQ and F4 tested whatever H1a's result; the claims table says so |
| D11 | Pilot results deadline vs CR4 | Within 90 days the Monitor deposits the sealed pilot report with a public hash and posts the nuisance parameters; arm-level results become public at Stage 1 publication or 12 months, whichever comes first (to be co-signed by the Monitor) |
| D12 | Public record while the repository is private | Both: a public mirror of the research ADRs, Program Registry and deviation log, and DOI snapshots at milestones; signed commits, protected branches and ADR CI before the brief draw |
| D14 | GPT worker arm | Deferred to Paper 2 and logged in the roadmap |
| D15 | Study 1b | A separate, decoupled Registered Report with its own lock, model profile and successor rule; its Stage 0 filed before Study 1's confirmatory lock |
| D16 | Licences | Apache-2.0 for the study engine; CC-BY-4.0 for data |
| D17 | Distinctiveness outcome | P1 and P2 are the two primary outcomes reported in the abstract; H1a is the only primary hypothesis; H2a is a gated key secondary |
| D18 | Number of confirmatory briefs | Fixed at 72 (12 strata × 6), no reserve stratum |
| D19 | Test of the article-demonstrated chain | Add H1c (C1-H's pre-D3 snapshot vs B-Plain on quality) to F1 |
| D20 | Positive control | 24 strong-vs-generic exemplar pairs per pool, 24 judgments each; pass = win ≥ .70 with the CI lower bound above .58; failure blocks "No meaningful effect" verdicts |
| D21 | Expert family | Estimation only (win rates and CIs on HE1, HE2, HE4, HE5, plus lay–expert agreement); no expert verdicts |
| D22 | AI-judge exposure | Counted by model line and role: the image generator does not expose an evaluator family; GPT stays on the panel with a GPT/OpenAI-image preference probe |
| D23 | TELLS-auto | One combined variant, then a single blind keep-or-revert call |

The primary test, accepted with the protocol: the mean of per-brief win proportions, tested against .50 with a two-way (brief × rater) cluster-robust standard error and a t reference with df = min(briefs, raters) − 1, two-sided and requiring the predicted direction ([power_sim3.py](../research/2026-10-07-study1-design/power_sim3.py)).

**Not decided here** (parked in the [backlog](../backlog.md) or [playbook](../playbook.md)): D1 baseline set (the protocol and harness assume the recommended set until confirmed), D2 prompt transcription and permission, D4 venue, D7 people, D8 ethics, D9 funding and patents, D10 ratifications, D13 spending ceiling, D24 product consequences.

## Alternatives considered

- **Walk through each choice before recording** (offered; not chosen).
- The alternatives for each decision are listed in protocol v1.1 Appendix B.1 and in [the design research](../research/2026-10-07-study1-design/decisions-reviews-stats-prompts.md).

## Consequences

**Positive**

- The study design is fixed enough to build the harness against: 72 briefs, K = 4, the arm set, the model profile, the outcome structure and the primary test.

**Negative**

- These were accepted as a package without discussing each one. They remain reopenable before Stage 0; after Stage 0 any change is a public deviation.

**Follow-ups**

- Fold the accepted options into protocol v1.2 and remove their [Dn] markers.
- ADR-0034 to ADR-0038 stay Proposed until D10's ratification session accepts them as amended.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T16:40:58Z — “Accept all recommendations (Recommended)”
- [study1/protocol-v1.1-draft.md](../study1/protocol-v1.1-draft.md) · Appendix B.1
