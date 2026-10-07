# ADR-0049: The team holds no key that can unblind or shape a study: beacon-seeded draw and escrow to the Monitor

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-07 06:35 |
| **Track** | Process |
| **Related** | [ADR-0043](0043-research-credibility-without-compromise.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md), [ADR-0044](0044-appoint-independent-integrity-monitor.md) |

## Context

The user requires research credibility "ABSOLUTELY AND WITHOUT COMPROMISE" ([ADR-0043](0043-research-credibility-without-compromise.md)) while the same small team builds a product on the protocol. Claude drafted a nine-rule charter (v0); four AI red-team lenses (a Registered Reports editor, a conflict-of-interest expert, a hostile replicator and a program-level integrity officer) attacked it, and a synthesis produced CR1–CR14. The user adopted all 14 rules.

**Threat this rule addresses:** Self-custody. A hash proves a file did not change after hashing, not that nobody read or shaped it. A seed the team picks proves nothing. 'Blind analysis on scrambled labels' is self-blinding when the analyst also holds the key.

drand provides 'verifiable, unpredictable and unbiased random numbers' from a multi-organization network (https://drand.love/). This rule merges Editor's custodian and drand seed, Replicator's beacon and copywriter escrow, and COI's key escrow.

## Decision

Charter rule **CR6**, adopted as part of the credibility charter (CR1–CR14):

The team never holds a key that could unblind or reshape a confirmatory study.

**Brief draw:**
- Preregister eligibility rules, strata and the draw script.
- Timestamp a snapshot of the full sampling frame.
- Seed the draw with a future drand round named in advance.

**Copywriter:** the independent copywriter screens eligibility, codes strata and fictionalizes the briefs under a written rulebook. They are blind to the hypotheses and never see generated pages. Every rejection and edit goes into a public log.

**Encryption:**
- Confirmatory briefs, copy decks and the stimulus-to-arm map are encrypted to the Monitor and the deputy at ingest.
- The harness decrypts them only inside the locked confirmatory run.
- The Judge database stores opaque IDs only.
- If the model-retirement window forces generation before IPA, outputs go to storage encrypted to the Monitor, with access logged.

**Unblinding:** the arm map is released only after the hash of the analysis code is registered.

**Enforced by:** System: encryption at ingest, opaque IDs and gated decryption. External parties: the Monitor, the copywriter and the drand beacon.

**Owner:** The engine owner implements it; the Monitor and the copywriter hold the materials.

## Alternatives considered

- **A lighter charter** (offered; not chosen) — fewer outside parties and gates; cheaper, but weaker than the user's standard.

## Consequences

**Positive**

- Closes the threat above with system enforcement.

**Negative**

- Cost (red-team estimate, unverified): 3–5 dev days. Copywriter time rises about 10–20% (Replicator's estimate). Adds 0–2 weeks of calendar time. The team can no longer debug the confirmatory run live; a full dry run on the development briefs offsets this.

**Follow-ups**

- Needed before the first pilot spend (day one).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T13:35:51Z — “Adopt all 14 (Recommended)”
- [research/2026-10-07-credibility-redteam/r_redteam_syn.md](../research/2026-10-07-credibility-redteam/r_redteam_syn.md) · CHARTER › CR6
