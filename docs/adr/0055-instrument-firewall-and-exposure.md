# ADR-0055: Evaluation instruments are walled off from the product, and exposure is tracked

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-07 06:35 |
| **Track** | Process |
| **Related** | [ADR-0043](0043-research-credibility-without-compromise.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md), [ADR-0044](0044-appoint-independent-integrity-monitor.md) |

## Context

The user requires research credibility "ABSOLUTELY AND WITHOUT COMPROMISE" ([ADR-0043](0043-research-credibility-without-compromise.md)) while the same small team builds a product on the protocol. Claude drafted a nine-rule charter (v0); four AI red-team lenses (a Registered Reports editor, a conflict-of-interest expert, a hostile replicator and a program-level integrity officer) attacked it, and a synthesis produced CR1–CR14. The user adopted all 14 rules.

**Threat this rule addresses:** Teaching to the test. Design rule 4 lets the product reuse the sameness and defect checks. Tuning recipes against them later turns them into circular outcomes. A product quality gate run on GPT or Gemini spoils those families as held-out judges. Editor, COI, Program and Architect all raised this.

## Decision

Charter rule **CR12**, adopted as part of the credibility charter (CR1–CR14):

Evaluation instruments live in the evaluation store, versioned by hash and frozen per study. They include:
- judge prompts and references;
- held-out judge model families;
- the tell detector, similarity embeddings and defect checklist;
- sealed and held-out briefs;
- rater data.

Access:
- Product workspaces cannot read the store.
- A CI import check blocks product code from importing these instruments.
- The product may use only forks, each with its own ID.

Exposure:
- Once the product uses an instrument or a model family as a feature, a quality gate or an optimization target, it is marked exposed.
- For recipes released after that date, an exposed instrument may serve only as an exploratory outcome.
- An exposed model family is retired as a held-out judge.

Data used to develop the recommender or composer is logged with its provenance, so later studies can exclude it.

**Enforced by:** System: store access scoping, the CI import check, and an exposure register that the evaluation side checks before computing confirmatory metrics.

**Owner:** The engine owner.

## Alternatives considered

- **A lighter charter** (offered; not chosen) — fewer outside parties and gates; cheaper, but weaker than the user's standard.

## Consequences

**Positive**

- Closes the threat above with system enforcement.

**Negative**

- Cost (red-team estimate, unverified): About 1–2 dev days now. The product loses convenient reuse and must maintain its own forks.

**Follow-ups**

- Needed before the first pilot spend (day one).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T13:35:51Z — “Adopt all 14 (Recommended)”
- [research/2026-10-07-credibility-redteam/r_redteam_syn.md](../research/2026-10-07-credibility-redteam/r_redteam_syn.md) · CHARTER › CR12
