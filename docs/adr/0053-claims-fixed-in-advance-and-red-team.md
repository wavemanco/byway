# ADR-0053: Claims fixed in advance in Stage 1, plus a paid outside red team

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-07 06:35 |
| **Track** | Process |
| **Related** | [ADR-0043](0043-research-credibility-without-compromise.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md), [ADR-0044](0044-appoint-independent-integrity-monitor.md) |

## Context

The user requires research credibility "ABSOLUTELY AND WITHOUT COMPROMISE" ([ADR-0043](0043-research-credibility-without-compromise.md)) while the same small team builds a product on the protocol. Claude drafted a nine-rule charter (v0); four AI red-team lenses (a Registered Reports editor, a conflict-of-interest expert, a hostile replicator and a program-level integrity officer) attacked it, and a synthesis produced CR1–CR14. The user adopted all 14 rules.

**Threat this rule addresses:** Spin and outcome switching. Two co-primaries, three baselines, five ablations, about ten secondary outcomes, two human panels and AI judges leave many routes to a positive headline, and 'C1-H' can drift into 'C1'. According to PubMed, industry-sponsored studies show less agreement between results and conclusions (RR 0.83, Lundh et al. 2017, https://doi.org/10.1002/14651858.MR000033.pub3). On a 1–3 person team, nobody is paid to find errors.

This merges COI's claims table and red team, Replicator's red team on code and its framing rule, and Editor's product-consequence table.

## Decision

Charter rule **CR10**, adopted as part of the credibility charter (CR1–CR14):

The Stage 1 includes three tables:
- (a) **Results-to-claims:** the exact abstract sentence for each outcome pattern (each co-primary win/null/loss, crossed with each ablation equivalent/inconclusive/superior).
- (b) **Product consequences:** what the product's label and default become in each pattern, including if H1a fails.
- (c) **Results shell:** a fixed table listing every registered outcome in registered order.

Reporting:
- The abstract reports both co-primaries with effect sizes and CIs.
- The arm is called 'C1-H' everywhere, never 'C1'.
- The paper is described as a controlled test of a headless variant, not an unqualified replication.

Red team and checks:
- Before both Stage 1 and Stage 2 submission, a paid outside red team (3–5 people, a base fee plus a bounty per verified error, at least one from a competing approach) reviews the manuscript and the arm-specific code paths.
- Their report is published.
- The Monitor and one red-team member check the abstract, press text, README and launch posts against the claims table before release.

**Enforced by:** External parties: the red team, the Monitor and the journal's reviewers. Process: the tables are fixed in Stage 1.

**Owner:** The team drafts the tables; the Monitor and the red team check against them.

## Alternatives considered

- **A lighter charter** (offered; not chosen) — fewer outside parties and gates; cheaper, but weaker than the user's standard.

## Consequences

**Positive**

- Closes the threat above with an outside party or process.

**Negative**

- Cost (red-team estimate, unverified): About 1 day to write the tables. The red team costs about $1–3k per round, the attackers' estimate scaled from a published precedent (not verified here).

**Follow-ups**

- Needed before the confirmatory run or Stage 2, not on day one.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T13:35:51Z — “Adopt all 14 (Recommended)”
- [research/2026-10-07-credibility-redteam/r_redteam_syn.md](../research/2026-10-07-credibility-redteam/r_redteam_syn.md) · CHARTER › CR10
