# ADR-0054: Evidence labels are computed from the registry; no efficacy claims before Stage 2 acceptance

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-07 06:35 |
| **Track** | Process |
| **Related** | [ADR-0043](0043-research-credibility-without-compromise.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md), [ADR-0044](0044-appoint-independent-integrity-monitor.md) |

## Context

The user requires research credibility "ABSOLUTELY AND WITHOUT COMPROMISE" ([ADR-0043](0043-research-credibility-without-compromise.md)) while the same small team builds a product on the protocol. Claude drafted a nine-rule charter (v0); four AI red-team lenses (a Registered Reports editor, a conflict-of-interest expert, a hostile replicator and a program-level integrity officer) attacked it, and a synthesis produced CR1–CR14. The user adopted all 14 rules.

**Threat this rule addresses:** Product claims can outrun the evidence. Paper 1 studies only C1-H: headless, with a fixed copy deck and the Opus 5.5 worker, on landing pages, judged by lay first-impression preference. The product will run human-in-the-loop C1, newer models, composed recipes and a recommender.

v0's 'Studied' label carries no direction, scope or expiry, and the team assigns it. All five attacks raised this. The merged rule takes Program's verdict taxonomy and expiry, Architect's scope tuple and no-override rule, Replicator's 'no claims before Stage 2', and Program's showcase rule.

## Decision

Charter rule **CR11**, adopted as part of the credibility charter (CR1–CR14):

**Labels are computed.** The engine computes evidence labels from the registry. Nobody types them by hand, and there is no override flag.

**One vocabulary** is used across protocol, papers and product. Each claim gets two parts:
- a verdict: Supported, No meaningful effect, Inconclusive, Worse or Untested;
- a scope match against the evidence-scope tuple (recipe hash, ruleset, model profile, checkpoint binding, domain and task set, outcome and rater population): Exact, Derived-from-studied (with the differences listed automatically), Composed, or Experimental.

**Limits on labels:**
- Composed recipes never inherit their blocks' labels.
- A label expires at the earlier of the studied model's retirement or 24 months after data freeze, and then degrades to 'Historical'.

**What may be claimed, and when:**
- No efficacy claim ('research-backed', 'proven', 'outperforms', 'studies show') before the Registered Report's Stage 2 is accepted.
- Other registered evaluations may be cited only as exploratory, and only once their results are public.
- Every public claim (site, docs, decks, sales email, talks) carries a claims-register ID, maps to a hypothesis ID and is signed off by the Monitor.
- A CI linter fails site and docs builds that contain claim phrases without a valid, unexpired ID.

**Product surfaces:**
- Showcases are seeded random draws from archived runs, or state their selection ratio.
- The recommender shows the recommended recipe's label, plus 'routing untested' until the recommender itself has been studied.

**Upkeep:** corrections go out within 14 days, and a public claims audit runs every year.

Adopted with the recommended defaults: hand-picked showcase galleries are allowed only if they state the selection ratio (e.g. "3 hand-picked of 40"); labels expire at the earlier of the studied model's retirement or 24 months after data freeze.

**Enforced by:** System: the label function, the CI linter, release CI and the gallery sampler. External party: the Monitor's sign-off.

**Owner:** The engine owner builds it; the Monitor signs off; whoever publishes a claim files it.

## Alternatives considered

- **Labels typed by the team (charter v0, CC7)** — rejected: no direction, scope or expiry, and assigned by interested people.
- **Allow citing the Monitor's results report before Stage 2** — rejected: peer review of the conclusions is part of the protection.
- **A lighter charter** (offered; not chosen) — fewer outside parties and gates; cheaper, but weaker than the user's standard.

## Consequences

**Positive**

- Closes the threat above with system enforcement.

**Negative**

- Cost (red-team estimate, unverified): 3–5 dev days, plus about 1 hour of Monitor time per marketing release. Commercially, no broad 'research-backed' copy until the evidence exists.

**Follow-ups**

- Needed before the first pilot spend (day one).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T13:35:51Z — “Adopt all 14 (Recommended)”
- [research/2026-10-07-credibility-redteam/r_redteam_syn.md](../research/2026-10-07-credibility-redteam/r_redteam_syn.md) · CHARTER › CR11
