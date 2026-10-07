# ADR-0044: Appoint an Independent Integrity Monitor: a paid methodologist who is not an author

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-07 06:35 |
| **Track** | Process |
| **Related** | [ADR-0043](0043-research-credibility-without-compromise.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md) |

## Context

The user requires research credibility "ABSOLUTELY AND WITHOUT COMPROMISE" ([ADR-0043](0043-research-credibility-without-compromise.md)) while the same small team builds a product on the protocol. Claude drafted a nine-rule charter (v0); four AI red-team lenses (a Registered Reports editor, a conflict-of-interest expert, a hostile replicator and a program-level integrity officer) attacked it, and a synthesis produced CR1–CR14. The user adopted all 14 rules.

**Threat this rule addresses:** Every safeguard in v0 is run by the people who profit, which is the fatal finding common to all four credibility attacks. According to PubMed, industry-sponsored studies more often have favourable results (RR 1.27) and favourable conclusions (RR 1.34), from an 'industry bias that cannot be explained by standard Risk of bias assessments' (Lundh et al. 2017, Cochrane, https://doi.org/10.1002/14651858.MR000033.pub3). TOP 2025's Certified level and both of its verification practices require 'a party independent from the researchers' (https://www.cos.io/initiatives/top-guidelines).

The four attacks each proposed a version of this role: Editor's custodian, COI's escrow statistician, Replicator's methods lead and Program's Integrity Monitor. They are merged into one role so a 1–3 person team signs one contract, not four. Program's 'not an author' condition is kept over Editor's 'the co-investigator may be custodian', because a co-author shares the paper's interest.

## Decision

Charter rule **CR1**, adopted as part of the credibility charter (CR1–CR14):

Before any pilot spend, appoint one Independent Integrity Monitor. The Monitor is a methodologist who is not an author and has no equity, options, advisory role, paid product role or product beta access. They are paid a fixed fee that does not depend on results. A published written charter gives the Monitor these powers:
- (a) custody of every study key (CR6);
- (b) the only view of pilot and interim arm effects (CR4);
- (c) the confirmatory analysis (CR9);
- (d) co-signature on deviations (CR7) and on every public claim or label change that cites the research (CR11);
- (e) read access to the registry, archive and gateway ledger;
- (f) a contractual right to post registered results, plus a dissent, if a results deadline (CR3) is missed; this right survives the company folding.
Name a deputy key-holder: the academic co-investigator, if they pass the same independence test. Replacing the Monitor is a public registry event. The Monitor publishes a yearly integrity report.

The user chose a paid, non-author methodologist (the recommended option) over an academic co-investigator as Monitor (who then could not be an author) and a Monitor who is also a co-author.

**Enforced by:** External party (the Monitor), under a published contract, plus system access: keys are encrypted to the Monitor, and the Monitor has read-only access to the ledger and registry.

**Owner:** The team lead signs the contract; the Monitor holds the powers.

## Alternatives considered

- **Academic co-investigator as Monitor** — cheaper to arrange, but they then cannot be an author.
- **A Monitor who is also a co-author** — easiest, but a co-author shares the paper's interest.
- **Self-run safeguards (charter v0)** — rejected: every v0 safeguard was run by the people who profit.
- **A lighter charter** (offered; not chosen) — fewer outside parties and gates; cheaper, but weaker than the user's standard.

## Consequences

**Positive**

- Closes the threat above with an outside party or process.

**Negative**

- Cost (red-team estimate, unverified): Roughly $3–8k a year as a fixed fee (the attackers' estimate, not verified), plus about 2 hours a month of team time. The team also gives up control over when results are unblinded and who publishes the first numbers, which is the point.

**Follow-ups**

- Needed before the first pilot spend (day one).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T13:35:51Z — “Adopt all 14 (Recommended)”
- [research/2026-10-07-credibility-redteam/r_redteam_syn.md](../research/2026-10-07-credibility-redteam/r_redteam_syn.md) · CHARTER › CR1
