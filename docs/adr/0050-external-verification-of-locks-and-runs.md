# ADR-0050: Locks and runs are verified externally: public lock hashes, dedicated keys, a timestamped ledger and provider reconciliation

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it) |
| **Date (local, UTC−7)** | 2026-10-07 06:35 |
| **Track** | Process |
| **Related** | [ADR-0043](0043-research-credibility-without-compromise.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md), [ADR-0044](0044-appoint-independent-integrity-monitor.md) |

## Context

The user requires research credibility "ABSOLUTELY AND WITHOUT COMPROMISE" ([ADR-0043](0043-research-credibility-without-compromise.md)) while the same small team builds a product on the protocol. Claude drafted a nine-rule charter (v0); four AI red-team lenses (a Registered Reports editor, a conflict-of-interest expert, a hostile replicator and a program-level integrity officer) attacked it, and a synthesis produced CR1–CR14. The user adopted all 14 rules.

**Threat this rule addresses:** Hidden reruns and self-attested locks. In v0 nothing proves the 1,728 pages came from a single run, and the code that enforces the lock is code the team can patch.

Deviations often go undisclosed: according to PubMed, 9 of 27 early preregistered studies disclosed none of their deviations, which concentrated in sample size, exclusions and analysis (Claesen et al. 2021, https://doi.org/10.1098/rsos.211037).

Anthropic's Usage API filters by API key and lists 'Cost reconciliation' as a use, but 'The Admin API is unavailable for individual accounts' (https://platform.claude.com/docs/en/build-with-claude/usage-cost-api). OpenTimestamps is free and 'proves that some data existed prior to some point in time' (https://opentimestamps.org/). This rule merges Replicator, Program and Editor.

## Decision

Charter rule **CR7**, adopted as part of the credibility charter (CR1–CR14):

No study can be locked, rerun or changed without an outside record.

1. **Lock check.** A lock is valid only if its manifest hash appears in a public, frozen registration dated before the first confirmatory call. The manifest covers the engine commit; the recipe, prompt, ruleset, model-profile and binding-map hashes; and the container digests. The harness verifies this before it starts.
2. **Dedicated keys.** Confirmatory generation uses dedicated, spend-capped API keys at each provider, used for nothing else.
3. **Ledger.** The gateway writes an append-only, hash-chained ledger. Its daily root hash is timestamped externally with OpenTimestamps.
4. **Reconciliation.** After the run, the Monitor reconciles each provider's per-key usage export, and the Prolific study list, against the archive, and publishes the result. Any call that is not in the archive is a reportable deviation.
5. **Deviations.** Any change to a locked study creates a new lock version and an automatic public deviation entry. After IPA, every change is cleared with the editor before it is made and co-signed by the Monitor. Stage 2 includes the generated deviation table.

**Enforced by:** System: the lock check, the hash-chained ledger and automatic deviation entries. External parties: provider usage records, the timestamp service, the Monitor and the journal editor.

**Owner:** The engine owner builds it; the Monitor reconciles.

## Alternatives considered

- **A lighter charter** (offered; not chosen) — fewer outside parties and gates; cheaper, but weaker than the user's standard.

## Consequences

**Positive**

- Closes the threat above with system enforcement.

**Negative**

- Cost (red-team estimate, unverified): 2–4 dev days, about 4 Monitor hours, and an Anthropic organization account (plus the equivalent at each other provider). Free timestamping.

**Follow-ups**

- Needed before the confirmatory run or Stage 2, not on day one.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T13:35:51Z — “Adopt all 14 (Recommended)”
- [research/2026-10-07-credibility-redteam/r_redteam_syn.md](../research/2026-10-07-credibility-redteam/r_redteam_syn.md) · CHARTER › CR7
