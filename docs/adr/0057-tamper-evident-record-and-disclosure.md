# ADR-0057: A tamper-evident record and full disclosure: git, append-only ADRs, a public COI page, publication-freedom clauses

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-07 06:35 |
| **Track** | Process |
| **Related** | [ADR-0043](0043-research-credibility-without-compromise.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md), [ADR-0044](0044-appoint-independent-integrity-monitor.md) |

## Context

The user requires research credibility "ABSOLUTELY AND WITHOUT COMPROMISE" ([ADR-0043](0043-research-credibility-without-compromise.md)) while the same small team builds a product on the protocol. Claude drafted a nine-rule charter (v0); four AI red-team lenses (a Registered Reports editor, a conflict-of-interest expert, a hostile replicator and a program-level integrity officer) attacked it, and a synthesis produced CR1–CR14. The user adopted all 14 rules.

**Threat this rule addresses:** Several gaps:
- Provenance can be rewritten: the ActAI folder is not a git repository and sits in OneDrive, and the 37 verifier corrections left no diffs.
- The conflict disclosure is one line.
- AI ghost authorship by the same model family under test.
- Future contracts could buy control over publication.

ICMJE says authors must avoid sponsor agreements that 'interfere with authors' access to all of the study's data or that interfere with their ability to analyze and interpret the data and to prepare and publish manuscripts independently when and where they choose' (https://www.icmje.org/recommendations/browse/roles-and-responsibilities/author-responsibilities--conflicts-of-interest.html). PLOS requires a description of the funder's role (https://journals.plos.org/plosone/s/competing-interests).

Disclosure is a floor, not a safeguard; CR1–CR13 carry the weight.

## Decision

Charter rule **CR14**, adopted as part of the credibility charter (CR1–CR14):

**Version control.** Put protocol/, docs/adr/, the registry and the deviation log under git today. Push to a public remote with protected branches and signed commits. At each milestone (Stage 0, lock, draw, IPA, unblinding, Stage 2), archive a tagged snapshot to an external DOI archive.

**ADRs:**
- Accepted ADRs are append-only: CI fails any edit to their Context or Decision sections, and ratifications become new records.
- Ratify the 15 by-continuation ADRs before Stage 0.
- Product-only ADRs may stay private, but their hashes are published.

**Disclosure filings.** Every author, the Monitor, the co-investigator, the copywriter and the expert raters file ICMJE-scope disclosures at Stage 0/1, at Stage 2 and for every later paper.

**A standing public COI page** lists:
- equity and investors;
- the funding source and its role in design, analysis and the decision to publish;
- patents (planned, pending and issued), none of which may delay publication;
- model-provider credits or programmes;
- every agreement that touches research.

**Agreements.** Every investor, partner, customer or provider agreement carries a publication-freedom clause: no edit or veto, no delay beyond a short confidentiality review, and no restriction on data release.

**Per-preregistration statements:**
- Which product telemetry on that domain the authors had seen, auto-filled from the firewall's access logs.
- An AI-contribution statement naming the model family, which is the same family as the study's worker and critic, and the tasks it performed.

**Corrections and consent.** The ADR README's 'independent verifiers' becomes 'AI-assisted verification passes (same model family)'. The IRB and the rater consent form name the commercial sponsor, and the Prolific account type matches who pays.

The user chose a private GitHub remote for now (see ADR-0060). The public, timestamped parts of this rule (research ADRs, the Program Registry and milestone snapshots) still have to exist before the first Stage 0 registration.

**Enforced by:** System: git rulesets, a CI hash check and the external archive. Disclosure. Process: a contract template.

**Owner:** The team lead; the Monitor checks the disclosures at each stage.

## Alternatives considered

- **A lighter charter** (offered; not chosen) — fewer outside parties and gates; cheaper, but weaker than the user's standard.

## Consequences

**Positive**

- Closes the threat above with system enforcement.

**Negative**

- Cost (red-team estimate, unverified): About half a day for git and the archive, half a day for the ratification session, about 1 hour per person per filing, and a few hours of legal review for the contract clause. Some product strategy becomes public, and some deals may be lost.

**Follow-ups**

- Needed before the first pilot spend (day one).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T13:35:51Z — “Adopt all 14 (Recommended)”
- [research/2026-10-07-credibility-redteam/r_redteam_syn.md](../research/2026-10-07-credibility-redteam/r_redteam_syn.md) · CHARTER › CR14
