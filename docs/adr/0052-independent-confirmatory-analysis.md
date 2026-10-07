# ADR-0052: Independent confirmatory analysis and an independent code check before Stage 2

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-07 06:35 |
| **Track** | Process |
| **Related** | [ADR-0043](0043-research-credibility-without-compromise.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md), [ADR-0044](0044-appoint-independent-integrity-monitor.md) |

## Context

The user requires research credibility "ABSOLUTELY AND WITHOUT COMPROMISE" ([ADR-0043](0043-research-credibility-without-compromise.md)) while the same small team builds a product on the protocol. Claude drafted a nine-rule charter (v0); four AI red-team lenses (a Registered Reports editor, a conflict-of-interest expert, a hostile replicator and a program-level integrity officer) attacked it, and a synthesis produced CR1–CR14. The user adopted all 14 rules.

**Threat this rule addresses:** Control of the analysis is the sponsor's main lever, and CC4 made the independent statistician optional ('ideally'). The ICMJE wording is verified (https://www.icmje.org/recommendations/browse/roles-and-responsibilities/author-responsibilities--conflicts-of-interest.html). CODECHECK issues a 'certificate of executable computation' with a DOI (https://codecheck.org.uk/). TOP 2025's Computational Reproducibility practice requires verification by an independent party.

## Decision

Charter rule **CR9**, adopted as part of the credibility charter (CR1–CR14):

The confirmatory analysis is run independently.
- The Monitor, or a statistician they contract under the same independence test, receives the data freeze and the frozen analysis code, whose hash is registered.
- They apply the exclusions, run the confirmatory analysis, and deposit a signed results report with a DOI before the authors draft the Discussion.
- Any gap between that report and the paper is a declared deviation.
- A non-conflicted guarantor signs ICMJE's statement: 'I had full access to all of the data in this study and I take complete responsibility for the integrity of the data and the accuracy of the data analysis.'
- The analysis pipeline gets a CODECHECK certificate, or an equivalent independent reproduction, before Stage 2 submission.

**Enforced by:** External parties: the Monitor or contracted statistician, and CODECHECK.

**Owner:** The Monitor.

## Alternatives considered

- **A lighter charter** (offered; not chosen) — fewer outside parties and gates; cheaper, but weaker than the user's standard.

## Consequences

**Positive**

- Closes the threat above with an outside party or process.

**Negative**

- Cost (red-team estimate, unverified): The attackers estimated $2–8k for a statistician, unverified; it may fall within the Monitor's fee. CODECHECK's community checks appear to be volunteer-run, and no fee is stated. Adds 1–2 weeks before Stage 2.

**Follow-ups**

- Needed before the confirmatory run or Stage 2, not on day one.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T13:35:51Z — “Adopt all 14 (Recommended)”
- [research/2026-10-07-credibility-redteam/r_redteam_syn.md](../research/2026-10-07-credibility-redteam/r_redteam_syn.md) · CHARTER › CR9
