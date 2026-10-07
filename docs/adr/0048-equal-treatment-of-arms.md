# ADR-0048: Equal treatment of arms: frozen baselines, repair-only changes, a per-arm tuning ledger and an outside baseline

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-07 06:35 |
| **Track** | Process |
| **Related** | [ADR-0043](0043-research-credibility-without-compromise.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md), [ADR-0044](0044-appoint-independent-integrity-monitor.md) |

## Context

The user requires research credibility "ABSOLUTELY AND WITHOUT COMPROMISE" ([ADR-0043](0043-research-credibility-without-compromise.md)) while the same small team builds a product on the protocol. Claude drafted a nine-rule charter (v0); four AI red-team lenses (a Registered Reports editor, a conflict-of-interest expert, a hostile replicator and a program-level integrity officer) attacked it, and a synthesis produced CR1–CR14. The user adopted all 14 rules.

**Threat this rule addresses:** Tuning effort is unequal across arms. C1-H gets iterated for months on development briefs, in the Playground and on the product track, while the baselines stay fixed strings. A C1-H win would then partly measure tuning budget. All five attacks raised this. Editor and Program cite the machine-learning evidence that comparisons flip with tuning budget (Dodge et al.; Melis et al.); those papers were not re-opened in this synthesis.

## Decision

Charter rule **CR5**, adopted as part of the credibility charter (CR1–CR14):

Baselines and the C1-H recipe get equal treatment.

1. **Freeze baselines before the pilot.** Use the article's prompts verbatim. Pin B-Skill to a commit chosen by a preregistered rule, such as the latest release on the lock date.
2. **Before the lock, C1-H may change only to repair failures from a closed list:** build error, crash, tool misuse, copy-deck non-compliance and render failure. For each repair:
   - log the diff, the reason and the author;
   - apply it to every arm where it makes sense;
   - have the Monitor classify it as 'repair, not tuning';
   - stay within a preregistered cap on the number of repairs.
3. **Tuning ledger.** The gateway tags every pre-lock call by arm, recipe hash and workspace, and generates a per-arm ledger (iterations, tokens, dollars, hours). The ledger is published with the Stage 1. Lab refuses to lock a plan without it.
4. **No product shortcuts.** Before IPA, any Playground or product run of a study recipe happens only in a logged workspace. A product recipe version enters a study only through a new Stage 0.
5. **Outside choices.** An independent designer picks the critic calibration exemplars under a preregistered rule. Before the lock, one outside owner of a competing approach is invited to submit a baseline, which is run and reported whatever the result.

**Enforced by:** System: gateway tagging and ledger generation, and Lab's refusal to lock without a ledger. External party: the Monitor classifies repairs, and an outside owner supplies a baseline.

**Owner:** The engine owner builds the tagging; the Monitor classifies repairs.

## Alternatives considered

- **A lighter charter** (offered; not chosen) — fewer outside parties and gates; cheaper, but weaker than the user's standard.

## Consequences

**Positive**

- Closes the threat above with system enforcement.

**Negative**

- Cost (red-team estimate, unverified): About 1–2 dev days. The outside baseline costs about $7–10 per brief in generation (Replicator's estimate) plus coordination. C1-H may score lower than a fully tuned version would, and that lower score is the honest estimate.

**Follow-ups**

- Needed before the first pilot spend (day one).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T13:35:51Z — “Adopt all 14 (Recommended)”
- [research/2026-10-07-credibility-redteam/r_redteam_syn.md](../research/2026-10-07-credibility-redteam/r_redteam_syn.md) · CHARTER › CR5
