# ADR-0051: Decisions that could tilt results are made by preregistered scripts; every AI judge is reported; raters are screened

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
- Forking paths in exclusions, retries, render failures and judge reporting.
- methods.md says not to report a judge that fails its threshold, which conflicts with reporting every registered analysis.
- Harness bugs that favour one arm (−D3 snapshot timing, the critic seeing code or the threshold, cross-arm cache hits).
- Raters using AI tools, and raters with conflicts of their own.

This merges Editor's outcome-neutral checks and exclusion rules, Replicator's fidelity assertions, A/A arm, render logs and rater AI-use controls, and the rater screener from COI and Editor.

## Decision

Charter rule **CR8**, adopted as part of the credibility charter (CR1–CR14):

Anything that could tilt a result is decided by a preregistered script, not a person, and every such decision is logged.

**Decided by script:**
- Rater exclusions, and recruitment of replacement raters until a preregistered number of valid judgments exists per brief-contrast. Both are applied on opaque IDs before unblinding.
- Whether a failure counts as infrastructure or quality, read from exit codes and HTTP statuses, with no human override and every retry logged.
- A render-failure taxonomy. Intention-to-treat is the default, with a sensitivity analysis that excludes flagged stimuli.
- Copy-deck non-compliance: intention-to-treat, with compliance reported per arm.

**Outcome-neutral checks** have numeric thresholds and stated consequences. They cover gold-pair accuracy, copy compliance and the gateway fidelity assertions, plus an A/A arm in the pilot.

**AI judges:** every AI judge is reported with a validity flag against a sealed human subset. None is dropped, and none is cited as corroboration.

**Raters and experts:**
- They pass a screener: no paid, equity, customer or competitor tie, and not a product user.
- They are told not to use AI tools.
- Focus and paste events are logged.
- They answer a blinding check at the end of the session.

**Enforced by:** System: the Judge app, the failure classifier and the gateway fidelity assertions. Process: thresholds fixed in Stage 0.

**Owner:** The engine owner builds it; the Monitor approves the thresholds at Stage 0.

## Alternatives considered

- **A lighter charter** (offered; not chosen) — fewer outside parties and gates; cheaper, but weaker than the user's standard.

## Consequences

**Positive**

- Closes the threat above with system enforcement.

**Negative**

- Cost (red-team estimate, unverified): 2–3 days of specification and scripts, plus 3–5 dev days for the assertions and A/A plumbing. The A/A arm costs about $250 (Replicator's estimate). Replacement raters add modest Prolific spend.

**Follow-ups**

- Needed before the first pilot spend (day one).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T13:35:51Z — “Adopt all 14 (Recommended)”
- [research/2026-10-07-credibility-redteam/r_redteam_syn.md](../research/2026-10-07-credibility-redteam/r_redteam_syn.md) · CHARTER › CR8
