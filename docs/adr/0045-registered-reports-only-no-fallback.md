# ADR-0045: Cited confirmatory studies run only as Registered Reports, with no fallback; PCI RR excluded

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-07 06:35 |
| **Track** | Process |
| **Related** | [ADR-0043](0043-research-credibility-without-compromise.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md), [ADR-0044](0044-appoint-independent-integrity-monitor.md) |

## Context

The user requires research credibility "ABSOLUTELY AND WITHOUT COMPROMISE" ([ADR-0043](0043-research-credibility-without-compromise.md)) while the same small team builds a product on the protocol. Claude drafted a nine-rule charter (v0); four AI red-team lenses (a Registered Reports editor, a conflict-of-interest expert, a hostile replicator and a program-level integrity officer) attacked it, and a synthesis produced CR1–CR14. The user adopted all 14 rules.

**Threat this rule addresses:** Two problems: the default route is closed, and v0's fallback is an escape hatch the team triggers itself.

PCI's policy, verified at the source, says 'Authors should have no financial conflict of interest relating to the articles they submit to PCI'. A conflict covers salary, shares or patents linked to the research within the past four years. It tells conflicted authors to submit elsewhere (https://peercommunityin.org/?p=8096). COI, Replicator and Program recommended PCI RR; Editor's finding overrides them because the policy makes PCI unavailable to equity holders.

CC1's OSF fallback would let the team drop IPA after seeing the pilot. Registered Reports had 44% positive results against 96% in standard reports (Scheel, Schijen & Lakens, https://www.psychologicalscience.org/journals/ampps/25152459211007467/).

Verified alternatives:
- PLOS ONE grants IPA, publishes the Stage 1 protocol as its own article (https://everyone.plos.org/2021/03/30/registered-reports-one-year-at-plos-one), and requires shares, employment and patents to be declared rather than barring them (https://journals.plos.org/plosone/s/competing-interests).
- RSOS accepted direct Registered Report submissions as of 2021 (https://royalsociety.org/blog/2021/04/rsos-pci-rr/). Its conflict-of-interest terms were not checked.

## Decision

Charter rule **CR2**, adopted as part of the credibility charter (CR1–CR14):

Every confirmatory study that a paper headline or a public product claim will cite runs as a Registered Report with in-principle acceptance (IPA). The journal must accept declared financial interests.
- Do not use PCI RR: its policy bars authors with financial conflicts.
- Fix the venue and record it as an ADR before Stage 0.
- No fallback to a plain preregistration. If one RR venue declines, submit to another RR venue.
- Make the Stage 1 public on acceptance, with no embargo.
- Handle model-retirement pressure through escrowed generation (CR6) and a model-retirement contingency preregistered in Stage 0. Never handle it by changing route.

**Enforced by:** External party (the journal's editor and reviewers), plus process (the route ADR, timestamped before Stage 0).

**Owner:** The team lead chooses; the Monitor confirms the ADR predates Stage 0.

## Alternatives considered

- **PCI RR** — excluded: its policy bars authors with a financial conflict of interest.
- **OSF preregistration as a fallback (charter v0, CC1)** — rejected: the team could drop in-principle acceptance after seeing the pilot.
- **A lighter charter** (offered; not chosen) — fewer outside parties and gates; cheaper, but weaker than the user's standard.

## Consequences

**Positive**

- Closes the threat above with an outside party or process.

**Negative**

- Cost (red-team estimate, unverified): An article processing charge (PLOS ONE and RSOS both charge; amounts not checked). The team gives up PCI's free review. Stage 1 review time was not verified for these journals. It squeezes the model-retirement window: tooling.md lists Opus 5.5 as 'not before 2027-09-22' and Fable 5.1 as 'not before 2027-09-01'.

**Follow-ups**

- Needed before the first pilot spend (day one).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T13:35:51Z — “Adopt all 14 (Recommended)”
- [research/2026-10-07-credibility-redteam/r_redteam_syn.md](../research/2026-10-07-credibility-redteam/r_redteam_syn.md) · CHARTER › CR2
