# ADR-0059: Engine requirements for composition and credibility, built into the harness spine before the pilot

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved recommendation (Claude recommended; the user explicitly chose it). Approved as part of design section 1, revision 2, which the user settled by answering its four settling questions; no requirement was individually discussed. |
| **Date (local, UTC−7)** | 2026-10-07 06:35 |
| **Track** | System |
| **Related** | [ADR-0041](0041-shared-engine-pinned-research-versions.md), [ADR-0042](0042-product-north-star-recommend-or-compose.md), [ADR-0044](0044-appoint-independent-integrity-monitor.md), [ADR-0058](0058-design-time-composition-only.md) |

## Context

Design section 1, revision 2 combined the shared-engine structure ([ADR-0041](0041-shared-engine-pinned-research-versions.md)), the product north star ([ADR-0042](0042-product-north-star-recommend-or-compose.md)) and the credibility charter (ADR-0044 to ADR-0057). The red-team synthesis derived what the engine must provide and when. The red team recommended building the day-one credibility gates into the spine before the pilot rather than adding them later; under the alternative, the pilot would run without the controls that make it credible.

## Decision

Build these engine capabilities, on the schedule given for each:

- **When:** Harness spine, before any pilot spend.
  Gateway spend gate and ledger:
  - Refuse any paid model call without a live Program Registry ID whose phase permits it.
  - Tag every call with workspace, study, arm, recipe hash and prompt hash.
  - Enforce per-arm and per-study caps.
  - Write an append-only, hash-chained ledger and export its daily root for external timestamping.
  - Record request IDs, the returned model string, headers and latency.
  - Route confirmatory traffic only through dedicated per-study provider keys.
- **When:** Harness spine (the lock already needs it).
  Content-addressed, immutable registry for blocks, glue adapters, frozen prompt templates, rulesets and evaluation instruments.
  - Each entry has a semver label and a SHA-256 of its canonical definition.
  - A block definition covers role, port signature, knobs with article defaults, ranges and ⟨A⟩ flags, guards, bypass semantics, compatibility row, evidence level and status.
  - Entries are deprecated, never deleted.
  - Studies pin by hash.
- **When:** The format spike ADR-0029 already plans, before the pilot.
  One canonical recipe format: JSON hashed with RFC 8785, with the schema version included in the hash.
  - Required fields: kind (protocol-config, variant, ablation, baseline, composed, experimental), parent hash and derivation, block instances by hash, typed edges, grammar operators only, a max on every loop, checkpoint declarations without bindings, sit-outs with reasons, exception-catalogue references, budget inputs and success criteria judged outside the loop.
  - Ablations are derived by a versioned transform using each block's registered bypass, never by hand edits.
  - No API for changing the graph at runtime.
- **When:** Before the pilot.
  Model profile (pinned IDs, route, effort) and checkpoint-binding map (live, policy, AI proxy, replay) stored as separate hashed artifacts, recorded in every manifest. The evidence-scope tuple is: recipe, ruleset, model-profile and binding-map hashes, plus domain and task set, plus outcome and rater population.
- **When:** Paper 1 subset before the pilot; the composed-kind profile before the product composer ships.
  Versioned ruleset and validator.
  - Port and default rules carry stable IDs and a class: invariant, hard or default.
  - An exception catalogue separates protocol-declared exceptions, study manipulations (legal only in research-frozen recipes bound to a lock, e.g. CRITIC-self, and D3-auto on unpicked candidates under port rule 4) and invariants that are never relaxed.
  - Recipes cite exceptions only by ID.
  - The verdict is stored in the manifest.
  - Dataflow rules (threshold hidden from the critic; seeds, credentials and the tells catalogue kept out of prompts and artifacts; locked voice) are enforced at runtime by role and label taint tracking in the interpreter and gateway.
- **When:** Paper 1 arms before the pilot; C2–C7 before the product launches.
  Conformance suite and fidelity assertions.
  - Golden tests: C1–C7 and C6a validate with exactly 03's exceptions; the nine Study 1 arms validate under their kinds; broken fixtures fail with the expected rule ID.
  - Gateway fidelity assertions: no code or threshold tokens in critic inputs; non-zero DOM diff between −D3 and C1-H for a stated share of candidates; no cross-arm cache hits; no ASSET instruction in baseline prompts.
  - Support for an A/A arm.
  - The lock refuses to run unless the suite passes on the pinned ruleset.
  - Notation, diagrams and ⟨A⟩ marks are generated from recipe files.
- **When:** Before the pilot (a channel field plus the lock check).
  Registry channels: protocol, research-frozen, product, workspace/composed.
  - A study lock resolves only research-frozen entries.
  - It refuses any lineage that includes a product or composed derivation, unless that recipe was promoted through an ADR, a new ID and a new Stage 0.
  - The product channel can read protocol and research entries but never write to them.
- **When:** Before the confirmatory run.
  Lock verification and deviation automation.
  - Before the first confirmatory call, the harness fetches the public registration and checks that the manifest hash and date match.
  - Any change to a locked study creates a new lock version.
  - A public deviation entry is generated by diffing executed manifests against the lock.
- **When:** Before the brief draw and the pilot.
  Escrow path.
  - Encrypt to the Monitor's and deputy's keys at ingest: sealed briefs, copy decks, the stimulus-to-arm map, and any generation made before IPA.
  - Decryption happens only inside the locked confirmatory run.
  - The Judge database stores opaque IDs only.
  - Unblinding is gated on a registered hash of the analysis code.
  - A frozen pilot-release script outputs only nuisance parameters.
- **When:** Before the first pilot rating.
  Judge app integrity.
  - Refuse to create a rater round without a registry ID.
  - Screener and conflict declaration for raters.
  - Per-trial logging of visibility, focus and paste events; side and timing; gold-check fields.
  - End-of-session blinding check.
  - Exclusions applied by script on opaque IDs.
  - Replacement recruitment until a preregistered number of valid judgments per brief-contrast.
- **When:** Render logs and classifier before the pilot; canaries before the confirmatory run.
  Run-quality instrumentation.
  - A render log for every stimulus: console errors, failed requests, font fallbacks, page height and truncation, and a blank-canvas detector.
  - An automated failure classifier from exit codes and HTTP statuses, with no human override and every retry logged.
  - Daily drift canaries during the confirmatory window: one long-context, multi-image critic call and one short build call, each with a preregistered pause threshold.
- **When:** Registry schema before the pilot (pilot outputs read 'Untested'). Linter and release CI before the first public product surface.
  Evidence and claims registry.
  - A label function computes verdict plus scope match from registry records, with indirectness differences listed automatically and no override flag.
  - An expiry scheduler.
  - Product UI and docs render labels only by lookup.
  - A claims linter runs in site and docs CI.
  - Release CI blocks any product release that claims a label its hash did not earn.
  - A seeded showcase sampler.
- **When:** Now, before the product reuses any check.
  Instrument firewall.
  - The evaluation store is unreadable from product workspaces.
  - An instrument registry with hashes and exposure flags.
  - A CI import check in product code.
  - Forks carry their own IDs.
  - The evaluation side checks recipe lineage against the exposure register before computing confirmatory metrics.
  - Recommender and composer development data is logged with its provenance.
- **When:** Built before confirmatory data collection ends.
  Replication-kit release CI. At lock it assembles the engine at the locked commit, recipes, prompts, the renderer, the Judge app, container image tarballs, and npm and font snapshots under an OSI licence. At data freeze it assembles Parquet tables with a data dictionary and every log CR13 lists.
- **When:** Before the product's recommender or composer ships; not needed for Paper 1.
  Product-side constraints the engine imposes on the recommender and composer.
  - Composition goes only through validate, then register (kind=composed, channel=workspace), then run.
  - The composed profile allows only admitted blocks, registered knob ranges and declared template slots (frozen block prompts are untouchable), composable exceptions only, and protected human checkpoints (VOICE, C6/C6a authorship).
  - Canonical configurations are recommended before anything is composed, and a composed recipe is shown as a diff from the nearest one, with its cost.
  - The chooser is stored as versioned predicate data and can answer 'no fit' or 'refused (veto)'.
  - Decision traces are logged from the first release.
  - Block admission moves through proposed, experimental, admitted and studied, and the Monitor signs any admission of a block that will be studied.

## Alternatives considered

- **Build only Paper 1 essentials and add the gates later** — faster, but the pilot would run without the controls that make it credible.

## Consequences

**Positive**

- The parts catalogue the composer needs exists from day one.
- Grammar rules become code-enforced instead of runbook-enforced.
- A conformance suite would already have caught the port rule 4 conflict and the operator-count drift.

**Negative**

- Roughly 4–7 extra engineer-weeks over the ~4-week spine (red-team estimate), much of it needed for Paper 1 anyway.

**Follow-ups**

- The engine and research-harness spec turns these into components and acceptance tests.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T13:35:51Z
- [research/2026-10-07-credibility-redteam/r_redteam_syn.md](../research/2026-10-07-credibility-redteam/r_redteam_syn.md) · ENGINE REQUIREMENTS and USER DECISIONS (engine sequencing)
