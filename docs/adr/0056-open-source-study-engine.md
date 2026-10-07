# ADR-0056: Open-source the study engine under an OSI licence by the end of confirmatory data collection

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-07 06:35 |
| **Track** | System |
| **Related** | [ADR-0043](0043-research-credibility-without-compromise.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md), [ADR-0044](0044-appoint-independent-integrity-monitor.md) |

## Context

The user requires research credibility "ABSOLUTELY AND WITHOUT COMPROMISE" ([ADR-0043](0043-research-credibility-without-compromise.md)) while the same small team builds a product on the protocol. Claude drafted a nine-rule charter (v0); four AI red-team lenses (a Registered Reports editor, a conflict-of-interest expert, a hostile replicator and a program-level integrity officer) attacked it, and a synthesis produced CR1–CR14. The user adopted all 14 rules.

**Threat this rule addresses:** CC5's promise contradicts the open licensing decision in the ADR log. A closed engine leaves C1-H neither re-runnable nor auditable, and a licence that excludes competitors reads as obstruction. tooling.md lists Opus 5.5 as 'not before 2027-09-22' and Fable 5.1 as 'not before 2027-09-01', so a release at publication could come after outsiders lose model access. This merges Editor (decide now, OSI), Replicator (release at the end of data collection, with tarballs) and Architect (open registry and validator).

## Decision

Charter rule **CR13**, adopted as part of the credibility charter (CR1–CR14):

Research code is everything a locked study executes: runner, gateway, sandbox, renderer, critic plumbing, registry, ruleset, validator, Judge app and analysis.

By the end of confirmatory data collection, publish under an OSI licence every engine release a study ran, together with:
- its recipes, prompts and development briefs;
- container image tarballs (not just digests);
- npm-mirror and font-cache snapshots.

By Stage 2 submission, publish with DOIs:
- data and de-identified trial-level ratings;
- every request and response;
- renders and render logs;
- pilot data and the tuning ledger;
- exclusion and deviation logs;
- the provider reconciliation;
- the analysis code.

Product-only code (recommender, composer, product UI) may stay closed, and can never be cited as evidence.

The user chose release under an OSI licence by the end of confirmatory data collection (the recommended option), over release at Stage 2 submission and a replication-only licence.

**Enforced by:** Process: an irrevocable commitment written into Stage 0. System: release CI builds the kit at lock.

**Owner:** The team lead decides; the engine owner packages; the Monitor checks completeness.

## Alternatives considered

- **OSI licence at Stage 2 submission** — later release; the minimum the charter tolerates.
- **Replication-only licence** — blocks competitive use; incompatible with the user's standard.
- **Keep the engine closed** — incompatible with the user's standard.
- **A lighter charter** (offered; not chosen) — fewer outside parties and gates; cheaper, but weaker than the user's standard.

## Consequences

**Positive**

- Closes the threat above with system enforcement.

**Negative**

- Cost (red-team estimate, unverified): 2–3 days of packaging; storage is roughly free at this scale. Strategically, competitors get the study engine early. That is the trade the user's standard implies.

**Follow-ups**

- Needed before the confirmatory run or Stage 2, not on day one.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T13:35:51Z — “Adopt all 14 (Recommended)”
- [research/2026-10-07-credibility-redteam/r_redteam_syn.md](../research/2026-10-07-credibility-redteam/r_redteam_syn.md) · CHARTER › CR13
