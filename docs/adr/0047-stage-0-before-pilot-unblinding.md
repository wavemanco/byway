# ADR-0047: Public Stage 0 registration before pilot unblinding; pilot arm effects go to the Monitor only

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-07 06:35 |
| **Track** | Process |
| **Related** | [ADR-0043](0043-research-credibility-without-compromise.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md), [ADR-0044](0044-appoint-independent-integrity-monitor.md) |

## Context

The user requires research credibility "ABSOLUTELY AND WITHOUT COMPROMISE" ([ADR-0043](0043-research-credibility-without-compromise.md)) while the same small team builds a product on the protocol. Claude drafted a nine-rule charter (v0); four AI red-team lenses (a Registered Reports editor, a conflict-of-interest expert, a hostile replicator and a program-level integrity officer) attacked it, and a synthesis produced CR1–CR14. The user adopted all 14 rules.

**Threat this rule addresses:** The all-arm pilot (about 1,500 judgments) shows the direction of every contrast before these are fixed: the SESOI, the families, the primary test (still open in ADR-0037), the equivalence margins and the thresholds. A null −D3 could quietly become an equivalence claim, and a close CRITIC-self contrast could be moved to exploratory.

Editor's Stage 0 and the pilot firewalls proposed by COI and Replicator converge. The strongest version is kept: the team never sees arm-level pilot effects before IPA, while reviewers see them in full.

## Decision

Charter rule **CR4**, adopted as part of the credibility charter (CR1–CR14):

Before any pilot rating is unblinded, file a timestamped public Stage 0 registration. It fixes:
- hypotheses and their directions;
- one primary test and a gatekeeping order, with H1a (C1-H vs B-Plain on lay quality) as the single gate for the headline claim;
- the SESOI and equivalence bounds, with a rationale written before any data (for example, a preference shift buyers would notice, or the per-candidate cost break-even), never derived from pilot effects;
- numeric thresholds for outcome-neutral checks, fidelity checks and AI-judge validity;
- exclusion and replacement rules;
- the baseline prompts, verbatim;
- a model-retirement contingency.

Pilot ratings go to the Monitor. The Monitor runs a frozen script that releases only nuisance parameters to the team: variance components, costs, timings, gold-check pass rates and failure rates. Arm-level pilot effects go to the journal with the Stage 1 and become public when it is published. Every change from Stage 0 to Stage 1 goes in a diff table.

**Enforced by:** Process: the Stage 0 registration. External party: the Monitor holds the pilot data. System: the script that releases only nuisance parameters.

**Owner:** The team writes Stage 0; the Monitor approves the thresholds and runs the release script.

## Alternatives considered

- **A lighter charter** (offered; not chosen) — fewer outside parties and gates; cheaper, but weaker than the user's standard.

## Consequences

**Positive**

- Closes the threat above with system enforcement.

**Negative**

- Cost (red-team estimate, unverified): 2–3 days to write Stage 0 earlier than planned, plus a few Monitor hours. The team loses informal access to the pilot results.

**Follow-ups**

- Needed before the first pilot spend (day one).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T13:35:51Z — “Adopt all 14 (Recommended)”
- [research/2026-10-07-credibility-redteam/r_redteam_syn.md](../research/2026-10-07-credibility-redteam/r_redteam_syn.md) · CHARTER › CR4
