# ADR-0046: A public Program Registry gates all spend, and results are due on fixed deadlines

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-07 06:35 |
| **Track** | Process |
| **Related** | [ADR-0043](0043-research-credibility-without-compromise.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md), [ADR-0044](0044-appoint-independent-integrity-monitor.md) |

## Context

The user requires research credibility "ABSOLUTELY AND WITHOUT COMPROMISE" ([ADR-0043](0043-research-credibility-without-compromise.md)) while the same small team builds a product on the protocol. Claude drafted a nine-rule charter (v0); four AI red-team lenses (a Registered Reports editor, a conflict-of-interest expert, a hostile replicator and a program-level integrity officer) attacked it, and a synthesis produced CR1–CR14. The user adopted all 14 rules.

**Threat this rule addresses:** The file drawer at program level, and agenda capture. Pilots, internal evaluations and abandoned studies can vanish, and favourable product evaluations get promoted. A Registered Report stops selective reporting inside one study, not selection of which studies exist.

WHO treats 12 months after completion as the longest acceptable time to post results (https://www.who.int/news/item/09-04-2015-japan-primary-registries-network).

This merges Editor (a study log with 90-day posting and a Judge gate), COI (a 12-month register) and Program (a gateway gate and the denominator). Both deadlines are kept: Editor's 90 days for small evaluations, WHO's 12 months for full studies.

## Decision

Charter rule **CR3**, adopted as part of the credibility charter (CR1–CR14):

Keep a public, append-only Program Registry: a folder in the public repo, mirrored to a timestamped external archive.

Before its first paid model call or rater round, each of these gets an entry: every study, pilot and development-brief tuning run, and every product evaluation that compares configurations, recipes or blocks using human raters or AI judges. An entry records:
- ID, question and arms;
- recipe hashes and judge type;
- N and phase;
- planned dates and the results-due date.
The gateway and the Judge app refuse to spend without a live entry whose phase permits it.

Deadlines:
- Results (every registered outcome, nulls included, plus data) are due within 90 days for pilots and evaluations, and within 12 months for studies.
- An abandoned entry gets a dated reason and releases whatever data exists.
- An entry's existence is never embargoed. Design details may be embargoed for at most 12 months.

The registry also holds the research roadmap: ladder rungs, candidate Paper 2 domains and comparator-selection criteria. Changes to it are dated and flagged whenever product information prompted them. Every paper and every claim reports the denominator: how many registered studies and arms tested that recipe or block.

Adopted with the recommended scope: the registry covers product evaluations that compare configurations, recipes or blocks with raters or AI judges, not only research studies.

**Enforced by:** System: the gateway and the Judge app block spend without an entry. External party: the Monitor publishes a list of overdue entries.

**Owner:** Whoever launches the spend files the entry; the Monitor audits.

## Alternatives considered

- **Research studies and pilots only; product evaluations internal and never citable** — narrower, but leaves a program-level file drawer.
- **A lighter charter** (offered; not chosen) — fewer outside parties and gates; cheaper, but weaker than the user's standard.

## Consequences

**Positive**

- Closes the threat above with system enforcement.

**Negative**

- Cost (red-team estimate, unverified): About 2 dev days for the gate, then about 30 minutes per entry. Competitors can see the pipeline, and some posted nulls will be uncomfortable.

**Follow-ups**

- Needed before the first pilot spend (day one).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T13:35:51Z — “Adopt all 14 (Recommended)”
- [research/2026-10-07-credibility-redteam/r_redteam_syn.md](../research/2026-10-07-credibility-redteam/r_redteam_syn.md) · CHARTER › CR3
